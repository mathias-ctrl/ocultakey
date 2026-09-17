import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { Skeleton } from './ui/Skeleton'
import { Timeline, TimelineItem } from './ui/Timeline'
import { Button } from './ui/Button'
import { auditLabels } from '../pages/AuditPage'
import { usePreferences } from '../lib/preferences'

type AuditEvent={id:string;event:string;object_type:string|null;object_id:string|null;created_at:string}
type PageResponse={items:AuditEvent[];next_cursor:string|null}
function eventLabel(event:string,locale:string){const r=auditLabels[event];return r?(locale==='en'?r.en:locale==='es'?r.es:r.pt):event}
export function ClientTimeline({clientId}:{clientId:string}){
  const{locale,t}=usePreferences();const[rows,setRows]=useState<AuditEvent[]>([]);const[loading,setLoading]=useState(true);const[nextCursor,setNextCursor]=useState<string|null>(null)
  const load=async(reset=true)=>{setLoading(true);try{const q=new URLSearchParams({limit:'50'});if(!reset&&nextCursor)q.set('cursor',nextCursor);const page=await api<PageResponse>(`/audit/client/${clientId}?${q}`);setRows(prev=>reset?page.items:[...prev,...page.items]);setNextCursor(page.next_cursor)}finally{setLoading(false)}}
  useEffect(()=>{load(true)},[clientId])
  if(loading&&rows.length===0)return <div className="space-y-4"><Skeleton className="h-12"/><Skeleton className="h-12"/><Skeleton className="h-12"/></div>
  if(!rows.length)return <p className="py-12 text-center text-sm text-ink/45">Ainda não há atividade registrada.</p>
  return <div className="ok-scrollbar max-h-[calc(100vh-330px)] min-h-[320px] overflow-y-auto pr-2"><Timeline>{rows.map(r=><TimelineItem key={r.id} title={eventLabel(r.event,locale)} meta={new Date(r.created_at).toLocaleString(locale)}>{r.object_type==='item'&&r.object_id&&<p className="mt-1 font-mono text-[11px] text-ink/35">{t('credential').toLowerCase()} {r.object_id.slice(0,8)}</p>}</TimelineItem>)}</Timeline>{nextCursor&&<div className="mt-4"><Button className="w-full" onClick={()=>load(false)} disabled={loading}>{t('loadMore')}</Button></div>}</div>
}
