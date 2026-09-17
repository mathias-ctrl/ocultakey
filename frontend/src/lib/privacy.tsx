import { createContext, useContext, useMemo, useState } from 'react'

type PrivacyContextValue = {
  hideCredentialNames: boolean
  toggleCredentialNames: () => void
}

const PrivacyContext = createContext<PrivacyContextValue | null>(null)

export function PrivacyProvider({ children }: { children: React.ReactNode }) {
  // Intencionalmente não persistido: cada login/reload volta ao modo privado.
  const [hideCredentialNames, setHideCredentialNames] = useState(true)
  const value = useMemo(() => ({
    hideCredentialNames,
    toggleCredentialNames: () => setHideCredentialNames((value) => !value),
  }), [hideCredentialNames])
  return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>
}

export function usePrivacy() {
  const value = useContext(PrivacyContext)
  if (!value) throw new Error('PrivacyProvider missing')
  return value
}
