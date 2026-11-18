import { PLATZ_LAGEN, type Besetzung, type DuLage, type PlatzLage, type SaalLage } from '../data/saal'
import { LOGO_GROSS } from './logo-form'
import './bausteine.css'

/**
 * Die 18 Plätze des Logos 4-6-8, von vorn nach hinten. Aus `logo-form.ts`, nicht
 * abgeschrieben: Bis zum 16.10.2026 stand hier eine eigene Liste, und als das
 * Pult näher an die Reihen rückte, hätte der Saal es als Einziger nicht getan.
 */
const PLAETZE = LOGO_GROSS.reihen.flat()

/** Ganze Klassennamen, damit eine Textsuche sie findet (`tests/css-klassen.test.ts`). */
const PLATZ_KLASSE: Record<PlatzLage, string> = {
  voll: 'saal-platz is-voll',
  wartet: 'saal-platz is-wartet',
  problem: 'saal-platz is-problem',
  offen: 'saal-platz is-offen',
}

const DU_KLASSE: Record<DuLage, string> = {
  voll: 'saal-du is-voll',
  wartet: 'saal-du is-wartet',
  problem: 'saal-du is-problem',
}

/**
 * **Der Saal** (T121): die Besetzung einer Zusammenkunft als Bild, vor dem
 * Pult in Minze. Die Lagen rechnet `saalLagen`; die Beschriftung sagt in
 * Worten, was das Bild zeigt.
 *
 * **Der eigene Platz** trägt einen Ring in Minze; der Punkt darin zeigt den
 * Stand der eigenen Zusage (`du`, 29.10.2026): blass, solange sie aussteht,
 * rot nach einer Absage. Mit der Zusage füllt er sich von der Mitte her in
 * Minze — eine Füllung über dem Grund, die wächst (bausteine.css). Bis dahin
 * war er immer in Minze, ob zugesagt oder nicht.
 *
 * **`sichtbar`** (T188): Die Beschriftung steht als Zeile unter dem Bild statt
 * nur für Vorleseprogramme — sonst erfuhr, wer nicht sieht, mehr als wer
 * sieht. Das Bild ist dann still, damit sie nicht zweimal vorgelesen wird.
 */
export function Saal({
  lagen,
  label,
  du = 'voll',
  sichtbar = false,
}: {
  lagen: readonly SaalLage[]
  label: string
  du?: DuLage
  sichtbar?: boolean
}) {
  if (sichtbar) {
    return (
      <figure className="saal-figur">
        <SaalBild lagen={lagen} du={du} />
        <figcaption className="saal-zahl">{label}</figcaption>
      </figure>
    )
  }
  return <SaalBild lagen={lagen} du={du} label={label} />
}

/** Das Bild allein — ohne `label` still (`aria-hidden`), weil die Beschriftung daneben steht. */
function SaalBild({ lagen, du, label }: { lagen: readonly SaalLage[]; du: DuLage; label?: string }) {
  const [pultX, pultY] = LOGO_GROSS.pult.mitte
  const a11y = label === undefined ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label }
  return (
    <svg className="saal" viewBox={LOGO_GROSS.viewBox} {...a11y}>
      <circle className="logo-pult" cx={pultX} cy={pultY} r={LOGO_GROSS.pult.r} />
      {PLAETZE.map(([x, y], i) => {
        const lage = lagen[i] ?? 'offen'
        if (lage === 'du') {
          return (
            <g key={i} className={DU_KLASSE[du]}>
              <circle className="saal-du-grund" cx={x} cy={y} r={LOGO_GROSS.r} />
              <circle className="saal-du-fuellung" cx={x} cy={y} r={LOGO_GROSS.r} />
              <circle className="saal-ring" cx={x} cy={y} r="25" />
            </g>
          )
        }
        return <circle key={i} className={PLATZ_KLASSE[lage]} cx={x} cy={y} r={lage === 'offen' ? 13 : LOGO_GROSS.r} />
      })}
    </svg>
  )
}

const BALKEN_KLASSE: Record<PlatzLage, string> = {
  voll: 'saal-balken-teil is-voll',
  wartet: 'saal-balken-teil is-wartet',
  problem: 'saal-balken-teil is-problem',
  offen: 'saal-balken-teil is-offen',
}

/**
 * **Der Saal als Balken** (29.10.2026): eine Woche auf der Planungs-Karte, in
 * den Farben des Saals — voll zugesagt, blass wartend, rot ein Problem,
 * gestrichelt offen. Jede Lage so breit wie ihr Anteil, aber nie schmaler als
 * ein Strich: Eine einzige Absage unter vierzig Plätzen ist genau die
 * Nachricht (wie im Saal, `saalLagen`). Die Zahlen nennt die Beschriftung.
 */
export function SaalBalken({ besetzung, label }: { besetzung: Besetzung; label: string }) {
  return (
    <span className="saal-balken" role="img" aria-label={label}>
      {PLATZ_LAGEN.map((lage) =>
        besetzung[lage] > 0 ? <span key={lage} className={BALKEN_KLASSE[lage]} style={{ flexGrow: besetzung[lage] }} /> : null,
      )}
    </span>
  )
}
