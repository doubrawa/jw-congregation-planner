import { useState, type FormEvent } from 'react'
import { useApp } from '../app/context'
import type { Lang } from '../data/types'
import { APP_LANGS } from '../i18n/langs'
import { useT } from '../i18n/useT'
import { isSupabaseConfigured, requestPasswordReset, signIn, signUp } from '../lib/supabase'
import './login.css'

/**
 * Login (Screen 1). Mit konfiguriertem Supabase echtes E-Mail+Passwort-Login
 * (inkl. Registrieren und Reset-Mail), sonst Demo-Modus wie im Prototyp:
 * beliebige Zugangsdaten, Anmelden wechselt zum Programm. Sprachauswahl hier.
 * Neue Konten treten anschließend per Einladungscode einer Versammlung bei.
 */
export function LoginScreen() {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [register, setRegister] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!isSupabaseConfigured) {
      dispatch({ type: 'login' })
      dispatch({ type: 'showToast', text: t.toastWillkommen })
      return
    }
    if (busy) return
    setBusy(true)
    if (register) {
      const result = await signUp(email.trim(), password)
      setBusy(false)
      if (!result.ok) {
        dispatch({ type: 'showToast', text: result.error })
        return
      }
      if (result.needsConfirm) {
        // E-Mail-Bestätigung aktiv: erst Mail-Link öffnen, dann anmelden
        setRegister(false)
        dispatch({ type: 'showToast', text: t.regMailHinweis })
      }
      return // ohne Bestätigung übernimmt das SIGNED_IN-Event
    }
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
    dispatch({ type: 'showToast', text: error ?? t.resetMailHinweis })
  }

  const submitLabel = register ? t.registrieren : t.anmelden

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
          autoComplete={register ? 'new-password' : 'current-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit" className="btn-primary login-submit" disabled={busy}>
          {busy ? `${submitLabel} …` : submitLabel}
        </button>
        {!register && (
          <button type="button" className="login-forgot" onClick={forgotPassword}>
            {t.pwVergessen}
          </button>
        )}
        {isSupabaseConfigured && (
          <button type="button" className="login-forgot" onClick={() => setRegister(!register)}>
            {register ? t.zurAnmeldung : t.kontoErstellen}
          </button>
        )}
      </form>

      <div className="login-langs">
        <select
          className="mem-select login-lang-select"
          aria-label="Sprache"
          value={state.lang}
          onChange={(e) => dispatch({ type: 'setLang', lang: e.target.value as Lang })}
        >
          {APP_LANGS.map(({ code, label }) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <p className="login-note">{isSupabaseConfigured ? t.nurMitglieder : t.demoHinweis}</p>
    </div>
  )
}
