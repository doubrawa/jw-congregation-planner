/**
 * Einstieg der Entwicklerseite (`/demo.html`, nur im Dev-Server).
 *
 * Dieselbe App wie `src/main.tsx`, mit zwei Unterschieden: Sie startet mit dem
 * Demo-Bestand (`entwicklerStart`), und sie hat keine Datenbank —
 * `lib/supabase.ts` legt auf dieser Seite keinen Client an. Kein Service
 * Worker und keine Update-Prüfung: beides gehört zum ausgelieferten Stand.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../src/styles/fonts.css'
import '../../src/index.css'
import App from '../../src/App'
import { entwicklerStart } from './demo-start'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App start={entwicklerStart} />
  </StrictMode>,
)
