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
 * `aria-current="step"`.
 */
export function Spur({ schritte, label }: { schritte: readonly SpurSchritt[]; label: string }) {
  return (
    <ol className="spur" aria-label={label}>
      {schritte.map((s, i) => (
        <li key={s.name} className={SCHRITT_KLASSE[s.lage]} aria-current={s.lage === 'jetzt' ? 'step' : undefined}>
          <span className="spur-bahn" aria-hidden="true">
            <span className={linie(schritte[i - 1]?.lage)} />
            <span className="spur-punkt" />
            <span className={i === schritte.length - 1 ? linie(undefined) : linie(s.lage)} />
          </span>
          <span className="spur-name">{s.name}</span>
          {s.wert && <span className="spur-wert">{s.wert}</span>}
        </li>
      ))}
    </ol>
  )
}
