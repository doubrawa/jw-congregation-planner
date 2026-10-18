import { LANGE_AB, OBERE_GRENZE, UNTERE_GRENZE, type Lage, type WochenArt } from '../data/auswertung'

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

const WOCHEN_KLASSE: Record<Exclude<WochenArt, null>, string> = {
  aufgabe: 'aw-woche is-aufgabe',
  hilfsdienst: 'aw-woche is-hilfsdienst',
  abwesend: 'aw-woche is-abwesend',
}

/** Die Wochen einer Person als Felder, in Reihen zu je dreizehn. */
export function WochenFelder({ wochen, reihen }: { wochen: readonly WochenArt[]; reihen: { label: string; von: number }[] }) {
  return (
    <div className="aw-wochen">
      {reihen.map((r, i) => {
        const bis = reihen[i + 1]?.von ?? wochen.length
        return (
          <div key={r.von} className="aw-wochen-reihe">
            <span className="klein-text">{r.label}</span>
            <div className="aw-wochen-felder">
              {wochen.slice(r.von, bis).map((art, j) => (
                <span key={j} className={art ? WOCHEN_KLASSE[art] : 'aw-woche'} />
              ))}
            </div>
          </div>
        )
      })}
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
  | 'abwesend'

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
  abwesend: 'aw-muster is-abwesend',
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
