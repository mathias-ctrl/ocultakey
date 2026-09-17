import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useVault } from '../lib/vault-context'
import { Button } from './ui/Button'
import { Field, Input } from './ui/Field'
import { Modal } from './ui/Modal'

export function ConfirmPassword({ onClose, onUnlocked }: { onClose: () => void; onUnlocked: () => void }) {
  const { unlockSecret } = useVault()
  const [password, setPassword] = useState('')
  const [visible, setVisible] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const submit = async (e: React.FormEvent) => {e.preventDefault();setLoading(true);setError('');try{await unlockSecret(password);setPassword('');onUnlocked()}catch{setError('Senha incorreta.')}finally{setLoading(false)}}
  return <Modal title="Confirmar senha" description="A confirmação libera a leitura dos segredos pelo período configurado." onClose={onClose} width="sm">
    <form onSubmit={submit} className="space-y-5"><Field label="Senha"><div className="relative"><Input autoFocus className="pr-11" type={visible?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password"/><button type="button" onClick={()=>setVisible(!visible)} className="absolute right-0 top-0 flex h-10 w-10 items-center justify-center text-ink/45">{visible?<EyeOff size={17}/>:<Eye size={17}/>}</button></div></Field>{error&&<p className="ui-error">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="text" onClick={onClose}>Cancelar</Button><Button variant="primary" disabled={loading||password.length<8}>{loading?'Confirmando...':'Confirmar'}</Button></div></form>
  </Modal>
}
