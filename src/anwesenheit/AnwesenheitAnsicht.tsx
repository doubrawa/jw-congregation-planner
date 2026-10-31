import { useId, useState } from 'react'
import { useApp } from '../app/context'
import { gebundenesDatum } from '../components/datum-anzeige'
import { anwesenheitVerlauf, videoAnteil, type AnwesenheitMonat, type VerlaufsMonat } from '../data/anwesenheit'
import { MEETING_TABS } from '../data/helpers'
import { fromIso } from '../data/meeting-dates'
import { rechteVon } from '../data/rechte'
import type { MeetingKey, Week } from '../data/types'
import { useDruckBogen } from '../druck/useDruckBogen'
import { fill, useT } from '../i18n/useT'
import { AnwesenheitBlatt } from './AnwesenheitBlatt'
import { AnwesenheitDruck } from './AnwesenheitDruck'
import './anwesenheit.css'

/** Ganze Klassennamen je Zusammenkunftsart, damit eine Textsuche sie findet (`klassennamen.test.ts`). */
const LINIE: Record<MeetingKey, string> = { mid: 'aw-verlauf-linie is-mid', we: 'aw-verlauf-linie is-we' }
const PUNKT: Record<MeetingKey, string> = { mid: 'aw-verlauf-punkt is-mid', we: 'aw-verlauf-punkt is-we' }
const LEGENDE: Record<MeetingKey, string> = { mid: 'is-mid', we: 'is-we' }

/** Wie die Zahlen geschrieben werden — von der Auswertung (`k.zahl`, `k.prozent`), in der Schrift der Sprache. */
interface Format {
  zahl: (n: number) => string
  prozent: (anteil: number) => string
}

/**
 * **Die Anwesenheit in der Auswertung** (T152): je Monat, der jüngste zuerst,
 * die Zahl der Zusammenkünfte, der Durchschnitt und der Anteil per Video —
 * unter der Woche und am Wochenende getrennt. Darüber der Verlauf als Linie
 * (31.10.2026; bis dahin je Monat ein Balkenpaar). Wo eine Zusammenkunft
 * stattfand, aber keine Zahl hat, steht ihr Tag; ein Tipp darauf öffnet das
 * Eintragen. Unten „Für den Bericht drucken".
 *
 * Die Monate rechnet die Auswertung (`useAnwesenheitMonate`), die mit ihnen auch
 * ihre Kachel zählt; die Zahlen schreibt sie wie überall (`k.zahl`) — in fa mit
 * persischen Ziffern, nicht als einziger Abschnitt mit 0–9.
 */
