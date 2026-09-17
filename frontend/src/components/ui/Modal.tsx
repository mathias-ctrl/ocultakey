import { X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export function Modal({ title, description, children, onClose, width = 'md' }: { title: string; description?: string; children: ReactNode; onClose: () => void; width?: 'sm'|'md'|'lg' }) {
  const widths = { sm: 'sm:max-w-md', md: 'sm:max-w-xl', lg: 'sm:max-w-3xl' }
  useEffect(()=>{
    const previous=document.body.style.overflow
    document.body.style.overflow='hidden'
    const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose()}
    window.addEventListener('keydown',onKey)
    return()=>{document.body.style.overflow=previous;window.removeEventListener('keydown',onKey)}
  },[onClose])
  return <>{createPortal(<div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/45 backdrop-blur-[5px] sm:items-center sm:p-5" onMouseDown={(e)=>e.target===e.currentTarget&&onClose()}>
    <section role="dialog" aria-modal="true" className={`ok-scrollbar max-h-[92vh] w-full overflow-auto border border-ink/10 bg-canvas shadow-2xl sm:rounded-md ${widths[width]}`}>
      <header className="sticky top-0 z-10 flex min-h-16 items-start justify-between gap-4 border-b border-ink/10 bg-canvas/95 px-5 py-4 backdrop-blur">
        <div><h2 className="text-base font-semibold text-ink">{title}</h2>{description&&<p className="mt-1 text-sm leading-5 text-ink/55">{description}</p>}</div>
        <button type="button" className="ui-icon-button shrink-0" onClick={onClose} aria-label="Fechar"><X size={18}/></button>
      </header>
      <div className="p-5">{children}</div>
    </section>
  </div>,document.body)}</>
}
