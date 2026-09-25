/**
 * Zusagen für den Demo-Modus — damit der Plan alle drei Ampel-Stufen zeigt.
 *
 * Im Betrieb kommen die Zusagen aus der Tabelle `confirmations`; die Demo hat
 * keine. Ohne diese Datei stünde jeder besetzte Platz gelb da, und weder die
 * Handbuch-Aufnahmen noch ein Blick auf die Demo verrieten, wie ein bestätigter
 * oder abgesagter Platz aussieht.
 *
 * Gebaut wird mit denselben Schlüsseln wie im Betrieb (`eachAssignedSlot`,
 * `fsTaskKey`) — eine Liste fester Schlüssel würde beim nächsten Umbau der
 * Demo-Wochen still ins Leere zeigen.
 *
 * Die Demo-Daten selbst bekommt die Funktion übergeben: `testdaten.ts` darf nur
 * die Entwickler-Ansicht importieren (`testdaten-grenze.test.ts`).
 */
import { fsLeiterZuteilung, fsTaskKey } from './fs'
import { eachAssignedSlot, helferKey } from './planning'
import { STANDARD_ZEITEN } from './vorgaben'
import type { ConfirmationMap, FsInstance, Service, Week } from './types'

export function buildDemoConfirmations(
  weeks: Week[],
  services: Service[],
  fsWeeks: FsInstance[][],
  /** Wer noch nicht zugesagt hat (Anzeigenamen) — alle übrigen haben. */
  unbestaetigt: readonly string[],
): ConfirmationMap {
  const offen = new Set(unbestaetigt)
  // Eine Absage je Woche, immer am selben Ort: der zweite Platz am Mikrofon
  // unter der Woche. So ist sie in jeder Woche zu finden, die man aufschlägt.
  const absagen = new Set(weeks.map((w) => helferKey(w.start, 'mid', 'mik', 1)))
  const out: ConfirmationMap = {}
  eachAssignedSlot(weeks, services, STANDARD_ZEITEN, (slot, key) => {
    if (absagen.has(key)) out[key] = 'verhindert'
    else if (!offen.has(slot.name)) out[key] = 'bestätigt'
  })
  fsWeeks.forEach((week, wi) => {
    for (const inst of week) {
      // Offen oder Freitext-Leiter: keine Person von hier, also keine Zusage.
      if (!fsLeiterZuteilung(inst) || offen.has(inst.leader)) continue
      out[fsTaskKey(weeks[wi]?.start ?? '', inst.id)] = 'bestätigt'
    }
  })
  return out
}
