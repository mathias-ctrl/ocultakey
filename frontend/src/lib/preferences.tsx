import { createContext, useContext, useEffect, useMemo, useState } from 'react'

export type ThemeMode = 'light' | 'dark'
export type Locale = 'pt-BR' | 'en' | 'es'

type Preferences = {
  theme: ThemeMode
  setTheme: (theme: ThemeMode) => void
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: string) => string
}

const dictionary: Record<Locale, Record<string,string>> = {
  'pt-BR': {
    profiles:'Perfis', audit:'Auditoria', trash:'Lixeira', settings:'Configurações', logout:'Sair',
    searchVault:'Buscar no OcultaKey', searchProfile:'Buscar perfil', newProfile:'Novo perfil',
    credentials:'Credenciais', activity:'Atividade', newCredential:'Nova credencial',
    production:'Produção', homologation:'Homologação', selectCredential:'Selecione uma credencial',
    selectCredentialHelp:'Os detalhes aparecem aqui sem tirar você da lista do perfil.',
    noProfiles:'Nenhum perfil cadastrado', noCredentials:'Nenhuma credencial', language:'Idioma', appearance:'Aparência',
    light:'Claro', dark:'Escuro', themeHelp:'O tema é aplicado somente depois do login.',
    auditSearch:'Buscar na auditoria', allEvents:'Todos os eventos', allObjects:'Todos os objetos',
    profile:'Perfil', credential:'Credencial', loadMore:'Carregar mais', resultsPerPage:'Itens por página',
    name:'Nome', description:'Descrição', tags:'Tags', cancel:'Cancelar', save:'Salvar', password:'Senha',
    editProfile:'Editar perfil', deleteProfile:'Excluir perfil', saveProfile:'Salvar perfil',
    type:'Tipo', environment:'Ambiente', username:'Usuário / identificador', scopes:'Escopos', note:'Nota',
    protectedValues:'Valores protegidos', replace:'Substituir', protectedFields:'Campos protegidos', addField:'Campo',
    saveCredential:'Salvar credencial', editCredential:'Editar credencial', secureNote:'Nota segura',
    backupExport:'Backup e exportação', accountVault:'Conta e cofre', storage:'Armazenamento', googleDrive:'Google Drive',
    restore:'Restaurar', restoreOky:'Restaurar .oky', exportOky:'Exportar .oky', exportCsv:'Exportar CSV', localBackup:'Backup local agora',
    trashEmpty:'Lixeira vazia', restoreItem:'Restaurar', noActivity:'Ainda não há atividade registrada.'
  },
  en: {
    profiles:'Profiles', audit:'Audit', trash:'Trash', settings:'Settings', logout:'Sign out',
    searchVault:'Search OcultaKey', searchProfile:'Search profile', newProfile:'New profile',
    credentials:'Credentials', activity:'Activity', newCredential:'New credential',
    production:'Production', homologation:'Staging', selectCredential:'Select a credential',
    selectCredentialHelp:'Details appear here without leaving the profile list.',
    noProfiles:'No profiles yet', noCredentials:'No credentials', language:'Language', appearance:'Appearance',
    light:'Light', dark:'Dark', themeHelp:'Theme applies only after sign in.',
    auditSearch:'Search audit log', allEvents:'All events', allObjects:'All objects',
    profile:'Profile', credential:'Credential', loadMore:'Load more', resultsPerPage:'Items per page',
    name:'Name', description:'Description', tags:'Tags', cancel:'Cancel', save:'Save', password:'Password',
    editProfile:'Edit profile', deleteProfile:'Delete profile', saveProfile:'Save profile',
    type:'Type', environment:'Environment', username:'User / identifier', scopes:'Scopes', note:'Note',
    protectedValues:'Protected values', replace:'Replace', protectedFields:'Protected fields', addField:'Field',
    saveCredential:'Save credential', editCredential:'Edit credential', secureNote:'Secure note',
    backupExport:'Backup and export', accountVault:'Account and vault', storage:'Storage', googleDrive:'Google Drive',
    restore:'Restore', restoreOky:'Restore .oky', exportOky:'Export .oky', exportCsv:'Export CSV', localBackup:'Create local backup',
    trashEmpty:'Trash is empty', restoreItem:'Restore', noActivity:'No activity recorded yet.'
  },
  es: {
    profiles:'Perfiles', audit:'Auditoría', trash:'Papelera', settings:'Configuración', logout:'Salir',
    searchVault:'Buscar en OcultaKey', searchProfile:'Buscar perfil', newProfile:'Nuevo perfil',
    credentials:'Credenciales', activity:'Actividad', newCredential:'Nueva credencial',
    production:'Producción', homologation:'Homologación', selectCredential:'Selecciona una credencial',
    selectCredentialHelp:'Los detalles aparecen aquí sin salir de la lista del perfil.',
    noProfiles:'No hay perfiles', noCredentials:'No hay credenciales', language:'Idioma', appearance:'Apariencia',
    light:'Claro', dark:'Oscuro', themeHelp:'El tema se aplica solo después de iniciar sesión.',
    auditSearch:'Buscar en auditoría', allEvents:'Todos los eventos', allObjects:'Todos los objetos',
    profile:'Perfil', credential:'Credencial', loadMore:'Cargar más', resultsPerPage:'Elementos por página',
    name:'Nombre', description:'Descripción', tags:'Etiquetas', cancel:'Cancelar', save:'Guardar', password:'Contraseña',
    editProfile:'Editar perfil', deleteProfile:'Eliminar perfil', saveProfile:'Guardar perfil',
    type:'Tipo', environment:'Ambiente', username:'Usuario / identificador', scopes:'Alcances', note:'Nota',
    protectedValues:'Valores protegidos', replace:'Sustituir', protectedFields:'Campos protegidos', addField:'Campo',
    saveCredential:'Guardar credencial', editCredential:'Editar credencial', secureNote:'Nota segura',
    backupExport:'Backup y exportación', accountVault:'Cuenta y bóveda', storage:'Almacenamiento', googleDrive:'Google Drive',
    restore:'Restaurar', restoreOky:'Restaurar .oky', exportOky:'Exportar .oky', exportCsv:'Exportar CSV', localBackup:'Crear backup local',
    trashEmpty:'La papelera está vacía', restoreItem:'Restaurar', noActivity:'Todavía no hay actividad registrada.'
  }
}

const Context = createContext<Preferences | null>(null)

export function PreferencesProvider({children}:{children:React.ReactNode}){
  const [theme,setThemeState]=useState<ThemeMode>(() => (localStorage.getItem('ok-theme') as ThemeMode) || 'light')
  const [locale,setLocaleState]=useState<Locale>(() => (localStorage.getItem('ok-locale') as Locale) || 'pt-BR')
  const setTheme=(value:ThemeMode)=>{setThemeState(value);localStorage.setItem('ok-theme',value)}
  const setLocale=(value:Locale)=>{setLocaleState(value);localStorage.setItem('ok-locale',value)}
  useEffect(()=>{
    const root=document.documentElement
    const body=document.body
    root.dataset.theme=theme
    body.dataset.theme=theme
    return()=>{
      root.dataset.theme='light'
      body.dataset.theme='light'
    }
  },[theme])
  const value=useMemo(()=>({theme,setTheme,locale,setLocale,t:(key:string)=>dictionary[locale][key]??dictionary['pt-BR'][key]??key}),[theme,locale])
  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function usePreferences(){const value=useContext(Context);if(!value)throw new Error('PreferencesProvider missing');return value}
