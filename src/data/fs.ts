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

import { istAbwesendAm } from './absence'
import { displayName, isQualified, tieHash } from './helpers'
import { deutschesDatum } from './meeting-dates'
import type { Absence, ConfirmationMap, FsInstance, FsRule, MyTask, Person } from './types'

/** Uhrzeiten im 15-Minuten-Raster (06:00–22:00) für Zeit-Auswahlen. */
export const FS_TIME_OPTIONS: string[] = Array.from({ length: (22 - 6) * 4 + 1 }, (_unused, i) => {
  const h = 6 + Math.floor(i / 4)
  const m = (i % 4) * 15
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
})

/**
 * Montag der Woche 0. Bevorzugt das echte ISO-Startdatum der Wochen: beim
 * jw.org-Import trägt jede Woche `start` = Montag der jeweiligen Woche. Von der
 * ersten Woche mit Startdatum aus liegt Woche 0 `i` Wochen davor. Das ist
 * unabhängig von `today` und vom gespeicherten `current`-Flag — beide veralten
 * (das `current`-Flag wird nicht gegen das echte Datum nachgeführt), was den
 * Treffpunkt-Wochenversatz verursacht hat.
 *
 * Nur wenn keine Woche ein Startdatum hat (Demo/Vorlagen), wird ersatzweise an
 * der als `current` markierten Woche relativ zu `today` verankert.
 */
