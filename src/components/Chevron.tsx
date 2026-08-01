import './components.css'

/**
 * Chevron-Icon für runde Blätter-Buttons (Wochen-Navigation, Datumsauswahl).
 *
 * Bewusst ein SVG statt der Glyphen ‹ ›: das sind typografische Anführungs-
 * zeichen, deren Tinte auf x-Höhe sitzt und nicht mittig in der Zeilenbox —
 * im Kreis wirken sie dadurch zu tief (gemessen 1,1 px). Wie stark, hängt an
 * der Schrift (0,05–0,16 em über die Fallback-Kette), ein fester Korrekturwert
 * wäre also nur für eine Schrift richtig. Das SVG ist geometrisch exakt
 * zentriert, unabhängig von der geladenen Schrift.
 *
 * Im Fließtext bleiben ‹ › richtig (dort SOLL das Zeichen auf x-Höhe sitzen).
 * Die Größe folgt der Schriftgröße des Buttons (em), skaliert also mit dem
 * Schriftgrößen-Regler.
 */
export function Chevron({ dir }: { dir: 'prev' | 'next' }) {
  return (
    <svg className="chev" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {/* Pfad symmetrisch um die viewBox-Mitte (x 8,5–15,5 / y 5–19, Mitte 12|12),
          damit das Zeichen exakt im Kreis sitzt. */}
      <path d={dir === 'prev' ? 'M15.5 5 L8.5 12 L15.5 19' : 'M8.5 5 L15.5 12 L8.5 19'} />
    </svg>
  )
}
