import { useState } from 'react'
import { api, idempotencyKey } from '../lib/api'
import { blindTokensForClient, encryptJson } from '../lib/crypto'
import { useVault } from '../lib/vault-context'
import type { ClientMeta, DecryptedClient } from '../types'
import { Button } from './ui/Button'
import { Field, Input } from './ui/Field'
import { SecureTextEditor } from './SecureTextEditor'
import { Modal } from './ui/Modal'
import { useToast } from '../lib/toast'
import { usePreferences } from '../lib/preferences'

export function ClientForm({ current, onClose, onSaved }: { current?: DecryptedClient; onClose:()=>void; onSaved:()=>void }) {
  const { metadataKey, searchKey } = useVault()
  const {show}=useToast();const{t}=usePreferences()
  const [name,setName]=useState(current?.meta.name ?? '')
  const [description,setDescription]=useState(current?.meta.description ?? '')
  const [tags,setTags]=useState(current?.meta.tags.join(', ') ?? '')
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')

  const save=async(e:React.FormEvent)=>{
    e.preventDefault(); if(!metadataKey||!searchKey)return
    setLoading(true);setError('')
    try{
      const meta:ClientMeta={schema:1,name:name.trim(),description:description.trim(),tags:tags.split(',').map(x=>x.trim()).filter(Boolean)}
      const payload={metadata:await encryptJson(metadataKey,meta),search_tokens:await blindTokensForClient(searchKey,meta),favorite:current?.favorite??false}
      await api(current?`/clients/${current.id}`:'/clients',{method:current?'PUT':'POST',headers:current?{}:{'Idempotency-Key':idempotencyKey()},body:JSON.stringify(payload)})
      onSaved();window.dispatchEvent(new Event('ocultakey:clients-changed'));show({kind:'success',title:current?'Perfil atualizado':'Perfil criado'});onClose()
    }catch(err){setError(err instanceof Error?err.message:'Não foi possível salvar o perfil.')}finally{setLoading(false)}
  }
  return <Modal title={current?t('editProfile'):t('newProfile')} description="Organize as credenciais deste perfil." onClose={onClose}>
    <form onSubmit={save} className="space-y-5">
      <Field label={t('name')}><Input autoFocus value={name} onChange={e=>setName(e.target.value)} required maxLength={128} placeholder="Ex.: Junior Barbearia"/></Field>
      {current&&<Field label={t('description')} hint="Máximo de 256 caracteres."><SecureTextEditor value={description} onChange={setDescription} maxLength={256} placeholder="Ex.: Site, agenda e integrações" minRows={5} fullscreenLabel="Abrir descrição em tela cheia"/></Field>}
      <Field label={t('tags')} hint="Separe por vírgula."><Input value={tags} maxLength={64} onChange={e=>setTags(e.target.value)} placeholder="site, produção, suporte"/></Field>
      {error&&<p className="ui-error">{error}</p>}
      <div className="flex justify-end gap-2 border-t border-ink/10 pt-4"><Button type="button" variant="text" onClick={onClose}>{t('cancel')}</Button><Button variant="primary" disabled={loading||!name.trim()}>{loading?'Salvando...':t('saveProfile')}</Button></div>
    </form>
  </Modal>
}
