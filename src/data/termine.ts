/**
 * Weitere Termine einer Woche (T63) — reine Logik.
 *
 * Pionierbesprechung, Ältestenbesprechung, was sonst ansteht: **eine**
 * allgemeine Terminart statt zweier fester Sonderfälle, und reine Ankündigung
 * ohne Bearbeiter (siehe `Termin` in `types.ts`). Weil niemand zugeteilt wird,
 * gibt es hier weder Kennungen für Bestätigungen noch eine Anrechnung — nur
 * Anlegen, Ändern, Entfernen und eine Reihenfolge.
 *
 * Alle Funktionen sind pur und geben unveränderte Wochen **identisch** zurück;
 * daran erkennt der Aufrufer, ob er speichern muss (dieselbe Linie wie in
 * `fs.ts` und `meeting-edit.ts`).
 */

import type { Termin, Week } from './types'
import { WEEKDAY_OFFSET } from './meeting-dates'

/** Nur die Woche `wi` ersetzen (die übrigen behalten ihre Referenz). */
function patchWeek(weeks: Week[], wi: number, fn: (week: Week) => Week): Week[] {
  return weeks.map((week, i) => (i === wi ? fn(week) : week))
}

/**
 * Die Termine einer Woche, nach Wochentag und Uhrzeit sortiert.
 *
 * Sortiert wird beim **Lesen**, nicht beim Schreiben: Der Planer tippt einen
 * Tag ein, während er noch am Formular ist — spränge die Zeile dabei weg,
 * verlöre das Feld den Fokus. `fsSort` macht es beim Schreiben, weil dort Zeit
 * und Ort aus fertigen Auswahlfeldern kommen.
 *
 * Termine ohne Tag stehen hinten: Sie sind unfertig, nicht „am Montag".
 */
export function termineVon(week: Week | undefined): Termin[] {
  const liste = week?.termine
  if (!liste || liste.length === 0) return []
  const rang = (t: Termin): number => {
    const versatz = t.day ? WEEKDAY_OFFSET[t.day] : undefined
    return versatz ?? 99
  }
  return [...liste].sort((a, b) => rang(a) - rang(b) || (a.time ?? '').localeCompare(b.time ?? ''))
}

/** Neuen, leeren Termin an die Woche hängen. */
export function terminAdd(weeks: Week[], wi: number, id: string): Week[] {
  return patchWeek(weeks, wi, (week) => ({
    ...week,
    termine: [...(week.termine ?? []), { id, title: '' }],
  }))
}

/** Felder eines Termins ändern. */
export function terminUpdate(
  weeks: Week[],
  wi: number,
  id: string,
  patch: Partial<Omit<Termin, 'id'>>,
): Week[] {
  const week = weeks[wi]
  if (!week?.termine?.some((t) => t.id === id)) return weeks
  return patchWeek(weeks, wi, (w) => ({
    ...w,
    termine: (w.termine ?? []).map((t) => (t.id === id ? { ...t, ...patch } : t)),
  }))
}

/**
 * Termin entfernen.
 *
 * Ist es der letzte, verschwindet auch das Feld — eine Woche ohne Termine soll
 * aussehen wie eine, die nie welche hatte. Sonst stünde in den Daten für immer
 * ein `termine: []`, und jede Woche, die einmal einen Termin trug, wäre von den
 * übrigen unterscheidbar, ohne es zu sein.
 */
export function terminRemove(weeks: Week[], wi: number, id: string): Week[] {
  const week = weeks[wi]
  if (!week?.termine?.some((t) => t.id === id)) return weeks
  return patchWeek(weeks, wi, (w) => {
    const rest = (w.termine ?? []).filter((t) => t.id !== id)
    if (rest.length > 0) return { ...w, termine: rest }
    const { termine: _weg, ...ohne } = w
    return ohne
  })
}
