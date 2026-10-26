import { argon2id } from 'hash-wasm'
import type { CipherBlob, ClientMeta, ItemMeta, VaultBundle } from '../types'

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()
const WRAP_AAD = textEncoder.encode('ocultakey-key-v1')
const DATA_AAD = textEncoder.encode('ocultakey-data-v1')

type AesMaterial = Uint8Array | CryptoKey

export function b64ToBytes(value: string): Uint8Array {
  const base = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base + '='.repeat((4 - (base.length % 4)) % 4)
  const binary = atob(padded)
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

export function bytesToB64(bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach((b) => (binary += String.fromCharCode(b)))
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_')
}

export type KdfParams = Pick<VaultBundle, 'kdf_salt' | 'kdf_memory_kib' | 'kdf_iterations' | 'kdf_parallelism'>

export async function deriveKek(password: string, vault: KdfParams): Promise<Uint8Array> {
  const output = await argon2id({
    password,
    salt: b64ToBytes(vault.kdf_salt),
    parallelism: vault.kdf_parallelism,
    iterations: vault.kdf_iterations,
    memorySize: vault.kdf_memory_kib,
    hashLength: 32,
    outputType: 'binary'
  })
  return new Uint8Array(output)
}

async function aesKey(raw: AesMaterial, usages: KeyUsage[]): Promise<CryptoKey> {
  if (!(raw instanceof Uint8Array)) return raw
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, usages)
}

async function importSecretKey(raw: Uint8Array, usages: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, usages)
}

export async function unwrapVaultKey(kek: Uint8Array, ciphertext: string, nonce: string): Promise<Uint8Array> {
  const key = await aesKey(kek, ['decrypt'])
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBytes(nonce), additionalData: WRAP_AAD },
    key,
    b64ToBytes(ciphertext)
  )
  return new Uint8Array(plain)
}

export async function wrapVaultKey(kek: Uint8Array, raw: Uint8Array): Promise<{ciphertext:string;nonce:string}> {
  const key = await aesKey(kek, ['encrypt'])
  const nonce = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce,additionalData:WRAP_AAD},key,raw)
  return {ciphertext:bytesToB64(new Uint8Array(ciphertext)),nonce:bytesToB64(nonce)}
}

export function randomKeyBytes() { return crypto.getRandomValues(new Uint8Array(32)) }

export async function createAccountBundle(password:string) {
  const params={kdf_salt:bytesToB64(crypto.getRandomValues(new Uint8Array(16))),kdf_memory_kib:65536,kdf_iterations:3,kdf_parallelism:1}
  const kek=await deriveKek(password,params)
  const [metadata,search,secret]=[randomKeyBytes(),randomKeyBytes(),randomKeyBytes()]
  const [wm,ws,wsec]=await Promise.all([wrapVaultKey(kek,metadata),wrapVaultKey(kek,search),wrapVaultKey(kek,secret)])
  return {kek,auth_proof:await deriveAuthProof(kek),vault:{...params,wrapped_metadata_key:wm.ciphertext,metadata_key_nonce:wm.nonce,wrapped_search_key:ws.ciphertext,search_key_nonce:ws.nonce,wrapped_secret_key:wsec.ciphertext,secret_key_nonce:wsec.nonce,crypto_version:1}}
}

export async function makeSectorKeyBundle(kek:Uint8Array) {
  const keys={metadata:randomKeyBytes(),search:randomKeyBytes(),secret:randomKeyBytes()}
  const serialized=new TextEncoder().encode(JSON.stringify({metadata:bytesToB64(keys.metadata),search:bytesToB64(keys.search),secret:bytesToB64(keys.secret)}))
  const wrapped=await wrapVaultKey(kek,serialized)
  serialized.fill(0)
  return {keys,...wrapped}
}

export async function wrapSectorKeys(kek:Uint8Array,keys:{metadataKey:Uint8Array;searchKey:Uint8Array;secretRaw:Uint8Array}) {
  const packed=new TextEncoder().encode(JSON.stringify({metadata:bytesToB64(keys.metadataKey),search:bytesToB64(keys.searchKey),secret:bytesToB64(keys.secretRaw)}))
  const wrapped=await wrapVaultKey(kek,packed);packed.fill(0);return wrapped
}

