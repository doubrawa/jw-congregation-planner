import { useState } from 'react'
import { useApp } from '../app/context'
import { gebundenesDatum } from '../components/datum-anzeige'
import { MEETING_TABS } from '../data/helpers'
import { fromIso } from '../data/meeting-dates'
import { rechteVon } from '../data/rechte'
import type { MeetingKey, Week } from '../data/types'
import { useDruckBogen } from '../druck/useDruckBogen'
import { fill, useT } from '../i18n/useT'
import { zahlBinden } from '../i18n/zahl-binden'
import { AnwesenheitBlatt } from './AnwesenheitBlatt'
import { AnwesenheitDruck } from './AnwesenheitDruck'
import { useAnwesenheitMonate } from './useAnwesenheitMonate'
import './anwesenheit.css'

/** Ganze Klassennamen je Zusammenkunftsart, damit eine Textsuche sie findet (`klassennamen.test.ts`). */
const SAEULE: Record<MeetingKey, string> = { mid: 'aw-anwesend-saeule is-mid', we: 'aw-anwesend-saeule is-we' }
const LEGENDE: Record<MeetingKey, string> = { mid: 'is-mid', we: 'is-we' }

/**
 * **Die Anwesenheit in der Auswertung** (T152): je Monat, der jüngste zuerst,
 * die Zahl der Zusammenkünfte und der Durchschnitt — unter der Woche und am
 * Wochenende getrennt. Darüber je Monat ein Balkenpaar. Wo eine Zusammenkunft
 * stattfand, aber keine Zahl hat, steht ihr Tag; ein Tipp darauf öffnet das
 * Eintragen. Unten „Für den Bericht drucken".
 */
export function AnwesenheitAnsicht({ zeitraum }: { zeitraum: number }) {
  const { state } = useApp()
  const { t } = useT()
  const monate = useAnwesenheitMonate(zeitraum)
  const { drucken, bogen } = useDruckBogen()
  const [nachtragen, setNachtragen] = useState<{ week: Week; tab: MeetingKey } | null>(null)
  const darfNachtragen = rechteVon(state).zuteilen && state.staleAt === null
  const mitZahl = monate.filter((m) => MEETING_TABS.some((tab) => m.je[tab].anzahl > 0))
  const hoechster = Math.max(1, ...monate.flatMap((m) => MEETING_TABS.map((tab) => m.je[tab].schnitt ?? 0)))
  const monatsName = (iso: string) => gebundenesDatum(fromIso(iso), state.lang, 'monatJahr')
  const tagText = (iso: string) => gebundenesDatum(fromIso(iso), state.lang, 'wochentagZahl')
  const name = { mid: t.unterDerWoche, we: t.amWochenende } as const satisfies Record<MeetingKey, string>

  const oeffnen = (woche: string, tab: MeetingKey) => {
    const week = state.weeks.find((w) => w.start === woche)
    if (week) setNachtragen({ week, tab })
  }

  return (
    <div className="aw-anwesend">
      {mitZahl.length === 0 && <p className="karte aw-leer">{t.awAnwesenheitKeine}</p>}
      {mitZahl.length > 0 && (
        <div className="karte aw-anwesend-balken" role="img" aria-label={t.awAnwesenheitTitel}>
          {[...mitZahl].reverse().map((m) => (
            <div key={m.monat} className="aw-anwesend-monat">
              <div className="aw-anwesend-paar">
                {MEETING_TABS.map((tab) => (
                  <span
                    key={tab}
                    className={SAEULE[tab]}
                    style={{ blockSize: `${Math.round(((m.je[tab].schnitt ?? 0) / hoechster) * 100)}%` }}
                  />
                ))}
              </div>
              <span className="klein-text">{gebundenesDatum(fromIso(m.monat), state.lang, 'monatKurz')}</span>
            </div>
          ))}
        </div>
      )}
      {mitZahl.length > 0 && (
        <ul className="aw-anwesend-legende">
          {MEETING_TABS.map((tab) => (
            <li key={tab} className={LEGENDE[tab]}>
              <span className="aw-anwesend-punkt" aria-hidden="true" />
              {name[tab]}
            </li>
          ))}
        </ul>
      )}
      {monate.map((m) => (
        <section key={m.monat} className="karte aw-anwesend-karte" aria-label={monatsName(m.monat)}>
          <h3 className="aw-anwesend-titel">{monatsName(m.monat)}</h3>
          {MEETING_TABS.map((tab) => {
            const z = m.je[tab]
            // Ohne Zahl und ohne Lücke gibt es zu dieser Art nichts zu sagen —
            // etwa unter der Woche im Oktober, wenn nur ein Sonntag hineinragt.
            if (z.anzahl === 0 && z.fehlt.length === 0) return null
            return (
              <div key={tab} className="aw-anwesend-reihe">
                <span className="aw-anwesend-name">{name[tab]}</span>
                <span className="klein-text">
                  {[
                    zahlBinden(fill(t.awZusammenkuenfte, { n: z.anzahl })),
                    z.schnitt !== null ? zahlBinden(fill(t.awAnwesenheitSchnitt, { n: z.schnitt })) : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                {z.fehlt.length > 0 && (
                  <span className="aw-anwesend-fehlt">
                    <span>{t.awAnwesenheitOhne}</span>
                    {z.fehlt.map(({ tag, woche }) =>
                      darfNachtragen ? (
                        <button key={tag} type="button" className="verweis-leise" onClick={() => oeffnen(woche, tab)}>
                          {tagText(tag)}
                        </button>
                      ) : (
                        <span key={tag}>{tagText(tag)}</span>
                      ),
                    )}
                  </span>
                )}
              </div>
            )
          })}
        </section>
      ))}
      {mitZahl.length > 0 && (
        <button type="button" className="knopf-pille aw-anwesend-drucken" onClick={() => drucken(<AnwesenheitDruck monate={mitZahl} />)}>
          {t.awAnwesenheitDrucken}
        </button>
      )}
      {bogen}
      {nachtragen && <AnwesenheitBlatt week={nachtragen.week} tab={nachtragen.tab} onClose={() => setNachtragen(null)} />}
    </div>
  )
}
