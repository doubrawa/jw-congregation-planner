/**
 * Zusammenkünfte für den Predigtdienst ("Treffpunkte") — reine Logik.
 *
 * Aus dem Grundplan (FsRule[]) werden pro Woche die konkreten Treffpunkte
 * (FsInstance[]) materialisiert: Versammlungstreffpunkte (grp null) gelten für
 * alle, Gruppentreffpunkte (grp = Group.id) nur für ihre Gruppe. Eine
 * Gruppen-Regel mit `skipCong` entfällt, wenn am selben Wochentag bereits ein
 * Versammlungstreffpunkt liegt. `monthly` (1..4) begrenzt eine Regel auf den
 * N-ten betreffenden Wochentag im Monat.
 *
 * Alle Funktionen sind pur. Die Treffpunkt-Wochen liegen parallel zu den
 * Programmwochen (`fsWeeks[wi]` gehört zu `weeks[wi]`) und werden über deren
 * Montag angesprochen — `Week.start`, die Kennung im `task_key` (T66). Eine
 * eigene Datumsbasis („Montag der Woche 0 plus wi·7") gab es bis zum
 * 25.9.2026 als Rückfall; sie lag bei jeder Lücke im Bestand daneben.
 */

import { istAbwesendAm } from './absence'
import {
  dieselbePerson,
  displayName,
  eindeutigeNamen,
  gehoertZuKennung,
  idAufloeser,
  isQualified,
  overseerGroup,
} from './helpers'
import { tieHash } from './auslastung'
import { deutschesDatum, fromIso, istVorbei, kalendertagMs, versatzAbMontag } from './meeting-dates'
import { fsKey, schluesselTeile } from '../../supabase/functions/_shared/aufgaben-schluessel.ts'
// Nur der Typ — `planning.ts` kennt `fs.ts` nicht, es entsteht also kein Zyklus.
// Die Konflikt-Form ist bewusst dieselbe: Zusammenkünfte und Treffpunkte
// erscheinen im selben Banner und sollen sich für den Planer nicht
// unterschiedlich anfühlen.
import { kennungVon, zusageStatus } from './planning'
import type { Conflict } from './planning'
import type { Zuteilung } from './helpers'
import type { Absence, ConfirmationMap, FsInstance, FsRule, Group, MyTask, Person } from './types'

/** Uhrzeiten im 15-Minuten-Raster (06:00–22:00) für Zeit-Auswahlen. */
export const FS_TIME_OPTIONS: string[] = Array.from({ length: (22 - 6) * 4 + 1 }, (_unused, i) => {
  const h = 6 + Math.floor(i / 4)
  const m = (i % 4) * 15
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
})

/**
 * Datum eines Treffpunkts: Montag der Woche plus Wochentagsversatz.
 *
 * Ohne brauchbare Kennung `null` — einen Tag zu erfinden wäre schlimmer, als
 * keinen zu nennen (so hält es auch `deriveMyFsTasks`).
 */
export function fsTag(wochenStart: string, wd: number): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(wochenStart)) return null
  // Über `fromIso`, damit „ISO-Datum → lokaler Mittag" eine einzige
  // Schreibweise hat: Ein UTC-Versatz an einer der Fassungen verschöbe genau
  // die Tage, um die es hier geht.
  const d = fromIso(wochenStart)
  if (Number.isNaN(d.getTime())) return null
  d.setDate(d.getDate() + versatzAbMontag(wd))
  return d
}

/**
 * Termin eines Treffpunkts, kanonisch deutsch: „Dienstag, 8. September · 19:00
 * · Bahnhof". Übersetzt wird erst bei der Anzeige, Segment für Segment.
 *
 * **Eine Zeichenkette, ein Erzeuger.** Der Text steht in „Meine Aufgaben" und
 * in der Entzugs-Nachricht — die zweite kann der Empfänger nirgends
 * nachlesen, sie muss also dasselbe sagen. Zwei Fassungen waren schon
 * auseinander: Ein Treffpunkt ohne Ort endete hier auf „ · " und dort sauber.
 *
 * Leere Teile fallen heraus: Ohne brauchbare Kennung (Vorlagen, Tests) gibt es
 * keinen Tag, und einen zu erfinden wäre schlimmer, als keinen zu nennen.
 */
export function fsTerminText(tag: Date | null, inst: { time: string; place: string }): string {
  return [tag ? deutschesDatum(tag) : '', inst.time, inst.place].filter(Boolean).join(' · ')
}

/** Sortierung: Wochentag (Mo→So), dann Uhrzeit, dann Gruppe. */
export function fsSort(a: FsInstance, b: FsInstance): number {
  // Ohne Gruppe (Versammlungstreffpunkt) zuerst — `null` sortiert vor jedem Namen.
  return (
    versatzAbMontag(a.wd) - versatzAbMontag(b.wd) ||
    a.time.localeCompare(b.time) ||
    (a.grp ?? '').localeCompare(b.grp ?? '')
  )
}

