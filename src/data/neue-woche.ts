/**
 * **Eine frisch importierte Woche einordnen** — was mit ihr geschieht, bevor sie
 * gespeichert wird.
 *
 * `import-week` liefert das Programm, wie es auf jw.org steht. Die Versammlung
 * macht daraus ihre Woche:
 *
 *  - **Endzeiten** aus den eigenen Zusammenkunftszeiten. Der Import kennt sie
 *    nicht und trägt feste Werte ein (20:45 / 11:45) — bei einem Beginn um
 *    18:30 stünde auf jedem Programmblatt eine falsche Endzeit.
 *  - **Zusätzliche Klasse**: Ist sie eingerichtet, bekommt jeder Schülerteil
 *    seine zweite Platzreihe und die Zusammenkunft ihren Ratgeber — sonst
 *    verschwände die Klasse ab dem nächsten Import.
 *  - **Gedächtnismahl**: Bringt die Woche seinen Termin mit (T65), wird der
 *    Ausfall hier abgeleitet und nicht im Import. Die Regel — Werktag trifft
 *    die Zusammenkunft unter der Woche, Wochenende die andere — steht damit an
 *    einer Stelle; ein zweites Mal in eine Edge Function geschrieben war sie
 *    schon einmal die Ursache eines Fehlers (B8/T40).
 *  - **Treffpunkte** aus dem Grundplan, samt der vorgemerkten Gruppenbesuche
 *    (T120).
 *  - **Öffentlicher Vortrag**, wenn er aus dem Vortragsplan vorgemerkt ist
 *    (T122): Das Planungsprogramm plant Monate voraus, die Woche kommt erst
 *    mit ihrem Programm.
 *  - **Der feste Leiter des Wachtturm-Studiums** (18.10.2026), bei Abwesenheit
 *    sein Vertreter (`festenWtLeiterEintragen`) — nach dem Vortrag: Hält der
 *    Leiter ihn selbst, leitet der Vertreter.
 *
 * Eine Funktion für den Knopf in der App (`addImportedWeek`) und das Skript
 * `scripts/wochen-importieren.mjs` — Gleichstand durch Bauart, nicht durch
 * Abschrift. Bis zum 5.10.2026 schrieb das Skript die Woche, wie `import-week`
 * sie liefert: ohne Klasse, mit den festen Endzeiten, ohne Treffpunkte. Mit
 * eingeschalteter Klasse wies `zuteilen` dann jede Zuteilung eines Planers in
 * diesen Wochen als Umbau ab — die App gleicht beim Laden an, schreibt es aber
 * nicht zurück.
 */

import { setAnlassTermin } from './anlass'
import { syncAuxSlots } from './aux-class'
import { genFsWeek } from './fs'
import { besucheInNeueWoche } from './gruppenbesuche'
import { endeAusStartzeit } from './meeting-edit'
import { festenWtLeiterEintragen } from './planning'
import type { Absence, FsInstance, FsRule, Gruppenbesuch, MeetingTimes, Person, Week } from './types'
import { vortragInNeueWoche, type VorgemerkterVortrag } from './vortragsplan'

export interface NeueWocheKontext {
  zeiten: MeetingTimes
  /** Zusätzliche Klasse eingerichtet (`congregations.aux_class`). */
  auxClass: boolean
  fsRules: FsRule[]
  gruppenbesuche: readonly Gruppenbesuch[]
  /** Vorgemerkte öffentliche Vorträge (T122). */
  vortraege: readonly VorgemerkterVortrag[]
  persons: readonly Person[]
  /** Wer wann fehlt — der feste Studienleiter kommt nur in die Woche, wenn er da ist. */
  absences: readonly Absence[]
}

/** Die Woche, wie die Versammlung sie speichert, und ihre Treffpunkte. */
export function neueWocheEinordnen(roh: Week, k: NeueWocheKontext): { week: Week; fsWeek: FsInstance[] } {
  const mitEnden: Week = {
    ...roh,
    mid: { ...roh.mid, end: endeAusStartzeit(k.zeiten.mid.time, roh.mid.end) },
    we: { ...roh.we, end: endeAusStartzeit(k.zeiten.we.time, roh.we.end) },
  }
  let wochen = syncAuxSlots([mitEnden], k.auxClass)
  const mem = mitEnden.anlass?.art === 'mem' ? mitEnden.anlass.von : undefined
  if (mem) wochen = setAnlassTermin(wochen, 0, { von: mem })
  const fsWeek = besucheInNeueWoche(genFsWeek(roh.start, k.fsRules), roh.start, k.gruppenbesuche, k.persons)
  // Nach dem Gedächtnismahl: Fällt es aufs Wochenende, bleibt der Vortrag weg.
  const mitVortrag = vortragInNeueWoche(wochen[0] ?? mitEnden, k.vortraege, k.persons)
  const { week } = festenWtLeiterEintragen(mitVortrag, k.persons, k.absences, k.zeiten)
  return { week, fsWeek }
}
