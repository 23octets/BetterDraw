import { AccountGate } from './account/AccountGate'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { RecoveryBoundary } from './ui/RecoveryBoundary'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
<RecoveryBoundary><AccountGate><App /></AccountGate></RecoveryBoundary>
  </StrictMode>,
)
