import { useState } from 'react'
import { useApp } from '../app/context'
import { PlusMinus } from '../bausteine/PlusMinus'
import { Zeichen } from '../bausteine/Zeichen'
import { fill, useT } from '../i18n/useT'
import { EinstellZeile } from './EinstellZeile'
import { uebernehmenKoennen, uebernehmenText } from './einstellungen-anzeige'
import { HilfsdienstNeuBlatt } from './HilfsdienstNeuBlatt'

/**
 * **Hilfsdienste** (T121, Entwurf `GHilfsdienste`): je Dienst, wie viele Plätze
 * es je Zusammenkunft gibt (− und +), in der Folge, in der sie auch im Programm
 * stehen. Ein Tipp auf den Namen öffnet den Dienst (`HilfsdienstBlatt`): wer ihn
 * übernehmen darf, die Reihenfolge, Entfernen. Der Entwurf zeigt zum Umsortieren
 * einen Griff; hier geht es über „Nach oben" und „Nach unten" im Blatt, wie bei
 * den Programmpunkten.
 *
 * Unter dem Namen steht, wie viele Personen den Dienst übernehmen dürfen (T79) —
 * hervorgehoben bei niemandem: Die Auto-Zuteilung sucht über den
 * Aufgabenbereich `svc:<key>`, und ein neuer Dienst beginnt ohne Freigaben. Sein
 * Platz bliebe sonst Woche für Woche offen, ohne dass irgendwo stünde, woran es
 * liegt. Bei einem Gruppen-Dienst (Reinigung) stehen dort die Gruppen, die
 * reinigen — hervorgehoben bei keiner, aus demselben Grund (18.10.2026).
 */
export function HilfsdiensteInhalt() {
  const { state, dispatch } = useApp()
  const { t, tu } = useT()
  const [neu, setNeu] = useState(false)

  return (
    <>
      <p className="einst-einleitung">{t.hdDesc}</p>
      <section className="karte einst-karte hd-karte">
        {state.services.map((service) => {
          const name = tu(service.name)
          const anzahl = uebernehmenKoennen(state, service)
          return (
            <div key={service.key} className="hd-zeile">
              <button
                type="button"
                className="hd-name"
                onClick={() => dispatch({ type: 'openServiceSheet', key: service.key })}
              >
                <span className="einst-zeile-name" dir="auto">
                  {name}
                </span>
                <span className={anzahl === 0 ? 'klein-text hd-niemand' : 'klein-text'}>
                  {uebernehmenText(t, service, anzahl)}
                </span>
              </button>
              <PlusMinus
                wert={service.count}
                min={1}
                max={6}
                label={fill(t.hdPlaetzeVon, { name })}
                onWert={(wert) =>
                  dispatch({ type: 'changeServiceCount', key: service.key, delta: wert > service.count ? 1 : -1 })
                }
              />
            </div>
          )
        })}
        <button type="button" className="zeile-hinzu" onClick={() => setNeu(true)}>
          <Zeichen name="plus" />
          {t.hilfsdienstHinzu}
        </button>
      </section>
      <section className="karte einst-karte">
        <EinstellZeile
          name={t.werDarfWas}
          unter={t.bereicheBeiPerson}
          onTipp={() => dispatch({ type: 'navigate', screen: 'personen' })}
        />
      </section>
      {neu && <HilfsdienstNeuBlatt onClose={() => setNeu(false)} />}
    </>
  )
}
