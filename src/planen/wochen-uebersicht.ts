import { kalendertagMs, montagNach, weekEndMs } from '../data/meeting-dates'
import { wochenstand, type PlanungsQuellen, type Wochenstand } from '../data/planungsstand'
import type { PersoenlichLog, Week } from '../data/types'
import { holenNach } from '../lib/import'
import { zahlenDerWoche, type WochenZahlen } from './plan-spur'

/**
 * Was eine Woche der Übersicht oben rechts sagt (Entwurf `GWochen`): Probleme
 * vor offenen Plätzen vor dem Versand — dieselbe Rangfolge wie die Chips der
 * Planungs-Karte. Ist alles zugeteilt und gesendet, sagt sie nichts; das zeigt
 * die Spur darunter.
 */
export type WochenLage = { art: 'probleme' | 'offen'; n: number } | { art: 'bereit' } | null

/** Eine Woche der Übersicht: wo sie steht, ihre Spur und was sie sagt. */
export interface WochenKarte {
  /** Index in `weeks`. */
  wi: number
  stand: Wochenstand
  /** Die Zahlen der Spur — wie bei den Zusagen der Woche (`zahlenDerWoche`). */
  zahlen: WochenZahlen
  lage: WochenLage
}

/**
 * Woraus die Übersicht rechnet: die Quellen der Planungs-Karte ohne den Vorrat
 * (den sagt die Karte „Holen") und dazu die Haken „weiß Bescheid".
 */
export type UebersichtQuellen = Omit<PlanungsQuellen, 'geladenBisMs'> & { persoenlich: PersoenlichLog }

/**
 * **Die Wochen der Übersicht** — jede geladene ab der Kalenderwoche, deren
 * Sonntag noch nicht vorbei ist, in Kalenderfolge.
 *
 * Anders als die Planungs-Karte (`planungsstand`) nicht nur die mit etwas zu
 * tun und nicht nur vier: Hier sucht der Planer eine Woche, auch eine fertige.
 */
export function wochenKarten(q: UebersichtQuellen, heute: Date): WochenKarte[] {
  const heuteMs = kalendertagMs(heute)
  const karten: WochenKarte[] = []
  q.weeks.forEach((week, wi) => {
    const sonntag = weekEndMs(week.start)
    if (sonntag === null || sonntag < heuteMs) return
    const stand = wochenstand(q, wi, heute)
    karten.push({ wi, stand, zahlen: zahlenDerWoche(week, q.fsWeeks[wi], q, heute), lage: lageDerWoche(stand) })
  })
  return karten
}

/** Probleme (Konflikte und Engpässe), sonst offene Plätze, sonst „bereit zum Senden". */
export function lageDerWoche(stand: Wochenstand): WochenLage {
  const probleme = stand.konflikte + stand.nichtBesetzbar
  if (probleme > 0) return { art: 'probleme', n: probleme }
  if (stand.offen > 0) return { art: 'offen', n: stand.offen }
  return stand.nichtGesendet > 0 ? { art: 'bereit' } : null
}

/**
 * **Der Montag der Woche, die „Holen" als Nächstes holt** — wie `import-week`
 * sie zu `holenNach` wählt: die Woche danach.
 */
export function naechsteHolWoche(weeks: Week[], heute: Date): string {
  return montagNach(holenNach(weeks, heute), 1)
}
