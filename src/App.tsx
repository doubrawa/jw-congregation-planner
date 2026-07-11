import { useEffect, useState } from 'react'
import type { Theme } from './data/types'
import './App.css'

/**
 * Platzhalter-Startscreen des Scaffolds.
 *
 * Zeigt die Wortmarke im Login-Stil und einen Hell/Dunkel-Umschalter —
 * genug, um Schriften (Newsreader + IBM Plex Sans) und die Design-Tokens
 * in beiden Themes zu prüfen. Die eigentlichen Screens (Programm, Aufgaben,
 * Planen, Personen, Einstellungen) werden gemäß docs/design-handoff gebaut.
 */

function getInitialTheme(): Theme {
  const stored = localStorage.getItem('theme')
  if (stored === 'light' || stored === 'dark') return stored
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

function App() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('theme', theme)
  }, [theme])

  return (
    <div className="desk">
      <main className="app-col">
        <header className="brand">
          <p className="eyebrow">JW</p>
          <h1 className="wordmark">
            Congregation
            <br />
            Planner
          </h1>
          <p className="subtitle">Versammlung Musterstadt</p>
        </header>

        <p className="scaffold-note">
          Projekt-Gerüst steht. Screens folgen gemäß{' '}
          <code>docs/design-handoff</code>.
        </p>

        <div className="theme-toggle" role="group" aria-label="Darstellung">
          <button
            type="button"
            className={theme === 'light' ? 'is-active' : ''}
            aria-pressed={theme === 'light'}
            onClick={() => setTheme('light')}
          >
            Hell
          </button>
          <button
            type="button"
            className={theme === 'dark' ? 'is-active' : ''}
            aria-pressed={theme === 'dark'}
            onClick={() => setTheme('dark')}
          >
            Dunkel
          </button>
        </div>
      </main>
    </div>
  )
}

export default App
