import type { EinseitigZeile, Hinweis, Vergleich } from '../data/auswertung'
import { fill } from '../i18n/useT'
import { gerundet, type Kontext } from './kontext'

/** Was eine Zeile zählt, im Hinweis wie in „Zu oft, zu selten": „Aufgaben: 7 · erwartet: 1". */
export const TEXT_DES_VERGLEICHS = {
  aufgaben: 'awTextAufgaben',
  hilfsdienste: 'awTextGesamt',
} as const satisfies Record<Vergleich, string>

/** So viele Namen nennt der Hinweis „Lange Wartezeit", den Rest als Zahl. */
export const NAMEN_SICHTBAR = 3

/** Wie eine einseitige Verteilung in Worten heißt: „Vor allem X, nie Y". */
export function einseitigText(z: EinseitigZeile, k: Kontext): string {
  const nie = z.nie.map(k.bereich).join(', ')
  if (z.ueberwiegt && nie) return fill(k.t.awVorAllemNie, { bereich: k.bereich(z.ueberwiegt), nie })
  if (z.ueberwiegt) return fill(k.t.awVorAllem, { bereich: k.bereich(z.ueberwiegt) })
  if (nie) return fill(k.t.awNieBereich, { nie })
  return k.t.awAusgewogen
}

/** Woran ein Hinweis in der Liste zu erkennen ist: Art und Person — oder Bereich. */
export function hinweisSchluessel(h: Hinweis): string {
  return h.art === 'absagen' || h.art === 'wartet' ? `${h.art}|${h.bereich}` : `${h.art}|${h.pid}`
}

/** „Anna, Ben, Carl +2" — die ersten Namen, der Rest als Zahl. */
function namenListe(pids: readonly string[], k: Kontext): string {
  const namen = pids.slice(0, NAMEN_SICHTBAR).map(k.name).join(', ')
  const rest = pids.length - NAMEN_SICHTBAR
  return rest > 0 ? `${namen} +${k.zahl(rest)}` : namen
}

/** Titel und Zeile eines Hinweises. */
export function hinweisTexte(h: Hinweis, k: Kontext): { titel: string; text: string } {
  switch (h.art) {
    case 'selten':
    case 'oft':
      return {
        titel: fill(h.art === 'oft' ? k.t.awHinweisOft : k.t.awHinweisSelten, { name: k.name(h.pid) }),
        text: fill(k.t[TEXT_DES_VERGLEICHS[h.vergleich]], { n: k.zahl(h.n), e: k.zahl(gerundet(h.erwartet)) }),
      }
    case 'einseitig':
      return { titel: fill(k.t.awHinweisEinseitig, { name: k.name(h.pid) }), text: einseitigText(h.zeile, k) }
    case 'wartet':
      return {
        titel: fill(k.t.awHinweisWartezeit, { bereich: k.bereich(h.bereich) }),
        text: fill(k.t.awTextWartezeit, { namen: namenListe(h.pids, k), ueblich: k.dauer(gerundet(h.ueblich)) }),
      }
    case 'absagen':
      return {
        titel: fill(k.t.awHinweisAbsagen, { bereich: k.bereich(h.bereich) }),
        text: fill(k.t.awTextAbsagen, { anteil: k.prozent(h.anteil), sonst: k.prozent(h.sonst) }),
      }
    case 'ohneBereich':
      return {
        titel: fill(k.t.awHinweisOhneBereich, { name: k.name(h.pid) }),
        text: fill(k.t.awTextOhneBereich, {
          liste: h.bereiche.map((b) => fill(k.t.awBereichZahl, { bereich: k.bereich(b.bereich), n: k.zahl(b.n) })).join(', '),
        }),
      }
    case 'nieGenutzt':
      return {
        titel: fill(k.t.awHinweisNieGenutzt, { name: k.name(h.pid) }),
        text: fill(k.t.awTextNieGenutzt, { bereiche: h.bereiche.map(k.bereich).join(', ') }),
      }
  }
}
