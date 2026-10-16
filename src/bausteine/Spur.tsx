import './bausteine.css'

/**
 * Lage eines Schritts: erledigt (`voll`), hier stehst du (`jetzt`), zum Teil
 * (`teil`), noch nicht (`leer`) oder hängt (`problem`).
 */
export type SpurLage = 'voll' | 'jetzt' | 'teil' | 'leer' | 'problem'

export interface SpurSchritt {
  name: string
  /** Kleine Zahl unter dem Namen („16 von 19") — wo es eine gibt. */
  wert?: string
  lage: SpurLage
  /** Wohin ein Tipp auf den Schritt führt (Entwurf: `ziele`) — wo es einen Weg dorthin gibt. */
  ziel?: () => void
}

/** Ganze Klassennamen, damit eine Textsuche sie findet (`tests/css-klassen.test.ts`). */
const SCHRITT_KLASSE: Record<SpurLage, string> = {
  voll: 'spur-schritt is-voll',
  jetzt: 'spur-schritt is-jetzt',
  teil: 'spur-schritt is-teil',
  leer: 'spur-schritt is-leer',
  problem: 'spur-schritt is-problem',
}

/** Wie groß die Spur steht (siehe `Spur`). */
export type SpurForm = 'gross' | 'knapp' | 'punkte'

const SPUR_KLASSE: Record<SpurForm, string> = {
  gross: 'spur',
  knapp: 'spur spur--knapp',
  punkte: 'spur spur--knapp spur--punkte',
}

/** Die Linie zwischen zwei Schritten ist durchgezogen, wo der frühere erledigt ist. */
const linie = (vorher: SpurLage | undefined): string =>
  vorher === undefined ? 'spur-linie is-weg' : vorher === 'voll' ? 'spur-linie is-voll' : 'spur-linie'

/**
 * **Die Spur eines Ablaufs** (T121): wenige Schritte auf einer Linie, der
 * laufende hervorgehoben — beim Absagen, was danach geschieht, beim Planen,
 * wie weit eine Woche ist. Eine geordnete Liste; der laufende Schritt trägt
 * `aria-current="step"`. Ein Schritt mit `ziel` ist ganz ein Knopf: Beim Planen
 * führt „Zusagen" zu den Zusagen der Woche und „Zuteilen" zurück in den Plan.
 *
 * Die Form (`form`, sonst `gross`):
 *  - `knapp`: die kleine Spur einer Wochenkarte (Entwürfe `GWochen`,
 *    `GDesktopPlanen`) — linksbündig, der Punkt vorn, die Zahl über dem Namen,
 *    und wo es noch keine Zahl gibt, ein Strich.
 *  - `punkte`: dieselbe in der schmalen Wochenspalte am Desktop — nur die
 *    Punkte, darunter über die ganze Breite der laufende Schritt mit seiner
 *    Zahl (`imBlick`). Die übrigen Namen liest nur der Screenreader. In einem
 *    Drittel der Spalte brachen sie mitten im Wort, in sechs Sprachen schon bei
 *    normaler Schrift (Betreiber, 16.10.2026).
 */
export function Spur({
  schritte,
  label,
  form = 'gross',
}: {
  schritte: readonly SpurSchritt[]
  label: string
  form?: SpurForm
}) {
  const punkte = form === 'punkte'
  const gezeigt = punkte ? imBlick(schritte) : undefined
  return (
    <ol className={SPUR_KLASSE[form]} aria-label={label}>
      {schritte.map((s, i) => {
        // Der Strich steht nur, wo man ihn sieht — vorgelesen hieße er „Minus".
        const wert = s.wert ?? (form === 'knapp' ? '–' : undefined)
        const inhalt = (
          <>
            <span className="spur-bahn" aria-hidden="true">
              <span className={linie(schritte[i - 1]?.lage)} />
              <span className="spur-punkt" />
              <span className={i === schritte.length - 1 ? linie(undefined) : linie(s.lage)} />
            </span>
            <span className={punkte ? 'spur-name sr-only' : 'spur-name'}>{s.name}</span>
            {wert && <span className={punkte ? 'spur-wert sr-only' : 'spur-wert'}>{wert}</span>}
          </>
        )
        return (
          <li key={s.name} className={SCHRITT_KLASSE[s.lage]} aria-current={s.lage === 'jetzt' ? 'step' : undefined}>
            {s.ziel ? (
              <button type="button" className="spur-ziel" onClick={s.ziel}>
                {inhalt}
              </button>
            ) : (
              inhalt
            )}
          </li>
        )
      })}
      {/* Was die Schritte darüber schon sagen — für den Screenreader stünde es doppelt da. */}
      {gezeigt && (
        <li className="spur-unterschrift" aria-hidden="true">
          {gezeigt.wert && <span className="spur-unterschrift-wert">{gezeigt.wert}</span>}
          <span className="spur-unterschrift-name">{gezeigt.name}</span>
        </li>
      )}
    </ol>
  )
}

/**
 * Der Schritt, den die Spur in der Form `punkte` beim Namen nennt: der
 * laufende — ohne laufenden der letzte erledigte (alles fertig), sonst der
 * erste.
 */
export function imBlick(schritte: readonly SpurSchritt[]): SpurSchritt | undefined {
  return schritte.find((s) => s.lage === 'jetzt') ?? schritte.findLast((s) => s.lage === 'voll') ?? schritte[0]
}
