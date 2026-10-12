/**
 * **Vortragsplan aus dem Planungsprogramm** (T122) — reine Logik.
 *
 * Die öffentlichen Vorträge plant der Vortragskoordinator in einem eigenen
 * Programm, oft Monate voraus. Die App übernimmt daraus je Woche Redner,
 * Versammlung, Thema und Lied — mehr nicht: Von auswärtigen Rednern dürfen nur
 * Name und Versammlung in die Cloud (Vorgabe des Betreibers, 12.10.2026); ihre
 * Kontaktdaten bleiben im Planungsprogramm. Gelesen wird die Datei auf dem
 * Gerät (`lib/vortragsplan-xml.ts`), hier kommt nur noch an, was erlaubt ist.
 *
 * Eine Woche gibt es in der App erst, wenn ihr Programm von jw.org geholt ist —
 * meist wenige Wochen voraus. Ein Vortrag für eine spätere Woche wird deshalb
 * **vorgemerkt** (Tabelle `vortraege`) und eingetragen, sobald die Woche
 * angelegt wird (`vortragInNeueWoche`, aus `neueWocheEinordnen`) — derselbe Weg
 * wie bei den Gruppenbesuchen.
 *
 * In eine angelegte Woche schreibt der Import unmittelbar: den Platz des
 * Redners, das Thema und das Anfangslied. Danach ist es eine Zuteilung wie jede
 * andere — Programm, Druck, Aufgabe, Zusage und Erinnerung eines eigenen
 * Redners laufen ohne eine Zeile mehr. Das Planungsprogramm ist führend: Ein
 * erneuter Import überschreibt, was in der App am Vortrag geändert wurde, und
 * was in seinem Zeitraum nicht mehr in der Datei steht, entfällt (Entscheidung
 * des Betreibers, 12.10.2026).
 */

import {
  displayName,
  eindeutigeNamen,
  herkunftVon,
  istArt,
  istAusgefallen,
  isSong,
  namensSchluessel,
  rolleBasis,
  ROLE_GUEST_SPEAKER,
  ROLE_OWN_SPEAKER,
} from './helpers'
import { isoDay, meetingDate, montagVon, tagNach, versatzAbMontag } from './meeting-dates'
import { editTalkTheme, openingSongNr, setOpeningSong, TALK_PLACEHOLDER } from './meeting-edit'
import { assignSlot } from './planning'
import type { MeetingTimes, PartItem, PartSlotSelection, Person, Week } from './types'

/** Was am Vortragsplatz einer Woche steht — so, wie der Import es setzt. */
export interface Vortrag {
  redner: string
  /** Heimatversammlung des Gastredners; leer beim eigenen Redner. */
  versammlung: string
  /** Redner der eigenen Versammlung (Rolle „Redner"), sonst Gastredner. */
  eigener: boolean
  /** Seine Person — nur, wenn sie über den Namen eindeutig zu finden war. */
  pid?: string
  /** Leer = kein Thema (in der Woche steht dann der Platzhalter). */
  thema: string
  /** Liednummer in Ziffern, leer = keins. */
  lied: string
}

/** Ein Vortrag, wie ihn die Datei nennt: dazu sein Tag, noch ohne Person. */
export interface PlanVortrag extends Omit<Vortrag, 'pid'> {
  /** Tag des Vortrags (ISO) — er bestimmt die Woche. */
  datum: string
}

/**
 * Der gelesene Plan. `von`/`bis` ist der Zeitraum, den die Datei abdeckt
 * (ISO, beide leer bei einer Datei ohne Vorträge und ohne Angabe): Was darin
 * in der App steht, aber nicht in der Datei, entfällt — gemessen am Tag der
 * Zusammenkunft, nicht an der Woche.
 */
export interface Vortragsplan {
  von: string
  bis: string
  vortraege: PlanVortrag[]
  /**
   * Wochen (Montage), zu denen die Datei etwas sagen wollte, das nicht lesbar
   * war — zwei Vorträge, ein fehlender Redner. Sie bleiben, wie sie sind: Ein
   * Fehler in der Datei ist keine Absage.
   */
  fehlerWochen?: string[]
}

