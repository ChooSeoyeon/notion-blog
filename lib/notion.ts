import { NotionAPI } from 'notion-client'
import type { ExtendedRecordMap } from 'notion-types'

export const notion = new NotionAPI()

type PropertyFilter = {
  filter: { filter: { operator: string; value?: { value: unknown } }; property: string }
}

function applyPropertyFilters(
  blockIds: string[],
  propertyFilters: PropertyFilter[],
  recordMap: ExtendedRecordMap,
): string[] {
  return blockIds.filter((blockId) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const blockEntry = recordMap.block[blockId] as any
    const block = blockEntry?.value?.value ?? blockEntry?.value
    return propertyFilters.every(({ filter: { filter, property } }) => {
      const propValue = block?.properties?.[property] as string[][] | undefined
      const text = propValue?.[0]?.[0]
      if (filter.operator === 'checkbox_is') {
        const expected = filter.value?.value === true ? 'Yes' : 'No'
        return text === expected
      }
      return true
    })
  })
}

/**
 * Notion API가 collection_group_results에 필터/그룹 결과를 누락하는 문제를 클라이언트에서 보정.
 * 1. 각 컬렉션의 published 필터(checkbox_is=true)를 collection_view에서 찾아 적용
 * 2. 그룹화된 뷰는 per-group 키(results:type:value)도 추가
 */
function fixCollectionData(recordMap: ExtendedRecordMap) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const collectionQuery = recordMap.collection_query as unknown as Record<string, Record<string, Record<string, any>>>
  if (!collectionQuery) return

  // 각 collection_view 블록의 첫번째 뷰 ID 수집
  const firstViewIds = new Set<string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const blockEntry of Object.values(recordMap.block) as any[]) {
    const block = blockEntry?.value?.value ?? blockEntry?.value
    if (block?.type === 'collection_view' || block?.type === 'collection_view_page') {
      const viewIds = block.view_ids as string[] | undefined
      if (viewIds?.length) firstViewIds.add(viewIds[0])
    }
  }

  // collection_view에서 collectionId별 published 필터(checkbox_is=true) 찾기
  // 뷰의 format.collection_pointer.id 또는 query2 등에서 collection_id를 찾기 어려우므로
  // collection_query의 collectionId를 키로 사용하여 관련 뷰를 역으로 찾음
  const collectionPublishedFilters: Record<string, PropertyFilter[]> = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const [, viewEntry] of Object.entries(recordMap.collection_view) as any[]) {
    const view = viewEntry?.value?.value ?? viewEntry?.value
    const filters = view?.format?.property_filters as PropertyFilter[] | undefined
    if (!filters?.length) continue
    // checkbox_is=true 필터만 (published 필터)
    const publishedFilters = filters.filter(
      (f) => f.filter.filter.operator === 'checkbox_is' && f.filter.filter.value?.value === true
    )
    if (!publishedFilters.length) continue
    // 이 뷰가 속한 collection_id 찾기 (collection_query 키와 대조)
    const collectionPointerId = view?.format?.collection_pointer?.id as string | undefined
    if (collectionPointerId && !collectionPublishedFilters[collectionPointerId]) {
      collectionPublishedFilters[collectionPointerId] = publishedFilters
    }
  }

  for (const collectionId of Object.keys(collectionQuery)) {
    for (const viewId of Object.keys(collectionQuery[collectionId] ?? {})) {
      if (!firstViewIds.has(viewId)) continue

      const data = collectionQuery[collectionId][viewId]
      if (!data) continue

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const viewEntry = recordMap.collection_view[viewId] as any
      const view = viewEntry?.value?.value ?? viewEntry?.value

      // 이 뷰 자체의 필터 또는 컬렉션의 published 필터 사용
      const viewFilters = view?.format?.property_filters as PropertyFilter[] | undefined
      const publishedFilters = collectionPublishedFilters[collectionId]
      const filtersToApply = viewFilters?.length ? viewFilters : publishedFilters

      const groupResults = data.collection_group_results
      if (!groupResults?.blockIds?.length) continue

      // 1. 필터 적용하여 collection_group_results.blockIds 교체
      if (filtersToApply?.length) {
        groupResults.blockIds = applyPropertyFilters(groupResults.blockIds, filtersToApply, recordMap)
      }

      // 2. 그룹화된 뷰: per-group 키 추가
      if (Object.keys(data).some(k => k.startsWith('results:'))) continue
      const groups = view?.format?.collection_groups as Array<{
        property: string
        hidden?: boolean
        value: { type: string; value?: string }
      }> | undefined
      if (!groups?.length) continue

      for (const group of groups) {
        const { property, value: { value: groupValue, type } } = group
        const queryLabel = groupValue ?? 'uncategorized'
        const key = `results:${type}:${queryLabel}`
        if (data[key]) continue

        const groupBlockIds = groupResults.blockIds.filter((blockId: string) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const blockEntry = recordMap.block[blockId] as any
          const block = blockEntry?.value?.value ?? blockEntry?.value
          const propValue = block?.properties?.[property] as string[][] | undefined
          if (!propValue?.length) return groupValue === undefined
          if (groupValue === undefined) return false
          return propValue.some((seg) => {
            const text = seg[0]
            if (!text) return false
            return text === groupValue || text.split(',').some((v: string) => v.trim() === groupValue)
          })
        })

        data[key] = { type: 'results', blockIds: groupBlockIds, total: groupBlockIds.length, hasMore: false }
      }
    }
  }
}

export async function getPageRecordMap(pageId: string) {
  const recordMap = await notion.getPage(pageId)
  fixCollectionData(recordMap)
  return recordMap
}
