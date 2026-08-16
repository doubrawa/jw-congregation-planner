import { useState, type FormEvent } from 'react'
import { useApp } from '../app/context'
import { DatePicker } from '../components/DatePicker'
import { PushPrompt } from '../components/PushPrompt'
import { fullName } from '../data/helpers'
import { LOCALES } from '../i18n/langs'
import { relativeDayLabel } from '../i18n/relative-time'
import { aufgabenLabel, fill, useT } from '../i18n/useT'
import './aufgaben.css'

/**
 * Meine Aufgaben (Screen 4): nächste Aufgaben mit Bestätigungs-Status
 * (bestätigen / verhindert, S-89 anzeigen) und eigene Abwesenheiten. Das
 * Profil (Darstellung/Sprache/Abmelden) ist ein eigener Navigationspunkt.
 */
export function AufgabenScreen() {
  const { state, dispatch } = useApp()
  const i18n = useT()
  const { t, tu, tp } = i18n
  const me = state.persons.find((p) => p.id === state.personId)

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [reason, setReason] = useState('')

  const fmtDate = (iso: string): string => {
    if (!iso) return ''
    const date = new Date(`${iso}T12:00:00`)
    return date.toLocaleDateString(LOCALES[state.lang], { day: 'numeric', month: 'long' })
  }

  /**
   * „Deine Einträge": seit die Abwesenheiten versammlungsweit geladen werden
   * (die Planung braucht sie), muss hier wieder auf die eigenen eingegrenzt
   * werden — selbst erfasst oder zur eigenen Person. Ohne Konto (Demo) gibt es
   * nichts einzugrenzen.
   */
  const eigeneAbwesenheiten = state.userId
    ? state.absences.filter(
        (a) => a.userId === state.userId || (state.personId != null && a.personId === state.personId),
      )
    : state.absences

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
    dispatch({
      type: 'addAbsence',
      // personId verknüpft die Abwesenheit mit dem Programm — ohne sie weiß die
      // Planung nicht, wer fehlt. userId bleibt der Ersteller (siehe Absence).
      absence: {
        id: crypto.randomUUID(),
        personId: state.personId,
        userId: state.userId ?? '',
        from,
        to,
        reason,
      },
    })
    setFrom('')
    setTo('')
    setReason('')
  }

  return (
    <section className="screen">
      <h1 className="screen-title">{t.navAufgabenLong}</h1>
      <p className="screen-subtitle">
        {me ? fullName(me) : ''} · {fill(t.congLabel, { name: state.congregation.name })}
      </p>

      <PushPrompt />

      <div className="panel panel--lead" data-farbe="acc">
        <h2 className="panel-label">{t.naechsteAufgaben}</h2>
        {state.myTasks.map((task) => (
          <div key={task.id} className="auf-row">
            <div>
              <button
                type="button"
                className="auf-open"
                onClick={() => dispatch({ type: 'openMyTask', id: task.id })}
              >
                <div className="auf-title">{aufgabenLabel(task, i18n)}</div>
                <div className="auf-date">{tp(task.date)}</div>
              </button>
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
            {(() => {
              // Live-Countdown aus dem echten Datum (Intl); im Demo der Chip-Text.
              const label = task.at != null ? relativeDayLabel(task.at, state.lang) : tu(task.chip)
              return label && <span className="auf-chip">{label}</span>
            })()}
          </div>
        ))}
      </div>

      {state.substituteReqs.length > 0 && (
        <div className="panel panel--pb14 auf-sub" data-farbe="gold">
          <h2 className="panel-label">{t.einspringenTitle}</h2>
          <p className="panel-hint">{t.einspringenHint}</p>
          {state.substituteReqs.map((req) => (
            <div key={req.key} className="auf-sub-row">
              <div>
                <div className="auf-sub-title">{tu(req.title)}</div>
                <div className="auf-sub-meta">
                  {tp(req.date)} · {tu(req.declinedBy)}
                </div>
                {/* Was ich an dem Tag schon habe — vor dem Zusagen. */}
                {req.schonHeute.length > 0 && (
                  <div className="auf-sub-warn">
                    {t.sheetSchonHeute}:{' '}
                    {req.schonHeute.map((a) => (a.lang === 'u' ? tu(a.text) : tp(a.text))).join(', ')}
                  </div>
                )}
              </div>
              <button
                type="button"
                className="auf-sub-btn"
                onClick={() => dispatch({ type: 'takeSubstitute', key: req.key })}
              >
                {t.uebernehmen}
              </button>
            </div>
          ))}
        </div>
      )}

      <form className="panel panel--pb16" data-farbe="neutral" onSubmit={addAbsence}>
        <h2 className="panel-label">{t.abwesenheiten}</h2>
        <div className="abs-form-row">
          <div className="abs-field">
            <span className="field-label">{t.von}</span>
            <DatePicker
              value={from}
              onChange={(iso) => {
                setFrom(iso)
                // "Bis" mit demselben Tag vorbelegen → Ein-Tages-Abwesenheit
                // ist ein einziger Klick; korrigiert auch ein Bis vor dem Von.
                if (iso && (!to || to < iso)) setTo(iso)
              }}
              locale={LOCALES[state.lang]}
              placeholder={t.datumPh}
              ariaLabel={t.von}
              prevLabel={t.a11yPrevMonth}
              nextLabel={t.a11yNextMonth}
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
              prevLabel={t.a11yPrevMonth}
              nextLabel={t.a11yNextMonth}
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
        {eigeneAbwesenheiten.map((absence) => (
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
              aria-label={t.a11yRemove}
              onClick={() => dispatch({ type: 'removeAbsence', id: absence.id })}
            >
              ✕
            </button>
          </div>
        ))}
        {eigeneAbwesenheiten.length === 0 && <p className="abs-empty">{t.keineAbw}</p>}
      </form>
    </section>
  )
}
