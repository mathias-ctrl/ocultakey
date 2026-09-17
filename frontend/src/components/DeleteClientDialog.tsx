import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { api } from '../lib/api'
import { useVault } from '../lib/vault-context'
import type { DecryptedClient } from '../types'
import { Button } from './ui/Button'
import { Field, Input } from './ui/Field'
import { Modal } from './ui/Modal'
import { useToast } from '../lib/toast'
import { usePreferences } from '../lib/preferences'

export function DeleteClientDialog({client,onClose,onDeleted}:{client:DecryptedClient;onClose:()=>void;onDeleted:()=>void}){
  const {confirmPassword}=useVault();const{show}=useToast();const{t}=usePreferences();const[password,setPassword]=useState('');const[visible,setVisible]=useState(false);const[loading,setLoading]=useState(false);const[error,setError]=useState('')
  const submit=async(e:React.FormEvent)=>{e.preventDefault();setLoading(true);setError('');try{const token=await confirmPassword(password,`delete_client:${client.id}`);await api(`/clients/${client.id}`,{method:'DELETE',headers:{'X-Reauth-Token':token}});window.dispatchEvent(new Event('ocultakey:clients-changed'));show({kind:'success',title:'Perfil movido para a lixeira'});onDeleted();onClose()}catch(err){setError(err instanceof Error?err.message:'Não foi possível excluir o perfil.')}finally{setLoading(false)}}
  return <Modal title={t('deleteProfile')} description={`O perfil ${client.meta.name} e suas credenciais serão enviados para a lixeira.`} onClose={onClose} width="sm"><form onSubmit={submit} className="space-y-5"><div className="border-l-2 border-ink px-3 py-1 text-sm leading-6 text-ink/65">Confirme sua senha para continuar. O perfil poderá ser restaurado pela lixeira.</div><Field label={t('password')}><div className="relative"><Input autoFocus type={visible?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" className="pr-11"/><button type="button" onClick={()=>setVisible(!visible)} className="absolute right-0 top-0 flex h-10 w-10 items-center justify-center text-ink/45">{visible?<EyeOff size={17}/>:<Eye size={17}/>}</button></div></Field>{error&&<p className="ui-error">{error}</p>}<div className="flex justify-end gap-2 border-t border-ink/10 pt-4"><Button type="button" variant="text" onClick={onClose}>{t('cancel')}</Button><Button variant="danger" disabled={password.length<8||loading}>{loading?'Excluindo...':t('deleteProfile')}</Button></div></form></Modal>
}
