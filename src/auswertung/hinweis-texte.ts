import type { EinseitigZeile, Hinweis, Vergleich } from '../data/auswertung'
import { fill } from '../i18n/useT'
import { gerundet, type Kontext } from './kontext'

const TEXT_DES_VERGLEICHS = {
  aufgaben: 'awTextAufgaben',
  schulung: 'awTextSchulung',
  hilfsdienste: 'awTextGesamt',
} as const satisfies Record<Vergleich, string>

/** Wie eine einseitige Verteilung in Worten heißt: „Vor allem X, nie Y". */
export function einseitigText(z: EinseitigZeile, k: Kontext): string {
  const nie = z.nie.map(k.bereich).join(', ')
  if (z.ueberwiegt && nie) return fill(k.t.awVorAllemNie, { bereich: k.bereich(z.ueberwiegt), nie })
  if (z.ueberwiegt) return fill(k.t.awVorAllem, { bereich: k.bereich(z.ueberwiegt) })
  if (nie) return fill(k.t.awNieBereich, { nie })
  return k.t.awAusgewogen
}

/** Titel und Zeile eines Hinweises. */
export function hinweisTexte(h: Hinweis, k: Kontext): { titel: string; text: string } {
  const name = k.name(h.pid)
  switch (h.art) {
    case 'selten':
    case 'oft':
      return {
        titel: fill(h.art === 'oft' ? k.t.awHinweisOft : k.t.awHinweisSelten, { name }),
        text: fill(k.t[TEXT_DES_VERGLEICHS[h.vergleich]], { n: k.zahl(h.n), e: k.zahl(gerundet(h.erwartet)) }),
      }
    case 'einseitig':
      return { titel: fill(k.t.awHinweisEinseitig, { name }), text: einseitigText(h.zeile, k) }
    case 'wartet': {
      const werte = { bereich: k.bereich(h.bereich), ueblich: k.dauer(gerundet(h.ueblich)) }
      return {
        titel: fill(k.t.awHinweisWartet, { name }),
        text: h.wochen === null ? fill(k.t.awWartetNie, werte) : fill(k.t.awWartetSeit, { ...werte, dauer: k.dauer(h.wochen) }),
      }
    }
  }
}
