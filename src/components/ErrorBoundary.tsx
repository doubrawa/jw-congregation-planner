import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * Fängt Render-Fehler ab, damit aus einem kaputten Bereich nicht der
 * Totalausfall der ganzen App wird.
 *
 * Es gibt in React keinen Hook dafür — nur `getDerivedStateFromError` /
 * `componentDidCatch` an einer Klasse. Deshalb kommen die Texte als Props
 * herein: `useT()` ginge hier nicht, und es wäre auch die falsche Stelle
 * dafür, wenn ausgerechnet die Übersetzung der Auslöser war (genau so lag der
 * Fall bei den Datumsregeln, siehe translate.ts `datumsRegel`).
 *
 * Nur „Neu laden" anbieten und nicht selbst aufräumen: Was den Fehler
 * ausgelöst hat, steht im Zustand — ein bloßes Zurücksetzen der Boundary
 * würde denselben Zustand erneut rendern und sofort wieder scheitern.
 * Erholung ohne Neuladen passiert stattdessen über `key` am Einsatzort: ein
 * Screenwechsel hängt eine frische Boundary ein.
 */

type Props = {
  children: ReactNode
  titel: string
  text: string
  aktion: string
}

type State = { gescheitert: boolean }

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { gescheitert: false }

  static getDerivedStateFromError(): State {
    return { gescheitert: true }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  override render(): ReactNode {
    if (!this.state.gescheitert) return this.props.children
    return (
      <div className="err-box" role="alert">
        <strong className="err-box-title">{this.props.titel}</strong>
        <p className="err-box-text">{this.props.text}</p>
        <button type="button" className="err-box-btn" onClick={() => location.reload()}>
          {this.props.aktion}
        </button>
      </div>
    )
  }
}
