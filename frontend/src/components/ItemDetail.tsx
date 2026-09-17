import { useEffect, useState } from 'react'
import { ArrowLeft, Copy, Eye, EyeOff, ExternalLink, Pencil, Trash2 } from 'lucide-react'
import type { DecryptedItem, ItemSecret } from '../types'
import { decryptJson } from '../lib/crypto'
import { useVault } from '../lib/vault-context'
import { usePreferences } from '../lib/preferences'
import { ConfirmPassword } from './ConfirmPassword'
import { ConfirmDialog } from './ui/ConfirmDialog'
import { api } from '../lib/api'
import { SecureNoteViewer } from './SecureNoteViewer'
import { usePrivacy } from '../lib/privacy'
import { useToast } from '../lib/toast'

export function ItemDetail({item,onBack,onEdit,onDeleted}:{item:DecryptedItem;onBack:()=>void;onEdit:()=>void;onDeleted:()=>void}){const{hideCredentialNames}=usePrivacy();
 const {secretKey}=useVault();const{t}=usePreferences();const{show}=useToast();const [secret,setSecret]=useState<ItemSecret|null>(null); const [confirm,setConfirm]=useState(false); const [confirmTrash,setConfirmTrash]=useState(false); const [revealed,setRevealed]=useState<Record<string,boolean>>({})
 useEffect(()=>{setSecret(null);setRevealed({});if(secretKey)decryptJson<ItemSecret>(secretKey,item.secret).then(setSecret).catch(()=>setSecret(null))},[item,secretKey])
 const ensure=()=>{if(!secretKey){setConfirm(true);return false}return true}
 const reveal=async(id:string)=>{if(!ensure())return;const s=secret??await decryptJson<ItemSecret>(secretKey!,item.secret);setSecret(s);setRevealed(x=>({...x,[id]:!x[id]}));api('/audit/event',{method:'POST',body:JSON.stringify({event:'SECRET_REVEALED',object_type:'item',object_id:item.id})}).catch(()=>{})}
 const copy=async(id:string)=>{if(!ensure())return;const s=secret??await decryptJson<ItemSecret>(secretKey!,item.secret);setSecret(s);await navigator.clipboard.writeText(s.values[id]??'');show({kind:'success',title:'Copiado'});api('/audit/event',{method:'POST',body:JSON.stringify({event:'SECRET_COPIED',object_type:'item',object_id:item.id})}).catch(()=>{})}
 const trash=async()=>{await api(`/items/${item.id}`,{method:'DELETE'});show({kind:'success',title:'Credencial movida para a lixeira'});setConfirmTrash(false);onDeleted()}
 const env=item.meta.environment==='staging'||item.meta.environment==='homologation'||item.meta.environment.toLowerCase().includes('homolog')?t('homologation'):t('production')
 const noteField=item.meta.type==='secure_note'?item.meta.fields.find(f=>f.id==='note')??item.meta.fields[0]:undefined
 return <div className="ok-scrollbar h-full min-h-0 overflow-y-auto bg-canvas"><div className="sticky top-0 z-10 border-b border-ink/10 bg-surface/95 px-5 py-5 backdrop-blur sm:px-7"><div className="flex items-start justify-between gap-4"><div className="flex min-w-0 gap-2"><button className="ui-icon-button shrink-0 lg:hidden" onClick={onBack}><ArrowLeft size={18}/></button><div className="min-w-0"><div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-ink/45"><span>{item.meta.type.replace('_',' ')}</span><span>•</span><span>{env}</span></div><h2 className="truncate text-xl font-semibold tracking-tight">{hideCredentialNames?'••••••••':item.meta.name}</h2>{item.meta.description&&<p className="mt-2 max-w-2xl text-sm leading-6 text-ink/55">{item.meta.description}</p>}</div></div><div className="flex shrink-0 gap-1"><button className="ui-icon-button" onClick={onEdit} title="Editar"><Pencil size={17}/></button><button className="ui-icon-button" onClick={()=>setConfirmTrash(true)} title="Mover para lixeira"><Trash2 size={17}/></button></div></div></div>
 <div className="px-5 py-6 sm:px-7"><div className="max-w-3xl overflow-hidden border border-ink/10 bg-surface rounded-ui">
 {item.meta.url&&<Row label="URL"><div className="flex items-center gap-2"><span className="min-w-0 flex-1 break-all">{item.meta.url}</span><a href={item.meta.url} target="_blank" rel="noreferrer" className="ui-icon-button"><ExternalLink size={16}/></a></div></Row>}
 {item.meta.username&&<Row label="Usuário / identificador"><div className="flex items-center gap-2"><span className="min-w-0 flex-1 break-all font-mono text-sm">{item.meta.username}</span><button className="ui-icon-button" onClick={()=>navigator.clipboard.writeText(item.meta.username)}><Copy size={16}/></button></div></Row>}
 {noteField?<Row label="Nota">{revealed[noteField.id]&&secret?<SecureNoteViewer value={secret.values[noteField.id]??''} onCopy={()=>copy(noteField.id)}/>:<div className="flex items-center justify-between gap-3"><span className="font-mono text-sm text-ink/35">••••••••••••</span><button className="ui-icon-button" onClick={()=>reveal(noteField.id)}><Eye size={17}/></button></div>}</Row>:item.meta.fields.map(f=><Row key={f.id} label={f.label}><div className="flex items-center gap-2"><span className={`min-w-0 flex-1 break-all ${f.kind==='multiline'?'whitespace-pre-wrap':'font-mono text-sm'}`}>{revealed[f.id]&&secret?secret.values[f.id]||'—':'••••••••••••'}</span><button className="ui-icon-button" onClick={()=>reveal(f.id)}>{revealed[f.id]?<EyeOff size={17}/>:<Eye size={17}/>}</button><button className="ui-icon-button" onClick={()=>copy(f.id)}><Copy size={17}/></button></div></Row>)}
 {item.meta.scopes.length>0&&<Row label="Escopos"><div className="flex flex-wrap gap-1.5">{item.meta.scopes.map(s=><span key={s} className="border border-ink/10 bg-ink/[.025] px-2 py-1 text-xs rounded-md">{s}</span>)}</div></Row>}
 {item.meta.tags.length>0&&<Row label="Tags"><div className="flex flex-wrap gap-1.5">{item.meta.tags.map(s=><span key={s} className="border border-ink/10 bg-ink/[.025] px-2 py-1 text-xs rounded-md">{s}</span>)}</div></Row>}
 </div><div className="mt-5 text-xs text-ink/40">Atualizado em {new Date(item.updated_at).toLocaleString('pt-BR')}</div></div>
 {confirm&&<ConfirmPassword onClose={()=>setConfirm(false)} onUnlocked={()=>setConfirm(false)}/>} {confirmTrash&&<ConfirmDialog title="Mover credencial para a lixeira" description="A credencial continuará criptografada e poderá ser restaurada depois." confirmLabel="Mover para lixeira" danger onClose={()=>setConfirmTrash(false)} onConfirm={trash}/>}</div>
}
function Row({label,children}:{label:string;children:React.ReactNode}){return <div className="grid gap-2 border-b border-ink/10 p-4 last:border-b-0 sm:grid-cols-[180px_1fr]"><div className="text-xs font-medium text-ink/45">{label}</div><div className="text-sm text-ink/80">{children}</div></div>}
