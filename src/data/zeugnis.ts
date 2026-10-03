/**
 * Öffentliches Zeugnisgeben (T120, Phase 3) — reine Logik.
 *
 * Gemessen: Die Ältestenschaft organisiert Stände oder Trolleys im
 * Versammlungsgebiet, am besten **immer am selben Ort, am selben Wochentag und
 * zur selben Uhrzeit** (Unser Königreichsdienst, Nov. 2013, Abs. 7–8). An
 * einem Trolley steht wenigstens ein Verkündiger, ein Infostand wird immer von
 * zweien betreut (Nov. 2014, Abs. 2).
 *
 * Ein **Termin** (`OzTermin`) beschreibt die Regel; jede Woche entsteht aus
 * ihm eine **Schicht**. Schichten werden nicht gespeichert — nur die
 * **Einträge** (`OzEintrag`), je Person einer. Eine Schicht ist damit
 * `(Termin, Datum)` plus die Einträge, die darauf zeigen.
 *
 * Alle Funktionen sind pur.
 */

import { istAbwesendAm } from './absence'
import { displayName, isQualified } from './helpers'
import { tieHash } from './auslastung'
import { fromIso, isoDay, kalendertagMs, montagNach, montagVon, tagVorbei, versatzAbMontag } from './meeting-dates'
import { zusageStatus } from './planning'
import { neuesterVersand, nochNichtGemeldet, type EntzogeneZusage, type OffeneMeldung } from './plan-versand'
import { ozKey } from '../../supabase/functions/_shared/aufgaben-schluessel.ts'
import {
  OZ_DIENST,
  offeneZeugnisEintraege,
  ozTerminText as ozTerminTextEdge,
} from '../../supabase/functions/_shared/zuteilungen.ts'
import type { Absence, ConfirmationMap, MyTask, OzEintrag, OzTermin, Person, SentLog, TaskStatus } from './types'

/** Der Aufgabenbereich, der zum Eintragen berechtigt (`FesteBereiche.zeugnis`). */
export const OZ_BEREICH = 'zeugnis'

/** Wie viele Wochen Planen und Ansehen voraus zeigen: ein Vierteljahr. */
export const OZ_WOCHEN = 13

/**
 * So viele Wochen stehen offen da; die übrigen bis zum Ende des Vierteljahrs
 * (`OZ_WOCHEN`) auf Wunsch. Dreizehn Wochen mit je zwei Schichten wären eine
 * Wand, durch die niemand scrollt, um die nächste freie Stelle zu finden. Die
 * freien Plätze zählen Planen und die Planungs-Karte auf Start für dieselben
 * Wochen.
 */
export const OZ_ERSTE_WOCHEN = 4

/** Eine Schicht: ein Termin an einem Tag, mit ihren Einträgen. */
export interface OzSchicht {
  termin: OzTermin
  /** Der Tag (ISO). */
  datum: string
  /** Der Montag seiner Woche (ISO) — die Woche im Aufgaben-Schlüssel. */
  montag: string
  eintraege: OzEintrag[]
  /** Freie Plätze: Plätze des Termins minus Einträge, nie unter null. */
  frei: number
}

/** Der Tag eines Termins in der Woche dieses Montags (ISO). */
export function ozDatum(montag: string, wd: number): string {
  const tag = fromIso(montag)
  tag.setDate(tag.getDate() + versatzAbMontag(wd))
  return isoDay(tag)
}

/** Sortierung der Schichten: Tag, dann Beginn, dann Ort. */
function schichtSort(a: OzSchicht, b: OzSchicht): number {
  return a.datum.localeCompare(b.datum) || a.termin.von.localeCompare(b.termin.von) || a.termin.ort.localeCompare(b.termin.ort)
}

/**
 * Die Schichten von `wochen` Wochen ab dem Montag `ab`, aufsteigend.
 *
 * Einträge, deren Termin es nicht mehr gibt, fallen heraus — in der Datenbank
 * gehen sie mit dem Termin (Kaskade).
 */
