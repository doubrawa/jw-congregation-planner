import type { FormEvent } from 'react'
import { useApp } from '../app/context'
import { CONGREGATION } from '../data/demo'
import './login.css'

/**
 * Login (Screen 1) — noch ohne echte Auth wie im Prototyp: beliebige
 * Zugangsdaten, Anmelden wechselt zum Programm. Produktion später:
 * E-Mail+Passwort inkl. Reset, Daten versammlungsintern geschützt.
 */
export function LoginScreen() {
  const { dispatch } = useApp()

  const submit = (event: FormEvent) => {
    event.preventDefault()
    dispatch({ type: 'login' })
    dispatch({ type: 'showToast', text: 'Willkommen, Simon!' })
  }

  return (
    <div className="login">
      <header className="login-head">
        <p className="login-eyebrow">JW</p>
        <h1 className="login-wordmark">
          Congregation
          <br />
          Planner
        </h1>
        <p className="login-sub">Versammlung {CONGREGATION.name}</p>
      </header>

      <form className="login-form" onSubmit={submit}>
        <label className="login-label" htmlFor="login-mail">
          E-MAIL
        </label>
        <input
          id="login-mail"
          className="login-input"
          type="email"
          placeholder="name@beispiel.de"
          autoComplete="email"
        />
        <label className="login-label login-label--gap" htmlFor="login-pass">
          PASSWORT
        </label>
        <input
          id="login-pass"
          className="login-input"
          type="password"
          placeholder="••••••••"
          autoComplete="current-password"
        />
        <button type="submit" className="btn-primary login-submit">
          ANMELDEN
        </button>
        <button
          type="button"
          className="login-forgot"
          onClick={() =>
            dispatch({ type: 'showToast', text: 'Demo — Passwort-Reset kommt mit echtem Login' })
          }
        >
          Passwort vergessen?
        </button>
      </form>

      <p className="login-note">Demo · Zugangsdaten beliebig</p>
    </div>
  )
}
