import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { api, setAccessToken, setSessionExpiredHandler } from './api'
import { deriveAuthProof, deriveKek, openMetadataKeysFromKek, openSecretDecryptKeyFromKek, openSecretEncryptKeyFromKek } from './crypto'
import type { VaultBundle } from '../types'
import { useToast } from './toast'

type VaultContextValue = {
  authenticated: boolean
  email: string
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
  const [vault, setVault] = useState<VaultBundle | null>(null)
  const [metadataKey, setMetadataKey] = useState<Uint8Array | null>(null)
  const [searchKey, setSearchKey] = useState<Uint8Array | null>(null)
  const [secretEncryptKey, setSecretEncryptKey] = useState<CryptoKey | null>(null)
  const [secretKey, setSecretKey] = useState<CryptoKey | null>(null)
  const [secretUnlockMinutes, setSecretUnlockMinutes] = useState(1)
  const [vaultAutoLockMinutes, setVaultAutoLockMinutes] = useState(10)
  const secretTimer = useRef<number | null>(null)

  const clearLocalSession = () => {
    setAccessToken(null)
    lockSecret()
    metadataKey?.fill(0)
    searchKey?.fill(0)
    setMetadataKey(null)
    setSearchKey(null)
    setSecretEncryptKey(null)
    setVault(null)
    setEmail('')
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
      const me = await api<{ email: string; secret_unlock_minutes: number; vault_auto_lock_minutes: number }>('/auth/me')
      setVault(response.vault)
      setMetadataKey(keys.metadataKey)
      setSearchKey(keys.searchKey)
      setSecretEncryptKey(encryptKey)
      setEmail(me.email)
      setSecretUnlockMinutes(me.secret_unlock_minutes)
      setVaultAutoLockMinutes(me.vault_auto_lock_minutes)
      setAuthenticated(true)
    } finally {
      kek.fill(0)
    }
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
      const key = await openSecretDecryptKeyFromKek(kek, vault)
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
    authenticated, email, vault, metadataKey, searchKey, secretEncryptKey, secretKey,
    secretUnlockMinutes, vaultAutoLockMinutes, login, logout, unlockSecret, confirmPassword, lockSecret
  }), [authenticated, email, vault, metadataKey, searchKey, secretEncryptKey, secretKey, secretUnlockMinutes, vaultAutoLockMinutes])

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>
}

export function useVault() {
  const value = useContext(VaultContext)
  if (!value) throw new Error('VaultProvider missing')
  return value
}