/** Ein Vortrag für eine Woche, die noch nicht angelegt ist (Tabelle `vortraege`). */
export interface VorgemerkterVortrag extends Omit<Vortrag, 'pid'> {
  /** Kennung, vom Client vergeben (`v<uuid>`). */
  id: string
  /** Montag der Woche (ISO) — wie `Week.start`. */
  woche: string
  /**
   * Der eigene Redner; `null`, wenn seine Person nicht zu finden war oder
   * gelöscht wurde — dann zählt der Name. Wie `Gruppenbesuch.pid` und die
   * Spalte `person_id` (`on delete set null`).
   */
  pid: string | null
}

/** Der leere Vortragsplatz: so, wie ihn der Import von jw.org anlegt. */
const LEER: Vortrag = { redner: '', versammlung: '', eigener: false, thema: '', lied: '' }

/** Abschnitt und Punkt des öffentlichen Vortrags — `null`, wenn die Woche keinen hat. */
export function vortragsPlatz(week: Week): { si: number; ii: number } | null {
  const si = week.we.sections.findIndex((s) => istArt(s, 'vortrag'))
  const ii = week.we.sections[si]?.items.findIndex((it) => !isSong(it)) ?? -1
  return si >= 0 && ii >= 0 ? { si, ii } : null
}

/** Was in einer angelegten Woche am Vortragsplatz steht — `null` ohne Platz. */
export function vortragDerWoche(week: Week): Vortrag | null {
  const platz = vortragsPlatz(week)
  if (!platz) return null
  const item = week.we.sections[platz.si]?.items[platz.ii] as PartItem
  const slot = item.names[0]
  const eigener = rolleBasis(slot?.rolle) === ROLE_OWN_SPEAKER
  return {
    redner: slot?.name ?? '',
    versammlung: eigener ? '' : herkunftVon(slot),
    eigener,
    ...(slot?.pid ? { pid: slot.pid } : {}),
    thema: item.title === TALK_PLACEHOLDER ? '' : item.title,
    lied: openingSongNr(week.we),
  }
}

/**
 * Die Person eines eigenen Redners — nur, wenn genau eine so heißt. Verglichen
 * wird wie bei der Eindeutigkeit der Namen (T110): ohne Groß-/Kleinschreibung
 * und doppelte Leerzeichen.
 */
export function rednerPerson(name: string, persons: readonly Person[]): Person | undefined {
  const schluessel = namensSchluessel({ fn: name, ln: '' })
  const id = schluessel ? eindeutigeNamen(persons, namensSchluessel).get(schluessel) : undefined
  return id ? persons.find((p) => p.id === id) : undefined
}

/**
 * Ein Vortrag, wie er in die App kommt: der eigene Redner mit seiner Person und
 * deren Namen, der Gastredner mit seiner Versammlung. Findet sich die Person
 * nicht, bleibt der Name aus der Datei stehen — ohne Aufgabe und Erinnerung;
 * die Vorschau sagt es (`ohnePerson`).
 */
export function alsVortrag(v: Omit<Vortrag, 'pid'> & { pid?: string | null }, persons: readonly Person[]): Vortrag {
  const { redner, versammlung, eigener, thema, lied } = v
  if (!eigener) return { redner, versammlung, eigener, thema, lied }
  const person = persons.find((p) => p.id === v.pid) ?? rednerPerson(redner, persons)
  return person
    ? { redner: displayName(person), versammlung: '', eigener, pid: person.id, thema, lied }
    : { redner, versammlung: '', eigener, thema, lied }
}

/** Eigener Redner, dessen Person sich nicht finden ließ. */
export function personFehlt(v: Vortrag | null): boolean {
  return Boolean(v?.eigener && v.redner && !v.pid)
}

function istLeer(v: Vortrag | null): boolean {
  return !v || (!v.redner && !v.thema && !v.lied)
}