/**
 * Kennung eines Treffpunkts aus dem Grundplan: **die Regel, sonst nichts** (T87).
 *
 * Sie trug bis August 2026 die Wochennummer vorn (`"3|r1"`) — dieselbe
 * Ordnungszahl, die T66 überall sonst abgeschafft hat, hier übersehen. Die
 * Nummer ist die Position im Ladefenster, und das Fenster rutscht: Es hält die
 * jüngsten 52 Wochen, seine erste wandert also mit jedem Import weiter.
 * Dieselbe Kalenderwoche hieß danach `"2|r1"` statt `"3|r1"` — und weil
 * `regenFsWeeks` die gespeicherte Leitung über die Kennung wiederfindet, war
 * der zugeteilte Leiter beim nächsten Laden **weg**. Nachgemessen, nicht
 * vermutet: siehe `fs-kennung.test.ts`.
 *
 * Eindeutig ist die Regel-Id auch allein: `genFsWeek` materialisiert jede Regel
 * höchstens einmal je Woche, und gespeichert wird ohnehin je Woche eine eigene
 * Zeile (`fs_weeks`). Die Woche steht im `task_key` davor — dort gehört sie hin.
 */
function instanzId(rule: FsRule): string {
  return rule.id
}

/**
 * Materialisiert alle Treffpunkte einer Woche aus dem Grundplan.
 *
 * `wochenStart` ist der Montag dieser Woche (`Week.start`) — an ihm hängt die
 * Monatsregel. Ist er unbrauchbar, greift sie nicht: Lieber eine
 * Regel, die nicht auslöst, als eine, die in der falschen Woche auslöst.
 */
export function genFsWeek(wochenStart: string, rules: FsRule[]): FsInstance[] {
  const out: FsInstance[] = []
  const congDays = new Set<number>()
  const fits = (r: FsRule): boolean => {
    if (!r.monthly) return true
    const tag = fsTag(wochenStart, r.wd)
    return tag !== null && Math.ceil(tag.getDate() / 7) === r.monthly
  }
  const ausgesetzt = (r: FsRule): boolean => Boolean(r.aus?.includes(wochenStart))

  for (const r of rules) {
    if (r.grp == null && fits(r)) {
      // Ein ausgesetzter Versammlungstreffpunkt belegt seinen Tag weiter: Wer ihn
      // für eine Woche streicht, holt damit nicht die Gruppen an seine Stelle.
      if (!ausgesetzt(r)) {
        out.push({ id: instanzId(r), ruleId: r.id, grp: null, wd: r.wd, time: r.time, place: r.place, leader: '' })
      }
      congDays.add(r.wd)
    }
  }
  for (const r of rules) {
    if (r.grp != null && fits(r) && !ausgesetzt(r) && !(r.skipCong && congDays.has(r.wd))) {
      out.push({ id: instanzId(r), ruleId: r.id, grp: r.grp, wd: r.wd, time: r.time, place: r.place, leader: '' })
    }
  }
  out.sort(fsSort)
  return out
}

/**
 * Baut die Treffpunkte aller Wochen aus dem Grundplan; `seedLeaders` belegt
 * vorab Leiter (Demo). Reine Funktion — je Aufruf frische Objekte.
 *
 * Die Vorbelegung ist **je Woche** adressiert (`"<wi>|<instanzId>"`), die
 * Kennung der Instanz dagegen nicht mehr (T87): Sie beschreibt den Treffpunkt,
 * nicht seinen Termin, und wäre als Schlüssel hier mehrdeutig — dieselbe Regel
 * gibt es in jeder Woche. Ohne die Wochennummer davor stünde derselbe Leiter
 * in allen vier Demo-Wochen.
 */
export function buildFsWeeks(
  kennungen: readonly string[],
  rules: FsRule[],
  seedLeaders: Record<string, string> = {},
): FsInstance[][] {
  return kennungen.map((kennung, wi) =>
    genFsWeek(kennung, rules).map((inst) => ({
      ...inst,
      leader: seedLeaders[`${wi}|${inst.id}`] ?? '',
    })),
  )
}

/**
 * Gleicher Inhalt? Treffpunkt-Instanzen sind flach — ein Feldvergleich genügt.
 */
function gleicheInstanzen(a: FsInstance[], b: FsInstance[]): boolean {
  if (a.length !== b.length) return false
  return a.every((x, i) => {
    const y = b[i]
    if (!y) return false
    const kx = Object.keys(x)
    if (kx.length !== Object.keys(y).length) return false
    return kx.every((k) => x[k as keyof FsInstance] === y[k as keyof FsInstance])
  })
}

/**
 * Die Besetzung eines Treffpunkts: Name, Person und Freitext-Kennzeichen —
 * nur die Felder, die gesetzt sind, damit gleicher Inhalt gleich vergleicht.
 *
 * **Alle drei gehören zusammen.** Bis zum 15. September 2026 übernahm
 * `regenFsWeeks` nur den Namen. Weil es beim Laden und bei jeder Änderung am
 * Grundplan läuft, verlor ein Freitext-Leiter danach sein `lext`: Der
 * Kreisaufseher galt wieder als Person, trug einen Ampel-Punkt, und
 * `fsLeiterBinden` hängte ihm beim nächsten Laden den gleichnamigen
 * Bruder an — mit Aufgabe und Erinnerungen. Die Person-Id ging ebenso
 * verloren, und jede Woche mit zugeteiltem Leiter galt als geändert.
 */
function besetzungVon(inst: FsInstance): Pick<FsInstance, 'leader' | 'lpid' | 'lext'> {
  return {
    leader: inst.leader,
    ...(inst.lpid ? { lpid: inst.lpid } : {}),
    ...(inst.lext ? { lext: true } : {}),
  }
}

