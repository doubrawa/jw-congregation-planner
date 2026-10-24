import { Fragment } from 'react'
import type { FeldArt, Lage, PersonWoche } from '../data/auswertung'
import { MEETING_TABS } from '../data/helpers'
import { fill } from '../i18n/useT'
import { gerundet, type Kontext } from './kontext'

/**
 * **Die Diagramme der Auswertung** (T126) — aus Kästchen gebaut, nicht aus einer
 * Bibliothek: So gehen sie offline, kippen von rechts nach links, wachsen mit
 * der Schriftstufe und nehmen die Farben von Hell und Dunkel aus den Tokens.
 * Gestrichelt heißt überall „nie" oder „fehlt" (wie „offen" in der App), rot
 * „zu viel".
 *
 * Zuteilungen gegen die Erwartung und Wartezeiten stehen seit dem 24.10.2026
 * in Worten da (`Marke`), nicht mehr als Balken mit Feld und Strich: „Das
 * erschließt sich nicht jedem so einfach, wie das zu lesen ist" (Betreiber,
 * T138).
 */

const anteil = (x: number, max: number): string => `${Math.max(0, Math.min(100, (x / max) * 100))}%`

/** Rot, wenn etwas zu viel ist; gestrichelt, wenn etwas fehlt; sonst grau. */
export type MarkenArt = 'problem' | 'fehlt' | 'ruhig'

const MARKEN_KLASSE: Record<MarkenArt, string> = {
  problem: 'aw-marke is-problem',
  fehlt: 'aw-marke is-fehlt',
  ruhig: 'aw-marke is-ruhig',
}

/** Ein Befund in einem Wort, rechts neben dem Namen: „6 mehr", „passt", „wartet lange". */
export function Marke({ art, text }: { art: MarkenArt; text: string }) {
  return <span className={MARKEN_KLASSE[art]}>{text}</span>
}

const MARKE_DER_LAGE = { oft: 'problem', rahmen: 'ruhig', selten: 'fehlt' } as const satisfies Record<Lage, MarkenArt>

/**
 * Zuteilungen gegen die Erwartung: „6 mehr", „passt", „3 weniger". Gezählt
 * wird gegen die gerundete Erwartung, die daneben steht — „7 · erwartet 1"
 * und „6 mehr" gehen zusammen auf. Auffällig ist erst, wer drei daneben liegt
 * (`MINDESTABSTAND`); gegen die gerundete Erwartung bleiben es mindestens drei,
 * ein „0 mehr" gibt es nicht.
 */
export function LageMarke({ lage, n, erwartet, k }: { lage: Lage; n: number; erwartet: number; k: Kontext }) {
  const abstand = k.zahl(Math.abs(n - gerundet(erwartet)))
  const text = lage === 'oft' ? fill(k.t.awMehrN, { n: abstand }) : lage === 'selten' ? fill(k.t.awWenigerN, { n: abstand }) : k.t.awPasst
  return <Marke art={MARKE_DER_LAGE[lage]} text={text} />
}

/**
 * Ein schmaler Balken in einer Liste je Bereich — gestrichelt, wo nie.
 * `hervor` in Minze (der überwiegende Bereich), `auffaellig` in der
 * Problemfarbe (ein Bereich mit vielen Absagen).
 */
export function MiniBalken({ n, max, hervor = false, auffaellig = false }: { n: number; max: number; hervor?: boolean; auffaellig?: boolean }) {
  if (n === 0) return <span className="aw-mini is-nie" aria-hidden="true" />
  const klasse = auffaellig ? 'aw-mini-wert is-problem' : hervor ? 'aw-mini-wert is-hervor' : 'aw-mini-wert'
  return (
    <span className="aw-mini" aria-hidden="true">
      <span className={klasse} style={{ width: anteil(n, max) }} />
    </span>
  )
}

/** Je Woche ein Feld, die älteste zuerst; gefüllt, wo dran. */
export function Streifen({ wochen, aria }: { wochen: readonly boolean[]; aria: string }) {
  return (
    <div className="aw-streifen" role="img" aria-label={aria}>
      {wochen.map((an, i) => (
        <span key={i} className={an ? 'aw-streifen-feld is-an' : 'aw-streifen-feld'} />
      ))}
    </div>
  )
}

