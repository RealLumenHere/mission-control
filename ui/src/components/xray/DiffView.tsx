import { cn } from '@/lib/utils'

function lineClass(line: string): string {
  if (line.startsWith('+++') || line.startsWith('---')) return 'text-sand'
  if (line.startsWith('@@')) return 'text-status-open-dependent'
  if (line.startsWith('+')) return 'bg-status-open/10 text-status-open'
  if (line.startsWith('-')) return 'bg-status-blocked/10 text-status-blocked'
  return 'text-bone/80'
}

export function DiffView({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <pre className="overflow-auto rounded-md border border-ink-2 bg-ink-0 p-3 text-[12px] leading-5">
      {lines.map((line, i) => (
        <div key={i} className={cn('whitespace-pre', lineClass(line))}>
          {line || ' '}
        </div>
      ))}
    </pre>
  )
}
