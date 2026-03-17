import { getPageRecordMap } from '@/lib/notion'
import NotionPage from '@/components/NotionPage'

export const revalidate = 60

const HOME_PAGE_ID = '72d985021e0c435384a06d19fdb0bd91'

export default async function Home() {
  const recordMap = await getPageRecordMap(HOME_PAGE_ID)
  return <NotionPage recordMap={recordMap} rootPageId={HOME_PAGE_ID} />
}
