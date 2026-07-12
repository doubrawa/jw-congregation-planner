import { useState, type FormEvent } from 'react'
import { useApp } from '../app/context'
import { CONGREGATION, CURRENT_PERSON_ID, sessionRoleLabel } from '../data/demo'
import { displayName } from '../data/helpers'
import { performLogout } from '../lib/supabase'
import { deriveMyAssignments } from './assignments'
import './aufgaben.css'

/** ISO-Datum → "12. Oktober" (wie Prototyp fmtDate). */
function fmtDate(iso: string): string {
  if (!iso) return ''
  const date = new Date(`${iso}T12:00:00`)
  return date.toLocaleDateString('de-DE', { day: 'numeric', month: 'long' })
}

/**
 * Meine Aufgaben (Screen 4, persönlicher Bereich): nächste Aufgaben
 * (live aus den Wochenprogrammen), eigene Abwesenheiten, Profil mit
 * Darstellungs-Umschalter und Abmelden.
 */
export function AufgabenScreen() {
  const { state, dispatch } = useApp()
  const me = state.persons.find((p) => p.id === CURRENT_PERSON_ID)
  const myName = me ? displayName(me) : ''
  const assignments = myName ? deriveMyAssignments(state.weeks, state.services, myName) : []

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [reason, setReason] = useState('')

  const addAbsence = (event: FormEvent) => {
    event.preventDefault()
    if (!from || !to) {
      dispatch({ type: 'showToast', text: 'Bitte Von und Bis angeben' })
      return
    }
    dispatch({ type: 'addAbsence', absence: { id: crypto.randomUUID(), from, to, reason } })
    setFrom('')
    setTo('')
    setReason('')
  }

  return (
    <section className="screen">
      <h1 className="screen-title">Meine Aufgaben</h1>
      <p className="screen-subtitle">
        {me ? `${me.fn} ${me.ln}` : ''} · Versammlung {CONGREGATION.name}
      </p>

      <div className="panel panel--lead" data-farbe="gold">
        <div className="panel-label">NÄCHSTE AUFGABEN</div>
        {assignments.map((a, index) => (
          <div key={index} className="auf-row">
            <div>
              <div className="auf-title">{a.title}</div>
              <div className="auf-date">{a.date}</div>
            </div>
            {a.chip && <span className="auf-chip">{a.chip}</span>}
          </div>
        ))}
        {assignments.length === 0 && <p className="auf-empty">Keine Aufgaben zugeteilt.</p>}
      </div>

      <form className="panel panel--pb16" data-farbe="neutral" onSubmit={addAbsence}>
        <div className="panel-label">ABWESENHEITEN</div>
        <div className="abs-form-row">
          <div className="abs-field">
            <label className="field-label" htmlFor="abs-from">
              VON
            </label>
            <input
              id="abs-from"
              className="field-input"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="abs-field">
            <label className="field-label" htmlFor="abs-to">
              BIS
            </label>
            <input
              id="abs-to"
              className="field-input"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>
        <div className="abs-reason">
          <label className="field-label" htmlFor="abs-reason">
            GRUND (OPTIONAL)
          </label>
          <input
            id="abs-reason"
            className="field-input"
            type="text"
            placeholder="z. B. Urlaub"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <button type="submit" className="btn-outline abs-submit">
          ABWESENHEIT EINTRAGEN
        </button>

        <div className="panel-label auf-entries-label">DEINE EINTRÄGE</div>
        {state.absences.map((absence) => (
          <div key={absence.id} className="abs-row">
            <div>
              <div className="abs-range">
                {fmtDate(absence.from)} – {fmtDate(absence.to)}
              </div>
              <div className="abs-reason-text">{absence.reason || 'Ohne Angabe'}</div>
            </div>
            <button
              type="button"
              className="abs-remove"
              aria-label="Abwesenheit löschen"
              onClick={() => dispatch({ type: 'removeAbsence', id: absence.id })}
            >
              ✕
            </button>
          </div>
        ))}
        {state.absences.length === 0 && (
          <p className="abs-empty">Keine Abwesenheiten eingetragen.</p>
        )}
      </form>

      <div className="panel panel--pb14" data-farbe="neutral">
        <div className="panel-label">PROFIL</div>
        <div className="kv-row">
          <span className="kv-key">Name</span>
          <span className="kv-val">{me ? `${me.fn} ${me.ln}` : ''}</span>
        </div>
        <div className="kv-row">
          <span className="kv-key">Versammlung</span>
          <span className="kv-val">{CONGREGATION.name}</span>
        </div>
        <div className="kv-row">
          <span className="kv-key">Rolle</span>
          <span className="kv-val">{sessionRoleLabel(state.planner)}</span>
        </div>
        <div className="kv-row kv-row--plain">
          <span className="kv-key">Darstellung</span>
          <div className="theme-chips">
            <button
              type="button"
              className={state.theme === 'light' ? 'theme-chip is-active' : 'theme-chip'}
              aria-pressed={state.theme === 'light'}
              onClick={() => dispatch({ type: 'setTheme', theme: 'light' })}
            >
              Hell
            </button>
            <button
              type="button"
              className={state.theme === 'dark' ? 'theme-chip is-active' : 'theme-chip'}
              aria-pressed={state.theme === 'dark'}
              onClick={() => dispatch({ type: 'setTheme', theme: 'dark' })}
            >
              Dunkel
            </button>
          </div>
        </div>
        <button type="button" className="prof-logout" onClick={() => performLogout(dispatch)}>
          Abmelden
        </button>
      </div>
    </section>
  )
}
