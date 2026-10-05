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
import { sentKey, zusageStatus } from './planning'
import {
  neuesterVersand,
  nochNichtGemeldet,
  type EntzogeneZusage,
  type GeaenderteSchicht,
  type OffeneMeldung,
} from './plan-versand'
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
  /**
   * Die Schicht **fällt aus** (`OzTermin.aus`). Sie bleibt in der Liste —
   * Planen und Ansehen zeigen „Fällt aus", sonst fehlte die Woche einfach —,
   * aber ohne Einträge und ohne freien Platz. So zählt sie in keiner Rechnung
   * mit, die nach freien Plätzen oder Eingetragenen fragt: Banner, Karte auf
   * Start, Konflikte, automatisches Besetzen, Eintragen und Zuteilen.
   */
  gestrichen: boolean
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

/** Die Schicht eines Termins an diesem Tag — gestrichen ohne Einträge und ohne Platz. */
function schichtAm(termin: OzTermin, datum: string, eintraege: readonly OzEintrag[]): OzSchicht {
  const montag = montagVon(datum)
  if (termin.aus?.includes(datum)) return { termin, datum, montag, eintraege: [], frei: 0, gestrichen: true }
  const drin = eintraege.filter((e) => e.terminId === termin.id && e.datum === datum)
  return { termin, datum, montag, eintraege: drin, frei: Math.max(0, termin.plaetze - drin.length), gestrichen: false }
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
    for (const termin of termine) out.push(schichtAm(termin, ozDatum(montag, termin.wd), eintraege))
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
  return schichtAm(termin, datum, eintraege)
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
 * Zwei Stände des Zeugnisgebens — vor und nach einer Aktion — und was es
 * braucht, um daraus Nachrichten zu machen. Ein Objekt statt einer langen
 * Reihe gleichartiger Listen: Vertauscht hätte niemand es bemerkt.
 */
export interface OzVergleich {
  vorher: { termine: readonly OzTermin[]; eintraege: readonly OzEintrag[] }
  nachher: { termine: readonly OzTermin[]; eintraege: readonly OzEintrag[] }
  persons: readonly Person[]
  confirmations: ConfirmationMap
  /** Das Versand-Tagebuch — wer zugeteilt wurde und davon schon weiß. */
  sentLog: SentLog
  /** Die eigene Person: Was sie selbst tut, meldet ihr niemand. */
  ausser: string | undefined
}

/**
 * **Weiß die Person von diesem Eintrag?** Selbst eingetragen oder bestätigt —
 * oder zugeteilt, und „Plan senden" hat es ihr gesagt (`sentLog`). Wer
 * zugeteilt, aber noch nicht benachrichtigt ist, weiß nichts; ihm sagt erst
 * „Plan senden" den Stand von dann.
 */
function ozWeissDavon(e: OzEintrag, name: string, confirmations: ConfirmationMap, sentLog: SentLog): boolean {
  const zusage = ozZusage(e, confirmations)
  if (zusage === 'bestätigt') return true
  return zusage === 'offen' && Boolean(sentLog[sentKey(ozTaskKey(e), name)])
}

/**
 * Fällt die Schicht dieses Eintrags weg — gestrichen, auf einen anderen
 * Wochentag gelegt oder ihr Termin gelöscht? Dann geht der Eintrag nicht der
 * Person verloren, sondern der Termin.
 */
function ozSchichtWeg(e: OzEintrag, termine: readonly OzTermin[]): boolean {
  const termin = termine.find((t) => t.id === e.terminId)
  return !termin || Boolean(termin.aus?.includes(e.datum)) || fromIso(e.datum).getDay() !== termin.wd
}

/**
 * Einträge, die weggefallen sind — wer sie hatte, erfährt es sofort
 * (`send-plan`, Aktion „entzug"), wie bei jedem anderen Platz.
 *
 * - **Ein Planer hat ihn entfernt:** gemeldet wird eine **Zusage** — bestätigt
 *   oder selbst eingetragen; wer sich eingetragen hat, plant mit der Schicht
 *   wie jemand, der eine Zuteilung bestätigt hat. Die Nachricht heißt
 *   „Zuteilung zurückgezogen", wie bei den Zusammenkünften.
 * - **Die Schicht fällt aus** (5.10.2026): gestrichen, anderer Wochentag oder
 *   Termin gelöscht. Dann erfährt es jeder, der von seinem Eintrag weiß —
 *   auch wer zugeteilt und benachrichtigt ist, aber noch nicht bestätigt hat:
 *   Er stünde sonst an einem Tag dort, an dem niemand kommt. Die Nachricht
 *   heißt „Schicht fällt aus" (`grund`), mit dem Termin, den er kannte.
 *
 * Nicht gemeldet wird, wer sich selbst austrägt (`ausser`, die eigene Person) —
 * das ist seine Absage, keine Wegnahme —, was vorbei ist, und wer nicht mehr in
 * der Personenliste steht: Eine gelöschte Person hat niemanden mehr, dem man
 * etwas sagen könnte.
 */
export function ozEntzogeneZusagen(v: OzVergleich, heute = new Date()): EntzogeneZusage[] {
  if (v.vorher.eintraege === v.nachher.eintraege) return []
  const confirmations = v.confirmations ?? {}
  const bleibt = new Set(v.nachher.eintraege.map((e) => e.id))
  const out: EntzogeneZusage[] = []
  for (const e of v.vorher.eintraege) {
    if (bleibt.has(e.id) || e.pid === v.ausser || ozVorbei(e, heute)) continue
    const termin = v.vorher.termine.find((t) => t.id === e.terminId)
    const person = v.persons.find((p) => p.id === e.pid)
    if (!termin || !person) continue
    const name = displayName(person)
    const ausfall = ozSchichtWeg(e, v.nachher.termine)
    const melden = ausfall ? ozWeissDavon(e, name, confirmations, v.sentLog ?? {}) : ozZusage(e, confirmations) === 'bestätigt'
    if (!melden) continue
    out.push({
      key: ozTaskKey(e),
      name,
      pid: e.pid,
      label: OZ_DIENST,
      datum: ozTerminText(e.datum, termin),
      ...(ausfall ? { grund: 'ausfall' as const } : {}),
    })
  }
  return out
}

/**
 * **Schichten, deren Uhrzeit oder Ort sich geändert hat** (5.10.2026) — wer
 * dort eingetragen ist und davon weiß, erfährt den neuen Termin
 * (`send-plan`, Aktion „zeugnis-geaendert").
 *
 * Gefragt wird je Termin, der in beiden Ständen steht und denselben Wochentag
 * hat: Ein anderer Wochentag nimmt die kommenden Einträge mit, und die meldet
 * `ozEntzogeneZusagen` als Ausfall. Gemeldet werden die kommenden Einträge,
 * die nach der Änderung noch gelten — der heutige auch: Wer heute Nachmittag
 * dort steht, braucht die neue Uhrzeit am dringendsten.
 */
export function ozGeaenderteSchichten(v: OzVergleich, heute = new Date()): GeaenderteSchicht[] {
  if (v.vorher.termine === v.nachher.termine) return []
  const confirmations = v.confirmations ?? {}
  const out: GeaenderteSchicht[] = []
  for (const neu of v.nachher.termine) {
    const alt = v.vorher.termine.find((t) => t.id === neu.id)
    if (!alt || alt.wd !== neu.wd) continue
    if (alt.von === neu.von && alt.bis === neu.bis && alt.ort === neu.ort) continue
    for (const e of v.nachher.eintraege) {
      if (e.terminId !== neu.id || e.pid === v.ausser || ozVorbei(e, heute) || !ozEintragGilt(e, neu, heute)) continue
      const person = v.persons.find((p) => p.id === e.pid)
      if (!person) continue
      const name = displayName(person)
      if (!ozWeissDavon(e, name, confirmations, v.sentLog ?? {})) continue
      out.push({ key: ozTaskKey(e), name, pid: e.pid, label: OZ_DIENST, datum: ozTerminText(e.datum, neu) })
    }
  }
  return out
}

/**
 * **Steht ein Eintrag noch im Plan?** Gefragt von „Meine Aufgaben" und von der
 * Zeitleiste im Personen-Detail — beide zeigen dieselben Einträge.
 *
 * Nicht mehr, wenn sein Termin fehlt oder die Schicht gestrichen ist: Ihre
 * Einträge räumt die Datenbank ab (`oz_ausfall_raeumen`); bis zum nächsten
 * Laden steht hier womöglich noch einer, den der Planer nicht kannte. Ebenso
 * ein kommender Eintrag an einem anderen Wochentag als dem seines Termins: Er
 * stammt aus der Zeit vor einem Wechsel des Wochentags, den die App des Planers
 * nicht ganz abräumen konnte (`oz_tagwechsel_raeumen`). Heute bleibt, wie beim
 * Wechsel selbst (`ozWegBeiTagwechsel`).
 */
export function ozEintragGilt(
  eintrag: OzEintrag,
  termin: OzTermin | undefined,
  heute = new Date(),
): termin is OzTermin {
  if (!termin || termin.aus?.includes(eintrag.datum)) return false
  return fromIso(eintrag.datum).getDay() === termin.wd || eintrag.datum <= isoDay(heute)
}

/**
 * Die eigenen Einträge als **Aufgaben** — das Gegenstück zu `deriveMyFsTasks`
 * für das öffentliche Zeugnisgeben. Vergangenes fällt heraus wie dort
 * (`MyTask.at` ist der Kalendertag; die Liste filtert danach). Die Rolle steht
 * kanonisch deutsch (`OZ_DIENST`), übersetzt wird beim Anzeigen.
 */
export function deriveMyOzTasks(
  termine: readonly OzTermin[],
  eintraege: readonly OzEintrag[],
  personId: string | undefined,
  confirmations: ConfirmationMap,
  heute = new Date(),
): MyTask[] {
  if (!personId) return []
  const tasks: MyTask[] = []
  for (const eintrag of eintraege) {
    if (eintrag.pid !== personId) continue
    const termin = termine.find((t) => t.id === eintrag.terminId)
    if (!ozEintragGilt(eintrag, termin, heute)) continue
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
