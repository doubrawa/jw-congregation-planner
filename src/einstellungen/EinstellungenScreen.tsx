import { useState, type FormEvent } from 'react'
import { useApp } from '../app/context'
import { CONG_TO_CODE } from '../i18n/langs'
import { PRIV_KEY, type Dict } from '../i18n/ui'
import { fill, useT } from '../i18n/useT'
import type { QualificationKey, Service } from '../data/types'
import './einstellungen.css'

/**
 * Einstellungen (Screen 6, nur Planer): Versammlung, Hilfsdienste,
 * Sprache (Versammlungssprache-Sheet), Erinnerungen und Programm-Import.
 */
export function EinstellungenScreen() {
  const { state, dispatch } = useApp()
  const { t, tu } = useT()
  const [serviceName, setServiceName] = useState('')

  const serviceSub = (service: Service): string => {
    if (service.groups) return t.gruppenRotation
    if (service.priv) return t.bereich + t[PRIV_KEY[service.priv as QualificationKey]]
    return t.alleVerk
  }

  const reminderSub = (n: number): string => {
    if (n === 0) return t.remAmTag
    return n === 1 ? t.remTagVorher : fill(t.remTageVorher, { n })
  }

  const addService = (event: FormEvent) => {
    event.preventDefault()
    const name = serviceName.trim()
    if (!name) {
      dispatch({ type: 'showToast', text: t.toastNameEingeben })
      return
    }
    dispatch({
      type: 'addService',
      service: { key: `svc-${crypto.randomUUID()}`, name, count: 1, priv: null, groups: false },
    })
    setServiceName('')
  }

  const importWorkbook = () => {
    if (state.imported) {
      dispatch({ type: 'showToast', text: t.toastAlleWochen })
      return
    }
    if (state.importing) return
    dispatch({ type: 'startImport' })
    setTimeout(() => dispatch({ type: 'finishImport' }), 900) // simulierter Abruf
  }

  const importLabel = state.importing
    ? t.importiere
    : state.imported
      ? t.alleImportiert
      : t.importBtn

  const progFallback = !CONG_TO_CODE[state.congLang]

  const reminderRows: Array<{ key: 'first' | 'last'; name: keyof Dict }> = [
    { key: 'first', name: 'remErste' },
    { key: 'last', name: 'remLetzte' },
  ]

  return (
    <section className="screen">
      <h1 className="screen-title">{t.einstellungen}</h1>
      <p className="screen-subtitle">{fill(t.congLabel, { name: state.congregation.name })}</p>

      <div className="panel panel--lead panel--pb14" data-farbe="neutral">
        <div className="panel-label">{t.versammlungCard}</div>
        <div className="kv-row">
          <span className="kv-key">{t.nameLbl}</span>
          <span className="kv-val">{state.congregation.name}</span>
        </div>
        <div className="kv-row">
          <span className="kv-key">{t.saal}</span>
          <span className="kv-val">{state.congregation.hall}</span>
        </div>
        <div className="kv-row kv-row--plain">
          <span className="kv-key">{t.zusammenkuenfte}</span>
          <span className="kv-val">{tu(state.congregation.meetings)}</span>
        </div>
      </div>

      <form className="panel panel--pb16" data-farbe="petrol" onSubmit={addService}>
        <div className="panel-label">{t.hilfsdienste}</div>
        <p className="panel-hint">{t.hdDesc}</p>
        {state.services.map((service) => (
          <div key={service.key} className="svc-row">
            <div>
              <div className="svc-name">{tu(service.name)}</div>
              <div className="svc-sub">{serviceSub(service)}</div>
            </div>
            <div className="svc-controls">
              <button
                type="button"
                className="stepper-btn"
                aria-label="–"
                onClick={() => dispatch({ type: 'changeServiceCount', key: service.key, delta: -1 })}
              >
                –
              </button>
              <span className="svc-count">{service.count}</span>
              <button
                type="button"
                className="stepper-btn"
                aria-label="+"
                onClick={() => dispatch({ type: 'changeServiceCount', key: service.key, delta: 1 })}
              >
                +
              </button>
              <button
                type="button"
                className="svc-remove"
                aria-label="✕"
                onClick={() => dispatch({ type: 'removeService', key: service.key })}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
        <div className="svc-add-row">
          <input
            type="text"
            className="svc-add-input"
            placeholder={t.neuerDienstPh}
            aria-label={t.neuerDienstPh}
            value={serviceName}
            onChange={(e) => setServiceName(e.target.value)}
          />
          <button type="submit" className="svc-add-btn">
            {t.hinzufuegen}
          </button>
        </div>
      </form>

      <div className="panel panel--pb14" data-farbe="gold">
        <div className="panel-label">{t.spracheCard}</div>
        <button
          type="button"
          className="lang-card-row"
          onClick={() => dispatch({ type: 'openLangSheet' })}
        >
          <span className="lang-card-key">{t.versSprache}</span>
          <span className="lang-card-val">
            <span>{state.congLang}</span>
            <span className="lang-card-chevron">›</span>
          </span>
        </button>
        <p className="lang-card-desc">{t.versSpracheDesc}</p>
        {progFallback && <div className="lang-demo-hint">{t.demoLangHint}</div>}
      </div>

      <div className="panel panel--pb14" data-farbe="wein">
        <div className="panel-label">{t.erinnerungenCard}</div>
        <p className="panel-hint">{t.remDesc}</p>
        <div className="kv-row">
          <span className="kv-key">{t.remBeiZut}</span>
          <span className="kv-val">{t.remSofort}</span>
        </div>
        {reminderRows.map(({ key, name }) => (
          <div key={key} className="svc-row">
            <div>
              <div className="svc-name">{t[name]}</div>
              <div className="svc-sub">{reminderSub(state.reminders[key])}</div>
            </div>
            <div className="svc-controls">
              <button
                type="button"
                className="stepper-btn"
                aria-label="–"
                onClick={() => dispatch({ type: 'changeReminder', key, delta: -1 })}
              >
                –
              </button>
              <span className="svc-count">{state.reminders[key]}</span>
              <button
                type="button"
                className="stepper-btn"
                aria-label="+"
                onClick={() => dispatch({ type: 'changeReminder', key, delta: 1 })}
              >
                +
              </button>
            </div>
          </div>
        ))}
        <div className="rem-toggle-row">
          <span className="rem-toggle-label">{t.remRepeat}</span>
          <button
            type="button"
            role="switch"
            aria-checked={state.reminders.repeat}
            aria-label={t.remRepeat}
            className={state.reminders.repeat ? 'switch is-on' : 'switch'}
            onClick={() => dispatch({ type: 'toggleReminderRepeat' })}
          >
            <span className="switch-knob" />
          </button>
        </div>
      </div>

      <div className="panel panel--pb16" data-farbe="neutral">
        <div className="panel-label">{t.importCard}</div>
        <p className="panel-hint">{t.importDesc}</p>
        <div className="imp-status">
          <span className="kv-key">{t.arbeitsheftLbl}</span>
          <span className="imp-count">{fill(t.wochenGeladen, { n: state.weeks.length })}</span>
        </div>
        <button type="button" className="btn-outline imp-btn" onClick={importWorkbook}>
          {importLabel}
        </button>
      </div>
    </section>
  )
}
