import { NotionAPI } from 'notion-client'

export const notion = new NotionAPI()

export async function getPageRecordMap(pageId: string) {
  return await notion.getPage(pageId)
}
