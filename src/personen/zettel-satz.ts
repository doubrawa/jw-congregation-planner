import { encode } from 'uqr'
import { gebundenesDatum } from '../components/datum-anzeige'
import type { Lang } from '../data/types'
import type { Dict } from '../i18n/ui'
import type { AusgestellterLink } from '../lib/links-ausstellen'

/** Der QR-Code eines Zettels: Kantenlänge in Modulen und ein SVG-Pfad aus den dunklen. */
export interface QrBild {
  groesse: number
  pfad: string
}

/** Ein Anmelde-Zettel, fertig zum Druck. */
export interface Zettel {
  personId: string
  name: string
  /** Der Code zum Eintippen („K7RD-2QWM"). */
  code: string
  /** Bis wann er gilt — derselbe Tag in derselben Form wie in der Nachricht, mit Jahr. */
  bis: string
  qr: QrBild
}

/** Der ganze Bogen: in welcher Sprache, für welche Versammlung, unter welcher Adresse die App steht. */
export interface ZettelSatz {
  lang: Lang
  t: Dict
  versammlung: string
  /** Die Adresse der App ohne Weg („versammlung.app") — für den, dessen Kamera nicht will. */
  adresse: string
  zettel: Zettel[]
}

/**
 * **Der QR-Code eines Zettels** als SVG-Pfad. Ein eigener Pfad statt
 * `renderSVG` von `uqr`: Das gäbe eine fertige Zeichenkette, und die käme nur
 * über `dangerouslySetInnerHTML` auf die Seite. Je Zeile wird ein Lauf dunkler
 * Module zu einem Rechteck — das hält den Pfad kurz.
 *
 * Fehlerkorrektur „M": Ein geknickter oder bekritzelter Zettel liest sich noch.
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

/**
 * **Die Zettel zu eben ausgestellten Links** (T121, Phase 8). Eigene Datei,
 * erst beim Drucken nachgeladen: Sie zieht `uqr` mit — wer nie druckt, lädt es
 * nicht. Das Datum steht gebunden da (`zahlBinden`): Auf dem schmalen Zettel
 * bricht es sonst zwischen Tag und Monat um.
 */
export function zettelSatz(
  links: readonly AusgestellterLink[],
  { namen, lang, t, versammlung }: { namen: ReadonlyMap<string, string>; lang: Lang; t: Dict; versammlung: string },
): ZettelSatz {
  return {
    lang,
    t,
    versammlung,
    adresse: links[0] ? new URL(links[0].zettelUrl).host : '',
    zettel: links.map((l) => ({
      personId: l.personId,
      name: namen.get(l.personId) ?? '',
      code: l.code,
      bis: gebundenesDatum(new Date(l.gueltigBis), lang, 'tagMonatJahr'),
      qr: qrBild(l.zettelUrl),
    })),
  }
}