export function fsBaseFromWeeks(
  weeks: ReadonlyArray<{ current: boolean; start?: string }>,
  today: Date,
): Date {
  const i = weeks.findIndex((w) => w.start)
  const iso = weeks[i]?.start // findIndex -1 → weeks[-1] undefined → iso undefined
  if (iso) {
    const [y, m, d] = iso.split('-').map(Number)
    const base = new Date(y, m - 1, d, 12, 0, 0, 0) // lokaler Mittag: kein UTC-Tagesversatz
    base.setDate(base.getDate() - i * 7) // Montag der Woche 0 (i Wochen vor der ersten mit start)
    return base
  }
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
  from = 0,
): FsInstance[][] {
  return fsWeeks.map((week, wi) => {
    // Nicht geladene Wochen (Platzhalter) bleiben leer: sie würden sonst neu
    // erzeugt, als geändert gelten und die echten Zeilen überschreiben.
    if (wi < from) return week
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
export function fsSetLeader(
  fsWeeks: FsInstance[][],
  wi: number,
  instId: string,
  name: string,
  pid?: string,
): FsInstance[][] {
  return patchWeek(fsWeeks, wi, (week) =>
    week.map((inst) => {
      if (inst.id !== instId) return inst
      // `lpid` nur setzen, wenn wirklich eine Person dahintersteht. Beim Leeren
      // (name = '') muss die alte Id weg, sonst gehörte der freie Platz weiter
      // jemandem — „Meine Aufgaben" zeigte ihn dann bei einer Person, die gar
      // nicht mehr eingeteilt ist.
      const next = { ...inst, leader: name }
      if (name && pid) next.lpid = pid
      else delete next.lpid
      return next
    }),
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

/* ---- Auto-Zuteilung / Leeren der Treffpunkt-Leiter ---- */

/**
 * task_key einer Treffpunkt-Leitung.
 *
 * Bewusst mit `fs` vorn statt hinten: jeder Zusammenkunfts-Schlüssel beginnt
 * mit `<wi>|<tab>|…`, und `taskKeyWeek` liest genau daraus Woche und
 * Zusammenkunft. Ein Treffpunkt hat kein mid/we, sondern einen eigenen
 * Wochentag — stünde die Wochennummer vorn, liefe er dort als kaputter
 * Zusammenkunfts-Schlüssel mit statt als eigene Art.
 *
 * Dieselbe Form benutzt die Personen-Zeitleiste seit je (`fs|wi|instId`).
 */
export function fsTaskKey(wi: number, instId: string): string {
  return `fs|${wi}|${instId}`
}

/**
 * Wie weit die Treffpunkt-Last zurückreicht — ein Jahr.
 *
 * Vorher zählten **alle** geladenen Wochen mit, ohne Grenze. Wer vor zwei
 * Jahren viel geleitet hat, blieb damit dauerhaft hinten: die Strichliste
 * vergaß nichts, und ein einmal entstandener Rückstand ließ sich nie mehr
 * aufholen. Ein Jahr ist der Zeitraum, über den sich eine Rotation ohnehin
 * schließt.
 *
 * Rückwärts gezählt, nicht symmetrisch wie `LOAD_RADIUS` bei den Aufgaben:
 * dort geht es um ein enges Fenster von fünf Wochen um die geplante herum,
 * hier um die Frage „wer war zuletzt dran". Künftige Wochen sind meist noch
 * gar nicht besetzt und würden die Rechnung nur verdünnen.
 */
export const FS_LOAD_WEEKS = 52

/**
 * Besetzt offene Treffpunkt-Leiter der Woche `wi` automatisch: Kandidaten sind
 * treffpunkt-qualifiziert (wie im Zuteilungs-Sheet, ohne Gruppenbindung) und in
 * der Woche nicht abwesend. Niemand leitet zwei Treffpunkte am selben
 * Wochentag. `onlyGroup` grenzt auf eine Gruppe ein (Gruppenaufseher). Bereits
 * gesetzte Leiter bleiben unangetastet.
 *
 * Die Rangfolge folgt derselben Staffelung wie die Programm-Zuteilung
 * (`autoAssignMeeting`), nur mit den Treffpunkten als eigener Strichliste —
 * sie bleiben eine getrennte Größe und wandern nicht in `workloadOf`:
 *
 *  1. **Last** im Fenster der letzten `FS_LOAD_WEEKS` Wochen,
 *  2. **Wartezeit** — wer am längsten nicht geleitet hat, kommt zuerst;
 *     gemessen über alle geladenen Wochen, wie `assignmentDistance` es für die
 *     Aufgaben tut. Ohne diesen Schritt entschied bei Gleichstand allein der
 *     Hash, und niemand fragte, wer am längsten wartet — bei mehr
 *     Qualifizierten als Plätzen ist das der Normalfall, nicht die Ausnahme,
 *  3. **Hash** als deterministischer letzter Ausweg.
 */
export function fsAutoAssign(
  fsWeeks: FsInstance[][],
  wi: number,
  persons: Person[],
  onlyGroup: string | null = null,
  absences: readonly Absence[] = [],
  base?: Date,
): { fsWeeks: FsInstance[][]; count: number; newly: string[] } {
  const qualifiziert = persons.filter((p) => isQualified(p, 'treffpunkt'))
  /**
   * Kandidaten für einen Wochentag. Die Abwesenheit wird am echten Tag des
   * Treffpunkts geprüft, nicht an der Woche: ein Treffpunkt hat seinen eigenen
   * Wochentag, wer nur übers Wochenende weg ist, kann montags leiten. Ohne
   * Datumsbasis (Tests, Vorlagen) bleibt die Prüfung aus.
   */
  const poolAm = new Map<number, Person[]>()
  const poolFor = (wd: number): Person[] => {
    const fertig = poolAm.get(wd)
    if (fertig) return fertig
    const tag = base ? fsDate(base, wi, wd) : null
    const pool = qualifiziert.filter((p) => !tag || !istAbwesendAm(absences, p.id, tag))
    poolAm.set(wd, pool)
    return pool
  }
  // Grundlast: Leitungen je Person im Fenster der letzten FS_LOAD_WEEKS Wochen.
  const load = new Map<string, number>()
  const vonWoche = Math.max(0, wi - FS_LOAD_WEEKS + 1)
  for (let i = vonWoche; i <= wi; i++) {
    for (const inst of fsWeeks[i] ?? []) {
      if (inst.leader) load.set(inst.leader, (load.get(inst.leader) ?? 0) + 1)
    }
  }
  // Wartezeit: Abstand zur nächstgelegenen eigenen Leitung über ALLE geladenen
  // Wochen — auch außerhalb des Lastfensters, sonst wären alle dort auf null
  // Stehenden ununterscheidbar. Genau wie `assignmentDistance` es für die
  // Aufgaben macht.
  const abstand = new Map<string, number>()
  fsWeeks.forEach((week, i) => {
    const d = Math.abs(i - wi)
    for (const inst of week) {
      if (inst.leader && (abstand.get(inst.leader) ?? Infinity) > d) {
        abstand.set(inst.leader, d)
      }
    }
  })
  const wartezeit = (name: string): number => abstand.get(name) ?? Infinity
  // Schon je Wochentag dieser Woche belegte Leiter (Doppelung am selben Tag meiden).
  const dayUsed = new Map<number, Set<string>>()
  const markDay = (wd: number, name: string) => {
    const set = dayUsed.get(wd) ?? new Set<string>()
    set.add(name)
    dayUsed.set(wd, set)
  }
  for (const inst of fsWeeks[wi] ?? []) if (inst.leader) markDay(inst.wd, inst.leader)
  const newly: string[] = []
  const week = (fsWeeks[wi] ?? []).map((inst) => {
    if (inst.leader || (onlyGroup !== null && inst.grp !== onlyGroup)) return inst
    const used = dayUsed.get(inst.wd) ?? new Set<string>()
    // Der Hash ist derselbe gemischte wie bei der Programm-Zuteilung. Die
    // frühere eigene Fassung ohne Avalanche ergab in jeder Woche dieselbe feste
    // Rangliste nach Namen — wer darin hinten stand, leitete nie (siehe
    // tieHash in helpers.ts). Der Schlüssel wird getrennt gefügt: „Ann"+„a12"
    // und „Anna"+„12" wären sonst derselbe.
    const cand = poolFor(inst.wd)
      .map((p) => ({ p, name: displayName(p) }))
      .filter((k) => !used.has(k.name))
      .sort(
        (a, b) =>
          (load.get(a.name) ?? 0) - (load.get(b.name) ?? 0) ||
          wartezeit(b.name) - wartezeit(a.name) ||
          tieHash(`${a.name}|${wi}|${inst.wd}`) - tieHash(`${b.name}|${wi}|${inst.wd}`),
      )
    const pick = cand[0]
    if (!pick) return inst
    load.set(pick.name, (load.get(pick.name) ?? 0) + 1)
    // Wer gerade drankommt, wartet ab jetzt null Wochen — sonst gewönne
    // dieselbe Person die Wartezeit auch beim nächsten Treffpunkt derselben
    // Woche noch einmal.
    abstand.set(pick.name, 0)
    markDay(inst.wd, pick.name)
    newly.push(pick.name)
    return { ...inst, leader: pick.name, lpid: pick.p.id }
  })
  if (newly.length === 0) return { fsWeeks, count: 0, newly: [] }
  return { fsWeeks: patchWeek(fsWeeks, wi, () => week), count: newly.length, newly }
}

/** Leiter der Woche `wi` leeren (`onlyGroup` grenzt auf eine Gruppe ein). */
export function fsClear(
  fsWeeks: FsInstance[][],
  wi: number,
  onlyGroup: string | null = null,
): { fsWeeks: FsInstance[][]; count: number } {
  let count = 0
  const week = (fsWeeks[wi] ?? []).map((inst) => {
    if (!inst.leader || (onlyGroup !== null && inst.grp !== onlyGroup)) return inst
    count++
    // Auch die Id muss weg: sonst gehörte der geleerte Platz weiter jemandem
    // und stünde bei ihm in „Meine Aufgaben".
    const { lpid: _weg, ...ohne } = inst
    return { ...ohne, leader: '' }
  })
  if (count === 0) return { fsWeeks, count: 0 }
  return { fsWeeks: patchWeek(fsWeeks, wi, () => week), count }
}

/**
 * Treffpunkt-Leitungen dieser Person als Aufgaben — das Gegenstück zu
 * `deriveMyTasks` für die zweite Datenquelle.
 *
 * Eigene Ableitung statt eines Zweigs in `deriveMyTasks`: Treffpunkte bleiben
 * eine getrennte Größe (sie zählen nicht in `workloadOf` und haben ihre eigene
 * Strichliste), sie hängen an `fsWeeks`/`fsBase` statt an `weeks`, und ihr
 * Termin kommt aus Wochentag und eigener Uhrzeit statt aus den
 * Zusammenkunftszeiten. Zusammengeführt wird erst in `state.myTasks`.
 *
 * Zugeordnet über die Person-Id, mit Rückfall auf den Namen für Altdaten —
 * dieselbe Rangfolge wie bei den Zusammenkunfts-Aufgaben. Ohne das sahen
 * Namensgleiche gegenseitig ihre Treffpunkte.
 */
export function deriveMyFsTasks(
  fsWeeks: FsInstance[][],
  fsBase: Date | null,
  personName: string,
  confirmations: ConfirmationMap,
  personId: string | undefined,
  titel: string,
): MyTask[] {
  const tasks: MyTask[] = []
  if (!personName && !personId) return tasks
  fsWeeks.forEach((week, wi) => {
    for (const inst of week) {
      if (!inst.leader) continue
      const meins = inst.lpid && personId ? inst.lpid === personId : inst.leader === personName
      if (!meins) continue
      const key = fsTaskKey(wi, inst.id)
      // Ohne Datumsbasis (Vorlagen, Tests) gibt es keinen echten Termin — dann
      // bleibt der Countdown aus, statt einen erfundenen Tag zu zeigen.
      const tag = fsBase ? fsDate(fsBase, wi, inst.wd) : null
      // Termin kanonisch deutsch wie bei den Zusammenkünften („Dienstag,
      // 8. September · 19:00"): übersetzt wird erst bei der Anzeige. Der Ort
      // hängt als eigenes Segment dran — der Übersetzer geht Segment für
      // Segment vor und lässt einen unbekannten Ortsnamen stehen.
      tasks.push({
        id: key,
        title: titel,
        date: tag
          ? `${deutschesDatum(tag)} · ${inst.time} · ${inst.place}`
          : `${inst.time} · ${inst.place}`,
        chip: '',
        at: tag ? tag.getTime() : null,
        status: confirmations[key] ?? 'offen',
        s89: null,
      })
    }
  })
  return tasks
}