export async function rewrapAccountBundle(oldKek:Uint8Array,newPassword:string,vault:VaultBundle,keys:{metadataKey:Uint8Array;searchKey:Uint8Array}) {
  const secretRaw=await unwrapVaultKey(oldKek,vault.wrapped_secret_key,vault.secret_key_nonce)
  const params={kdf_salt:bytesToB64(crypto.getRandomValues(new Uint8Array(16))),kdf_memory_kib:vault.kdf_memory_kib,kdf_iterations:vault.kdf_iterations,kdf_parallelism:vault.kdf_parallelism}
  const newKek=await deriveKek(newPassword,params)
  try{
    const [metadata,search,secret]=await Promise.all([
      wrapVaultKey(newKek,keys.metadataKey),wrapVaultKey(newKek,keys.searchKey),wrapVaultKey(newKek,secretRaw)
    ])
    return {newKek,newAuthProof:await deriveAuthProof(newKek),vault:{...params,wrapped_metadata_key:metadata.ciphertext,metadata_key_nonce:metadata.nonce,wrapped_search_key:search.ciphertext,search_key_nonce:search.nonce,wrapped_secret_key:secret.ciphertext,secret_key_nonce:secret.nonce,crypto_version:vault.crypto_version}}
  }catch(error){newKek.fill(0);throw error}
  finally{secretRaw.fill(0)}
}

export async function deriveAuthProof(kek: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey('raw', kek, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const proof = new Uint8Array(await crypto.subtle.sign('HMAC', key, textEncoder.encode('ocultakey-auth-v1')))
  return bytesToB64(proof)
}

export async function openMetadataKeysFromKek(kek: Uint8Array, vault: VaultBundle) {
  const metadataKey = await unwrapVaultKey(kek, vault.wrapped_metadata_key, vault.metadata_key_nonce)
  const searchKey = await unwrapVaultKey(kek, vault.wrapped_search_key, vault.search_key_nonce)
  return { metadataKey, searchKey }
}

export async function openSecretEncryptKeyFromKek(kek: Uint8Array, vault: VaultBundle) {
  const raw = await unwrapVaultKey(kek, vault.wrapped_secret_key, vault.secret_key_nonce)
  try {
    return await importSecretKey(raw, ['encrypt'])
  } finally {
    raw.fill(0)
  }
}

export async function openSecretDecryptKeyFromKek(kek: Uint8Array, vault: VaultBundle) {
  const raw = await unwrapVaultKey(kek, vault.wrapped_secret_key, vault.secret_key_nonce)
  try {
    return await importSecretKey(raw, ['decrypt'])
  } finally {
    raw.fill(0)
  }
}

export async function encryptJson(keyBytes: AesMaterial, value: unknown): Promise<CipherBlob> {
  const key = await aesKey(keyBytes, ['encrypt'])
  const nonce = crypto.getRandomValues(new Uint8Array(12))
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: DATA_AAD },
    key,
    textEncoder.encode(JSON.stringify(value))
  )
  return { ciphertext: bytesToB64(new Uint8Array(cipher)), nonce: bytesToB64(nonce), crypto_version: 1 }
}

export async function decryptJson<T>(keyBytes: AesMaterial, blob: CipherBlob): Promise<T> {
  const key = await aesKey(keyBytes, ['decrypt'])
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBytes(blob.nonce), additionalData: DATA_AAD },
    key,
    b64ToBytes(blob.ciphertext)
  )
  return JSON.parse(textDecoder.decode(plain)) as T
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9@._:/-]+/g, ' ').trim()
}

function tokenParts(value: string): string[] {
  const words = normalize(value).split(/\s+/).filter(Boolean)
  const parts = new Set<string>()
  for (const word of words) {
    parts.add(`w:${word}`)
    for (let i = 1; i <= Math.min(word.length, 12); i++) parts.add(`p:${word.slice(0, i)}`)
    if (word.length >= 3) {
      for (let i = 0; i <= word.length - 3; i++) parts.add(`t:${word.slice(i, i + 3)}`)
    }
  }
  return [...parts]
}

function queryParts(value: string): string[] {
  const words = normalize(value).split(/\s+/).filter(Boolean)
  const parts = new Set<string>()
  for (const word of words) {
    if (word.length <= 2) parts.add(`p:${word}`)
    else for (let i = 0; i <= word.length - 3; i++) parts.add(`t:${word.slice(i, i + 3)}`)
  }
  return [...parts]
}

async function hmacHex(keyBytes: Uint8Array, value: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, textEncoder.encode(value)))
  return [...signature].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function blindTokensForClient(key: Uint8Array, meta: ClientMeta): Promise<string[]> {
  const parts = tokenParts([meta.name, meta.description, meta.tags.join(' ')].join(' '))
  return Promise.all(parts.map((p) => hmacHex(key, p)))
}

export async function blindTokensForItem(key: Uint8Array, meta: ItemMeta): Promise<string[]> {
  const parts = tokenParts([meta.name, meta.description, meta.url, meta.username, meta.tags.join(' '), meta.scopes.join(' ')].join(' '))
  parts.push(`f:type:${meta.type}`)
  if (meta.environment) parts.push(`f:env:${normalize(meta.environment)}`)
  return Promise.all([...new Set(parts)].map((p) => hmacHex(key, p)))
}

export async function blindTokensForQuery(key: Uint8Array, query: string): Promise<string[]> {
  const parts = queryParts(query)
  return Promise.all(parts.map((p) => hmacHex(key, p)))
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', textEncoder.encode(value)))
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('')
}
