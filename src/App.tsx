import { AppShell } from './app/AppShell'
import type { AppState } from './app/context'
import { AppProvider } from './app/store'

/**
 * `start` liefert den ersten Zustand. Die App selbst startet leer
 * (`initialState`); nur die Entwicklerseite gibt ihren Demo-Bestand mit.
 */
function App({ start }: { start?: () => AppState }) {
  return (
    <AppProvider start={start}>
      <AppShell />
    </AppProvider>
  )
}

export default App
