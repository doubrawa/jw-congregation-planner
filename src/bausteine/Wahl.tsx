import './bausteine.css'

export interface WahlOption<T extends string> {
  wert: T
  text: string
}

/**
 * **Wenige Möglichkeiten, eine gedrückt** — Baustein `wahl` der Leinwand
 * (T121), etwa die Darstellung im Profil. Für zwei bis vier kurze Optionen;
 * mehr oder lange gehören in eine Liste. `klein` setzt die Schrift kleiner, wie
 * der Baustein mit vier Gruppen nebeneinander („Beginnen mit").
 */
export function Wahl<T extends string>({
  label,
  optionen,
  wert,
  onWahl,
  klein = false,
}: {
  /** Name der Gruppe für Vorleseprogramme — meist die Überschrift darüber. */
  label: string
  optionen: ReadonlyArray<WahlOption<T>>
  wert: T
  onWahl: (wert: T) => void
  klein?: boolean
}) {
  return (
    <div role="group" aria-label={label} className={klein ? 'wahl wahl--klein' : 'wahl'}>
      {optionen.map((o) => (
        <button
          key={o.wert}
          type="button"
          className="wahl-knopf"
          aria-pressed={o.wert === wert}
          onClick={() => onWahl(o.wert)}
        >
          {o.text}
        </button>
      ))}
    </div>
  )
}
