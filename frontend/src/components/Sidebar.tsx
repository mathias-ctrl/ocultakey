import { useEffect, useMemo, useState } from 'react'
import { ArchiveRestore, Eye, EyeOff, FileClock, KeyRound, LogOut, Plus, Search, Settings, UsersRound, X } from 'lucide-react'
import { NavLink, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { blindTokensForQuery, decryptJson } from '../lib/crypto'
import { useVault } from '../lib/vault-context'
import { usePreferences } from '../lib/preferences'
import type { ClientMeta, ClientRow, DecryptedClient } from '../types'
import { Input } from './ui/Field'
import { usePrivacy } from '../lib/privacy'

async function decryptRows(rows:ClientRow[], key:Uint8Array){return Promise.all(rows.map(async row=>({...row,meta:await decryptJson<ClientMeta>(key,row.metadata)})))}

export function Sidebar({ mobileOpen, onClose, onNewClient }:{mobileOpen:boolean;onClose:()=>void;onNewClient:()=>void}){
  const {metadataKey,searchKey,logout}=useVault();const{t}=usePreferences();const{hideCredentialNames,toggleCredentialNames}=usePrivacy()
  const [rows,setRows]=useState<DecryptedClient[]>([]);const [query,setQuery]=useState('');const [loading,setLoading]=useState(true)
  const [params]=useSearchParams();const navigate=useNavigate();const selected=params.get('client')
  const load=async(search='')=>{if(!metadataKey)return;setLoading(true);try{
    if(search.trim()&&searchKey){const tokens=await blindTokensForQuery(searchKey,search);if(tokens.length){const result=await api<{clients:ClientRow[]}>('/search',{method:'POST',body:JSON.stringify({tokens,scope:'clients',limit:50})});setRows(await decryptRows(result.clients,metadataKey));return}}
    const page=await api<{items:ClientRow[]}>('/clients?limit=50');setRows(await decryptRows(page.items,metadataKey))
  }finally{setLoading(false)}}
  useEffect(()=>{load()},[metadataKey])
  useEffect(()=>{const h=()=>load(query);window.addEventListener('ocultakey:clients-changed',h);return()=>window.removeEventListener('ocultakey:clients-changed',h)},[query,metadataKey,searchKey])
  useEffect(()=>{const h=window.setTimeout(()=>load(query),180);return()=>window.clearTimeout(h)},[query])

  const content=useMemo(()=> <div className="ok-sidebar flex h-full flex-col border-r border-white/10">
    <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
      <button className="flex items-center gap-2.5" onClick={()=>navigate('/')}><span className="flex h-8 w-8 items-center justify-center rounded-md bg-white text-sidebar"><KeyRound size={16}/></span><span className="text-[15px] font-semibold">OcultaKey</span></button>
      <div className="flex items-center gap-1"><button className="ui-icon-button !h-8 !w-8" onClick={toggleCredentialNames} title={hideCredentialNames?'Mostrar nomes das credenciais':'Ocultar nomes das credenciais'}>{hideCredentialNames?<EyeOff size={16}/>:<Eye size={16}/>}</button><button className="ui-icon-button lg:hidden" onClick={onClose}><X size={18}/></button></div>
    </div>
    <nav className="px-3 py-3 text-sm">
      <NavItem to="/" icon={<UsersRound size={16}/>}>{t('profiles')}</NavItem>
      <NavItem to="/audit" icon={<FileClock size={16}/>}>{t('audit')}</NavItem>
      <NavItem to="/trash" icon={<ArchiveRestore size={16}/>}>{t('trash')}</NavItem>
    </nav>
    <div className="border-t border-white/10 px-3 pt-4">
      <div className="mb-2 flex items-center justify-between px-1"><span className="text-xs font-medium text-white/55">{t('profiles')}</span><button className="ui-icon-button !h-8 !w-8" onClick={onNewClient} title={t('newProfile')}><Plus size={16}/></button></div>
      <div className="relative"><Search className="absolute left-3 top-2.5 text-white/35" size={15}/><Input value={query} onChange={e=>setQuery(e.target.value)} placeholder={t('searchProfile')} className="!h-9 !min-h-9 pl-9 text-[13px]"/></div>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
      {loading&&rows.length===0?<div className="space-y-2 px-2"><div className="h-9 animate-pulse bg-white/[.06]"/><div className="h-9 animate-pulse bg-white/[.06]"/><div className="h-9 animate-pulse bg-white/[.06]"/></div>:rows.map(client=><button key={client.id} onClick={()=>{navigate(`/?client=${client.id}`);onClose()}} className={`mb-0.5 w-full rounded-md px-3 py-2 text-left text-[13px] transition ${selected===client.id?'bg-white/[.11] text-white':'text-white/65 hover:bg-white/[.07] hover:text-white'}`}><span className="block truncate font-medium">{client.meta.name}</span>{client.meta.description&&<span className="mt-0.5 block truncate text-[11px] opacity-55">{client.meta.description}</span>}</button>)}
      {!loading&&rows.length===0&&<p className="px-3 py-6 text-center text-xs text-white/40">{t('noProfiles')}</p>}
    </div>
    <div className="border-t border-white/10 p-3 text-sm">
      <NavItem to="/settings" icon={<Settings size={16}/>}>{t('settings')}</NavItem>
      <button className="mt-1 flex min-h-10 w-full items-center gap-3 rounded-md px-3 text-left text-white/60 transition hover:bg-white/[.07] hover:text-white" onClick={()=>logout()}><LogOut size={16}/><span>{t('logout')}</span></button>
    </div>
  </div>,[rows,query,loading,selected,t])
  return <><aside className="fixed inset-y-0 left-0 z-40 hidden w-64 lg:block">{content}</aside>{mobileOpen&&<div className="fixed inset-0 z-[70] bg-black/55 lg:hidden" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><aside className="h-full w-[88vw] max-w-72">{content}</aside></div>}</>
}
function NavItem({to,icon,children}:{to:string;icon:React.ReactNode;children:React.ReactNode}){return <NavLink to={to} end={to==='/'} className={({isActive})=>`mb-0.5 flex min-h-10 items-center gap-3 rounded-md px-3 transition ${isActive?'bg-white/[.11] font-medium text-white':'text-white/60 hover:bg-white/[.07] hover:text-white'}`}>{icon}<span>{children}</span></NavLink>}
