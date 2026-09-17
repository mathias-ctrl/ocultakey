import type { ReactNode } from 'react'
export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="mx-auto flex max-w-md flex-col items-center px-6 py-16 text-center"><div className="mb-4 h-px w-12 bg-ink/20"/><h3 className="text-sm font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-ink/50">{description}</p>{action&&<div className="mt-5">{action}</div>}</div>
}
