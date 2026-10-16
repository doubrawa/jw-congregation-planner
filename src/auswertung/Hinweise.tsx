import { useState } from 'react'
import { Zeichen } from '../bausteine/Zeichen'
import type { Hinweis } from '../data/auswertung'
import { hinweisTexte } from './hinweis-texte'
import type { Kontext } from './kontext'

/** So viele stehen im Überblick, bevor „Alle Hinweise" den Rest zeigt. */
export const HINWEISE_SICHTBAR = 6

/** Das Zeichen eines Hinweises: Pfeil hinauf oder hinab, halber Kreis, Uhr. */
function HinweisZeichen({ art }: { art: Hinweis['art'] }) {
  if (art === 'oft') return <Zeichen name="pfeilHoch" />
  if (art === 'selten') return <Zeichen name="pfeilRunter" />
  if (art === 'einseitig') return <Zeichen name="halb" />
  return <Zeichen name="uhr" />
}

/**
 * **Was auffällt** — die ersten sechs, auf „Alle Hinweise" der Rest. Jeder
 * Hinweis öffnet die Person.
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
            <li key={`${h.art}|${h.pid}`}>
              <button type="button" className="aw-hinweis" onClick={() => k.personOeffnen(h.pid)}>
                <span className="aw-hinweis-zeichen" aria-hidden="true">
                  <HinweisZeichen art={h.art} />
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
