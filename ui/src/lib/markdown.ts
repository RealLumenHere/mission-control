import { marked } from 'marked'
import DOMPurify from 'dompurify'

marked.setOptions({ gfm: true, breaks: false })

/** Report/ticket-note markdown -> sanitized HTML. Report files are written by
 * our own agents, but ticket `notes`/`detail` text can carry pasted content
 * (error output, external URLs) — sanitize regardless of source. */
export function renderMarkdown(text: string): string {
  const raw = marked.parse(text, { async: false }) as string
  return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } })
}
