import type { Screen } from '../../src/data/types'

/**
 * **Alle Bildschirme außer der Anmeldung** — für die Proben, die jeden
 * Bildschirm einmal aufziehen: bedienbar, stille Konsole, keine deutschen
 * Reste in einer fremden Sprache.
 *
 * Die Liste stand dreimal abgeschrieben in diesen Proben. Ein neuer
 * Bildschirm (die Mitteilungen, 12.10.2026) hätte in jeder still gefehlt, und
 * alle drei wären grün geblieben. Über `satisfies` verlangt TypeScript jeden
 * Bildschirm und keinen mehr: Wer einen dazunimmt, bringt diese Datei zum
 * Stehen, nicht die Proben ins Leere.
 */
export const BILDSCHIRME = Object.keys({
  start: true,
  programm: true,
  aufgaben: true,
  mitteilungen: true,
  planen: true,
  personen: true,
  einstellungen: true,
  profil: true,
} satisfies Record<Exclude<Screen, 'login'>, true>) as Screen[]
