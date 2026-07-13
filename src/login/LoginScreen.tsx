import { useState, type FormEvent } from 'react'
import { useApp } from '../app/context'
import { APP_LANGS } from '../i18n/langs'
import { useT } from '../i18n/useT'
import { isSupabaseConfigured, requestPasswordReset, signIn } from '../lib/supabase'
import './login.css'

/**
 * Login (Screen 1). Mit konfiguriertem Supabase echtes E-Mail+Passwort-Login
 * (inkl. Reset-Mail), sonst Demo-Modus wie im Prototyp: beliebige Zugangs-
 * daten, Anmelden wechselt zum Programm. Sprachauswahl direkt hier.
 */
export function LoginScreen() {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!isSupabaseConfigured) {
      dispatch({ type: 'login' })
      dispatch({ type: 'showToast', text: t.toastWillkommen })
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
    dispatch({ type: 'showToast', text: t.toastWillkommen })
  }

  const forgotPassword = async () => {
    if (!isSupabaseConfigured) {
      dispatch({ type: 'showToast', text: t.demoHinweis })
      return
    }
    if (!email.trim()) {
      dispatch({ type: 'showToast', text: t.email })
      return
    }
    const error = await requestPasswordReset(email.trim())
    dispatch({ type: 'showToast', text: error ?? 'OK' })
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
        <p className="login-sub">{t.congName}</p>
      </header>

      <form className="login-form" onSubmit={submit}>
        <label className="login-label" htmlFor="login-mail">
          {t.email}
        </label>
        <input
          id="login-mail"
          className="login-input"
          type="email"
          placeholder={t.emailPh}
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <label className="login-label login-label--gap" htmlFor="login-pass">
          {t.passwort}
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
          {busy ? `${t.anmelden} …` : t.anmelden}
        </button>
        <button type="button" className="login-forgot" onClick={forgotPassword}>
          {t.pwVergessen}
        </button>
      </form>

      <div className="login-langs" role="group" aria-label="Sprache">
        {APP_LANGS.map(({ code, label }) => (
          <button
            key={code}
            type="button"
            className={state.lang === code ? 'login-lang is-active' : 'login-lang'}
            aria-pressed={state.lang === code}
            onClick={() => dispatch({ type: 'setLang', lang: code })}
          >
            {label}
          </button>
        ))}
      </div>

      <p className="login-note">{isSupabaseConfigured ? t.nurMitglieder : t.demoHinweis}</p>
    </div>
  )
}
