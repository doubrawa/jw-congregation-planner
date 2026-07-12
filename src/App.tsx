import { AppShell } from './app/AppShell'
import { AppProvider } from './app/store'

function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  )
}

export default App
