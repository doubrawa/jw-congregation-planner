import './bausteine.css'

/**
 * **Eine Möglichkeit von mehreren, eine gewählt** — ein Radio-Knopf mit Kreis,
 * Titel und, wo nötig, einer Zeile darunter (T121): die Wahl beim Drucken, der
 * Anlass einer Woche. Die Gruppe drumherum (`role="radiogroup"`) stellt der
 * Aufrufer; wie die Möglichkeiten aussehen — Fläche oder Zeile —, sagt ihre
 * Klasse.
 */
export function Option({
  an,
  titel,
  unter,
  onWahl,
}: {
  an: boolean
  titel: string
  unter?: string
  onWahl: () => void
}) {
  return (
    <button type="button" role="radio" aria-checked={an} className="option" onClick={onWahl}>
      <span className="option-kreis" aria-hidden="true" />
      <span className="option-text">
        <span className="option-titel">{titel}</span>
        {unter && <span className="klein-text">{unter}</span>}
      </span>
    </button>
  )
}
