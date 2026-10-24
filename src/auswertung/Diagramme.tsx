import { Fragment } from 'react'
import { LANGE_AB, OBERE_GRENZE, UNTERE_GRENZE, type FeldArt, type Lage, type PersonWoche } from '../data/auswertung'
import { MEETING_TABS } from '../data/helpers'

/**
 * **Die Diagramme der Auswertung** (T126) — aus Kästchen gebaut, nicht aus einer
 * Bibliothek: So gehen sie offline, kippen von rechts nach links, wachsen mit
 * der Schriftstufe und nehmen die Farben von Hell und Dunkel aus den Tokens.
 *
 * **Eine Sprache für alle**, wie auf der Leinwand: grauer Balken = Zahl, Strich
 * = erwartet, Feld dahinter = üblich, rot = darüber, gestrichelt = darunter
 * oder nie (wie „offen" in der App). Jedes Diagramm hat einen Satz für
 * Vorleseprogramme (`aria`), und jede Ansicht hat eine Tabelle daneben.
 */

const anteil = (x: number, max: number): string => `${Math.max(0, Math.min(100, (x / max) * 100))}%`

/**
 * Zuteilungen gegen die Erwartung. `zweiteilig`: Aufgaben und Hilfsdienste als
 * zwei Stücke eines Balkens (der Vergleich mit den Hilfsdiensten).
 */
export function VergleichsBalken({
  n,
  erwartet,
  hilfsdienste = 0,
  zweiteilig = false,
  lage,
  max,
  aria,
}: {
  n: number
  erwartet: number
  hilfsdienste?: number
  zweiteilig?: boolean
  lage: Lage
  max: number
  aria: string
}) {
  const unten = UNTERE_GRENZE * erwartet
  const oben = OBERE_GRENZE * erwartet
  const aufgaben = zweiteilig ? n - hilfsdienste : n
  return (
    <div className="aw-balken" role="img" aria-label={aria}>
      <span className="aw-band" style={{ insetInlineStart: anteil(unten, max), width: anteil(oben - unten, max) }} />
      <span className="aw-wert" style={{ width: anteil(aufgaben, max) }} />
      {zweiteilig && hilfsdienste > 0 && (
        <span className="aw-wert is-hilfsdienst" style={{ insetInlineStart: anteil(aufgaben, max), width: anteil(hilfsdienste, max) }} />
      )}
      {lage === 'oft' && <span className="aw-wert is-ueber" style={{ insetInlineStart: anteil(oben, max), width: anteil(n - oben, max) }} />}
      {lage === 'selten' && <span className="aw-luecke" style={{ insetInlineStart: anteil(n, max), width: anteil(unten - n, max) }} />}
      <span className="aw-strich" style={{ insetInlineStart: anteil(erwartet, max) }} />
    </div>
  )
}

/**
 * Die Wartezeit (Wochen seit dem letzten Mal, nur die, in denen die Person
 * hätte drankommen können): das Feld reicht bis `LANGE_AB`-mal so lange wie
 * üblich, was darüber liegt, ist rot — aber nur, wenn die Person wirklich lange
 * wartet: Wer schon geplant ist oder insgesamt über seiner Erwartung liegt,
 * wartet nicht, sein Balken bleibt grau. Wer im Jahr nie dran war (`nie`),
 * dessen Balken ist gestrichelt.
 */
export function WarteBalken({
  wochen,
  nie = false,
  ueblich,
  lange,
  max,
  aria,
}: {
  wochen: number
  nie?: boolean
  ueblich: number
  lange: boolean
  max: number
  aria: string
}) {
  const grenze = LANGE_AB * ueblich
  const darueber = lange ? wochen - grenze : 0
  const bis = anteil(darueber > 0 ? grenze : wochen, max)
  return (
    <div className="aw-balken" role="img" aria-label={aria}>
      <span className="aw-band" style={{ width: anteil(grenze, max) }} />
      {nie ? <span className="aw-nie" style={{ width: bis }} /> : <span className="aw-wert" style={{ width: bis }} />}
      {darueber > 0 && <span className="aw-wert is-ueber" style={{ insetInlineStart: anteil(grenze, max), width: anteil(darueber, max) }} />}
      <span className="aw-strich" style={{ insetInlineStart: anteil(ueblich, max) }} />
    </div>
  )
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
 * (`auswertung-legende.test.ts`). Der Hilfsdienst heißt hier `is-dienst`:
 * `is-hilfsdienst` ist das Muster des Balkens „Mit Hilfsdiensten", in einem
 * anderen Grau.
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
  | 'andere'
  | 'leer'
  | 'band'
  | 'strich'
  | 'ueber'
  | 'unter'
  | 'hilfsdienst'
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
  andere: 'aw-muster is-andere',
  leer: 'aw-muster is-leer',
  band: 'aw-muster is-band',
  strich: 'aw-muster is-strich',
  ueber: 'aw-muster is-ueber',
  unter: 'aw-muster is-unter',
  hilfsdienst: 'aw-muster is-hilfsdienst',
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
