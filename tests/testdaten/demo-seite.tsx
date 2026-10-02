/**
 * Die Entwicklerseite selbst: dieselbe App wie `src/main.tsx`, mit eigenem
 * Startzustand (`entwicklerStart`) und ohne Datenbank — `lib/supabase.ts` legt
 * auf dieser Seite keinen Client an. Kein Service Worker und keine
 * Update-Prüfung: beides gehört zum ausgelieferten Stand.
 *
 * Geladen wird sie von `demo.tsx`, erst nachdem die Uhr gestellt ist.
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
