import { Copy, Maximize2, Minimize2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export function SecureNoteViewer({value,onCopy}:{value:string;onCopy:()=>void}){
  const [fullscreen,setFullscreen]=useState(false)
  const lineCount=Math.max(1,value.split('\n').length)
  useEffect(()=>{
    if(!fullscreen)return
    const previous=document.body.style.overflow
    document.body.style.overflow='hidden'
    const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape')setFullscreen(false)}
    window.addEventListener('keydown',onKey)
    return()=>{document.body.style.overflow=previous;window.removeEventListener('keydown',onKey)}
  },[fullscreen])
  const content=<div className={`secure-note-view ${fullscreen?'h-full':''}`}><div className="flex items-center justify-between border-b border-ink/10 px-3 py-2"><span className="font-mono text-[11px] text-ink/45">{lineCount} {lineCount===1?'linha':'linhas'} · {value.length}/1024</span><div className="flex"><button className="ui-icon-button !h-8 !w-8" onClick={onCopy} title="Copiar"><Copy size={15}/></button><button className="ui-icon-button !h-8 !w-8" onClick={()=>setFullscreen(x=>!x)} title={fullscreen?'Sair da tela cheia':'Abrir em tela cheia'}>{fullscreen?<Minimize2 size={15}/>:<Maximize2 size={15}/>}</button></div></div><pre className={`whitespace-pre-wrap break-words p-4 font-mono text-sm leading-6 ${fullscreen?'ok-scrollbar h-[calc(100%-49px)] overflow-auto':''}`}>{value||'—'}</pre></div>
  if(fullscreen)return <>{createPortal(<div className="fixed inset-0 z-[140] bg-black/55 p-3 backdrop-blur-[5px] sm:p-7">{content}</div>,document.body)}</>
  return content
}
