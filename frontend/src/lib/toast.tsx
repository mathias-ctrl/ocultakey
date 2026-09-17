import { createContext, useContext, useState } from 'react'
import { CheckCircle2, Info, X, XCircle } from 'lucide-react'

type ToastKind='success'|'error'|'info'
type Toast={id:string;title:string;message?:string;kind:ToastKind}
const Context=createContext<{show:(toast:Omit<Toast,'id'>)=>void}|null>(null)
export function ToastProvider({children}:{children:React.ReactNode}){
 const[items,setItems]=useState<Toast[]>([])
 const show=(toast:Omit<Toast,'id'>)=>{const id=crypto.randomUUID();setItems(x=>[...x.slice(-2),{...toast,id}]);window.setTimeout(()=>setItems(x=>x.filter(i=>i.id!==id)),3200)}
 return <Context.Provider value={{show}}>{children}<div className="pointer-events-none fixed right-4 top-4 z-[120] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2">{items.map(item=><div key={item.id} className="pointer-events-auto flex gap-3 border border-ink/10 bg-surface px-4 py-3 text-ink shadow-xl shadow-ink/10"><span className="mt-0.5 text-action">{item.kind==='success'?<CheckCircle2 size={18}/>:item.kind==='error'?<XCircle size={18}/>:<Info size={18}/>}</span><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{item.title}</p>{item.message&&<p className="mt-0.5 text-sm leading-5 text-ink/55">{item.message}</p>}</div><button onClick={()=>setItems(x=>x.filter(i=>i.id!==item.id))} className="ui-icon-button !h-7 !w-7"><X size={14}/></button></div>)}</div></Context.Provider>
}
export function useToast(){const value=useContext(Context);if(!value)throw new Error('ToastProvider missing');return value}
