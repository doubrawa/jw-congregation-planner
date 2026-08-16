import { useState, type FormEvent } from 'react'
import { useApp } from '../app/context'
import { isQualified, serviceQualKey } from '../data/helpers'
import { fill, useT } from '../i18n/useT'
import type { Service } from '../data/types'

/** Hilfsdienste: je Dienst Anzahl-Stepper + löschen, plus Formular zum Anlegen. */
export function ServicesPanel() {
  const { state, dispatch } = useApp()
  const { t, tu } = useT()
  const [serviceName, setServiceName] = useState('')

  /**
   * Wie viele Personen für diesen Dienst freigegeben sind (T79).
   *
   * Ein Dienst, für den niemand freigegeben ist, lässt sich nie automatisch
   * besetzen: Die Auto-Zuteilung sucht Kandidaten über den Aufgabenbereich
   * `svc:<key>`, und ein **neu angelegter** Dienst bringt einen Bereich mit,
   * den bis dahin keine Person gesetzt hat. Sein Platz bleibt dann Woche für
   * Woche offen, ohne dass irgendwo stünde, woran es liegt. Hier steht es —
   * an der Stelle, an der der Planer es auch ändern kann.
   */
  const freigegeben = (service: Service): number =>
    state.persons.filter((p) => isQualified(p, serviceQualKey(service.key))).length

  // Jeder Dienst ist sein eigener Aufgabenbereich (Schalter im Personen-Detail);
  // nur Gruppen-Dienste rotieren stattdessen Gruppen und brauchen niemanden.
  const serviceSub = (service: Service): string =>
    service.groups
      ? t.gruppenRotation
      : `${t.eigenerBereich} · ${fill(t.personenCount, { n: freigegeben(service) })}`

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
      <h2 className="panel-label">{t.hilfsdienste}</h2>
      <p className="panel-hint">{t.hdDesc}</p>
      {state.services.map((service) => (
        <div key={service.key} className="svc-row">
          <div>
            <div className="svc-name">{tu(service.name)}</div>
            <div className={freigegeben(service) === 0 && !service.groups ? 'svc-sub svc-sub--leer' : 'svc-sub'}>
              {serviceSub(service)}
            </div>
          </div>
          <div className="svc-controls">
            <button
              type="button"
              className="stepper-btn"
              aria-label={t.a11yDecrease}
              onClick={() => dispatch({ type: 'changeServiceCount', key: service.key, delta: -1 })}
            >
              –
            </button>
            <span className="svc-count">{service.count}</span>
            <button
              type="button"
              className="stepper-btn"
              aria-label={t.a11yIncrease}
              onClick={() => dispatch({ type: 'changeServiceCount', key: service.key, delta: 1 })}
            >
              +
            </button>
            <button
              type="button"
              className="svc-remove"
              aria-label={t.a11yRemove}
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
