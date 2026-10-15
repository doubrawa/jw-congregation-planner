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
 * `knapp`: die kleine Spur einer Wochenkarte (Entwürfe `GWochen`,
 * `GDesktopPlanen`) — linksbündig, der Punkt vorn, die Zahl über dem Namen,
 * und wo es noch keine Zahl gibt, ein Strich.
 */
export function Spur({ schritte, label, knapp = false }: { schritte: readonly SpurSchritt[]; label: string; knapp?: boolean }) {
  return (
    <ol className={knapp ? 'spur spur--knapp' : 'spur'} aria-label={label}>
      {schritte.map((s, i) => {
        const wert = s.wert ?? (knapp ? '–' : undefined)
        const inhalt = (
          <>
            <span className="spur-bahn" aria-hidden="true">
              <span className={linie(schritte[i - 1]?.lage)} />
              <span className="spur-punkt" />
              <span className={i === schritte.length - 1 ? linie(undefined) : linie(s.lage)} />
            </span>
            <span className="spur-name">{s.name}</span>
            {wert && <span className="spur-wert">{wert}</span>}
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
    </ol>
  )
}
