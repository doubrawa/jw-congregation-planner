import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/fonts.css'
import './index.css'
import App from './App.tsx'
import './lib/install.ts' // beforeinstallprompt früh abfangen (Seiteneffekt)
import { registerServiceWorker } from './lib/push.ts'
import { watchForUpdates } from './lib/version.ts'

registerServiceWorker()
// Im Dev-Server übernimmt Vites HMR das Nachladen; dort gibt es auch keine
// gehashten Bündel, an denen sich eine neue Fassung erkennen ließe.
if (import.meta.env.PROD) watchForUpdates()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
