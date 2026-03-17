'use client'

import React from 'react'
import dynamic from 'next/dynamic'
import { NotionRenderer } from 'react-notion-x'
import type { ExtendedRecordMap } from 'notion-types'

const Collection = dynamic(() =>
  import('react-notion-x/build/third-party/collection').then((m) => m.Collection)
)

// 링크 중첩 감지용 컨텍스트
const LinkDepthContext = React.createContext(0)

function SafePageLink({
  href,
  className,
  children,
  ...rest
}: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const depth = React.useContext(LinkDepthContext)
  return (
    <LinkDepthContext.Provider value={depth + 1}>
      {depth > 0 ? (
        // 이미 <a> 안에 있으면 <span>으로 렌더링 (중첩 방지)
        <span className={className}>{children}</span>
      ) : (
        <a href={href} className={className} {...rest}>
          {children}
        </a>
      )}
    </LinkDepthContext.Provider>
  )
}

export default function NotionPage({
  recordMap,
  rootPageId,
}: {
  recordMap: ExtendedRecordMap
  rootPageId?: string
}) {
  return (
    <NotionRenderer
      recordMap={recordMap}
      fullPage={true}
      darkMode={false}
      rootPageId={rootPageId}
      mapPageUrl={(pageId) => `/posts/${pageId.replace(/-/g, '')}`}
      components={{ Collection, PageLink: SafePageLink }}
    />
  )
}