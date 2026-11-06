import { encode } from 'uqr'

/** Ein QR-Code: Kantenlänge in Modulen und ein SVG-Pfad aus den dunklen. */
export interface QrBild {
  groesse: number
  pfad: string
}

/**
 * **Ein QR-Code** als SVG-Pfad — für den Anmelde-Zettel und den Einmal-Code im
 * Profil. Ein eigener Pfad statt `renderSVG` von `uqr`: Das gäbe eine fertige
 * Zeichenkette, und die käme nur über `dangerouslySetInnerHTML` auf die Seite.
 * Je Zeile wird ein Lauf dunkler Module zu einem Rechteck — das hält den Pfad
 * kurz.
 *
 * Fehlerkorrektur „M": Ein geknickter oder bekritzelter Zettel liest sich noch.
 *
 * Eigene Datei, erst bei Bedarf nachgeladen: Sie zieht `uqr` mit — wer nie
 * einen Code braucht, lädt es nicht.
 */
export function qrBild(text: string): QrBild {
  const { data, size } = encode(text, { ecc: 'M', border: 0 })
  let pfad = ''
  data.forEach((zeile, y) => {
    for (let x = 0; x < zeile.length; x++) {
      if (!zeile[x]) continue
      const von = x
      while (zeile[x + 1]) x++
      pfad += `M${von} ${y}h${x - von + 1}v1h-${x - von + 1}z`
    }
  })
  return { groesse: size, pfad }
}