export function ozSchichten(
  termine: readonly OzTermin[],
  eintraege: readonly OzEintrag[],
  ab: string,
  wochen = OZ_WOCHEN,
): OzSchicht[] {
  const out: OzSchicht[] = []
  for (let w = 0; w < wochen; w++) {
    const montag = montagNach(ab, w)
    for (const termin of termine) {
      const datum = ozDatum(montag, termin.wd)
      const drin = eintraege.filter((e) => e.terminId === termin.id && e.datum === datum)
      out.push({ termin, datum, montag, eintraege: drin, frei: Math.max(0, termin.plaetze - drin.length) })
    }
  }
  return out.sort(schichtSort)
}

/** Der Montag der laufenden Woche (ISO) — dort beginnen Planen und Ansehen. */
export function ozAb(heute = new Date()): string {
  return montagVon(isoDay(heute))
}

/**
 * Eine einzelne Schicht — oder `null`, wenn es den Termin nicht gibt oder er an
 * diesem Tag gar nicht stattfindet (anderer Wochentag).
 */
export function ozSchicht(
  termine: readonly OzTermin[],
  eintraege: readonly OzEintrag[],
  terminId: string,
  datum: string,
): OzSchicht | null {
  const termin = termine.find((t) => t.id === terminId)
  if (!termin || fromIso(datum).getDay() !== termin.wd) return null
  const drin = eintraege.filter((e) => e.terminId === terminId && e.datum === datum)
  return { termin, datum, montag: montagVon(datum), eintraege: drin, frei: Math.max(0, termin.plaetze - drin.length) }
}

/** Ist die Schicht vorbei (der Tag ist um)? */
export function ozVorbei(schicht: Pick<OzSchicht, 'datum'>, heute = new Date()): boolean {
  return tagVorbei(schicht.datum, heute)
}

/**
 * Die Einträge, die gehen, wenn ein Termin einen **anderen Wochentag** bekommt:
 * die kommenden — sie stünden an einem Tag, an dem er nicht mehr stattfindet.
 * Was heute ist oder war, bleibt; heute stehen die Eingetragenen womöglich
 * gerade dort. Eine Rechnung für den Reducer und die Rückfrage davor, damit
 * die genannte Zahl die ist, die dann wirklich geht.
 */
export function ozWegBeiTagwechsel(eintraege: readonly OzEintrag[], terminId: string, heute = new Date()): OzEintrag[] {
  const tag = isoDay(heute)
  return eintraege.filter((e) => e.terminId === terminId && e.datum > tag)
}

/**
 * Darf sich diese Person selbst in diese Schicht eintragen?
 *
 * Nur mit dem Aufgabenbereich (die Ältestenschaft organisiert das Zeugnisgeben
 * — so prüft es auch die Datenbank), nur in einen freien Platz, nur einmal und
 * nicht in Vergangenes.
 */
export function ozKannEintragen(person: Person | undefined, schicht: OzSchicht, heute = new Date()): boolean {
  if (!person || !isQualified(person, OZ_BEREICH)) return false
  if (schicht.frei <= 0 || ozVorbei(schicht, heute)) return false
  return !schicht.eintraege.some((e) => e.pid === person.id)
}

/**
 * Schichten mit freien Plätzen in den ersten `wochen` Wochen ab dem Montag
 * `ab` — ohne Vergangenes. Eine Rechnung für das Banner beim Planen und die
 * Planungs-Karte, damit beide dieselbe Zahl nennen.
 */
export function ozFreieSchichten(
  schichten: readonly OzSchicht[],
  ab: string,
  wochen: number,
  heute = new Date(),
): OzSchicht[] {
  const bis = montagNach(ab, wochen)
  return schichten.filter((s) => s.montag < bis && s.frei > 0 && !ozVorbei(s, heute))
}

/** Ein Konflikt einer Schicht: eine eingetragene Person ist an dem Tag abwesend. */
export interface OzKonflikt {
  schicht: OzSchicht
  eintrag: OzEintrag
  name: string
}

