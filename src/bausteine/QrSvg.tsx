import type { QrBild } from '../lib/qr-bild'

/**
 * **Ein QR-Code zum Scannen** — schwarz auf Weiß, auch im dunklen Design: Viele
 * Kameras lesen einen hellen Code auf dunklem Grund nicht. Der helle Rand gehört
 * zum Code; ohne ihn finden manche Kameras ihn nicht.
 *
 * Nur Bild: Was der Code trägt, steht daneben als Text (Zettel, Profil).
 */
export function QrSvg({ qr, className }: { qr: QrBild; className: string }) {
  const rand = 2
  const kante = qr.groesse + 2 * rand
  return (
    <svg className={className} viewBox={`${-rand} ${-rand} ${kante} ${kante}`} shapeRendering="crispEdges" aria-hidden="true">
      <rect x={-rand} y={-rand} width={kante} height={kante} fill="#fff" />
      <path d={qr.pfad} fill="#000" />
    </svg>
  )
}