function gleich(a: Vortrag, b: Vortrag): boolean {
  return (
    a.redner === b.redner &&
    a.versammlung === b.versammlung &&
    a.eigener === b.eigener &&
    (a.pid ?? '') === (b.pid ?? '') &&
    a.thema === b.thema &&
    a.lied === b.lied
  )
}

/** Warum eine angelegte Woche nicht angefasst wird. */
export type Uebersprungen = 'kreisaufseher' | 'kongress' | 'gedaechtnismahl' | 'ausfall' | 'keinPlatz'

/**
 * Wochen, deren Vortrag nicht aus dem Planungsprogramm kommt: Beim
 * Kreisaufseher hält er ihn; Kongress, Gedächtnismahl am Wochenende oder ein
 * Ausfall lassen die Zusammenkunft entfallen. Dieselbe Grenze wie beim
 * NWS-Import — was der Planer selbst entschieden hat, bleibt.
 */
export function uebersprungen(week: Week): Uebersprungen | null {
  if (week.anlass?.art === 'co') return 'kreisaufseher'
  if (week.anlass?.art === 'kongress') return 'kongress'
  if (week.memCancel === 'we') return 'gedaechtnismahl'
  if (istAusgefallen(week, 'we')) return 'ausfall'
  if (!vortragsPlatz(week)) return 'keinPlatz'
  return null
}

export type Vorschauart = 'neu' | 'geaendert' | 'unveraendert' | 'entfaellt' | 'uebersprungen'

/** Eine Woche der Vorschau. */
export interface VorschauZeile {
  /** Montag der Woche (ISO). */
  woche: string
  /** Tag der Zusammenkunft am Wochenende (ISO) — auch für Wochen, die es noch nicht gibt. */
  tag: string
  art: Vorschauart
  /** Die Woche ist angelegt — sonst wird der Vortrag vorgemerkt. */
  angelegt: boolean
  /** Was jetzt dasteht (in der Woche oder als Vormerkung). */
  vorher: Vortrag | null
  /** Was der Import setzt — `null`, wenn der Vortrag entfällt. */
  nachher: Vortrag | null
  grund?: Uebersprungen
}

export interface Vorschau {
  /** Nach Woche sortiert. */
  zeilen: VorschauZeile[]
  /** Vorträge, deren Tag vorbei ist: Die Datei darf sie enthalten, angefasst wird nichts. */
  vergangen: number
}

/** Der Kontext, gegen den ein Plan gelesen wird. */
export interface VorschauKontext {
  weeks: readonly Week[]
  vormerkungen: readonly VorgemerkterVortrag[]
  persons: readonly Person[]
  /** Die Zusammenkunftszeiten der Versammlung — sie geben den Tag jeder Woche. */
  zeiten: MeetingTimes
  heute?: Date
}

/**
 * **Was der Import täte** — Woche für Woche, ab der laufenden.
 *
 * Eine Funktion für die Vorschau und das Übernehmen: Der Reducer rechnet sie
 * beim Übernehmen mit dem dann gültigen Stand neu, statt einer Vorschau zu
 * folgen, die ein anderer Planer inzwischen überholt haben kann.
 */