/** Abwesende in kommenden Schichten — Vergangenes meldet nichts mehr. */
export function ozKonflikte(
  schichten: readonly OzSchicht[],
  persons: readonly Person[],
  absences: readonly Absence[],
  heute = new Date(),
): OzKonflikt[] {
  const out: OzKonflikt[] = []
  for (const schicht of schichten) {
    if (ozVorbei(schicht, heute)) continue
    for (const eintrag of schicht.eintraege) {
      if (!istAbwesendAm(absences, eintrag.pid, fromIso(schicht.datum))) continue
      const person = persons.find((p) => p.id === eintrag.pid)
      out.push({ schicht, eintrag, name: person ? displayName(person) : '' })
    }
  }
  return out
}

/**
 * **Freie Plätze automatisch besetzen** — in den kommenden Schichten.
 *
 * Kandidaten haben den Aufgabenbereich, sind am Tag nicht abwesend und stehen
 * an diesem Tag noch in keiner anderen Schicht. Vorn steht, wer am wenigsten
 * Einträge hat — im Zeitraum **und davor** (`bisher`, der geladene Rückblick),
 * damit es über die Vierteljahre hinweg reihum geht und nicht jedes Mal
 * dieselben vorn stehen. Bei Gleichstand entscheidet ein fester Hash, damit
 * dieselbe Lage dasselbe Ergebnis gibt. Bestehende Einträge bleiben.
 *
 * Gibt nur die **neuen** Einträge zurück (`selbst: false` — zugeteilt).
 */
export function ozAutoAssign(args: {
  schichten: readonly OzSchicht[]
  persons: readonly Person[]
  absences: readonly Absence[]
  neueId: () => string
  /** Einträge vor dem Zeitraum — sie zählen mit, belegen aber keinen Tag. */
  bisher?: readonly OzEintrag[]
  heute?: Date
}): OzEintrag[] {
  const { schichten, persons, absences, neueId, bisher = [], heute = new Date() } = args
  const kandidaten = persons.filter((p) => isQualified(p, OZ_BEREICH))
  const last = new Map<string, number>()
  const amTag = new Map<string, Set<string>>()
  const merke = (pid: string, datum: string) => {
    last.set(pid, (last.get(pid) ?? 0) + 1)
    const tag = amTag.get(datum) ?? new Set<string>()
    tag.add(pid)
    amTag.set(datum, tag)
  }
  for (const e of bisher) last.set(e.pid, (last.get(e.pid) ?? 0) + 1)
  for (const s of schichten) for (const e of s.eintraege) merke(e.pid, s.datum)

  const neu: OzEintrag[] = []
  for (const s of schichten) {
    if (ozVorbei(s, heute)) continue
    for (let platz = 0; platz < s.frei; platz++) {
      const wahl = kandidaten
        .filter((p) => !amTag.get(s.datum)?.has(p.id) && !istAbwesendAm(absences, p.id, fromIso(s.datum)))
        .sort(
          (a, b) =>
            (last.get(a.id) ?? 0) - (last.get(b.id) ?? 0) ||
            tieHash(`${s.termin.id}|${s.datum}|${a.id}`) - tieHash(`${s.termin.id}|${s.datum}|${b.id}`),
        )[0]
      if (!wahl) break
      neu.push({ id: neueId(), terminId: s.termin.id, datum: s.datum, pid: wahl.id, selbst: false })
      merke(wahl.id, s.datum)
    }
  }
  return neu
}

/** Einträge aufsteigend nach Tag, dann Termin — die Reihenfolge im Zustand. */
export function ozNachDatum(eintraege: readonly OzEintrag[]): OzEintrag[] {
  return [...eintraege].sort((a, b) => a.datum.localeCompare(b.datum) || a.terminId.localeCompare(b.terminId))
}

/** Der Aufgaben-Schlüssel eines Eintrags (`oz|<montag>|<id>`). */
export function ozTaskKey(eintrag: Pick<OzEintrag, 'id' | 'datum'>): string {
  return ozKey(montagVon(eintrag.datum), eintrag.id)
}

