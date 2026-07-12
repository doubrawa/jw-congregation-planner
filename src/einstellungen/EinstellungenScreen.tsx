import { useState, type FormEvent } from 'react'
import { useApp } from '../app/context'
import { QUALIFICATION_LABEL } from '../data/constants'
import { CONGREGATION, WORKBOOK_LABEL } from '../data/demo'
import type { QualificationKey, Service } from '../data/types'
import './einstellungen.css'

function serviceSub(service: Service): string {
  if (service.groups) return 'Gruppen-Rotation'
  if (service.priv) return `Bereich: ${QUALIFICATION_LABEL[service.priv as QualificationKey] ?? service.priv}`
  return 'Alle Verkündiger'
}

/**
 * Einstellungen (Screen 6, nur Planer): Versammlungs-Stammdaten (Anzeige),
 * Hilfsdienste konfigurieren (Anzahl 1–6, entfernen, eigene hinzufügen —
 * wirkt sofort auf Programm und Planung) und simulierter Arbeitsheft-Import
 * (~0.9 s, hängt die nächste Woche ohne Zuteilungen an).
 */
export function EinstellungenScreen() {
  const { state, dispatch } = useApp()
  const [serviceName, setServiceName] = useState('')

  const addService = (event: FormEvent) => {
    event.preventDefault()
    const name = serviceName.trim()
    if (!name) {
      dispatch({ type: 'showToast', text: 'Bitte einen Namen eingeben' })
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
      dispatch({ type: 'showToast', text: 'Alle verfügbaren Wochen sind importiert' })
      return
    }
    if (state.importing) return
    dispatch({ type: 'startImport' })
    setTimeout(() => dispatch({ type: 'finishImport' }), 900) // simulierter Abruf
  }

  const importLabel = state.importing
    ? 'IMPORTIERE …'
    : state.imported
      ? 'ALLE WOCHEN IMPORTIERT'
      : 'NÄCHSTE WOCHE IMPORTIEREN'

  return (
    <section className="screen">
      <h1 className="screen-title">Einstellungen</h1>
      <p className="screen-subtitle">Versammlung {CONGREGATION.name}</p>

      <div className="panel panel--lead panel--pb14" data-farbe="neutral">
        <div className="panel-label">VERSAMMLUNG</div>
        <div className="kv-row">
          <span className="kv-key">Name</span>
          <span className="kv-val">{CONGREGATION.name}</span>
        </div>
        <div className="kv-row">
          <span className="kv-key">Königreichssaal</span>
          <span className="kv-val">{CONGREGATION.hall}</span>
        </div>
        <div className="kv-row kv-row--plain">
          <span className="kv-key">Zusammenkünfte</span>
          <span className="kv-val">{CONGREGATION.meetings}</span>
        </div>
      </div>

      <form className="panel panel--pb16" data-farbe="petrol" onSubmit={addService}>
        <div className="panel-label">HILFSDIENSTE</div>
        <p className="panel-hint">
          Anzahl benötigter Personen je Dienst — wirkt sofort auf Programm und Planung.
        </p>
        {state.services.map((service) => (
          <div key={service.key} className="svc-row">
            <div>
              <div className="svc-name">{service.name}</div>
              <div className="svc-sub">{serviceSub(service)}</div>
            </div>
            <div className="svc-controls">
              <button
                type="button"
                className="stepper-btn"
                aria-label={`${service.name}: weniger`}
                onClick={() => dispatch({ type: 'changeServiceCount', key: service.key, delta: -1 })}
              >
                –
              </button>
              <span className="svc-count">{service.count}</span>
              <button
                type="button"
                className="stepper-btn"
                aria-label={`${service.name}: mehr`}
                onClick={() => dispatch({ type: 'changeServiceCount', key: service.key, delta: 1 })}
              >
                +
              </button>
              <button
                type="button"
                className="svc-remove"
                aria-label={`${service.name} entfernen`}
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
            placeholder="Neuer Dienst, z. B. Parkplatz"
            aria-label="Name des neuen Dienstes"
            value={serviceName}
            onChange={(e) => setServiceName(e.target.value)}
          />
          <button type="submit" className="svc-add-btn">
            + HINZUFÜGEN
          </button>
        </div>
      </form>

      <div className="panel panel--pb16" data-farbe="neutral">
        <div className="panel-label">PROGRAMM-IMPORT</div>
        <p className="panel-hint">
          Die Wochenprogramme stammen aus dem Arbeitsheft auf jw.org und werden ohne Zuteilungen
          importiert.
        </p>
        <div className="imp-status">
          <span className="kv-key">{WORKBOOK_LABEL}</span>
          <span className="imp-count">{state.weeks.length} Wochen geladen</span>
        </div>
        <button type="button" className="btn-outline imp-btn" onClick={importWorkbook}>
          {importLabel}
        </button>
      </div>
    </section>
  )
}