/** Ein Monat in den Wochen einer Person — fertig beschriftet. */
export interface KalenderMonat {
  /** Der Erste des Monats (ISO): eindeutig über die Jahre. */
  erster: string
  name: string
  wochen: readonly PersonWoche[]
  /** Was neben dem Monat steht, eine Zeile je Eintrag. */
  eintraege: readonly { text: string; absage: boolean }[]
}

/**
 * Feld und Legende tragen dieselbe Klasse — so haben sie dieselbe Farbe
 * (`auswertung-legende.test.ts`).
 */
const FELD_KLASSE: Record<Exclude<FeldArt, null>, string> = {
  aufgabe: 'is-aufgabe',
  hilfsdienst: 'is-dienst',
  beides: 'is-beides',
  abgesagt: 'is-abgesagt',
  abwesend: 'is-abwesend',
  ausgefallen: 'is-ausgefallen',
}

function feldKlasse(art: FeldArt, geplant: boolean): string {
  return ['aw-halb', art && FELD_KLASSE[art], geplant && 'is-geplant'].filter(Boolean).join(' ')
}

/**
 * **Die Wochen einer Person als Kalender** (Entwurf `GWochenbildKalender`,
 * 23.10.2026): je Monat eine Zeile, der neueste oben, über den Monaten eines
 * Jahres seine Zahl. Je Woche zwei Felder — erst die Zusammenkunft unter der
 * Woche, dann die am Wochenende —, daneben, welche Aufgabe es war; Geplantes
 * gestrichelt. Die Felder sind Bild (`aria-hidden`): Was sie zählen, sagt der
 * Abschnitt, was der Monat brachte, die Zeilen daneben.
 */
export function WochenKalender({ jahre }: { jahre: readonly { jahr: string; monate: readonly KalenderMonat[] }[] }) {
  return (
    <div className="aw-wochen">
      <div className="aw-kalender">
        {jahre.map((j) => (
          <Fragment key={j.jahr}>
            <h3 className="aw-jahr">{j.jahr}</h3>
            {j.monate.map((m) => (
              <div key={m.erster} className="aw-monat">
                <span className="aw-monat-name">{m.name}</span>
                <span className="aw-monat-felder" aria-hidden="true">
                  {m.wochen.map((w) => (
                    <span key={w.start} className="aw-woche">
                      {MEETING_TABS.map((tab) => (
                        <span key={tab} className={feldKlasse(w.felder[tab], w.geplant[tab])} />
                      ))}
                    </span>
                  ))}
                </span>
                {/* Fließend mit Komma, wie die Aufzählungen der Hinweise: Eine Zeile je
                    Eintrag machte den Monat eines Ältesten acht Zeilen hoch (Review 24.10.2026). */}
                {m.eintraege.length > 0 && (
                  <p className="aw-monat-text">
                    {m.eintraege.map((e, i) => (
                      <Fragment key={i}>
                        {i > 0 && ', '}
                        <span className={e.absage ? 'is-absage' : undefined}>{e.text}</span>
                      </Fragment>
                    ))}
                  </p>
                )}
              </div>
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  )
}

/** Ein Muster in der Legende — dieselbe Form wie im Diagramm. */
export type MusterArt =
  | 'leer'
  | 'stufe1'
  | 'stufe2'
  | 'stufe3'
  | 'ohne'
  | 'aufgabe'
  | 'dienst'
  | 'beides'
  | 'abgesagt'
  | 'abwesend'
  | 'ausgefallen'
  | 'geplant'

const MUSTER_KLASSE: Record<MusterArt, string> = {
  leer: 'aw-muster is-leer',
  stufe1: 'aw-muster is-stufe1',
  stufe2: 'aw-muster is-stufe2',
  stufe3: 'aw-muster is-stufe3',
  ohne: 'aw-muster is-ohne',
  aufgabe: 'aw-muster is-aufgabe',
  dienst: 'aw-muster is-dienst',
  beides: 'aw-muster is-beides',
  abgesagt: 'aw-muster is-abgesagt',
  abwesend: 'aw-muster is-abwesend',
  ausgefallen: 'aw-muster is-ausgefallen',
  geplant: 'aw-muster is-geplant',
}

export function Legende({ eintraege }: { eintraege: readonly (readonly [MusterArt, string])[] }) {
  return (
    <ul className="aw-legende">
      {eintraege.map(([art, text]) => (
        <li key={art} className="aw-legende-eintrag">
          <span className={MUSTER_KLASSE[art]} aria-hidden="true" />
          {text}
        </li>
      ))}
    </ul>
  )
}