/**
 * Die Zusage eines Eintrags. **Wer sich selbst einträgt, hat damit zugesagt**
 * — dafür wird keine Zeile in `confirmations` geschrieben, das sagt `selbst`.
 * Eine ausdrückliche Zusage (oder Absage) geht trotzdem vor.
 */
export function ozZusage(eintrag: OzEintrag, confirmations: ConfirmationMap): TaskStatus {
  const key = ozTaskKey(eintrag)
  if (key in confirmations) return zusageStatus(confirmations, key)
  return eintrag.selbst ? 'bestätigt' : 'offen'
}

/**
 * Termin einer Schicht, kanonisch deutsch: „Mittwoch, 9. September · 10:00–12:00
 * · Marktplatz" — übersetzt wird beim Anzeigen.
 *
 * Gebaut wird er im geteilten Edge-Ordner (`ozTerminText` in `zuteilungen.ts`),
 * nicht hier ein zweites Mal: Erinnerung, „Plan senden" und „Meine Aufgaben"
 * nennen denselben Termin, und beim Treffpunkt musste ein Paritätstest zwei
 * Fassungen zusammenhalten.
 */
export function ozTerminText(datum: string, termin: Pick<OzTermin, 'von' | 'bis' | 'ort'>): string {
  const montag = montagVon(datum)
  return ozTerminTextEdge(montag, versatzAbMontag(fromIso(datum).getDay()), termin.von, termin.bis, termin.ort)
}

/**
 * Was „Plan senden" hier noch zu tun hat: zugeteilte, unbestätigte, kommende
 * Einträge, über die das Versand-Tagebuch nichts weiß.
 *
 * Gerechnet mit **derselben** Funktion, mit der `send-plan` versendet
 * (`offeneZeugnisEintraege`) — die Zahl am Knopf geht nach dem Drücken so
 * sicher auf null.
 */
export function ozOffeneMeldungen(
  termine: readonly OzTermin[],
  eintraege: readonly OzEintrag[],
  persons: readonly Person[],
  confirmations: ConfirmationMap,
  sentLog: SentLog,
  heute = new Date(),
): OffeneMeldung[] {
  const namen = new Map(persons.map((p) => [p.id, displayName(p)]))
  const zeilen = eintraege.map((e) => ({ id: e.id, termin_id: e.terminId, datum: e.datum, person_id: e.pid, selbst: e.selbst }))
  return nochNichtGemeldet(
    offeneZeugnisEintraege(zeilen, termine, namen, new Map(Object.entries(confirmations)), kalendertagMs(heute)),
    sentLog,
  )
}

/** Was die Planungs-Karte auf Start zum öffentlichen Zeugnisgeben nennt. */
export interface OzStand {
  /** Eingetragene, die an ihrem Tag abwesend sind — im ganzen Vierteljahr. */
  konflikte: number
  /** Freie Plätze in den Wochen, die beim Planen offen dastehen. */
  frei: number
  /** Zugeteilte, die noch nichts wissen („Plan senden"). */
  nichtGesendet: number
}

/**
 * **Der Stand für die Planungs-Karte** (T120) — dieselben drei Zahlen wie die
 * Banner beim Planen: Konflikte über das ganze Vierteljahr (eine Abwesenheit in
 * acht Wochen lässt sich jetzt noch leicht lösen), freie Plätze in den Wochen,
 * die dort offen dastehen, und was „Plan senden" noch zu tun hat — Letzteres
 * nur, wenn gesendet werden kann (nicht offline).
 */
