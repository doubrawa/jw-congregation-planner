import { useState, type FormEvent } from 'react'
import { useApp } from '../app/context'
import { useT } from '../i18n/useT'
import type { Service } from '../data/types'

/** Hilfsdienste: je Dienst Anzahl-Stepper + löschen, plus Formular zum Anlegen. */
export function ServicesPanel() {
  const { state, dispatch } = useApp()
  const { t, tu } = useT()
  const [serviceName, setServiceName] = useState('')

  // Jeder Dienst ist sein eigener Aufgabenbereich (Schalter im Personen-Detail);
  // nur Gruppen-Dienste rotieren stattdessen Gruppen.
  const serviceSub = (service: Service): string =>
    service.groups ? t.gruppenRotation : t.eigenerBereich

  const addService = (event: FormEvent) => {
    event.preventDefault()
    const name = serviceName.trim()
    if (!name) {
      dispatch({ type: 'showToast', text: t.toastNameEingeben })
      return
    }
    dispatch({
      type: 'addService',
      service: { key: `svc-${crypto.randomUUID()}`, name, count: 1, groups: false },
    })
    setServiceName('')
  }

  return (
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
  )
}
