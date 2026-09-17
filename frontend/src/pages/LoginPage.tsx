import { useState } from 'react'
import { Eye, EyeOff, KeyRound, LockKeyhole, Search, ShieldCheck, SlidersHorizontal } from 'lucide-react'
import { useVault } from '../lib/vault-context'
import { Button } from '../components/ui/Button'
import { Field, Input } from '../components/ui/Field'

export function LoginPage(){
 const {login}=useVault();const[email,setEmail]=useState('');const[password,setPassword]=useState('');const[visible,setVisible]=useState(false);const[loading,setLoading]=useState(false);const[error,setError]=useState('')
 const submit=async(e:React.FormEvent)=>{e.preventDefault();setLoading(true);setError('');try{await login(email,password)}catch(err){setError(err instanceof Error?err.message:'Não foi possível entrar.')}finally{setLoading(false)}}
 return <main className="grid min-h-screen bg-[#F4F6F8] text-[#111827] lg:grid-cols-[1.15fr_.85fr]">
  <section className="hidden border-r border-black/10 lg:flex lg:flex-col">
   <div className="flex flex-1 items-center justify-center p-10 xl:p-14">
    <div className="w-full max-w-3xl overflow-hidden rounded-[12px] border border-black/15 bg-white shadow-[0_22px_60px_rgba(17,24,39,.14)]">
     <div className="flex h-10 items-center gap-3 border-b border-black/10 bg-[#ECEFF3] px-4">
      <div className="flex gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#111827]/25"/><span className="h-2.5 w-2.5 rounded-full bg-[#111827]/18"/><span className="h-2.5 w-2.5 rounded-full bg-[#111827]/12"/></div>
      <div className="mx-auto flex h-6 w-[48%] items-center justify-center rounded-md border border-black/10 bg-white px-3 text-[10px] text-black/35">ocultakey.local</div>
      <div className="w-[44px]"/>
     </div>
     <div className="grid min-h-[440px] grid-cols-[220px_1fr] bg-[#F4F6F8]">
      <aside className="bg-[#111827] p-4 text-white">
       <div className="mb-5 flex items-center gap-2.5 px-1 text-sm font-semibold"><span className="flex h-7 w-7 items-center justify-center rounded-md bg-white/10"><KeyRound size={14}/></span> OcultaKey</div>
       <div className="relative mb-5"><Search size={14} className="absolute left-2.5 top-2.5 text-white/35"/><div className="h-9 rounded-md border border-white/10 bg-white/[.06] pl-8 pt-2 text-xs text-white/35">Buscar perfil</div></div>
       <div className="mb-5 space-y-1 text-xs"><div className="rounded-md bg-white/[.08] px-3 py-2 font-medium text-white">Perfis</div><div className="px-3 py-2 text-white/55">Auditoria</div><div className="px-3 py-2 text-white/55">Lixeira</div><div className="px-3 py-2 text-white/55">Configurações</div></div>
       <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[.12em] text-white/28">Perfis recentes</p>
       {['Junior Barbearia','Pizzaria Tradição','Clínica Nova Visão'].map((x,i)=><div key={x} className={`mb-1 rounded-md px-3 py-2 text-xs ${i===0?'bg-[#2563EB] text-white':'text-white/55'}`}>{x}</div>)}
      </aside>
      <div className="min-w-0">
       <div className="flex h-12 items-center gap-3 border-b border-black/10 bg-white px-5"><div className="relative w-full max-w-sm"><Search size={12} className="absolute left-2.5 top-2.5 text-black/25"/><div className="h-8 rounded-md border border-black/10 bg-white pl-8 pt-[7px] text-[10px] text-black/28">Buscar no OcultaKey</div></div><span className="ml-auto text-[10px] font-medium text-black/35">Perfis</span></div>
       <div className="grid h-[388px] grid-cols-[minmax(245px,42%)_1fr]">
        <section className="border-r border-black/10 bg-white">
         <div className="border-b border-black/10 px-5 py-4"><p className="text-[10px] font-medium text-black/35">Perfil</p><h2 className="mt-1 text-sm font-semibold">Junior Barbearia</h2><p className="mt-1 text-[10px] text-black/38">Site, agenda e integrações</p><div className="mt-3 flex gap-3 border-b border-black/10 text-[10px]"><span className="border-b-2 border-[#2563EB] pb-2 font-medium">Credenciais</span><span className="pb-2 text-black/35">Atividade</span></div></div>
         <div className="flex items-center gap-2 border-b border-black/10 p-3"><div className="relative min-w-0 flex-1"><Search size={11} className="absolute left-2.5 top-2.5 text-black/25"/><div className="h-8 rounded-md border border-black/10 pl-8 pt-[7px] text-[10px] text-black/28">Buscar credencial</div></div><div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#2563EB] text-white">+</div></div>
         <div>{[['••••••••','API Key'],['••••••••','Login'],['••••••••','Banco de dados'],['••••••••','Token']].map(([a,b],i)=><div key={a} className={`flex items-center justify-between border-b border-black/[.07] px-4 py-3 ${i===0?'bg-[#2563EB]/[.06]':''}`}><div><p className="text-[11px] font-medium">{a}</p><p className="mt-1 text-[9px] text-black/35">{b} • Produção</p></div><span className="font-mono text-[9px] text-black/18">••••••</span></div>)}</div>
        </section>
        <section className="bg-[#F4F6F8]">
         <div className="border-b border-black/10 bg-white px-5 py-4"><div className="flex items-start justify-between"><div><p className="text-[9px] text-black/35">API Key • Produção</p><h3 className="mt-1 text-sm font-semibold">••••••••</h3><p className="mt-1 text-[10px] text-black/35">Conta principal do perfil</p></div><SlidersHorizontal size={14} className="text-black/30"/></div></div>
         <div className="p-5"><div className="overflow-hidden rounded-md border border-black/10 bg-white"><PreviewRow label="URL" value="https://asaas.com"/><PreviewRow label="API Key" value="••••••••••••••"/><PreviewRow label="Escopo" value="payments.read"/></div><p className="mt-3 text-[9px] text-black/28">Atualizado há poucos minutos</p></div>
        </section>
       </div>
      </div>
     </div>
    </div>
   </div>
   <div className="px-10 pb-9 text-sm text-black/42"><p className="max-w-xl leading-6">Perfis e credenciais em uma interface direta, com criptografia antes dos dados saírem do navegador.</p></div>
  </section>
  <section className="flex items-center justify-center bg-white p-5 sm:p-8"><div className="w-full max-w-md"><div className="mb-8 flex items-center gap-2.5 lg:hidden"><span className="flex h-9 w-9 items-center justify-center rounded-md bg-[#111827] text-white"><KeyRound size={17}/></span><span className="font-semibold">OcultaKey</span></div><h1 className="text-2xl font-semibold">Entrar</h1><p className="mt-2 text-sm leading-6 text-black/50">Use a conta criada no primeiro boot da instalação.</p><form onSubmit={submit} className="mt-7 space-y-5"><Field label="Email"><Input autoFocus type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="username" required placeholder="voce@exemplo.com"/></Field><Field label="Senha"><div className="relative"><Input type={visible?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required className="pr-11"/><button type="button" onClick={()=>setVisible(!visible)} className="absolute right-0 top-0 flex h-10 w-10 items-center justify-center text-black/45">{visible?<EyeOff size={17}/>:<Eye size={17}/>}</button></div></Field>{error&&<p className="ui-error">{error}</p>}<Button variant="primary" className="w-full" disabled={loading}>{loading?'Abrindo cofre...':'Entrar'}</Button></form><div className="mt-7 grid gap-3 border-t border-black/10 pt-5 text-xs leading-5 text-black/45"><div className="flex gap-3"><ShieldCheck size={17} className="mt-0.5 shrink-0 text-[#2563EB]"/><p>Metadados ficam disponíveis após o login. Segredos continuam protegidos até você solicitar acesso.</p></div><div className="flex gap-3"><LockKeyhole size={17} className="mt-0.5 shrink-0 text-[#2563EB]"/><p>Criar e editar usa a sessão autenticada. Revelar ou copiar um segredo exige confirmação quando necessário.</p></div></div></div></section>
 </main>
}

function PreviewRow({label,value}:{label:string;value:string}){return <div className="grid grid-cols-[82px_1fr] border-b border-black/[.07] px-4 py-3 text-[10px] last:border-b-0"><span className="text-black/35">{label}</span><span className="truncate font-mono text-black/65">{value}</span></div>}
