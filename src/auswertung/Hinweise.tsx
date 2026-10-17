import { useState } from 'react'
import { Zeichen, type ZeichenName } from '../bausteine/Zeichen'
import type { Hinweis } from '../data/auswertung'
import { hinweisSchluessel, hinweisTexte } from './hinweis-texte'
import type { Kontext } from './kontext'

/** So viele stehen im Überblick, bevor „Alle Hinweise" den Rest zeigt. */
export const HINWEISE_SICHTBAR = 6

/** Das Zeichen eines Hinweises: Pfeil hinauf oder hinab, halber Kreis, Uhr, Kreuz. */
const ZEICHEN_DER_ART = {
  oft: 'pfeilHoch',
  selten: 'pfeilRunter',
  einseitig: 'halb',
  wartet: 'uhr',
  absagen: 'kreuz',
} as const satisfies Record<Hinweis['art'], ZeichenName>

/**
 * **Was auffällt** — die ersten sechs, auf „Alle Hinweise" der Rest. Ein
 * Hinweis zu einer Person öffnet sie, einer zu einem Bereich die Absagen.
 */
export function HinweisListe({ k }: { k: Kontext }) {
  const [alle, setAlle] = useState(false)
  const liste = k.a.hinweise
  if (liste.length === 0) return <p className="karte aw-leer">{k.t.awNichtsAuffaellig}</p>
  const sichtbar = alle ? liste : liste.slice(0, HINWEISE_SICHTBAR)
  return (
    <div className="karte aw-hinweise-karte">
      <ul className="aw-hinweise">
        {sichtbar.map((h) => {
          const { titel, text } = hinweisTexte(h, k)
          return (
            <li key={hinweisSchluessel(h)}>
              <button
                type="button"
                className="aw-hinweis"
                onClick={() => (h.art === 'absagen' ? k.ansichtOeffnen('weiteres') : k.personOeffnen(h.pid))}
              >
                <span className="aw-hinweis-zeichen" aria-hidden="true">
                  <Zeichen name={ZEICHEN_DER_ART[h.art]} />
                </span>
                <span className="aw-hinweis-text">
                  <span className="aw-hinweis-titel">{titel}</span>
                  <span className="aw-hinweis-detail">{text}</span>
                </span>
                <Zeichen name="weiter" />
              </button>
            </li>
          )
        })}
      </ul>
      {liste.length > HINWEISE_SICHTBAR && (
        <button type="button" className="knopf-pille aw-mehr" aria-expanded={alle} onClick={() => setAlle(!alle)}>
          {alle ? k.t.awWeniger : k.t.awAlleHinweise}
        </button>
      )}
    </div>
  )
}
