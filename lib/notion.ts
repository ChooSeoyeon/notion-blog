import { NotionAPI } from 'notion-client'
import type { ExtendedRecordMap } from 'notion-types'

export const notion = new NotionAPI()

/**
 * Notion API가 그룹별 reducer 결과(results:type:value)를 더 이상 반환하지 않아
 * collection_group_results의 전체 blockIds를 각 그룹 조건에 따라 직접 필터링해서 채운다.
 */
function fixGroupedCollectionData(recordMap: ExtendedRecordMap) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const collectionQuery = recordMap.collection_query as unknown as Record<string, Record<string, Record<string, unknown>>>
  if (!collectionQuery) return

  // 각 collection_view 블록의 첫번째 뷰 ID만 수집 (두번째 뷰는 처리하지 않음)
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
      // 첫번째 뷰만 처리
      if (!firstViewIds.has(viewId)) continue
      const data = collectionQuery[collectionId][viewId]
      if (!data) continue

      // 이미 per-group 키가 있으면 패스
      if (Object.keys(data).some(k => k.startsWith('results:'))) continue

      const viewEntry = recordMap.collection_view[viewId] as Record<string, unknown>
      const view = (viewEntry?.value as Record<string, unknown>)?.value as Record<string, unknown> ?? viewEntry?.value as Record<string, unknown>
      const groups = (view?.format as Record<string, unknown>)?.collection_groups as Array<{
        property: string
        hidden?: boolean
        value: { type: string; value?: string }
      }> | undefined

      if (!groups?.length) continue

      const rawBlockIds = (data.collection_group_results as Record<string, unknown>)?.blockIds as string[] | undefined
      if (!rawBlockIds?.length) continue

      // 뷰의 property_filters를 클라이언트에서 직접 적용 (Notion API가 필터를 누락하는 경우 대비)
      const propertyFilters = (view?.format as Record<string, unknown>)?.property_filters as Array<{
        filter: { filter: { operator: string; value?: { value: unknown } }; property: string }
      }> | undefined

      const allBlockIds = propertyFilters?.length
        ? rawBlockIds.filter((blockId) => {
            const blockEntry = recordMap.block[blockId] as Record<string, unknown>
            const block = ((blockEntry?.value as Record<string, unknown>)?.value ?? blockEntry?.value) as Record<string, unknown>
            return propertyFilters.every(({ filter: { filter, property } }) => {
              const propValue = (block?.properties as Record<string, string[][]>)?.[property]
              const text = propValue?.[0]?.[0]
              if (filter.operator === 'checkbox_is') {
                const expected = filter.value?.value === true ? 'Yes' : 'No'
                return text === expected
              }
              return true
            })
          })
        : rawBlockIds

      if (!allBlockIds.length) continue

      for (const group of groups) {
        const { property, value: { value: groupValue, type } } = group
        const queryLabel = groupValue ?? 'uncategorized'
        const key = `results:${type}:${queryLabel}`

        if (data[key]) continue

        const groupBlockIds = allBlockIds.filter((blockId: string) => {
          const blockEntry = recordMap.block[blockId] as Record<string, unknown>
          const block = ((blockEntry?.value as Record<string, unknown>)?.value ?? blockEntry?.value) as Record<string, unknown>
          const propValue = (block?.properties as Record<string, unknown[][]>)?.[property] as string[][] | undefined

          if (!propValue?.length) return groupValue === undefined

          if (groupValue === undefined) return false

          // multi_select: "VALUE1,VALUE2" 처럼 콤마로 구분된 문자열 또는 개별 세그먼트 모두 처리
          return propValue.some((seg) => {
            const text = seg[0] as string
            if (!text) return false
            return text === groupValue || text.split(',').some((v) => v.trim() === groupValue)
          })
        })

        data[key] = {
          type: 'results',
          blockIds: groupBlockIds,
          total: groupBlockIds.length,
          hasMore: false,
        }
      }
    }
  }
}

export async function getPageRecordMap(pageId: string) {
  const recordMap = await notion.getPage(pageId)
  fixGroupedCollectionData(recordMap)
  return recordMap
}