export function vortragsplanVorschau(plan: Vortragsplan, k: VorschauKontext): Vorschau {
  const heute = isoDay(k.heute ?? new Date())
  const ausDatei = new Map(plan.vortraege.map((v) => [montagVon(v.datum), v]))
  const angelegt = new Map(k.weeks.map((w) => [w.start, w]))
  const vorgemerkt = new Map(k.vormerkungen.map((m) => [m.woche, m]))
  const fehlerhaft = new Set(plan.fehlerWochen ?? [])
  // An diesem Tag hängen Zeitraum und „vorbei" — nicht am Montag: Eine Datei bis
  // zum 30.11. (ein Montag) sagt nichts über den Vortrag am 6.12., obwohl beide
  // in derselben Woche liegen.
  const tagDer = (woche: string): string => {
    const week = angelegt.get(woche)
    return week ? isoDay(meetingDate(week, 'we', k.zeiten)) : tagNach(woche, versatzAbMontag(k.zeiten.we.wd))
  }
  const wochen = new Set(ausDatei.keys())
  if (plan.von && plan.bis) {
    for (const woche of [...angelegt.keys(), ...vorgemerkt.keys()]) {
      const tag = tagDer(woche)
      if (tag >= plan.von && tag <= plan.bis && !fehlerhaft.has(woche)) wochen.add(woche)
    }
  }

  const zeilen: VorschauZeile[] = []
  let vergangen = 0
  for (const woche of [...wochen].sort()) {
    const tag = tagDer(woche)
    const neu = ausDatei.get(woche)
    if (tag < heute) {
      if (neu) vergangen++
      continue
    }
    const nachher = neu ? alsVortrag(neu, k.persons) : null
    const week = angelegt.get(woche)
    if (week) {
      const grund = uebersprungen(week)
      if (grund) {
        // Gemeldet wird nur, was die Datei hier wollte — sonst ist nichts zu sagen.
        if (nachher) zeilen.push({ woche, tag, art: 'uebersprungen', angelegt: true, vorher: null, nachher, grund })
        continue
      }
      const zeile = vergleich(woche, tag, true, vortragDerWoche(week), nachher)
      if (zeile) zeilen.push(zeile)
    } else {
      const m = vorgemerkt.get(woche)
      const zeile = vergleich(woche, tag, false, m ? ohneKennung(m) : null, nachher)
      if (zeile) zeilen.push(zeile)
    }
  }
  return { zeilen, vergangen }
}

/** Die Vormerkung als Vortrag — so lässt sie sich mit der Datei vergleichen. */
function ohneKennung(m: VorgemerkterVortrag): Vortrag {
  const { id: _id, woche: _woche, pid, ...vortrag } = m
  return pid ? { ...vortrag, pid } : vortrag
}

function vergleich(
  woche: string,
  tag: string,
  angelegt: boolean,
  vorher: Vortrag | null,
  nachher: Vortrag | null,
): VorschauZeile | null {
  const alt = istLeer(vorher) ? null : vorher
  if (!alt && !nachher) return null
  const art: Vorschauart = !alt ? 'neu' : !nachher ? 'entfaellt' : gleich(alt, nachher) ? 'unveraendert' : 'geaendert'
  return { woche, tag, art, angelegt, vorher: alt, nachher }
}

/** Gibt es beim Übernehmen etwas zu tun? */
export function hatAenderungen(vorschau: Vorschau): boolean {
  return vorschau.zeilen.some((z) => z.art === 'neu' || z.art === 'geaendert' || z.art === 'entfaellt')
}

/**
 * Einen Vortrag in eine angelegte Woche schreiben: Redner, Thema, Anfangslied.
 *
 * Über dieselben Funktionen wie das Zuteilungsblatt und die Felder im
 * Programm (`assignSlot`, `editTalkTheme`, `setOpeningSong`) — so bleibt jede
 * ihrer Regeln gültig, und die Grenze des Planers (`zuteilen-grenze.ts`) lässt
 * genau das durch. Ohne Änderung dieselbe Referenz.
 */
export function vortragSetzen(weeks: Week[], wi: number, v: Vortrag): Week[] {
  const week = weeks[wi]
  const platz = week ? vortragsPlatz(week) : null
  if (!platz) return weeks
  const sel: PartSlotSelection = {
    kind: 'part',
    wi,
    tab: 'we',
    si: platz.si,
    ii: platz.ii,
    ni: 0,
    label: '',
    priv: 'vortrag',
    groups: false,
  }
  // Der Platz nur, wenn sich an ihm etwas ändert: `assignSlot` klont die Woche
  // in jedem Fall, und ein gleicher, aber neuer Klon löste ein Schreiben aus.
  const slot = (week?.we.sections[platz.si]?.items[platz.ii] as PartItem | undefined)?.names[0]
  const rolle = v.eigener ? ROLE_OWN_SPEAKER : ROLE_GUEST_SPEAKER
  const herkunft = v.eigener ? '' : v.versammlung
  let next = weeks
  if (
    (slot?.name ?? '') !== v.redner ||
    rolleBasis(slot?.rolle) !== rolle ||
    herkunftVon(slot) !== herkunft ||
    (slot?.pid ?? '') !== (v.pid ?? '')
  ) {
    next = assignSlot(next, sel, v.redner, rolle, v.pid, herkunft)
  }
  next = editTalkTheme(next, wi, platz.si, platz.ii, v.thema)
  return setOpeningSong(next, wi, v.lied)
}

