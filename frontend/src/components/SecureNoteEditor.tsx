import { SecureTextEditor } from './SecureTextEditor'

export function SecureNoteEditor({value,onChange,maxLength=1024}:{value:string;onChange:(value:string)=>void;maxLength?:number}){
  return <SecureTextEditor value={value} onChange={onChange} maxLength={maxLength} placeholder="Escreva sua nota..." minRows={10} fullscreenLabel="Abrir nota em tela cheia"/>
}
