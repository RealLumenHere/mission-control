import { useMemo } from 'react'

import { renderMarkdown } from '@/lib/markdown'

export function MarkdownView({ text }: { text: string }) {
  const html = useMemo(() => renderMarkdown(text), [text])
  return (
    <div
      className={[
        'max-w-none text-[13px] text-bone/90',
        '[&_h1]:mt-0 [&_h1]:mb-2 [&_h1]:text-[16px] [&_h1]:font-semibold [&_h1]:text-bone',
        '[&_h2]:mt-4 [&_h2]:mb-1.5 [&_h2]:text-[14px] [&_h2]:font-semibold [&_h2]:text-bone',
        '[&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:text-[13px] [&_h3]:font-semibold [&_h3]:text-bone',
        '[&_p]:my-1.5 [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5',
        '[&_li]:my-0.5 [&_a]:text-rust [&_a]:underline [&_strong]:text-bone [&_strong]:font-semibold',
        '[&_code]:rounded-xs [&_code]:bg-ink-2 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[12px]',
        '[&_pre]:overflow-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-ink-2 [&_pre]:bg-ink-0 [&_pre]:p-3',
        '[&_pre_code]:bg-transparent [&_pre_code]:p-0',
        '[&_blockquote]:border-l-2 [&_blockquote]:border-ink-2 [&_blockquote]:pl-3 [&_blockquote]:text-sand',
        '[&_hr]:border-ink-2 [&_table]:w-full [&_th]:border-b [&_th]:border-ink-2 [&_th]:text-left [&_td]:border-b [&_td]:border-ink-2/60 [&_th]:py-1 [&_td]:py-1',
      ].join(' ')}
      // Content is sanitized in renderMarkdown() (DOMPurify) before it ever reaches here.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
