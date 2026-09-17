import { useEffect, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { api } from '../lib/api'
import { decryptJson } from '../lib/crypto'
import { useVault } from '../lib/vault-context'
import type { ClientMeta, ClientRow, ItemMeta, ItemRow } from '../types'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { Page } from './AuditPage'
export function TrashPage(){const{metadataKey}=useVault();const[clients,setClients]=useState<Array<ClientRow&{name:string}>>([]);const[items,setItems]=useState<Array<ItemRow&{name:string}>>([]);const load=async()=>{if(!metadataKey)return;const[c,i]=await Promise.all([api<{items:ClientRow[]}>('/clients?deleted=true&limit=100'),api<{items:ItemRow[]}>('/items?deleted=true&limit=100')]);setClients(await Promise.all(c.items.map(async x=>({...x,name:(await decryptJson<ClientMeta>(metadataKey,x.metadata)).name}))));setItems(await Promise.all(i.items.map(async x=>({...x,name:(await decryptJson<ItemMeta>(metadataKey,x.metadata)).name}))))};useEffect(()=>{load()},[metadataKey]);return <Page title="Lixeira" description="Itens removidos continuam criptografados e podem ser restaurados."><div className="divide-y divide-ink/10 border-y border-ink/10">{clients.map(x=><Row key={x.id} name={x.name} kind="Perfil" onRestore={async()=>{await api(`/clients/${x.id}/restore`,{method:'POST'});load()}}/>)}{items.map(x=><Row key={x.id} name={x.name} kind="Credencial" onRestore={async()=>{await api(`/items/${x.id}/restore`,{method:'POST'});load()}}/> )}</div>{clients.length+items.length===0&&<EmptyState title="Lixeira vazia" description="Perfis e credenciais removidos aparecerão aqui."/>}</Page>}
function Row({name,kind,onRestore}:{name:string;kind:string;onRestore:()=>void}){return <div className="flex items-center justify-between gap-4 py-4"><div className="min-w-0"><p className="truncate text-sm font-medium">{name}</p><p className="mt-1 text-xs text-ink/45">{kind}</p></div><Button icon={<RotateCcw size={15}/>} onClick={onRestore}>Restaurar</Button></div>}