/**
 * Erzeugt den Grundplan neu über alle Wochen, erhält aber bereits gesetzte Leiter
 * (per Instanz-Id, samt Person und Freitext-Kennzeichen) und für die jeweilige
 * Woche manuell hinzugefügte Treffpunkte.
 *
 * `preserveEdits`: false (Grundplan-Änderung) übernimmt nur die Besetzung und
 * setzt Zeit/Ort auf die Regelwerte zurück; true (Neu-Ausrichtung beim Laden)
 * behält auch Zeit/Ort, damit wochenspezifische Anpassungen nicht verloren gehen.
 */
export function regenFsWeeks(
  kennungen: readonly string[],
  fsWeeks: FsInstance[][],
  rules: FsRule[],
  preserveEdits = false,
): FsInstance[][] {
  return fsWeeks.map((week, wi) => {
    const gen = genFsWeek(kennungen[wi] ?? '', rules).map((inst) => {
      const old = week.find((o) => o.id === inst.id)
      if (!old) return inst
      return preserveEdits
        ? { ...inst, time: old.time, place: old.place, ...besetzungVon(old) }
        : { ...inst, ...besetzungVon(old) }
    })
    const all = gen.concat(week.filter((o) => o.manual))
    all.sort(fsSort)
    // Ändert eine Regel nichts an dieser Woche, bleibt es bei der alten Liste.
    // An dieser Referenz erkennt `persist.ts`, was wirklich zu schreiben ist —
    // sonst sähen nach jedem Tastenanschlag alle 52 Wochen verändert aus.
    return gleicheInstanzen(all, week) ? week : all
  })
}

/* ---- Sichtbarkeit ---- */

/**
 * Die Treffpunkte, die jemand **sehen** darf.
 *
 * Ein Versammlungstreffpunkt (`grp: null`) gilt allen und wird allen gezeigt. Ein
 * Gruppentreffpunkt ist die Sache seiner Gruppe: ihn sieht, wer zu ihr gehört
 * (`Person.grp`) oder sie leitet (Aufseher/Gehilfe — er muss nicht in ihr
 * geführt sein). Der Planer sieht alles; er plant alle Gruppen.
 *
 * **Das ist eine Anzeige-Regel, keine Sperre.** Alle Treffpunkte einer Woche
 * liegen in *einer* jsonb-Zeile (`fs_weeks.data`); RLS kann darin keine
 * einzelnen Einträge ausblenden, und der Lader holt die Zeile ganz. Wer die
 * Datenbank direkt fragt, sieht weiterhin alle. Eine echte Sperre bräuchte eine
 * Zeile je Gruppe (`unique (congregation_id, start, grp)`) — bewusst nicht
 * gebaut: Treffpunkte sind innerhalb der Versammlung nichts Vertrauliches, die
 * Trennung dient der Übersicht.
 *
 * Deshalb steht die Regel **hier** und nicht in der Ansicht: Jede neue Stelle,
 * die Treffpunkte einer Woche zeigt, geht durch diese Funktion — genau die
 * Aufrufer-Lücke, die dieses Projekt am häufigsten trifft.
 */
export function fsVisible(
  insts: readonly FsInstance[],
  persons: readonly Person[],
  groups: readonly Group[],
  personId: string | null,
  planner: boolean,
): FsInstance[] {
  if (planner) return [...insts]
  const meine = new Set<string>()
  const eigene = personId ? persons.find((p) => p.id === personId)?.grp : null
  if (eigene) meine.add(eigene)
  const geleitet = overseerGroup(groups, personId)
  if (geleitet) meine.add(geleitet)
  return insts.filter((inst) => inst.grp == null || meine.has(inst.grp))
}

/* ---- Wochen-Bearbeitung (Planen) ---- */

/** Nur die Woche `wi` ersetzen (die übrigen behalten ihre Referenz). */
function patchWeek(fsWeeks: FsInstance[][], wi: number, fn: (week: FsInstance[]) => FsInstance[]): FsInstance[][] {
  return fsWeeks.map((week, i) => (i === wi ? fn(week) : week))
}

/**
 * Der Leiter als **Zuteilung** — oder `undefined`, wenn keine Person
 * dahintersteht.
 *
 * Die eine Stelle, an der „Freitext gehört niemandem hier" steht. Jeder, der
 * aus einem Treffpunkt eine Person machen will (Auslastung, „gehört mir",
 * Konflikt-Markierung), fragt hier — sonst wiederholt sich die Regel an fünf
 * Stellen und die sechste vergisst sie. Genau diese Fehlerart ist hier die
 * häufigste, und `alle-plaetze.test.ts` gibt es ihretwegen.
 */
export function fsLeiterZuteilung(inst: FsInstance): Zuteilung | undefined {
  if (!inst.leader || inst.lext) return undefined
  return { name: inst.leader, pid: inst.lpid }
}

/**
 * Die Treffpunkte einer Woche nach Wochentag gruppiert — in der Reihenfolge,
 * in der sie kommen (`fsSort` hat sie schon Mo→So, Zeit, Gruppe sortiert).
 * Programm und Planen bauen daraus je Tag eine Karte.
 */
