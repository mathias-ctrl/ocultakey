import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { api, setAccessToken, setActiveSectorId, setSessionExpiredHandler } from './api'
import { b64ToBytes, deriveAuthProof, deriveKek, makeSectorKeyBundle, openMetadataKeysFromKek, openSecretDecryptKeyFromKek, openSecretEncryptKeyFromKek, rewrapAccountBundle, unwrapVaultKey, wrapSectorKeys } from './crypto'
import type { VaultBundle } from '../types'
import { useToast } from './toast'

type VaultContextValue = {
  authenticated: boolean
  email: string
  displayName: string
  role: string
  sectors: Array<{id:string;name:string;rotation_required:boolean;metadataKey:Uint8Array;searchKey:Uint8Array;secretRaw:Uint8Array}>
  activeSectorId: string | null
  switchSector: (id:string|null) => void
  createSector: (name:string,password:string) => Promise<void>
  acknowledgeSectorRotation: (id:string) => Promise<void>
  changePassword: (currentPassword:string,newPassword:string) => Promise<void>
  vault: VaultBundle | null
  metadataKey: Uint8Array | null
  searchKey: Uint8Array | null
  secretEncryptKey: CryptoKey | null
  secretKey: CryptoKey | null
  secretUnlockMinutes: number
  vaultAutoLockMinutes: number
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  unlockSecret: (password: string) => Promise<void>
  confirmPassword: (password: string, purpose: string) => Promise<string>
  lockSecret: () => void
}

const VaultContext = createContext<VaultContextValue | null>(null)

