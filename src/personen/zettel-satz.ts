import { gebundenesDatum } from '../components/datum-anzeige'
import type { Lang } from '../data/types'
import type { Dict } from '../i18n/ui'
import type { AusgestellterLink } from '../lib/links-ausstellen'
import { qrBild, type QrBild } from '../lib/qr-bild'

/** Ein Anmelde-Zettel, fertig zum Druck. */
export interface Zettel {
  personId: string
  name: string
  /** Der Code zum Eintippen („K7RD 2QWM"). */
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