/**
 * **Den Plan übernehmen** — die Wochen und die Vormerkungen nach der Vorschau.
 *
 * Nebenbei verschwinden Vormerkungen, die niemand mehr braucht: für Wochen, die
 * inzwischen angelegt sind (dort steht der Vortrag schon), und für vergangene.
 * Es bleibt nichts liegen, was die App nicht braucht.
 */
export function vortragsplanAnwenden(args: {
  vorschau: Vorschau
  weeks: Week[]
  vormerkungen: VorgemerkterVortrag[]
  neueId: () => string
  heute?: Date
}): { weeks: Week[]; vormerkungen: VorgemerkterVortrag[]; geaendert: number[] } {
  const ab = montagVon(isoDay(args.heute ?? new Date()))
  // Die Wochen behalten ihre Stelle — nur ihr Inhalt wird ersetzt.
  const stelle = new Map(args.weeks.map((w, wi) => [w.start, wi]))
  let weeks = args.weeks
  let vormerkungen = [...args.vormerkungen]
  const geaendert: number[] = []
  for (const z of args.vorschau.zeilen) {
    if (z.art === 'unveraendert' || z.art === 'uebersprungen') continue
    if (z.angelegt) {
      const wi = stelle.get(z.woche)
      if (wi === undefined) continue
      const next = vortragSetzen(weeks, wi, z.nachher ?? LEER)
      if (next !== weeks) geaendert.push(wi)
      weeks = next
      continue
    }
    const i = vormerkungen.findIndex((m) => m.woche === z.woche)
    const alt = vormerkungen[i]
    if (!z.nachher) {
      if (alt) vormerkungen.splice(i, 1)
    } else {
      const vortrag = { ...z.nachher, pid: z.nachher.pid ?? null, woche: z.woche }
      if (alt) vormerkungen[i] = { ...vortrag, id: alt.id }
      else vormerkungen.push({ ...vortrag, id: args.neueId() })
    }
  }
  vormerkungen = vormerkungen
    .filter((m) => m.woche >= ab && !stelle.has(m.woche))
    .sort((a, b) => a.woche.localeCompare(b.woche))
  // Nichts geändert: dieselbe Liste — sonst sähe persist.ts eine Änderung.
  const unveraendert =
    vormerkungen.length === args.vormerkungen.length && vormerkungen.every((m, i) => m === args.vormerkungen[i])
  return { weeks, vormerkungen: unveraendert ? args.vormerkungen : vormerkungen, geaendert }
}

/**
 * Den vorgemerkten Vortrag einer frisch angelegten Woche eintragen (aus
 * `neueWocheEinordnen`). Eine Woche, die übersprungen würde — beim Anlegen
 * kann das nur das Gedächtnismahl am Wochenende sein —, bleibt, wie sie ist.
 * Der eigene Redner wird erneut über seine Person gebunden: Sie kann seit dem
 * Import gelöscht oder umbenannt worden sein. Ohne Vormerkung dieselbe Woche.
 */
export function vortragInNeueWoche(
  week: Week,
  vormerkungen: readonly VorgemerkterVortrag[],
  persons: readonly Person[],
): Week {
  const m = vormerkungen.find((x) => x.woche === week.start)
  if (!m || uebersprungen(week)) return week
  return vortragSetzen([week], 0, alsVortrag(m, persons))[0] ?? week
}