export function VaultProvider({ children }: { children: React.ReactNode }) {
  const { show } = useToast()
  const [authenticated, setAuthenticated] = useState(false)
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState('member')
  const [sectors, setSectors] = useState<VaultContextValue['sectors']>([])
  const [activeSectorId, setActiveSector] = useState<string|null>(null)
  const [vault, setVault] = useState<VaultBundle | null>(null)
  const [metadataKey, setMetadataKey] = useState<Uint8Array | null>(null)
  const [searchKey, setSearchKey] = useState<Uint8Array | null>(null)
  const [secretEncryptKey, setSecretEncryptKey] = useState<CryptoKey | null>(null)
  const [secretKey, setSecretKey] = useState<CryptoKey | null>(null)
  const [secretUnlockMinutes, setSecretUnlockMinutes] = useState(1)
  const [vaultAutoLockMinutes, setVaultAutoLockMinutes] = useState(10)
  const secretTimer = useRef<number | null>(null)
  const personalKeys = useRef<{metadataKey:Uint8Array;searchKey:Uint8Array;secretEncryptKey:CryptoKey}|null>(null)

  const clearLocalSession = () => {
    setAccessToken(null)
    setActiveSectorId(null)
    personalKeys.current?.metadataKey.fill(0);personalKeys.current?.searchKey.fill(0);personalKeys.current=null
    lockSecret()
    metadataKey?.fill(0)
    searchKey?.fill(0)
    setMetadataKey(null)
    setSearchKey(null)
    setSecretEncryptKey(null)
    setVault(null)
    setEmail('')
    setDisplayName('')
    setRole('member')
    sectors.forEach(s=>{s.metadataKey.fill(0);s.searchKey.fill(0);s.secretRaw.fill(0)})
    setSectors([])
    setActiveSector(null)
    setAuthenticated(false)
  }

  const lockSecret = () => {
    if (secretTimer.current) window.clearTimeout(secretTimer.current)
    secretTimer.current = null
    setSecretKey(null)
  }

  const login = async (userEmail: string, password: string) => {
    const pre = await api<{ kdf_salt: string; kdf_memory_kib: number; kdf_iterations: number; kdf_parallelism: number }>(`/auth/prelogin?email=${encodeURIComponent(userEmail)}`)
    const kek = await deriveKek(password, pre)
    try {
      const authProof = await deriveAuthProof(kek)
      const response = await api<{ access_token: string; expires_in: number; vault: VaultBundle }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: userEmail, auth_proof: authProof, device_name: navigator.userAgent.slice(0, 150) })
      })
      setAccessToken(response.access_token)
      const [keys, encryptKey] = await Promise.all([
        openMetadataKeysFromKek(kek, response.vault),
        openSecretEncryptKeyFromKek(kek, response.vault)
      ])
      personalKeys.current={...keys,secretEncryptKey:encryptKey}
      const me = await api<{ email: string; display_name:string; role:string; secret_unlock_minutes: number; vault_auto_lock_minutes: number }>('/auth/me')
      const sectorRows=await api<Array<{id:string;name:string;rotation_required:boolean;wrapped_sector_key:string;key_nonce:string}>>('/sectors')
      const sectorData=await Promise.all(sectorRows.map(async s=>{
        const packed=await unwrapVaultKey(kek,s.wrapped_sector_key,s.key_nonce)
        try { const keys=JSON.parse(new TextDecoder().decode(packed)) as {metadata:string;search:string;secret:string}; return {id:s.id,name:s.name,rotation_required:s.rotation_required,metadataKey:b64ToBytes(keys.metadata),searchKey:b64ToBytes(keys.search),secretRaw:b64ToBytes(keys.secret)} }
        finally {packed.fill(0)}
      }))
      setSectors(sectorData)
      setActiveSector(null);setActiveSectorId(null)
      setVault(response.vault)
      setMetadataKey(keys.metadataKey)
      setSearchKey(keys.searchKey)
      setSecretEncryptKey(encryptKey)
      setEmail(me.email)
      setDisplayName(me.display_name)
      setRole(me.role)
      setSecretUnlockMinutes(me.secret_unlock_minutes)
      setVaultAutoLockMinutes(me.vault_auto_lock_minutes)
      setAuthenticated(true)
    } finally {
      kek.fill(0)
    }
  }

  const switchSector = (id:string|null) => {
    setActiveSector(id)
    setActiveSectorId(id)
    setSecretKey(null)
    if(id===null){const p=personalKeys.current;if(p){setMetadataKey(p.metadataKey);setSearchKey(p.searchKey);setSecretEncryptKey(p.secretEncryptKey)}return}
    const s=sectors.find(x=>x.id===id);if(!s)return
    setMetadataKey(s.metadataKey);setSearchKey(s.searchKey)
    void crypto.subtle.importKey('raw',s.secretRaw,{name:'AES-GCM'},false,['encrypt']).then(setSecretEncryptKey)
    setSecretKey(null)
  }

  const createSector = async(name:string,password:string) => {
    if(!vault||role!=='superadmin')throw new Error('Somente o superadmin pode criar setores')
    const kek=await deriveKek(password,vault)
    try{
      const authProof=await deriveAuthProof(kek)
      const auth=await api<{token:string}>('/auth/reauth',{method:'POST',body:JSON.stringify({auth_proof:authProof,purpose:'create_sector'})})
      const bundle=await makeSectorKeyBundle(kek)
      const row=await api<{id:string;name:string;rotation_required:boolean}>('/sectors',{method:'POST',headers:{'X-Reauth-Token':auth.token},body:JSON.stringify({name,wrapped_sector_key:bundle.ciphertext,key_nonce:bundle.nonce})})
      const sector={...row,metadataKey:bundle.keys.metadata,searchKey:bundle.keys.search,secretRaw:bundle.keys.secret}
      setSectors(prev=>[...prev,sector]);setActiveSector(row.id);setActiveSectorId(row.id)
      setMetadataKey(sector.metadataKey);setSearchKey(sector.searchKey);setSecretKey(null)
      setSecretEncryptKey(await crypto.subtle.importKey('raw',sector.secretRaw,{name:'AES-GCM'},false,['encrypt']))
    }finally{kek.fill(0)}
  }

  const acknowledgeSectorRotation=async(id:string)=>{
    await api(`/sectors/${id}/rotation-complete`,{method:'POST'})
    setSectors(prev=>prev.map(s=>s.id===id?{...s,rotation_required:false}:s))
  }

  const changePassword=async(currentPassword:string,newPassword:string)=>{
    if(!vault||!personalKeys.current)throw new Error('Cofre indisponível')
    const oldKek=await deriveKek(currentPassword,vault)
    let newKek:Uint8Array|undefined
    try{
      const currentAuthProof=await deriveAuthProof(oldKek)
      const changed=await rewrapAccountBundle(oldKek,newPassword,vault,personalKeys.current)
      newKek=changed.newKek
      const wrappedSectors=await Promise.all(sectors.map(async sector=>{
        const wrapped=await wrapSectorKeys(newKek!,sector)
        return {sector_id:sector.id,wrapped_sector_key:wrapped.ciphertext,key_nonce:wrapped.nonce}
      }))
      await api('/auth/password',{method:'POST',body:JSON.stringify({current_auth_proof:currentAuthProof,new_auth_proof:changed.newAuthProof,vault:changed.vault,sectors:wrappedSectors})})
      setVault(changed.vault)
    }finally{oldKek.fill(0);newKek?.fill(0)}
  }

  const confirmPassword = async (password: string, purpose: string) => {
    if (!vault) throw new Error('Cofre indisponível')
    const kek = await deriveKek(password, vault)
    try {
      const authProof = await deriveAuthProof(kek)
      const response = await api<{ token: string }>('/auth/reauth', {
        method: 'POST',
        body: JSON.stringify({ auth_proof: authProof, purpose })
      })
      return response.token
    } finally {
      kek.fill(0)
    }
  }

  const unlockSecret = async (password: string) => {
    if (!vault) throw new Error('Cofre indisponível')
    const kek = await deriveKek(password, vault)
    try {
      const authProof = await deriveAuthProof(kek)
      await api('/auth/reauth', { method: 'POST', body: JSON.stringify({ auth_proof: authProof, purpose: 'secret_access' }) })
      const sector=activeSectorId?sectors.find(s=>s.id===activeSectorId):null
      const key = sector ? await crypto.subtle.importKey('raw',sector.secretRaw,{name:'AES-GCM'},false,['decrypt']) : await openSecretDecryptKeyFromKek(kek, vault)
      lockSecret()
      setSecretKey(key)
      secretTimer.current = window.setTimeout(lockSecret, secretUnlockMinutes * 60_000)
    } finally {
      kek.fill(0)
    }
  }

  const logout = async () => {
    try { await api('/auth/logout', { method: 'POST' }) } catch {}
    clearLocalSession()
  }

  useEffect(() => {
    setSessionExpiredHandler(() => {
      clearLocalSession()
      show({ kind: 'info', title: 'Sessão expirada', message: 'Entre novamente para continuar.' })
    })
    return () => setSessionExpiredHandler(null)
  }, [metadataKey, searchKey])

  useEffect(() => {
    if(!authenticated)return
    const sync=async()=>{
      try{
        const rows=await api<Array<{id:string;rotation_required:boolean}>>('/sectors')
        const latest=new Map(rows.map(row=>[row.id,row.rotation_required]))
        setSectors(prev=>prev.filter(s=>latest.has(s.id)).map(s=>({...s,rotation_required:latest.get(s.id)??s.rotation_required})))
        if(activeSectorId&&!latest.has(activeSectorId)){
          setActiveSector(null);setActiveSectorId(null);setSecretKey(null)
          const personal=personalKeys.current
          if(personal){setMetadataKey(personal.metadataKey);setSearchKey(personal.searchKey);setSecretEncryptKey(personal.secretEncryptKey)}
        }
      }catch{}
    }
    const timer=window.setInterval(sync,60_000)
    window.addEventListener('focus',sync)
    return()=>{window.clearInterval(timer);window.removeEventListener('focus',sync)}
  },[authenticated,activeSectorId])

  useEffect(() => {
    if (!authenticated || vaultAutoLockMinutes <= 0) return
    let timer = window.setTimeout(() => { clearLocalSession(); show({ kind:'info', title:'Sessão expirada', message:'Entre novamente para continuar.' }) }, vaultAutoLockMinutes * 60_000)
    const reset = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => { clearLocalSession(); show({ kind:'info', title:'Sessão expirada', message:'Entre novamente para continuar.' }) }, vaultAutoLockMinutes * 60_000)
    }
    const events = ['pointerdown', 'keydown', 'touchstart'] as const
    events.forEach((event) => window.addEventListener(event, reset, { passive: true }))
    return () => {
      window.clearTimeout(timer)
      events.forEach((event) => window.removeEventListener(event, reset))
    }
  }, [authenticated, vaultAutoLockMinutes])

  const value = useMemo(() => ({
    authenticated, email, displayName, role, sectors, activeSectorId, switchSector, createSector, acknowledgeSectorRotation, changePassword, vault, metadataKey, searchKey, secretEncryptKey, secretKey,
    secretUnlockMinutes, vaultAutoLockMinutes, login, logout, unlockSecret, confirmPassword, lockSecret
  }), [authenticated, email, displayName, role, sectors, activeSectorId, vault, metadataKey, searchKey, secretEncryptKey, secretKey, secretUnlockMinutes, vaultAutoLockMinutes])

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>
}

export function useVault() {
  const value = useContext(VaultContext)
  if (!value) throw new Error('VaultProvider missing')
  return value
}
