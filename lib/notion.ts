import { NotionAPI } from 'notion-client'
import type { ExtendedRecordMap } from 'notion-types'

export const notion = new NotionAPI()

type PropertyFilter = {
  filter: { filter: { operator: string; value?: { value: unknown } }; property: string }
}

function applyPropertyFilters(
  blockIds: string[],
  propertyFilters: PropertyFilter[] | undefined,
  recordMap: ExtendedRecordMap,
): string[] {
  if (!propertyFilters?.length) return blockIds
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
 * 1. property_filters를 collection_group_results.blockIds에 직접 적용 (모든 뷰)
 * 2. 그룹화된 뷰는 per-group 키(results:type:value)를 추가 (홈 리스트뷰용)
 */
function fixCollectionData(recordMap: ExtendedRecordMap) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const collectionQuery = recordMap.collection_query as unknown as Record<string, Record<string, Record<string, any>>>
  if (!collectionQuery) return

  // 각 collection_view 블록의 첫번째 뷰 ID만 수집
  const firstViewIds = new Set<string>()
  for (const blockEntry of Object.values(recordMap.block)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const block = ((blockEntry as any)?.value as any)?.value ?? (blockEntry as any)?.value
    if (block?.type === 'collection_view' || block?.type === 'collection_view_page') {
      const viewIds = block.view_ids as string[] | undefined
      if (viewIds?.length) firstViewIds.add(viewIds[0])
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
      const propertyFilters = view?.format?.property_filters as PropertyFilter[] | undefined
      const groupResults = data.collection_group_results
      if (!groupResults?.blockIds?.length) continue

      // 1. property_filters 적용하여 collection_group_results.blockIds 교체 (모든 뷰 공통)
      groupResults.blockIds = applyPropertyFilters(groupResults.blockIds, propertyFilters, recordMap)

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
