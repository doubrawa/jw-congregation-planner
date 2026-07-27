import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import './lib/install.ts' // beforeinstallprompt früh abfangen (Seiteneffekt)
import { registerServiceWorker } from './lib/push.ts'

registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
