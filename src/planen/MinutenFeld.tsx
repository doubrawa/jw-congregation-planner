import { useRef, useState } from 'react'
import { LAC_MAX_MINUTEN, LAC_MIN_MINUTEN } from '../data/meeting-edit'

/**
 * Die Minuten eines LAC-Punkts — **direkt eingeben**.
 *
 * Hier standen bis zum 18. September 2026 zwei Knöpfe, und die sprangen in
 * Fünferschritten: „19 Minuten" war damit nicht einstellbar, „20" kostete vier
 * Tipps. Ein Feld nennt den Wert selbst. Deshalb bleibt es auch im Blatt eines
 * Programmpunkts (T121) beim Feld, wo der Entwurf `GProgrammpunkt` wieder
 * Knöpfe zeichnet.
 *
 * **Gespeichert wird beim Verlassen, nicht bei jedem Tastendruck.** Sonst wäre
 * die „1" von „19" schon ein eigener Wert — die Zahl würde auf das Minimum
 * geklemmt, das Ende der Zusammenkunft nachgezogen und der Schreibvorgang
 * angestoßen, bevor überhaupt zu Ende getippt ist. Solange das Feld den Fokus
 * hat, gilt deshalb der Entwurf; danach wieder der Wert aus den Daten — der
 * kann ein anderer sein, weil `lacMinuten` auf 5..45 klemmt.
 */
export function MinutenFeld({
  mins,
  einheit,
  label,
  onSetzen,
}: {
  mins: number
  einheit: string
  label: string
  onSetzen: (wert: number) => void
}) {
  const [entwurf, setEntwurf] = useState(String(mins))
  const [tippt, setTippt] = useState(false)
  const abbruch = useRef(false)

  /**
   * Übernehmen — **gelesen wird aus dem Feld, nicht aus dem Entwurf.**
   *
   * Das Feld trägt den Wert unabhängig davon, ob React den Entwurf schon
   * übernommen hat; der Entwurf ist nur die Anzeige während des Tippens. Wer
   * hier den Zustand läse, machte das Übernehmen von der Reihenfolge zweier
   * Renderläufe abhängig — eine Abhängigkeit, die kein Nutzen rechtfertigt.
   */
  const beenden = (feld: HTMLInputElement) => {
    setTippt(false)
    if (abbruch.current) {
      abbruch.current = false
      setEntwurf(String(mins))
      return
    }
    const roh = feld.value.trim()
    const zahl = Number(roh)
    // Ein leeres Feld ist keine Null: Wer alles löscht und weiterklickt,
    // wollte die Dauer nicht auf das Minimum setzen.
    if (roh && Number.isFinite(zahl)) onSetzen(zahl)
    else setEntwurf(String(mins))
  }

  return (
    <span className="lac-mins">
      <input
        className="lac-mins-input"
        type="number"
        inputMode="numeric"
        min={LAC_MIN_MINUTEN}
        max={LAC_MAX_MINUTEN}
        step={1}
        aria-label={label}
        value={tippt ? entwurf : String(mins)}
        onFocus={(e) => {
          setEntwurf(String(mins))
          setTippt(true)
          e.currentTarget.select()
        }}
        onChange={(e) => setEntwurf(e.target.value)}
        onBlur={(e) => beenden(e.currentTarget)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          // Abbrechen über ein Merkfähnchen statt über den Entwurf: Das
          // Verlassen liest das Feld, und dort stünde die verworfene Zahl noch.
          // Die Taste bleibt beim Feld: Im Blatt eines Programmpunkts schlösse
          // sie sonst gleich das Blatt mit (`useEscape` horcht am Fenster).
          if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            abbruch.current = true
            e.currentTarget.blur()
          }
        }}
      />
      <span className="lac-mins-einheit">{einheit}</span>
    </span>
  )
}
