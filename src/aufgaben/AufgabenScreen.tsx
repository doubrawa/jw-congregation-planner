import { useState, type FormEvent } from 'react'
import { useApp } from '../app/context'
import { DatePicker } from '../components/DatePicker'
import { CURRENT_PERSON_ID } from '../data/demo'
import { LOCALES } from '../i18n/langs'
import { fill, useT } from '../i18n/useT'
import './aufgaben.css'

/**
 * Meine Aufgaben (Screen 4): nächste Aufgaben mit Bestätigungs-Status
 * (bestätigen / verhindert, S-89 anzeigen) und eigene Abwesenheiten. Das
 * Profil (Darstellung/Sprache/Abmelden) ist ein eigener Navigationspunkt.
 */
export function AufgabenScreen() {
  const { state, dispatch } = useApp()
  const { t, tu, tp } = useT()
  const me = state.persons.find((p) => p.id === (state.personId ?? CURRENT_PERSON_ID))

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [reason, setReason] = useState('')

  const fmtDate = (iso: string): string => {
    if (!iso) return ''
    const date = new Date(`${iso}T12:00:00`)
    return date.toLocaleDateString(LOCALES[state.lang], { day: 'numeric', month: 'long' })
  }

  const addAbsence = (event: FormEvent) => {
    event.preventDefault()
    if (!from || !to) {
      dispatch({ type: 'showToast', text: t.toastVonBis })
      return
    }
    if (from > to) {
      dispatch({ type: 'showToast', text: t.toastVonNachBis })
      return
    }
    dispatch({ type: 'addAbsence', absence: { id: crypto.randomUUID(), from, to, reason } })
    setFrom('')
    setTo('')
    setReason('')
  }

  return (
    <section className="screen">
      <h1 className="screen-title">{t.navAufgabenLong}</h1>
      <p className="screen-subtitle">
        {me ? `${me.fn} ${me.ln}` : ''} · {fill(t.congLabel, { name: state.congregation.name })}
      </p>

      <div className="panel panel--lead" data-farbe="acc">
        <div className="panel-label">{t.naechsteAufgaben}</div>
        {state.myTasks.map((task) => (
          <div key={task.id} className="auf-row">
            <div>
              <div className="auf-title">{tp(task.title)}</div>
              <div className="auf-date">{tp(task.date)}</div>
              <div className="auf-actions">
                {task.status === 'offen' && (
                  <button
                    type="button"
                    className="auf-confirm"
                    onClick={() => dispatch({ type: 'confirmTask', id: task.id })}
                  >
                    ✓ {t.bestaetigen}
                  </button>
                )}
                {task.status === 'bestätigt' && (
                  <span className="auf-badge auf-badge--best">✓ {t.bestaetigt}</span>
                )}
                {task.status === 'verhindert' && (
                  <span className="auf-badge auf-badge--verh">{t.verhindertChip}</span>
                )}
                {task.s89 && (
                  <button
                    type="button"
                    className="auf-s89"
                    onClick={() => task.s89 && dispatch({ type: 'openS89', payload: task.s89 })}
                  >
                    {t.s89Open} ›
                  </button>
                )}
              </div>
            </div>
            {task.chip && <span className="auf-chip">{tu(task.chip)}</span>}
          </div>
        ))}
      </div>

      <form className="panel panel--pb16" data-farbe="neutral" onSubmit={addAbsence}>
        <div className="panel-label">{t.abwesenheiten}</div>
        <div className="abs-form-row">
          <div className="abs-field">
            <span className="field-label">{t.von}</span>
            <DatePicker
              value={from}
              onChange={setFrom}
              locale={LOCALES[state.lang]}
              max={to || undefined}
              placeholder={t.datumPh}
              ariaLabel={t.von}
            />
          </div>
          <div className="abs-field">
            <span className="field-label">{t.bis}</span>
            <DatePicker
              value={to}
              onChange={setTo}
              locale={LOCALES[state.lang]}
              min={from || undefined}
              placeholder={t.datumPh}
              ariaLabel={t.bis}
            />
          </div>
        </div>
        <div className="abs-reason">
          <label className="field-label" htmlFor="abs-reason">
            {t.grundOpt}
          </label>
          <input
            id="abs-reason"
            className="field-input"
            type="text"
            placeholder={t.grundPh}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <button type="submit" className="btn-outline abs-submit">
          {t.abwEintragen}
        </button>

        <div className="panel-label auf-entries-label">{t.deineEintraege}</div>
        {state.absences.map((absence) => (
          <div key={absence.id} className="abs-row">
            <div>
              <div className="abs-range">
                {fmtDate(absence.from)} – {fmtDate(absence.to)}
              </div>
              <div className="abs-reason-text">{absence.reason || t.ohneAngabe}</div>
            </div>
            <button
              type="button"
              className="abs-remove"
              aria-label="✕"
              onClick={() => dispatch({ type: 'removeAbsence', id: absence.id })}
            >
              ✕
            </button>
          </div>
        ))}
        {state.absences.length === 0 && <p className="abs-empty">{t.keineAbw}</p>}
      </form>
    </section>
  )
}
