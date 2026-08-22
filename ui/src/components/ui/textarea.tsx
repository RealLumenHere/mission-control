import * as React from 'react'

import { cn } from '@/lib/utils'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex min-h-16 w-full rounded-sm border border-ink-2 bg-ink-0 px-2.5 py-1.5 text-[13px] text-bone outline-none transition-colors placeholder:text-sand/50 focus-visible:border-rust disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