export function ozStand(args: {
  termine: readonly OzTermin[]
  eintraege: readonly OzEintrag[]
  persons: readonly Person[]
  absences: readonly Absence[]
  confirmations: ConfirmationMap
  sentLog: SentLog
  sendenMoeglich: boolean
  heute?: Date
}): OzStand {
  const { termine, eintraege, persons, absences, confirmations, sentLog, sendenMoeglich, heute = new Date() } = args
  if (termine.length === 0) return { konflikte: 0, frei: 0, nichtGesendet: 0 }
  const ab = ozAb(heute)
  const schichten = ozSchichten(termine, eintraege, ab)
  return {
    konflikte: ozKonflikte(schichten, persons, absences, heute).length,
    frei: ozFreieSchichten(schichten, ab, OZ_ERSTE_WOCHEN, heute).reduce((n, s) => n + s.frei, 0),
    nichtGesendet: sendenMoeglich
      ? ozOffeneMeldungen(termine, eintraege, persons, confirmations, sentLog, heute).length
      : 0,
  }
}

/** Wann ging zuletzt etwas über das öffentliche Zeugnisgeben hinaus? */
export function ozZuletztGesendet(sentLog: SentLog): string | null {
  return neuesterVersand(sentLog, (schluessel) => schluessel.startsWith('oz|'))
}

/**
 * **Bestätigte** Einträge, die ein Planer entfernt hat — wer sie hatte, erfährt
 * es sofort (`send-plan`, Aktion „entzug"), wie bei jedem anderen Platz.
 *
 * Bestätigt heißt hier auch: **selbst eingetragen**. Wer sich eingetragen hat,
 * plant mit der Schicht wie jemand, der eine Zuteilung bestätigt hat.
 *
 * Nicht gemeldet wird, wer sich selbst austrägt (`ausser`, die eigene Person) —
 * das ist seine Absage, keine Wegnahme —, was vorbei ist, und wer nicht mehr in
 * der Personenliste steht: Eine gelöschte Person hat niemanden mehr, dem man
 * etwas sagen könnte.
 */
export function ozEntzogeneZusagen(
  termine: readonly OzTermin[],
  vorher: readonly OzEintrag[],
  nachher: readonly OzEintrag[],
  persons: readonly Person[],
  confirmations: ConfirmationMap,
  ausser: string | undefined,
  heute = new Date(),
): EntzogeneZusage[] {
  if (vorher === nachher) return []
  const bleibt = new Set(nachher.map((e) => e.id))
  const out: EntzogeneZusage[] = []
  for (const e of vorher) {
    if (bleibt.has(e.id) || e.pid === ausser) continue
    if (ozZusage(e, confirmations ?? {}) !== 'bestätigt' || ozVorbei(e, heute)) continue
    const termin = termine.find((t) => t.id === e.terminId)
    const person = persons.find((p) => p.id === e.pid)
    if (!termin || !person) continue
    out.push({ key: ozTaskKey(e), name: displayName(person), pid: e.pid, label: OZ_DIENST, datum: ozTerminText(e.datum, termin) })
  }
  return out
}

/**
 * Die eigenen Einträge als **Aufgaben** — das Gegenstück zu `deriveMyFsTasks`
 * für das öffentliche Zeugnisgeben. Vergangenes fällt heraus wie dort
 * (`MyTask.at` ist der Kalendertag; die Liste filtert danach). Die Rolle steht
 * kanonisch deutsch (`OZ_DIENST`), übersetzt wird beim Anzeigen — wie bei den
 * Vorträgen auswärts.
 */
export function deriveMyOzTasks(
  termine: readonly OzTermin[],
  eintraege: readonly OzEintrag[],
  personId: string | undefined,
  confirmations: ConfirmationMap,
): MyTask[] {
  if (!personId) return []
  const tasks: MyTask[] = []
  for (const eintrag of eintraege) {
    if (eintrag.pid !== personId) continue
    const termin = termine.find((t) => t.id === eintrag.terminId)
    if (!termin) continue
    tasks.push({
      id: ozTaskKey(eintrag),
      title: '',
      rolle: OZ_DIENST,
      date: ozTerminText(eintrag.datum, termin),
      at: kalendertagMs(fromIso(eintrag.datum)),
      status: ozZusage(eintrag, confirmations),
      s89: null,
    })
  }
  return tasks
}
