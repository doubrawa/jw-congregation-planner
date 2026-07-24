/**
 * Zusammenkünfte für den Predigtdienst ("Treffpunkte") — reine Logik.
 *
 * Aus dem Grundplan (FsRule[]) werden pro Woche die konkreten Treffpunkte
 * (FsInstance[]) materialisiert: Versammlungstreffpunkte (grp '') gelten für
 * alle, Gruppentreffpunkte (grp = Group.id) nur für ihre Gruppe. Eine
 * Gruppen-Regel mit `skipCong` entfällt, wenn am selben Wochentag bereits ein
 * Versammlungstreffpunkt liegt. `monthly` (1..4) begrenzt eine Regel auf den
 * N-ten betreffenden Wochentag im Monat.
 *
 * Alle Funktionen sind pur — Woche 0 wird durch das Basis-Datum (Montag der
 * ersten Woche) bestimmt; spätere Wochen sind wi × 7 Tage später.
 */

import type { FsInstance, FsRule } from './types'

/** Uhrzeiten im 15-Minuten-Raster (06:00–22:00) für Zeit-Auswahlen. */
export const FS_TIME_OPTIONS: string[] = Array.from({ length: (22 - 6) * 4 + 1 }, (_unused, i) => {
  const h = 6 + Math.floor(i / 4)
  const m = (i % 4) * 15
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
})

/**
 * Montag der Woche 0 — verankert an der als `current` markierten Programmwoche:
 * deren Montag ist der Montag der realen aktuellen Woche (`today`), Woche 0 liegt
 * `curIdx` Wochen davor. Sprachunabhängig (nutzt keine Datums-Strings).
 */
export function fsBaseFromWeeks(weeks: ReadonlyArray<{ current: boolean }>, today: Date): Date {
  const curIdx = Math.max(0, weeks.findIndex((w) => w.current))
  const d = new Date(today)
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - curIdx * 7) // Montag dieser Woche, dann curIdx Wochen zurück
  return d
}

/** Datum des Wochentags `wd` (0=So..6=Sa) in Woche `wi`, ausgehend vom Montag der Woche 0. */
export function fsDate(base: Date, wi: number, wd: number): Date {
  const d = new Date(base.getTime())
  d.setDate(d.getDate() + wi * 7 + ((wd + 6) % 7)) // (wd+6)%7 = Offset ab Montag
  return d
}

/** Sortierung: Wochentag (Mo→So), dann Uhrzeit, dann Gruppe. */
export function fsSort(a: FsInstance, b: FsInstance): number {
  return ((a.wd + 6) % 7) - ((b.wd + 6) % 7) || a.time.localeCompare(b.time) || a.grp.localeCompare(b.grp)
}

/** Materialisiert alle Treffpunkte der Woche `wi` aus dem Grundplan. */
export function genFsWeek(base: Date, wi: number, rules: FsRule[]): FsInstance[] {
  const out: FsInstance[] = []
  const congDays = new Set<number>()
  const fits = (r: FsRule): boolean =>
    !r.monthly || Math.ceil(fsDate(base, wi, r.wd).getDate() / 7) === r.monthly

  for (const r of rules) {
    if (r.grp === '' && fits(r)) {
      out.push({ id: `${wi}|${r.id}`, ruleId: r.id, grp: '', wd: r.wd, time: r.time, place: r.place, leader: '' })
      congDays.add(r.wd)
    }
  }
  for (const r of rules) {
    if (r.grp !== '' && fits(r) && !(r.skipCong && congDays.has(r.wd))) {
      out.push({ id: `${wi}|${r.id}`, ruleId: r.id, grp: r.grp, wd: r.wd, time: r.time, place: r.place, leader: '' })
    }
  }
  out.sort(fsSort)
  return out
}

/**
 * Baut die Treffpunkte aller Wochen aus dem Grundplan; `seedLeaders` (Instanz-Id
 * → Name) belegt vorab Leiter (Demo). Reine Funktion — je Aufruf frische Objekte.
 */
export function buildFsWeeks(
  base: Date,
  weekCount: number,
  rules: FsRule[],
  seedLeaders: Record<string, string> = {},
): FsInstance[][] {
  return Array.from({ length: weekCount }, (_unused, wi) =>
    genFsWeek(base, wi, rules).map((inst) => ({ ...inst, leader: seedLeaders[inst.id] ?? '' })),
  )
}

/**
 * Erzeugt den Grundplan neu über alle Wochen, erhält aber bereits gesetzte Leiter
 * (per Instanz-Id) und für die jeweilige Woche manuell hinzugefügte Treffpunkte.
 *
 * `preserveEdits`: false (Grundplan-Änderung) übernimmt nur den Leiter und setzt
 * Zeit/Ort auf die Regelwerte zurück; true (Neu-Ausrichtung beim Laden) behält
 * auch Zeit/Ort, damit wochenspezifische Anpassungen nicht verloren gehen.
 */
export function regenFsWeeks(
  base: Date,
  fsWeeks: FsInstance[][],
  rules: FsRule[],
  preserveEdits = false,
): FsInstance[][] {
  return fsWeeks.map((week, wi) => {
    const gen = genFsWeek(base, wi, rules).map((inst) => {
      const old = week.find((o) => o.id === inst.id)
      if (!old) return inst
      return preserveEdits
        ? { ...inst, time: old.time, place: old.place, leader: old.leader }
        : { ...inst, leader: old.leader }
    })
    const all = gen.concat(week.filter((o) => o.manual))
    all.sort(fsSort)
    return all
  })
}

/* ---- Wochen-Bearbeitung (Planen) ---- */

/** Nur die Woche `wi` ersetzen (die übrigen behalten ihre Referenz). */
function patchWeek(fsWeeks: FsInstance[][], wi: number, fn: (week: FsInstance[]) => FsInstance[]): FsInstance[][] {
  return fsWeeks.map((week, i) => (i === wi ? fn(week) : week))
}

/** Aktueller Leiter eines Treffpunkts ("" = offen / nicht gefunden). */
export function fsLeaderValue(fsWeeks: FsInstance[][], wi: number, instId: string): string {
  return fsWeeks[wi]?.find((i) => i.id === instId)?.leader ?? ''
}

/** Leiter eines Treffpunkts setzen ("" = entfernen). */
export function fsSetLeader(fsWeeks: FsInstance[][], wi: number, instId: string, name: string): FsInstance[][] {
  return patchWeek(fsWeeks, wi, (week) =>
    week.map((inst) => (inst.id === instId ? { ...inst, leader: name } : inst)),
  )
}

/** Zeit/Ort eines Treffpunkts für diese Woche ändern (neu sortiert). */
export function fsUpdateInst(
  fsWeeks: FsInstance[][],
  wi: number,
  instId: string,
  patch: Partial<Pick<FsInstance, 'time' | 'place'>>,
): FsInstance[][] {
  return patchWeek(fsWeeks, wi, (week) =>
    week.map((inst) => (inst.id === instId ? { ...inst, ...patch } : inst)).sort(fsSort),
  )
}

/** Treffpunkt aus dieser Woche entfernen. */
export function fsRemoveInst(fsWeeks: FsInstance[][], wi: number, instId: string): FsInstance[][] {
  return patchWeek(fsWeeks, wi, (week) => week.filter((inst) => inst.id !== instId))
}

/** Manuellen Treffpunkt zu dieser Woche hinzufügen (neu sortiert). */
export function fsAddInst(fsWeeks: FsInstance[][], wi: number, inst: FsInstance): FsInstance[][] {
  return patchWeek(fsWeeks, wi, (week) => [...week, inst].sort(fsSort))
}
