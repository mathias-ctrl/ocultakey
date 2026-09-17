import { Button } from './Button'
import { Modal } from './Modal'
export function ConfirmDialog({title,description,confirmLabel='Confirmar',danger=false,onClose,onConfirm}:{title:string;description:string;confirmLabel?:string;danger?:boolean;onClose:()=>void;onConfirm:()=>Promise<void>|void}){return <Modal title={title} description={description} onClose={onClose} width="sm"><div className="flex justify-end gap-2"><Button variant="text" onClick={onClose}>Cancelar</Button><Button variant={danger?'danger':'primary'} onClick={()=>onConfirm()}>{confirmLabel}</Button></div></Modal>}
