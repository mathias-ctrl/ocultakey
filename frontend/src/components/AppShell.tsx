import { useEffect, useState } from 'react'
import { Menu, Search } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { ClientForm } from './ClientForm'
import { Input } from './ui/Field'
import { usePreferences } from '../lib/preferences'
import { PrivacyProvider } from '../lib/privacy'

export function AppShell({children}:{children:React.ReactNode}){
  const [mobile,setMobile]=useState(false)
  const [newClient,setNewClient]=useState(false)
  const [query,setQuery]=useState('')
  const navigate=useNavigate(); const location=useLocation(); const{t}=usePreferences()
  useEffect(()=>{const handle=window.setTimeout(()=>{const q=query.trim();navigate(q?`/?q=${encodeURIComponent(q)}`:'/',{replace:true})},220);return()=>window.clearTimeout(handle)},[query])
  const section=location.pathname==='/audit'?t('audit'):location.pathname==='/trash'?t('trash'):location.pathname==='/settings'?t('settings'):t('profiles')
  return <PrivacyProvider><div className="min-h-screen bg-canvas text-ink">
    <Sidebar mobileOpen={mobile} onClose={()=>setMobile(false)} onNewClient={()=>setNewClient(true)}/>
    <div className="min-h-screen lg:pl-64">
      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-ink/10 bg-surface/95 px-4 backdrop-blur-sm sm:px-6">
        <button className="ui-icon-button lg:hidden" onClick={()=>setMobile(true)}><Menu size={19}/></button>
        <div className="relative w-full max-w-xl"><Search size={15} className="absolute left-3 top-3 text-ink/35"/><Input value={query} onChange={e=>setQuery(e.target.value)} placeholder={t('searchVault')} className="pl-9"/></div>
        <div className="ml-auto hidden text-xs font-medium text-ink/45 sm:block">{section}</div>
      </header>
      <div className="min-h-[calc(100vh-64px)]">{children}</div>
    </div>
    {newClient&&<ClientForm onClose={()=>setNewClient(false)} onSaved={()=>{window.dispatchEvent(new Event('ocultakey:clients-changed'))}}/>}
  </div></PrivacyProvider>
}