export function AnwesenheitAnsicht({ monate, zahl, prozent }: { monate: readonly AnwesenheitMonat[] } & Format) {
  const { state } = useApp()
  const { t } = useT()
  const { drucken, bogen } = useDruckBogen()
  const [nachtragen, setNachtragen] = useState<{ week: Week; tab: MeetingKey } | null>(null)
  const darfNachtragen = rechteVon(state).zuteilen && state.staleAt === null
  const mitZahl = monate.filter((m) => MEETING_TABS.some((tab) => m.je[tab].anzahl > 0))
  const monatsName = (iso: string) => gebundenesDatum(fromIso(iso), state.lang, 'monatJahr')
  const tagText = (iso: string) => gebundenesDatum(fromIso(iso), state.lang, 'wochentagZahl')
  const name = { mid: t.unterDerWoche, we: t.amWochenende } as const satisfies Record<MeetingKey, string>

  const oeffnen = (woche: string, tab: MeetingKey) => {
    const week = state.weeks.find((w) => w.start === woche)
    if (week) setNachtragen({ week, tab })
  }

  return (
    <div className="aw-anwesend">
      {mitZahl.length === 0 ? (
        <p className="karte aw-leer">{t.awAnwesenheitKeine}</p>
      ) : (
        <Verlauf verlauf={anwesenheitVerlauf(monate)} name={name} zahl={zahl} />
      )}
      {monate.map((m) => (
        <section key={m.monat} className="karte aw-anwesend-karte" aria-label={monatsName(m.monat)}>
          <h3 className="aw-anwesend-titel">{monatsName(m.monat)}</h3>
          {MEETING_TABS.map((tab) => {
            const z = m.je[tab]
            // Ohne Zahl und ohne Lücke gibt es zu dieser Art nichts zu sagen —
            // etwa unter der Woche im Oktober, wenn nur ein Sonntag hineinragt.
            if (z.anzahl === 0 && z.fehlt.length === 0) return null
            const video = videoAnteil(z)
            return (
              <div key={tab} className="aw-anwesend-reihe">
                <span className="aw-anwesend-name">{name[tab]}</span>
                <span className="klein-text">
                  {[
                    fill(t.awZusammenkuenfte, { n: zahl(z.anzahl) }),
                    z.schnitt !== null ? fill(t.awAnwesenheitSchnitt, { n: zahl(z.schnitt) }) : '',
                    video !== null ? fill(t.awAnwesenheitVideo, { n: prozent(video) }) : '',
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

/**
 * Luft über dem höchsten Punkt: Ein Punkt auf der obersten Linie ragte zur
 * Hälfte darüber — am Anfang der Zeile in die Zahl, die dort steht (Review
 * 31.10.2026).
 */
const LUFT = 1.1

/** Die obere Linie des Diagramms: über dem höchsten Durchschnitt, auf eine glatte Zahl aufgerundet. */
function obereLinie(hoechster: number): number {
  const schritt = hoechster <= 50 ? 10 : hoechster <= 200 ? 20 : 50
  return Math.max(schritt, Math.ceil((hoechster * LUFT) / schritt) * schritt)
}

/** Höchstens so viele Monatsnamen unter der Linie — mehr stießen am Handy aneinander. */
const MONATSNAMEN = 4

/**
 * **Der Verlauf** (31.10.2026): je Art eine Linie über die Monate, die Punkte
 * auf dem Durchschnitt; ein Monat ohne Zahl unterbricht sie. Die Fläche ist
 * ein SVG, das sich auf jede Breite dehnt — die Linien bleiben dabei gleich
 * dick (`vector-effect`), die Punkte sind HTML und bleiben rund. Unter der
 * Woche runde Punkte, am Wochenende eckige: Die Farbe ist nicht das einzige
 * Unterscheidungsmerkmal; die Legende steht in derselben Karte. Die Zahlen
 * jedes Monats stehen darunter in Worten.
 */
function Verlauf({ verlauf, name, zahl }: { verlauf: readonly VerlaufsMonat[]; name: Record<MeetingKey, string>; zahl: (n: number) => string }) {
  const { state } = useApp()
  const { t } = useT()
  const titelId = useId()
  const n = verlauf.length
  const oben = obereLinie(Math.max(0, ...verlauf.flatMap((m) => MEETING_TABS.map((tab) => m.schnitt[tab] ?? 0))))
  // Der erste Monat am Anfang, der letzte am Ende; ein einzelner in der Mitte.
  const x = (i: number) => (n === 1 ? 50 : (i / (n - 1)) * 100)
  const y = (wert: number) => (wert / oben) * 100
  const kurz = (iso: string) => gebundenesDatum(fromIso(iso), state.lang, 'monatKurz')
  // Vom jüngsten Monat rückwärts jeder `schritt`-te — der jüngste steht immer da.
  const schritt = Math.ceil(n / MONATSNAMEN)
  return (
    <div className="karte aw-verlauf">
      <p id={titelId} className="klein-text">
        {t.awAnwesenheitVerlauf}
      </p>
      <div className="aw-verlauf-flaeche" role="img" aria-labelledby={titelId}>
        <span className="aw-verlauf-oben">{zahl(oben)}</span>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {[0, 50, 100].map((h) => (
            <line key={h} className="aw-verlauf-gitter" x1="0" x2="100" y1={h} y2={h} vectorEffect="non-scaling-stroke" />
          ))}
          {MEETING_TABS.flatMap((tab) =>
            stuecke(verlauf, tab).map((stueck) => (
              <polyline
                key={`${tab}-${stueck[0]}`}
                className={LINIE[tab]}
                points={stueck.map((i) => `${x(i)},${100 - y(verlauf[i]!.schnitt[tab]!)}`).join(' ')}
                vectorEffect="non-scaling-stroke"
              />
            )),
          )}
        </svg>
        {MEETING_TABS.flatMap((tab) =>
          verlauf.flatMap((m, i) => {
            const wert = m.schnitt[tab]
            if (wert === null) return []
            return (
              <span
                key={`${tab}-${m.monat}`}
                className={PUNKT[tab]}
                style={{ insetInlineStart: `${x(i)}%`, insetBlockEnd: `${y(wert)}%` }}
                title={`${kurz(m.monat)} · ${name[tab]}: ${zahl(wert)}`}
              />
            )
          }),
        )}
      </div>
      <div className="aw-verlauf-monate" aria-hidden="true">
        {verlauf.flatMap((m, i) =>
          (n - 1 - i) % schritt === 0 ? (
            <span key={m.monat} className={monatsKlasse(i, n)} style={{ insetInlineStart: `${x(i)}%` }}>
              {kurz(m.monat)}
            </span>
          ) : (
            []
          ),
        )}
      </div>
      <ul className="aw-anwesend-legende">
        {MEETING_TABS.map((tab) => (
          <li key={tab} className={LEGENDE[tab]}>
            <span className="aw-anwesend-punkt" aria-hidden="true" />
            {name[tab]}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Ein Monatsname steht mittig unter seinem Punkt — am Anfang und am Ende bündig, damit er nicht über die Karte ragt. */
function monatsKlasse(i: number, n: number): string {
  if (n > 1 && i === 0) return 'klein-text is-anfang'
  if (n > 1 && i === n - 1) return 'klein-text is-ende'
  return 'klein-text'
}

/** Die Stücke einer Linie: je Lauf aufeinanderfolgender Monate mit Zahl die Indizes — erst ab zwei Punkten eine Linie. */
function stuecke(verlauf: readonly VerlaufsMonat[], tab: MeetingKey): number[][] {
  const out: number[][] = []
  let lauf: number[] = []
  verlauf.forEach((m, i) => {
    if (m.schnitt[tab] !== null) {
      lauf.push(i)
      return
    }
    if (lauf.length > 1) out.push(lauf)
    lauf = []
  })
  if (lauf.length > 1) out.push(lauf)
  return out
}
