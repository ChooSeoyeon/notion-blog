import { MetadataRoute } from 'next'
import { getPageRecordMap } from '@/lib/notion'

const HOME_PAGE_ID = '72d985021e0c435384a06d19fdb0bd91'
const BASE_URL = 'https://chooblog.vercel.app'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const recordMap = await getPageRecordMap(HOME_PAGE_ID)

  const pageIds = Object.entries(recordMap.block)
    .filter(([, block]) => {
      const value = (block as any)?.value
      return (
        value?.type === 'page' &&
        value?.id !== HOME_PAGE_ID.replace(/-/g, '') &&
        value?.parent_table === 'collection'
      )
    })
    .map(([id]) => id.replace(/-/g, ''))

  return [
    {
      url: BASE_URL,
      lastModified: new Date(),
    },
    ...pageIds.map((id) => ({
      url: `${BASE_URL}/posts/${id}`,
      lastModified: new Date(),
    })),
  ]
}