export function nachWochentag(insts: readonly FsInstance[]): { wd: number; items: FsInstance[] }[] {
  const tage: { wd: number; items: FsInstance[] }[] = []
  for (const inst of insts) {
    let tag = tage.find((d) => d.wd === inst.wd)
    if (!tag) {
      tag = { wd: inst.wd, items: [] }
      tage.push(tag)
    }
    tag.items.push(inst)
  }
  return tage
}

/** Aktueller Leiter eines Treffpunkts ("" = offen / nicht gefunden). */
export function fsLeaderValue(fsWeeks: FsInstance[][], wi: number, instId: string): string {
  return fsWeeks[wi]?.find((i) => i.id === instId)?.leader ?? ''
}

/**
 * Leiter eines Treffpunkts setzen ("" = entfernen).
 *
 * Zwei Wege, wie beim Redner am Sonntag (T29): eine **Person** der Versammlung
 * (mit `pid`) oder **Freitext** (`extern`) für jemanden von außerhalb — in der
 * Regel den Kreisaufseher. Beide schließen einander aus, und jeder räumt die
 * Spur des anderen weg; sonst bliebe ein Platz halb das eine, halb das andere.
 */
export function fsSetLeader(
  fsWeeks: FsInstance[][],
  wi: number,
  instId: string,
  name: string,
  pid?: string,
  extern = false,
): FsInstance[][] {
  return patchWeek(fsWeeks, wi, (week) =>
    week.map((inst) => {
      if (inst.id !== instId) return inst
      // `lpid` nur setzen, wenn wirklich eine Person dahintersteht. Beim Leeren
      // (name = '') muss die alte Id weg, sonst gehörte der freie Platz weiter
      // jemandem — „Meine Aufgaben" zeigte ihn dann bei einer Person, die gar
      // nicht mehr eingeteilt ist. Dasselbe gilt für das Freitext-Kennzeichen:
      // Ein leerer Platz ist weder auswärtig noch eigen, er ist offen.
      const next = { ...inst, leader: name }
      if (name && pid) next.lpid = pid
      else delete next.lpid
      if (name && !pid && extern) next.lext = true
      else delete next.lext
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

/**
 * Eine Grundplan-Regel für **eine** Woche aussetzen (`FsRule.aus`) — das
 * Gegenstück zu `fsRemoveInst` für Treffpunkte aus dem Grundplan.
 *
 * Ohne diese Marke kam ein entfernter Treffpunkt wieder: `regenFsWeeks` baute
 * ihn beim nächsten Laden und bei jeder Änderung am Grundplan aus seiner Regel
 * neu, ohne Leiter und als offene Zuteilung. Unverändert (dieselbe Referenz),
 * wenn es die Regel nicht gibt oder sie dort schon ausgesetzt ist.
 */
export function fsRegelAussetzen(rules: FsRule[], ruleId: string, woche: string): FsRule[] {
  const regel = rules.find((r) => r.id === ruleId)
  if (!regel || regel.aus?.includes(woche)) return rules
  return rules.map((r) => (r === regel ? { ...r, aus: [...(r.aus ?? []), woche] } : r))
}

/** Manuellen Treffpunkt zu dieser Woche hinzufügen (neu sortiert). */
export function fsAddInst(fsWeeks: FsInstance[][], wi: number, inst: FsInstance): FsInstance[][] {
  return patchWeek(fsWeeks, wi, (week) => [...week, inst].sort(fsSort))
}

/**
 * **Mit einer Gruppe gehen ihre Treffpunkte** — aus dem Grundplan und aus
 * jeder Woche.
 *
 * Eine gelöschte Gruppe ließ ihre Regeln zurück. Die Einstellungen zeigen den
 * Grundplan je Gruppe, also stand keine davon mehr irgendwo zum Löschen da;
 * `genFsWeek` erzeugte sie trotzdem Woche für Woche weiter, und Programm und
 * Planen betitelten sie mit der rohen Gruppen-Id. Sehen konnte sie außer dem
 * Planer niemand mehr (`fsVisible`) — die Gruppe hat ja keine Mitglieder mehr.
 *
 * Gestrichen wird **jeder** Treffpunkt der Gruppe, auch die nur für eine Woche
 * angelegten (`manual`): Die hält `regenFsWeeks` ausdrücklich fest, sie blieben
 * sonst stehen. Deshalb auch kein `regenFsWeeks` hier — das setzte nebenbei
 * Zeit und Ort jeder angepassten Woche auf den Grundplan zurück, und mit der
 * Gruppe hat das nichts zu tun.
 *
 * **`null` ist die Versammlung, keine Gruppe: Dafür wird nichts gestrichen.**
 * Der Wächter unten ist kein Formalismus, sondern die schärfste Zeile hier —
 * `grp: null` ist genau die Kennung des **Versammlungs**treffpunkts, und ohne
 * ihn nähme ein `fsGruppeEntfernen(…, null)` sie alle mit: Die Treffpunkte,
 * die jeden angehen, wären weg, weil eine Gruppe gelöscht wurde.
 *
 * Der Parameter lässt `null` deshalb ausdrücklich zu, statt es über den Typ zu
 * verbieten. Verboten wäre es nur hier; die Kennung **ist** `string | null`
 * (so steht sie in `FsRule.grp` und `FsInstance.grp`), und wer sie
 * durchreicht, käme sonst nur mit einem Cast vorbei — der prüft nichts und
 * fiele beim Lesen nicht auf.
 *
 * Bis zum 18. September 2026 stand für die Versammlung der leere String; der
 * Wächter (`!grp`) fängt beide. Eine Probe mit `''` prüft ihn seither aber
 * nicht mehr: Auf `''` passt keine Regel, die Funktion gäbe auch ohne ihn
 * dieselben Referenzen zurück.
 *
 * Unberührte Wochen und ein unberührter Grundplan behalten ihre Referenz —
 * daran erkennt `persist.ts`, was zu schreiben ist, und die Rückfrage vor dem
 * Löschen, ob es überhaupt Treffpunkte zu nennen gibt.
 */
export function fsGruppeEntfernen(
  rules: FsRule[],
  fsWeeks: FsInstance[][],
  grp: string | null,
): { fsRules: FsRule[]; fsWeeks: FsInstance[][] } {
  if (!grp) return { fsRules: rules, fsWeeks }
  const fsRules = rules.some((r) => r.grp === grp) ? rules.filter((r) => r.grp !== grp) : rules
  let geaendert = false
  const weeks = fsWeeks.map((week) => {
    if (!week.some((inst) => inst.grp === grp)) return week
    geaendert = true
    return week.filter((inst) => inst.grp !== grp)
  })
  return { fsRules, fsWeeks: geaendert ? weeks : fsWeeks }
}

/* ---- Auto-Zuteilung / Leeren der Treffpunkt-Leiter ---- */

/*
 * Aufbau und Zerlegung des Treffpunkt-Schlüssels stehen im geteilten Modul
 * (siehe den Kopf von `aufgaben-schluessel.ts`) — `send-reminders` und
 * `send-plan` bauen denselben und können nicht aus `src/` lesen.
 */
export { fsKey as fsTaskKey }

/** Woche (Kennung) eines Treffpunkt-Schlüssels — `null`, wenn es keiner ist. */
export function fsTaskKeyWoche(key: string): string | null {
  const teile = schluesselTeile(key)
  return teile?.art === 'fs' ? teile.woche : null
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
 * **Die Treffpunkt-Strichliste**: Leitungen je Person im Fenster der letzten
 * `FS_LOAD_WEEKS` Wochen bis einschließlich `wi`.
 *
 * Sie steht hier und nicht in `fsAutoAssign`, weil zwei Stellen sie brauchen:
 * die Auswahl der Automatik und der „frei"-Chip im Zuteilungs-Blatt. Der las
 * bis hierher `workloadOf` — also die **Zusammenkunfts**-Last über alle
 * geladenen Wochen. Das ist die falsche Größe und der falsche Zeitraum
 * zugleich: Treffpunkte zählen ausdrücklich nicht in `workloadOf` (siehe
 * `deriveMyFsTasks`), und über ein ganzes Jahr trägt fast jeder irgendetwas.
 * Der Chip war deshalb im Regelfall stumm — und in dem einen Fall, in dem er
 * ansprang (jemand ohne Zusammenkunfts-Aufgabe), behauptete er „frei" für
 * jemanden, der in derselben Woche schon drei Treffpunkte leitet.
 *
 * Gezählt wird über die Person-Id; ein Freitext-Leiter gehört niemandem hier
 * (`fsLeiterZuteilung`) und zählt für niemanden.
 *
 * Den Auflöser bringt der Aufrufer mit, statt dass ihn jeder Aufruf neu baut:
 * `fsAutoAssign` hält ihn ohnehin schon (zwei Maps über alle Personen), und im
 * Zuteilungs-Blatt entsteht er einmal je Liste statt einmal je Kandidat.
 */
export function fsLast(
  fsWeeks: FsInstance[][],
  wi: number,
  werIst: (z: Zuteilung | undefined) => string | undefined,
): Map<string, number> {
  const load = new Map<string, number>()
  const vonWoche = Math.max(0, wi - FS_LOAD_WEEKS + 1)
  for (let i = vonWoche; i <= wi; i++) {
    for (const inst of fsWeeks[i] ?? []) {
      const id = werIst(fsLeiterZuteilung(inst))
      if (id) load.set(id, (load.get(id) ?? 0) + 1)
    }
  }
  return load
}

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
  /** Montag dieser Woche (`Week.start`); leer = keine Abwesenheitsprüfung. */
  wochenStart = '',
  groups: readonly Group[] = [],
): { fsWeeks: FsInstance[][]; count: number } {
  const qualifiziert = persons.filter((p) => isQualified(p, 'treffpunkt'))
  /**
   * Kandidaten für einen Wochentag. Die Abwesenheit wird am echten Tag des
   * Treffpunkts geprüft, nicht an der Woche: ein Treffpunkt hat seinen eigenen
   * Wochentag, wer nur übers Wochenende weg ist, kann montags leiten. Ohne
   * Kennung (Proben) bleibt die Prüfung aus.
   */
  const poolAm = new Map<number, Person[]>()
  const poolFor = (wd: number): Person[] => {
    const fertig = poolAm.get(wd)
    if (fertig) return fertig
    const tag = fsTag(wochenStart, wd)
    const pool = qualifiziert.filter((p) => !tag || !istAbwesendAm(absences, p.id, tag))
    poolAm.set(wd, pool)
    return pool
  }
  // Alle Listen unten sind nach Person-Id geführt, nicht nach Name: zwei
  // Personen desselben Namens teilten sich sonst eine Strichliste, sperrten
  // sich gegenseitig am selben Wochentag und erbten gegenseitig die Wartezeit.
  const werIst = idAufloeser(persons)
  // Ein Freitext-Leiter steht in keiner Personenliste; sein Name ist kein
  // schwächerer Anhalt, sondern gar keiner (T29). Ohne das erhöhte der
  // Kreisaufseher die Auslastung eines gleichnamigen Bruders — und die
  // Auto-Zuteilung überginge ihn daraufhin.
  const idVon = (inst: FsInstance): string | undefined => werIst(fsLeiterZuteilung(inst))

  // Grundlast: Leitungen je Person im Fenster der letzten FS_LOAD_WEEKS Wochen.
  // Dieselbe Rechnung, die das Zuteilungs-Blatt für seinen „frei"-Chip liest
  // (`fsLast`) — sonst zeigt es eine andere Zahl an, als die Automatik wählt.
  const load = fsLast(fsWeeks, wi, werIst)
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
  const week = (fsWeeks[wi] ?? []).map((inst) => {
    if (inst.leader || (onlyGroup !== null && inst.grp !== onlyGroup)) return inst
    const used = dayUsed.get(inst.wd) ?? new Set<string>()
    // Der Hash ist derselbe gemischte wie bei der Programm-Zuteilung. Die
    // frühere eigene Fassung ohne Avalanche ergab in jeder Woche dieselbe feste
    // Rangliste nach Namen — wer darin hinten stand, leitete nie (siehe
    // tieHash in helpers.ts). Der Schlüssel wird getrennt gefügt: „Ann"+„a12"
    // und „Anna"+„12" wären sonst derselbe. Die Woche geht mit ihrem Montag
    // ein, nicht mit `wi`: Ab 52 Wochen liegt jede neue am selben Index, und der
    // Gleichstand fiele Woche für Woche gleich aus.
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
        tieHash(`${a.name}|${wochenStart || wi}|${inst.wd}`) - tieHash(`${b.name}|${wochenStart || wi}|${inst.wd}`),
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
    return { ...inst, leader: pick.name, lpid: pick.p.id }
  })
  if (newly.length === 0) return { fsWeeks, count: 0 }
  return { fsWeeks: patchWeek(fsWeeks, wi, () => week), count: newly.length }
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
    // und stünde bei ihm in „Meine Aufgaben". Das Freitext-Kennzeichen ebenso —
    // ein geleerter Platz ist offen, nicht auswärtig.
    const { lpid: _weg, lext: _auch, ...ohne } = inst
    return { ...ohne, leader: '' }
  })
  if (count === 0) return { fsWeeks, count: 0 }
  return { fsWeeks: patchWeek(fsWeeks, wi, () => week), count }
}

/**
 * **Ist der Tag dieses Treffpunkts vorbei?** Tagesgenau wie `istVorbei` — vorbei
 * ist er ab dem Tag danach.
 *
 * Gemessen in derselben Kodierung wie `MyTask.at` (`kalendertagMs`), damit
 * „vorbei" für einen Treffpunkt überall am selben Tag umspringt: in „Meine
 * Aufgaben", auf der Planungs-Karte und beim „Plan senden". Ohne brauchbare
 * Wochenkennung (Vorlagen, Tests) gibt es keinen Tag — dann ist auch nichts
 * vorbei.
 */
export function fsTagVorbei(wochenStart: string, wd: number, heute = new Date()): boolean {
  const tag = fsTag(wochenStart, wd)
  return tag ? istVorbei(kalendertagMs(tag), heute) : false
}

/**
 * Treffpunkt-Leitungen dieser Person als Aufgaben — das Gegenstück zu
 * `deriveMyTasks` für die zweite Datenquelle.
 *
 * Eigene Ableitung statt eines Zweigs in `deriveMyTasks`: Treffpunkte bleiben
 * eine getrennte Größe (sie zählen nicht in `workloadOf` und haben ihre eigene
 * Strichliste), sie hängen an `fsWeeks` statt an `weeks`, und ihr
 * Termin kommt aus Wochentag und eigener Uhrzeit statt aus den
 * Zusammenkunftszeiten. Zusammengeführt wird erst in `state.myTasks`.
 *
 * Zugeordnet über die Person-Id, mit Rückfall auf den Namen für Altdaten —
 * dieselbe Rangfolge wie bei den Zusammenkunfts-Aufgaben. Ohne das sahen
 * Namensgleiche gegenseitig ihre Treffpunkte. Dass ein Freitext-Leiter
 * niemandem hier gehört, entscheidet `fsLeiterZuteilung`.
 */
export function deriveMyFsTasks(
  fsWeeks: FsInstance[][],
  /** Montag je Woche (`Week.start`) — Schlüssel und Termin hängen daran. */
  kennungen: readonly string[],
  personName: string,
  confirmations: ConfirmationMap,
  personId: string | undefined,
  titel: string,
): MyTask[] {
  const tasks: MyTask[] = []
  if (!personName && !personId) return tasks
  fsWeeks.forEach((week, wi) => {
    for (const inst of week) {
      // Offen oder Freitext: gehört niemandem hier (`fsLeiterZuteilung`).
      if (!gehoertZuKennung(fsLeiterZuteilung(inst), personId, personName)) continue
      const kennung = kennungen[wi] ?? ''
      const key = fsKey(kennung, inst.id)
      // Ohne brauchbare Kennung (Vorlagen, Tests) gibt es keinen echten Termin —
      // dann bleibt der Countdown aus, statt einen erfundenen Tag zu zeigen.
      const tag = fsTag(kennung, inst.wd)
      tasks.push({
        id: key,
        // „Treffpunkt-Leiter" ist eine Rolle und gehört damit in die Sprache
        // des Lesers. Als Titel lief sie durch `tp` — bei deutscher App und
        // englischer Versammlungssprache stand dort Englisch.
        title: '',
        rolle: titel,
        date: fsTerminText(tag, inst),
        /*
         * **Der Kalendertag, nicht der Zeitpunkt** — als UTC-Mitternacht, wie
         * `meetingDateMs` ihn für die Zusammenkünfte liefert (siehe
         * `MyTask.at`). `fsTag` gibt den örtlichen Mittag zurück; das ist für
         * das Datum richtig und für diese Zahl die falsche Form: Der Countdown
         * liest daraus den UTC-Tag, und Ortsmittag fällt östlich von UTC+12 auf
         * den Vortag. Zwei Quellen, eine Kodierung.
         */
        at: tag ? kalendertagMs(tag) : null,
        status: zusageStatus(confirmations, key),
        s89: null,
      })
    }
  })
  return tasks
}

/**
 * Treffpunkt-Leitungen, deren Zusage im neuen Stand **niemandem mehr gehört** —
 * das Gegenstück zu `changedSlotKeys` (planning.ts) für die zweite Datenquelle.
 *
 * Eine Zusage gibt eine Person, gespeichert wird sie aber unter dem Schlüssel
 * des Platzes (`fsTaskKey`). Wechselt der Leiter, muss sie weg, sonst erbt der
 * Nachfolger sie. Bei den Zusammenkünften räumt jede Zuteilung ihre Schlüssel
 * ab (`dropConfirmations`); bei den Treffpunkten tat das bis zum 14. September
 * 2026 nichts. Der neue Leiter stand als bestätigt da, ohne je gefragt worden
 * zu sein, und bekam keine Erinnerung. Sagte er ab, verschwand die Absage unter
 * der Zusage des Vorgängers — beim Laden gewinnt „bestätigt"
 * (`confirmationMap`). Die Ampel am Chip hätte das grün angezeigt.
 *
 * Verglichen wird die **Person**, nicht der Name: Wer umbenannt wird, behält
 * seine Zusage (`dieselbePerson`, dieselbe Regel wie beim Entzug und bei den
 * Zusammenkünften). Nur wo keine Person-Id dasteht, entscheidet der Name
 * (`fsLeiterBinden` trägt sie nach, sobald es die Person gibt). Ein
 * Freitext-Leiter ist niemand von hier — der Wechsel zu ihm und
 * von ihm weg ist ein Wechsel. Verschwindet der Treffpunkt, geht die Zusage mit.
 */
export function fsVerwaisteZusagen(
  vorher: readonly FsInstance[] | undefined,
  nachher: readonly FsInstance[] | undefined,
  kennung: string,
): string[] {
  const jetzt = new Map((nachher ?? []).map((inst) => [inst.id, inst]))
  const out: string[] = []
  for (const alt of vorher ?? []) {
    if (!alt.leader) continue // kein Leiter, keine Zusage
    const neu = jetzt.get(alt.id)
    if (neu && dieselbeLeitung(alt, neu)) continue
    out.push(fsKey(kennung, alt.id))
  }
  return out
}

function dieselbeLeitung(a: FsInstance, b: FsInstance): boolean {
  if (!b.leader || Boolean(a.lext) !== Boolean(b.lext)) return false
  return dieselbePerson({ name: a.leader, pid: a.lpid }, { name: b.leader, pid: b.lpid })
}

/**
 * `fsVerwaisteZusagen` über alle Wochen, die sich zwischen zwei Ständen
 * geändert haben. Der Reducer räumt damit den Zustand ab; die Speicherschicht
 * liest das Ergebnis am Unterschied der Zusagen ab, statt es neu zu rechnen.
 *
 * Die Kennung kommt aus den Wochen des **alten** Stands: Unter ihr steht die
 * Zusage, um die es geht.
 */
export function fsVerwaisteZusagenAller(
  weeks: ReadonlyArray<{ start: string }>,
  vorher: readonly FsInstance[][],
  nachher: readonly FsInstance[][],
): string[] {
  if (vorher === nachher) return []
  const out: string[] = []
  for (let wi = 0; wi < vorher.length; wi++) {
    // Unberührte Wochen behalten ihre Referenz — der Vergleich kostet nichts.
    if (vorher[wi] === nachher[wi]) continue
    out.push(...fsVerwaisteZusagen(vorher[wi], nachher[wi], weeks[wi]?.start ?? ''))
  }
  return out
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
 * übers Wochenende weg ist, kann montags leiten. Ohne Kennung (Proben)
 * entfällt die Abwesenheitsprüfung — dieselbe Linie wie in `fsAutoAssign`.
 */
export function fsWeekConflicts(
  fsWeeks: FsInstance[][],
  wi: number,
  persons: Person[],
  absences: readonly Absence[] = [],
  /** Montag dieser Woche; leer = keine Abwesenheitsprüfung. */
  wochenStart = '',
  onlyGroup: string | null = null,
): Conflict[] {
  const week = fsWeeks[wi]
  if (!week) return []
  const conflicts: Conflict[] = []
  const werIst = idAufloeser(persons)
  // Gezählt wird über die Kennung, angezeigt der Name — wie bei den
  // Zusammenkünften (`weekConflicts`). Über den Namen zu zählen legte zwei
  // Gleichnamige zusammen, und die Markierung im Plan träfe danach beide.
  const proTag = new Map<number, Map<string, number>>()
  const namen = new Map<string, string>()

  for (const inst of week) {
    if (!inst.leader || (onlyGroup !== null && inst.grp !== onlyGroup)) continue
    const kennung = kennungVon(inst.leader, inst.lpid)
    namen.set(kennung, inst.leader)
    // Zählung je Wochentag für `fsDouble` — auch ohne Kennung prüfbar.
    const tag = proTag.get(inst.wd) ?? new Map<string, number>()
    tag.set(kennung, (tag.get(kennung) ?? 0) + 1)
    proTag.set(inst.wd, tag)

    if (!wochenStart) continue
    // Wer der Leiter ist, sagt `idAufloeser` (Id vor Name) — beim Freitext
    // niemand: Von jemandem außerhalb der Versammlung kennt die App keine
    // Abwesenheiten, und der Namensweg träfe einen Gleichnamigen. Die
    // Doppelbelegung oben zählt ihn weiter mit: zweimal am selben Tag ist
    // auch beim Kreisaufseher ein Planungsfehler.
    const personId = werIst(fsLeiterZuteilung(inst))
    // Nicht `tag` genannt: Der Name ist oben schon für die Zählung je
    // Wochentag vergeben.
    const datum = fsTag(wochenStart, inst.wd)
    if (personId && datum && istAbwesendAm(absences, personId, datum)) {
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
 * Jede Treffpunkt-Instanz durch `fn` schicken — unter Erhalt der Referenzen.
 *
 * Vier Umstellungen trugen dasselbe Gerüst mit sich: ein `changed` je Woche,
 * ein `anyChanged` darüber, und am Ende die Rückgabe der Eingabe, falls
 * nichts geschah. Nur die Verwandlung selbst war jeweils anders.
 *
 * Ob sich etwas geändert hat, sagt die **Identität**: Wer nichts zu ändern
 * hat, gibt seine Eingabe zurück — das taten die vier Aufrufer ohnehin schon.
 * Damit steht der Vertrag „unveränderte Wochen behalten ihre Referenz" an
 * einer Stelle statt an vieren; `persist.ts` entscheidet daran, was zu
 * schreiben ist.
 */
function mapInsts(fsWeeks: FsInstance[][], fn: (inst: FsInstance) => FsInstance): FsInstance[][] {
  let anyChanged = false
  const next = fsWeeks.map((week) => {
    let changed = false
    const insts = week.map((inst) => {
      const neu = fn(inst)
      if (neu !== inst) changed = true
      return neu
    })
    if (!changed) return week
    anyChanged = true
    return insts
  })
  return anyChanged ? next : fsWeeks
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
  return mapInsts(fsWeeks, (inst) => {
    if (inst.lpid !== id) return inst
    const { lpid: _weg, ...ohne } = inst
    return ohne
  })
}

/**
 * Leiter-Namen ohne `lpid` an ihre Person binden — das Gegenstück zu
 * `pidsNachtragen` (lib/data.ts) für die zweite Datenquelle.
 *
 * Gebraucht wird es im laufenden Betrieb: Wird eine Person gelöscht, nimmt
 * `fsDropPersonPid` ihre Id aus den Treffpunkten und lässt den Namen stehen.
 * Legt der Planer sie neu an, fänden die Zusammenkünfte wieder zusammen, die
 * Treffpunkte nie — dort bliebe ein Name ohne Person, und die Leitung zählte
 * in keiner Auslastung und in keiner Aufgabenliste mehr.
 *
 * Nur **eindeutige** Namen werden zugeordnet (`eindeutigeNamen`) — seit T110
 * sind sie das je Versammlung ohnehin. Idempotent, und unveränderte Wochen
 * behalten ihre Referenz.
 */
export function fsLeiterBinden(
  fsWeeks: FsInstance[][],
  persons: readonly Person[],
): FsInstance[][] {
  const nachName = eindeutigeNamen(persons)
  if (nachName.size === 0) return fsWeeks

  return mapInsts(fsWeeks, (inst) => {
    // `lext` ist die Ausnahme, für die es das Flag überhaupt gibt: Ohne sie
    // machte dieser Backfill den Freitext-Leiter bei jedem Laden wieder zu
    // einer Person — der Fehler wäre nicht nur möglich, sondern selbstheilend
    // in die falsche Richtung.
    if (inst.lpid || inst.lext || !inst.leader) return inst
    const id = nachName.get(inst.leader)
    if (!id) return inst // Gruppenname, Unbekannter, Dublette
    return { ...inst, lpid: id }
  })
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
  return mapInsts(fsWeeks, (inst) => {
    // Freitext bleibt unberührt: Wer außerhalb der Versammlung steht, wird
    // nicht mitumbenannt, nur weil ein Bruder zufällig so hieß.
    const meint = inst.lext ? false : inst.lpid ? inst.lpid === id : inst.leader === oldName
    if (!meint || inst.leader === newName) return inst
    return { ...inst, leader: newName }
  })
}
