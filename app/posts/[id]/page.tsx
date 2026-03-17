import { getPageRecordMap } from '@/lib/notion'
import NotionPage from '@/components/NotionPage'
import GiscusComments from '@/components/GiscusComments'
import { getPageTitle } from 'notion-utils'
import type { Metadata } from 'next'

export const revalidate = 60

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const recordMap = await getPageRecordMap(id)
  const title = getPageTitle(recordMap)
  return { title }
}

export default async function PostPage({ params }: Props) {
  const { id } = await params
  const recordMap = await getPageRecordMap(id)

  return (
    <div>
      <NotionPage recordMap={recordMap} />
      <GiscusComments />
    </div>
  )
}
