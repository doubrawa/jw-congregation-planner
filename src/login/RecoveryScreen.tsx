import { useState, type FormEvent } from 'react'
import { useApp } from '../app/context'
import { useT } from '../i18n/useT'
import { updatePassword } from '../lib/supabase'
import './login.css'

/**
 * „Neues Passwort setzen“ — erscheint, wenn der Reset-Mail-Link in die App
 * führt (PASSWORD_RECOVERY-Event, state.recovery). Nutzt das Login-Layout.
 */
export function RecoveryScreen() {
  const { dispatch } = useApp()
  const { t } = useT()
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    if (password !== repeat) {
      dispatch({ type: 'showToast', text: t.toastPwMismatch })
      return
    }
    setBusy(true)
    const error = await updatePassword(password)
    setBusy(false)
    if (error) {
      dispatch({ type: 'showToast', text: error })
      return
    }
    dispatch({ type: 'setRecovery', on: false })
    dispatch({ type: 'showToast', text: t.toastPwGeaendert })
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
        <p className="login-sub">{t.recoveryTitle}</p>
      </header>

      <form className="login-form" onSubmit={submit}>
        <label className="login-label" htmlFor="rec-pass">
          {t.neuesPasswort}
        </label>
        <input
          id="rec-pass"
          className="login-input"
          type="password"
          placeholder="••••••••"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <label className="login-label login-label--gap" htmlFor="rec-pass2">
          {t.pwWiederholen}
        </label>
        <input
          id="rec-pass2"
          className="login-input"
          type="password"
          placeholder="••••••••"
          autoComplete="new-password"
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
        />
        <button type="submit" className="btn-primary login-submit" disabled={busy}>
          {busy ? `${t.pwSpeichern} …` : t.pwSpeichern}
        </button>
      </form>
    </div>
  )
}
