export type CipherBlob = { ciphertext: string; nonce: string; crypto_version: number }

export type VaultBundle = {
  kdf_salt: string
  kdf_memory_kib: number
  kdf_iterations: number
  kdf_parallelism: number
  wrapped_metadata_key: string
  metadata_key_nonce: string
  wrapped_search_key: string
  search_key_nonce: string
  wrapped_secret_key: string
  secret_key_nonce: string
  crypto_version: number
}

export type ClientRow = {
  id: string
  metadata: CipherBlob
  favorite: boolean
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type ItemRow = {
  id: string
  client_id: string
  metadata: CipherBlob
  secret: CipherBlob
  favorite: boolean
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type ClientMeta = {
  schema: 1
  name: string
  description: string
  tags: string[]
}

export type ItemType = 'login' | 'api_key' | 'token' | 'database' | 'ssh' | 'oauth' | 'webhook' | 'secure_note' | 'custom'

export type FieldDefinition = {
  id: string
  label: string
  kind: 'text' | 'password' | 'url' | 'multiline'
  protected: boolean
}

export type ItemMeta = {
  schema: 1
  name: string
  type: ItemType
  environment: string
  description: string
  url: string
  username: string
  tags: string[]
  scopes: string[]
  fields: FieldDefinition[]
}

export type ItemSecret = {
  schema: 1
  values: Record<string, string>
}

export type DecryptedClient = ClientRow & { meta: ClientMeta }
export type DecryptedItem = ItemRow & { meta: ItemMeta }
