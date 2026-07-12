import { useState, type FormEvent } from 'react'
import { useApp } from '../app/context'
import { CONGREGATION } from '../data/demo'
import { isSupabaseConfigured, requestPasswordReset, signIn } from '../lib/supabase'
import './login.css'

/**
 * Login (Screen 1). Mit konfiguriertem Supabase echtes E-Mail+Passwort-Login
 * (inkl. Reset-Mail), sonst Demo-Modus wie im Prototyp: beliebige Zugangs-
 * daten, Anmelden wechselt zum Programm.
 */
export function LoginScreen() {
  const { dispatch } = useApp()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!isSupabaseConfigured) {
      dispatch({ type: 'login' })
      dispatch({ type: 'showToast', text: 'Willkommen, Simon!' })
      return
    }
    if (busy) return
    setBusy(true)
    const error = await signIn(email, password)
    setBusy(false)
    if (error) {
      dispatch({ type: 'showToast', text: error })
      return
    }
    dispatch({ type: 'login' })
    dispatch({ type: 'showToast', text: 'Willkommen!' })
  }

  const forgotPassword = async () => {
    if (!isSupabaseConfigured) {
      dispatch({ type: 'showToast', text: 'Demo — Passwort-Reset kommt mit echtem Login' })
      return
    }
    if (!email.trim()) {
      dispatch({ type: 'showToast', text: 'Bitte zuerst die E-Mail-Adresse eingeben' })
      return
    }
    const error = await requestPasswordReset(email.trim())
    dispatch({ type: 'showToast', text: error ?? 'E-Mail zum Zurücksetzen ist unterwegs' })
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
          value={email}
          onChange={(e) => setEmail(e.target.value)}
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
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit" className="btn-primary login-submit" disabled={busy}>
          {busy ? 'ANMELDEN …' : 'ANMELDEN'}
        </button>
        <button type="button" className="login-forgot" onClick={forgotPassword}>
          Passwort vergessen?
        </button>
      </form>

      <p className="login-note">
        {isSupabaseConfigured
          ? 'Zugang nur für Mitglieder der Versammlung'
          : 'Demo · Zugangsdaten beliebig'}
      </p>
    </div>
  )
}
