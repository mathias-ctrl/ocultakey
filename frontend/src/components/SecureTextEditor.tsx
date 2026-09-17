import { Maximize2, Minimize2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export function SecureTextEditor({
  value,
  onChange,
  maxLength,
  placeholder = 'Escreva aqui...',
  minRows = 6,
  fullscreenLabel = 'Editor em tela cheia',
}: {
  value: string
  onChange: (value: string) => void
  maxLength: number
  placeholder?: string
  minRows?: number
  fullscreenLabel?: string
}) {
  const [fullscreen, setFullscreen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const lineCount = Math.max(1, value.split('\n').length)
  const lines = useMemo(() => Array.from({ length: lineCount }, (_, i) => i + 1), [lineCount])

  useEffect(() => {
    if (!fullscreen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const timer = window.setTimeout(() => textareaRef.current?.focus(), 0)
    return () => {
      window.clearTimeout(timer)
      document.body.style.overflow = previous
    }
  }, [fullscreen])

  useEffect(() => {
    if (!fullscreen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFullscreen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen])

  const editor = (
    <div className={`secure-editor ${fullscreen ? 'secure-editor-portal' : ''}`}>
      <div className="secure-editor-toolbar">
        <div className="flex min-w-0 items-center gap-3 font-mono text-[11px] text-ink/45">
          <span>{lineCount} {lineCount === 1 ? 'linha' : 'linhas'}</span>
          <span>{value.length}/{maxLength}</span>
        </div>
        <button
          type="button"
          className="ui-icon-button !h-8 !w-8"
          onClick={() => setFullscreen((current) => !current)}
          aria-label={fullscreen ? 'Sair da tela cheia' : fullscreenLabel}
          title={fullscreen ? 'Sair da tela cheia' : fullscreenLabel}
        >
          {fullscreen ? <Minimize2 size={15}/> : <Maximize2 size={15}/>} 
        </button>
      </div>
      <div className="secure-editor-body">
        <div className="secure-editor-gutter" aria-hidden="true">
          {lines.map((line) => <span key={line}>{line}</span>)}
        </div>
        <textarea
          ref={textareaRef}
          rows={minRows}
          value={value}
          maxLength={maxLength}
          onChange={(event) => onChange(event.target.value)}
          className="secure-editor-textarea"
          placeholder={placeholder}
          spellCheck={false}
        />
      </div>
    </div>
  )

  if (fullscreen) {
    return <>{createPortal(<div className="fixed inset-0 z-[140] bg-black/55 p-3 backdrop-blur-[5px] sm:p-7">{editor}</div>, document.body)}</>
  }
  return editor
}
