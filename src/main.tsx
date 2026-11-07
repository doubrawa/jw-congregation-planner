import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/fonts.css'
import './index.css'
import App from './App.tsx'
import './lib/install.ts' // beforeinstallprompt früh abfangen (Seiteneffekt)
import { fehlerGrenzenEinhaengen } from './lib/fehler-melden.ts'
import { registerServiceWorker } from './lib/push.ts'
import { watchForUpdates } from './lib/version.ts'
import { neuLaden } from './app/neu-laden.ts'

// Vor allem anderen (T171): Ein Fehler beim Start soll auch gemeldet werden.
// Gemeldet wird erst, sobald eine Versammlung feststeht — die Horcher hängen
// trotzdem von Anfang an, sonst fehlte genau der erste Fehler.
fehlerGrenzenEinhaengen()

registerServiceWorker()
// Im Dev-Server übernimmt Vites HMR das Nachladen; dort gibt es auch keine
// gehashten Bündel, an denen sich eine neue Fassung erkennen ließe.
if (import.meta.env.PROD) watchForUpdates(() => void neuLaden())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
