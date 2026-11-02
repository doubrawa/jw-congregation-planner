import { Component, type ReactNode } from 'react'

type Props = {
  children: ReactNode
  /** Was stattdessen geschehen soll — der Aufrufer weiß, welcher Weg ohne den Teil bleibt. */
  onFehler: () => void
}

type State = { gescheitert: boolean }

/**
 * **Fängt einen nachgeladenen Teil ab, der nicht kommt** (`lazy` hinter
 * `Suspense`). Ohne Grenze hängt React bei einem gescheiterten Nachladen den
 * ganzen Baum aus, und die Seite steht leer — nach einem Deploy, wenn der alte
 * Teil auf dem Server fehlt, oder ohne Netz, wenn er nie im Cache lag.
 *
 * Anders als `ErrorBoundary` zeigt sie nichts an und bietet kein Neuladen: Sie
 * meldet den Fehler dem Aufrufer, und der führt auf einen Weg ohne den Teil.
 * Für einen neuen Versuch braucht es ein neues `lazy` — React merkt sich die
 * Ablehnung des alten.
 */
export class NachladeGrenze extends Component<Props, State> {
  override state: State = { gescheitert: false }

  static getDerivedStateFromError(): State {
    return { gescheitert: true }
  }

  override componentDidCatch(error: Error): void {
    console.error('[nachladen]', error)
    this.props.onFehler()
  }

  override render(): ReactNode {
    return this.state.gescheitert ? null : this.props.children
  }
}
