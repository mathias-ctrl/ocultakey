import { Navigate, Route, Routes } from 'react-router-dom'
import { VaultProvider, useVault } from './lib/vault-context'
import { PreferencesProvider } from './lib/preferences'
import { ToastProvider } from './lib/toast'
import { LoginPage } from './pages/LoginPage'
import { VaultPage } from './pages/VaultPage'
import { AuditPage } from './pages/AuditPage'
import { TrashPage } from './pages/TrashPage'
import { SettingsPage } from './pages/SettingsPage'
import { AppShell } from './components/AppShell'

function RoutedApp(){
  const{authenticated}=useVault()
  if(!authenticated)return <LoginPage/>
  return <PreferencesProvider><AppShell><Routes>
    <Route path="/" element={<VaultPage/>}/>
    <Route path="/audit" element={<AuditPage/>}/>
    <Route path="/trash" element={<TrashPage/>}/>
    <Route path="/settings" element={<SettingsPage/>}/>
    <Route path="*" element={<Navigate to="/" replace/>}/>
  </Routes></AppShell></PreferencesProvider>
}
export default function App(){return <ToastProvider><VaultProvider><RoutedApp/></VaultProvider></ToastProvider>}
