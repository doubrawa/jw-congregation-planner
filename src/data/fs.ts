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
import { displayName, idAufloeser, isQualified, overseerGroup, tieHash } from './helpers'
import { deutschesDatum } from './meeting-dates'
// Nur der Typ — `planning.ts` kennt `fs.ts` nicht, es entsteht also kein Zyklus.
// Die Konflikt-Form ist bewusst dieselbe: Zusammenkünfte und Treffpunkte
// erscheinen im selben Banner und sollen sich für den Planer nicht
// unterschiedlich anfühlen.
import { kennungVon } from './planning'
import type { Conflict } from './planning'
import type { Absence, ConfirmationMap, FsInstance, FsRule, Group, MyTask, Person } from './types'

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
  // Ein ISO-Datum hat drei Teile. Fehlt einer, ist das Datum unbrauchbar und
  // es bleibt beim Rückfall unten — besser als ein `NaN`-Datum, das sich erst
  // Wochen später als verschobene Zeitleiste zeigt.
  const [jahr, monat, tag] = (iso ?? '').split('-').map(Number)
  if (iso && jahr !== undefined && monat !== undefined && tag !== undefined) {
    const base = new Date(jahr, monat - 1, tag, 12, 0, 0, 0) // lokaler Mittag: kein UTC-Tagesversatz
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
/**
 * Montag der Woche `wi` als Kennung (T66) — aus der Datumsbasis gerechnet.
 *
 * Treffpunkt-Wochen liegen parallel zu den Programmwochen und tragen selbst
 * kein Datum; `fsBase` ist der Montag der Woche 0, und Wochen liegen genau
 * sieben Tage auseinander. Ohne Basis (Vorlagen, Tests) bleibt es leer — dann
 * gibt es auch keinen Termin zu zeigen.
 */
export function fsWochenStart(fsBase: Date | null, wi: number): string {
  if (!fsBase) return ''
  const d = new Date(Date.UTC(fsBase.getFullYear(), fsBase.getMonth(), fsBase.getDate() + wi * 7))
  return d.toISOString().slice(0, 10)
}

export function fsTaskKey(woche: string, instId: string): string {
  return `fs|${woche}|${instId}`
}

/**
 * Wie weit die Treffpunkt-Strichliste zurückreicht.
 *
 * Vorher zählten **alle** geladenen Wochen mit, ohne Grenze. Wer vor zwei
 * Jahren viel geleitet hat, blieb damit dauerhaft hinten: die Liste vergaß
 * nichts, und ein einmal entstandener Rückstand ließ sich nie aufholen.
 *
 * Die Breite ist gemessen, nicht geschätzt. Aufbau: acht Stammleiter, zwei
 * Treffpunkte je Woche, in Woche 40 kommt ein Neuling dazu. Gezählt wurde,
 * was er in den folgenden 20 Wochen bekommt — gegen den Schnitt des Stamms:
 *
 * | Fenster | Neuling (20 W) | Stamm-Schnitt | Verteilung W40–60 |
 * | --- | --- | --- | --- |
 * | 52 Wochen | **12** | 3,5 | 4 4 3 4 3 3 4 3 **12** |
 * | 26 Wochen | 6 | 4,3 | 4 5 4 4 4 4 5 4 **6** |
 * | **12 Wochen** | **5** | 4,4 | 4 5 5 4 4 4 5 4 **5** |
 *
 * Je länger das Fenster, desto größer der Rückstand, den ein Neuling
 * aufzuholen scheint — bei einem Jahr bekam er das Dreifache der anderen.
 * Bei zwölf Wochen reiht er sich ein. Die Fairness über lange Zeiträume trägt
 * ohnehin nicht dieses Fenster, sondern die **Wartezeit**, die über alle
 * geladenen Wochen misst — dieselbe Arbeitsteilung wie bei den Aufgaben, wo
 * `LOAD_RADIUS` nur fünf Wochen umfasst.
 *
 * Rückwärts gezählt, nicht symmetrisch wie `LOAD_RADIUS`: dort geht es um ein
 * enges Fenster um die geplante Woche herum, hier um „wer war zuletzt dran".
 * Künftige Wochen sind meist noch gar nicht besetzt und verdünnten die
 * Rechnung nur.
 */
export const FS_LOAD_WEEKS = 12

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
  groups: readonly Group[] = [],
): { fsWeeks: FsInstance[][]; count: number; newly: string[]; newlyIds: string[] } {
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
  // Alle Listen unten sind nach Person-Id geführt, nicht nach Name: zwei
  // Personen desselben Namens teilten sich sonst eine Strichliste, sperrten
  // sich gegenseitig am selben Wochentag und erbten gegenseitig die Wartezeit.
  const werIst = idAufloeser(persons)
  const idVon = (inst: FsInstance): string | undefined =>
    werIst({ name: inst.leader, pid: inst.lpid })

  // Grundlast: Leitungen je Person im Fenster der letzten FS_LOAD_WEEKS Wochen.
  const load = new Map<string, number>()
  const vonWoche = Math.max(0, wi - FS_LOAD_WEEKS + 1)
  for (let i = vonWoche; i <= wi; i++) {
    for (const inst of fsWeeks[i] ?? []) {
      const id = idVon(inst)
      if (id) load.set(id, (load.get(id) ?? 0) + 1)
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
      const id = idVon(inst)
      if (id && (abstand.get(id) ?? Infinity) > d) abstand.set(id, d)
    }
  })
  const wartezeit = (id: string): number => abstand.get(id) ?? Infinity
  // Schon je Wochentag dieser Woche belegte Leiter (Doppelung am selben Tag meiden).
  const dayUsed = new Map<number, Set<string>>()
  const markDay = (wd: number, id: string) => {
    const set = dayUsed.get(wd) ?? new Set<string>()
    set.add(id)
    dayUsed.set(wd, set)
  }
  // Wer in DIESER Woche schon leitet — für den Wochen-Deckel unten.
  const inDerWoche = new Set<string>()
  for (const inst of fsWeeks[wi] ?? []) {
    const id = idVon(inst)
    if (!id) continue
    markDay(inst.wd, id)
    inDerWoche.add(id)
  }

  const newly: string[] = []
  /** Dieselben Leitungen als Person-Id — für die „…"-Markierung (pendingIds). */
  const newlyIds: string[] = []
  const week = (fsWeeks[wi] ?? []).map((inst) => {
    if (inst.leader || (onlyGroup !== null && inst.grp !== onlyGroup)) return inst
    const used = dayUsed.get(inst.wd) ?? new Set<string>()
    // Der Hash ist derselbe gemischte wie bei der Programm-Zuteilung. Die
    // frühere eigene Fassung ohne Avalanche ergab in jeder Woche dieselbe feste
    // Rangliste nach Namen — wer darin hinten stand, leitete nie (siehe
    // tieHash in helpers.ts). Der Schlüssel wird getrennt gefügt: „Ann"+„a12"
    // und „Anna"+„12" wären sonst derselbe.
    const alle = poolFor(inst.wd)
      .map((p) => ({ p, name: displayName(p) }))
      .filter((k) => !used.has(k.p.id))
    // Höchstens eine Leitung je Person und Woche — aber nur, solange dafür
    // genug Kandidaten da sind; sonst bliebe ein Platz offen, obwohl jemand da
    // ist.
    //
    // Gemessen an vier Stammleitern, drei Treffpunkten je Woche und einem
    // Neuling ab Woche 25: ohne den Deckel gab es vier Wochen, in denen
    // dieselbe Person zwei- oder dreimal leitete, und der Neuling bekam in
    // seiner zweiten und dritten Woche je drei Leitungen (1 3 3 0 1). Mit dem
    // Deckel: keine einzige Doppelung, und der Neuling reiht sich mit
    // 1 1 1 1 1 ein.
    //
    // Das ist die Bremse gegen das Häufen — nicht der Lastvergleich. Der sagt
    // nur, WER als Nächstes dran ist, nicht wie oft hintereinander.
    const frei = alle.filter((k) => !inDerWoche.has(k.p.id))
    // Den Gruppentreffpunkt leitet fachlich jemand aus der Gruppe (F8).
    //
    // Die Bevorzugung steht **vor** dem Lastvergleich. Dahinter wäre sie
    // wirkungslos: sobald irgendjemand außerhalb der Gruppe weniger geleitet
    // hat, gewänne er — und das ist der Normalfall, nicht die Ausnahme. Die
    // Gruppe schränkt also den Kreis ein; *innerhalb* des Kreises entscheidet
    // unverändert dieselbe Staffelung, die Fairness bleibt damit erhalten.
    // Ist niemand aus der Gruppe frei, greift der Rest — ein Platz bleibt
    // nicht offen, nur weil die Gruppe gerade nicht kann.
    //
    // Treffpunkte ohne Gruppe sind unberührt: dort ist jeder Rang 0, die
    // Reihenfolge bleibt Zeichen für Zeichen die alte.
    const gruppenRang = (p: Person): number => (!inst.grp || p.grp === inst.grp ? 0 : 1)
    // Aufseher und Gehilfe erst bei sonst völligem Gleichstand — stünden sie
    // weiter vorn, leitete der Aufseher jede Woche seinen eigenen Treffpunkt.
    // Hier ersetzt die Rangfolge nur den Zufall des Hashes.
    const aufseherRang = (p: Person): number =>
      inst.grp && overseerGroup(groups, p.id) === inst.grp ? 0 : 1
    const cand = (frei.length > 0 ? frei : alle).sort(
      (a, b) =>
        gruppenRang(a.p) - gruppenRang(b.p) ||
        (load.get(a.p.id) ?? 0) - (load.get(b.p.id) ?? 0) ||
        wartezeit(b.p.id) - wartezeit(a.p.id) ||
        aufseherRang(a.p) - aufseherRang(b.p) ||
        tieHash(`${a.name}|${wi}|${inst.wd}`) - tieHash(`${b.name}|${wi}|${inst.wd}`),
    )
    const pick = cand[0]
    if (!pick) return inst
    load.set(pick.p.id, (load.get(pick.p.id) ?? 0) + 1)
    // Wer gerade drankommt, wartet ab jetzt null Wochen — sonst gewönne
    // dieselbe Person die Wartezeit auch beim nächsten Treffpunkt derselben
    // Woche noch einmal.
    abstand.set(pick.p.id, 0)
    markDay(inst.wd, pick.p.id)
    inDerWoche.add(pick.p.id)
    newly.push(pick.name)
    newlyIds.push(pick.p.id)
    return { ...inst, leader: pick.name, lpid: pick.p.id }
  })
  if (newly.length === 0) return { fsWeeks, count: 0, newly: [], newlyIds: [] }
  return { fsWeeks: patchWeek(fsWeeks, wi, () => week), count: newly.length, newly, newlyIds }
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
      const key = fsTaskKey(fsWochenStart(fsBase, wi), inst.id)
      // Ohne Datumsbasis (Vorlagen, Tests) gibt es keinen echten Termin — dann
      // bleibt der Countdown aus, statt einen erfundenen Tag zu zeigen.
      const tag = fsBase ? fsDate(fsBase, wi, inst.wd) : null
      // Termin kanonisch deutsch wie bei den Zusammenkünften („Dienstag,
      // 8. September · 19:00"): übersetzt wird erst bei der Anzeige. Der Ort
      // hängt als eigenes Segment dran — der Übersetzer geht Segment für
      // Segment vor und lässt einen unbekannten Ortsnamen stehen.
      tasks.push({
        id: key,
        // „Treffpunkt-Leiter" ist eine Rolle und gehört damit in die Sprache
        // des Lesers. Als Titel lief sie durch `tp` — bei deutscher App und
        // englischer Versammlungssprache stand dort Englisch.
        title: '',
        rolle: titel,
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

/**
 * Konflikte der Treffpunkte einer Woche — das Gegenstück zu `weekConflicts`
 * für die zweite Datenquelle.
 *
 * Zwei Arten, beide bisher unbemerkt:
 *
 *  - **`fsAbsent`** — jemand ist am Tag seines Treffpunkts abwesend, steht aber
 *    als Leiter da. Die Auto-Zuteilung prüft das (`istAbwesendAm`), die
 *    manuelle Zuteilung warnt nur, und eine später eingetragene Abwesenheit
 *    bemerkte gar niemand. Bei den Zusammenkünften fängt `weekConflicts` genau
 *    diesen Fall ab; für Treffpunkte gab es nichts.
 *  - **`fsDouble`** — dieselbe Person leitet zwei Treffpunkte am selben
 *    Wochentag. Die Auto-Zuteilung verhindert das (`dayUsed`), von Hand ist es
 *    weiter möglich.
 *
 * Geprüft wird am **echten Tag** des Treffpunkts, nicht an der Woche: wer nur
 * übers Wochenende weg ist, kann montags leiten. Ohne Datumsbasis (Vorlagen,
 * Tests) entfällt die Abwesenheitsprüfung — dieselbe Linie wie in
 * `fsAutoAssign`.
 */
export function fsWeekConflicts(
  fsWeeks: FsInstance[][],
  wi: number,
  persons: Person[],
  absences: readonly Absence[] = [],
  base: Date | null = null,
  onlyGroup: string | null = null,
): Conflict[] {
  const week = fsWeeks[wi]
  if (!week) return []
  const conflicts: Conflict[] = []
  const nachName = new Map(persons.map((p) => [displayName(p), p]))
  // Gezählt wird über die Kennung, angezeigt der Name — wie bei den
  // Zusammenkünften (`weekConflicts`). Über den Namen zu zählen legte zwei
  // Gleichnamige zusammen, und die Markierung im Plan träfe danach beide.
  const proTag = new Map<number, Map<string, number>>()
  const namen = new Map<string, string>()

  for (const inst of week) {
    if (!inst.leader || (onlyGroup !== null && inst.grp !== onlyGroup)) continue
    const kennung = kennungVon(inst.leader, inst.lpid)
    namen.set(kennung, inst.leader)
    // Zählung je Wochentag für `fsDouble` — auch ohne Datumsbasis prüfbar.
    const tag = proTag.get(inst.wd) ?? new Map<string, number>()
    tag.set(kennung, (tag.get(kennung) ?? 0) + 1)
    proTag.set(inst.wd, tag)

    if (!base) continue
    // Über die Id, mit Rückfall auf den Namen für Altdaten.
    const person = inst.lpid ? persons.find((p) => p.id === inst.lpid) : nachName.get(inst.leader)
    if (person && istAbwesendAm(absences, person.id, fsDate(base, wi, inst.wd))) {
      conflicts.push({ kind: 'fsAbsent', name: inst.leader, kennung, wd: inst.wd, ort: inst.place })
    }
  }

  for (const [wd, tag] of proTag) {
    for (const [kennung, n] of tag) {
      if (n >= 2) {
        conflicts.push({ kind: 'fsDouble', name: namen.get(kennung) ?? '', kennung, wd, count: n })
      }
    }
  }
  return conflicts
}

/**
 * Löst die Verweise auf eine gelöschte Person aus den Treffpunkt-Wochen: die
 * `lpid` verschwindet, **der Name bleibt als Text stehen** — genau wie bei den
 * Zusammenkünften (`dropPersonPid` in lib/data.ts).
 *
 * Ohne das zeigte der Fremdschlüssel ins Leere: `deriveMyFsTasks` und die
 * Konfliktprüfung entscheiden über die Id und fänden niemanden mehr, während
 * der Name weiter dastünde. Ohne `lpid` greift wieder der Namensweg.
 *
 * Unveränderte Wochen behalten ihre Referenz — daran erkennt der Aufrufer,
 * welche er speichern muss.
 */
export function fsDropPersonPid(fsWeeks: FsInstance[][], id: string): FsInstance[][] {
  let anyChanged = false
  const next = fsWeeks.map((week) => {
    let changed = false
    const insts = week.map((inst) => {
      if (inst.lpid !== id) return inst
      changed = true
      const { lpid: _weg, ...ohne } = inst
      return ohne
    })
    if (!changed) return week
    anyChanged = true
    return insts
  })
  return anyChanged ? next : fsWeeks
}

/**
 * Backfill der `lpid` aus dem gespeicherten Leiter-Namen — das Gegenstück zu
 * `migrateAssignmentPids` (lib/data.ts) für die zweite Datenquelle.
 *
 * Zwei Fälle brauchen es. Der erste sind **Bestandsdaten**: Treffpunkte, die
 * vor der `lpid` zugeteilt wurden, tragen nur einen Namen. Der zweite wiegt
 * schwerer und entsteht im laufenden Betrieb: Wird eine Person gelöscht,
 * nimmt `fsDropPersonPid` ihre Id aus den Treffpunkten und lässt den Namen
 * stehen. Legt der Planer sie neu an, fanden die Zusammenkünfte wieder
 * zusammen, die Treffpunkte nie — dort blieb ein Name ohne Person, und die
 * Leitung zählte in keiner Auslastung und in keiner Aufgabenliste mehr.
 *
 * Nur **eindeutige** Namen werden zugeordnet; bei Dubletten bliebe es ein
 * Raten, und die App warnt davor ohnehin (`duplicateDisplayNames`).
 * Idempotent, und unveränderte Wochen behalten ihre Referenz.
 */
export function fsMigrateLeaderPids(
  fsWeeks: FsInstance[][],
  persons: readonly Person[],
): FsInstance[][] {
  const nachName = new Map<string, string>()
  const doppelt = new Set<string>()
  for (const p of persons) {
    const n = displayName(p)
    if (nachName.has(n)) doppelt.add(n)
    nachName.set(n, p.id)
  }
  for (const d of doppelt) nachName.delete(d)
  if (nachName.size === 0) return fsWeeks

  let anyChanged = false
  const next = fsWeeks.map((week) => {
    let changed = false
    const insts = week.map((inst) => {
      if (inst.lpid || !inst.leader) return inst
      const id = nachName.get(inst.leader)
      if (!id) return inst // Gruppenname, Unbekannter, Dublette
      changed = true
      return { ...inst, lpid: id }
    })
    if (!changed) return week
    anyChanged = true
    return insts
  })
  return anyChanged ? next : fsWeeks
}

/**
 * Zieht den Anzeigenamen einer umbenannten Person durch die Treffpunkt-Wochen.
 *
 * Gegenstück zu `renameInWeeks` (lib/data.ts). Der Leiter steht als **Text** in
 * den Treffpunkt-Daten, `lpid` ist nur der Fremdschlüssel — ohne dieses
 * Nachziehen stand auf jedem Treffpunkt weiter der alte Name, während die
 * Zusammenkünfte längst den neuen zeigten.
 *
 * Es ist derselbe Fehler, den T38 schon zweimal behoben hat: einmal für die
 * Zusätzliche Klasse und den Ratgeber, einmal beim Löschen (`fsDropPersonPid`
 * gleich darüber). Nur das Umbenennen kam bei der zweiten Datenquelle nie an.
 *
 * Getroffen wird über die `lpid`; ohne sie (Altdaten) über den alten Namen —
 * dieselbe Rangfolge wie in `gehoertZu`. Unveränderte Wochen behalten ihre
 * Referenz, daran erkennt der Aufrufer, welche er speichern muss.
 */
export function fsRenameLeader(
  fsWeeks: FsInstance[][],
  id: string,
  oldName: string,
  newName: string,
): FsInstance[][] {
  // Ohne alten Namen nichts tun: sonst bekämen offene Plätze (leerer Leiter)
  // den neuen Namen. Ein zugeteilter Treffpunkt trägt immer einen.
  if (!oldName || oldName === newName) return fsWeeks
  let anyChanged = false
  const next = fsWeeks.map((week) => {
    let changed = false
    const insts = week.map((inst) => {
      const meint = inst.lpid ? inst.lpid === id : inst.leader === oldName
      if (!meint || inst.leader === newName) return inst
      changed = true
      return { ...inst, leader: newName }
    })
    if (!changed) return week
    anyChanged = true
    return insts
  })
  return anyChanged ? next : fsWeeks
}
