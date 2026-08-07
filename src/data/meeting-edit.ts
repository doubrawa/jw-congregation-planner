/**
 * Bearbeitung der Programme im Planen-Screen: „Unser Leben als Christ"
 * (Minuten, Reihenfolge, eigene Punkte) und die Wochenend-Zusammenkunft
 * (Vortragsthema, Anfangslied).
 *
 * Alle Funktionen sind pur (Eingaben bleiben unverändert). Jede Änderung wird
 * in die Sprachvarianten der Woche (Week.alt) gespiegelt — sonst fiele die
 * Anzeige der Variante nach einem Edit auf die kanonische Sprache zurück
 * (localizedWeek prüft die Struktur).
 */

import { angleichen, hatAuxKlasse } from './aux-class'
import { LABEL_EROEFFNUNG } from './constants'
import { isSong } from './helpers'
import { meetingDateParts, meetingTimesOf } from './meeting-dates'
import type { Meeting, MeetingKey, PartItem, Week } from './types'

const MIN_RE = /(\d+) Min\./

/** Minuten aus einer Meta-Zeile lesen ("Besprechung · 15 Min." → 15). */
export function itemMinutes(item: PartItem): number | null {
  const match = MIN_RE.exec(item.meta ?? '')
  return match ? Number(match[1]) : null
}

/**
 * Regeldauer einer Zusammenkunft in Minuten (1 Stunde 45).
 *
 * Bewusst eine Konstante und keine Summe der `X Min.`-Angaben: das Arbeitsheft
 * beziffert nur die Programmpunkte. Lieder, Gebete und Übergänge stehen dort
 * ohne Minuten, ihre rund 17 Minuten fehlten also in jeder Summe. Beide
 * Zusammenkünfte dauern regulär 1:45 — genau das kodierten auch die früher
 * fest eingetragenen Endzeiten (19:00 → 20:45, 10:00 → 11:45).
 *
 * Weicht das Programm ab, verschiebt `shiftEnd` die Endzeit mit: der Planer
 * ändert LAC-Minuten, das Ende folgt.
 */
export const MEETING_MINUTES = 105

/**
 * Endzeit-Zeile aus der Startzeit: „19:00" → „Ende ca. 20:45".
 *
 * Der Import trug hier feste Werte ein, unabhängig von den gepflegten
 * Zusammenkunftszeiten — beginnt die Versammlung um 18:30, stand auf jedem
 * Programmblatt eine falsche Endzeit. Ohne hinterlegte Startzeit gibt es
 * nichts zu rechnen; dann bleibt, was der Import mitgebracht hat.
 */
export function endeAusStartzeit(startZeit: string, fallback: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(startZeit)
  if (!m) return fallback
  return shiftEnd(`Ende ca. ${startZeit}`, MEETING_MINUTES)
}

/** Minuten seit Mitternacht aus „19:00" — `null`, wenn da keine Uhrzeit steht. */
function minuten(zeit: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(zeit)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

/**
 * Zieht die Endzeiten aller Wochen nach, wenn die Versammlung ihre
 * Zusammenkunftszeit ändert.
 *
 * `end` steht in den Wochendaten und wurde bisher nur beim Import gerechnet.
 * Die **Start**zeit dagegen holt `meetingTime()` bei jeder Anzeige frisch aus
 * den Einstellungen. Stellte die Versammlung von 19:00 auf 18:30 um, zeigte der
 * Programmkopf sofort 18:30 und die Fußzeile weiter „Ende ca. 20:45" — eine
 * Zusammenkunft von 2:15 auf dem Blatt.
 *
 * Verschoben statt neu gerechnet: `lacAdjust` hat die Endzeit womöglich schon
 * um geänderte Programmminuten versetzt (`shiftEnd`), und diese Anpassung des
 * Planers darf eine Zeitumstellung nicht verwerfen.
 *
 * Übersprungen werden Wochen, die im `date`-Feld eine eigene Uhrzeit tragen —
 * und zwar nach derselben Regel, nach der `meetingTime()` die **Start**zeit
 * bestimmt: steht dort eine, gilt sie und die Einstellungen bleiben außen vor.
 * Deren Anfang bewegt sich also nicht, folglich auch ihr Ende nicht. Das
 * betrifft Sondertermine (Gedächtnismahl) ebenso wie Demo- und Altwochen, die
 * ihren Termin ausgeschrieben mitbringen. Übrig bleiben die importierten
 * Wochen: die tragen die Überschrift der jw.org-Seite („7.–13. September"),
 * ihre Startzeit kommt aus den Einstellungen — und genau dort klaffte es.
 */
export function endenNachziehen(weeks: Week[], alt: string, neu: string): Week[] {
  const alteZeit = meetingTimesOf(alt)
  const neueZeit = meetingTimesOf(neu)
  // `meetingTimesOf` liest die Uhrzeiten der Stellung nach: die erste gehört
  // zur Wochenmitte, die zweite zum Wochenende. Fehlt in einem der beiden
  // Texte eine, rutscht die Zuordnung — aus „Di abends · So 10:00" würde für
  // die Wochenmitte 10:00, und die Verschiebung wäre um Stunden daneben.
  // Dann lieber gar nichts anfassen.
  const delta: Record<MeetingKey, number> = { mid: 0, we: 0 }
  for (const tab of ['mid', 'we'] as const) {
    const a = minuten(alteZeit[tab])
    const n = minuten(neueZeit[tab])
    if (a === null || n === null) return weeks
    delta[tab] = n - a
  }
  if (delta.mid === 0 && delta.we === 0) return weeks

  let geaendert = false
  const next = weeks.map((week) => {
    if (week.stub) return week
    const kopie = { ...week }
    for (const tab of ['mid', 'we'] as const) {
      if (delta[tab] === 0) continue
      if (meetingDateParts(week[tab].date).zeit !== undefined) continue
      const ende = shiftEnd(week[tab].end, delta[tab])
      if (ende === week[tab].end) continue
      kopie[tab] = { ...week[tab], end: ende }
      geaendert = true
    }
    return kopie
  })
  return geaendert ? next : weeks
}

/** Verschiebt "Ende ca. 20:45" um `delta` Minuten (mod 24 h). */
export function shiftEnd(endStr: string, delta: number): string {
  const match = /(\d+):(\d+)/.exec(endStr)
  if (!match) return endStr
  let t = Number(match[1]) * 60 + Number(match[2]) + delta
  t = ((t % 1440) + 1440) % 1440
  const hh = Math.floor(t / 60)
  const mm = String(t % 60).padStart(2, '0')
  return endStr.replace(/\d+:\d+/, `${hh}:${mm}`)
}

/** Indizes der verschiebbaren (Nicht-Lied-)Items einer Sektion. */
function movableIndices(items: Meeting['sections'][number]['items']): number[] {
  return items.map((x, i) => (isSong(x) ? -1 : i)).filter((i) => i >= 0)
}

/** Spiegelt Änderungen in die Sprachvarianten der Woche (Week.alt). */
function forEachAltMeeting(week: Week, tab: MeetingKey, fn: (meeting: Meeting) => void): void {
  for (const variant of Object.values(week.alt ?? {})) {
    const meeting = variant[tab]
    if (meeting) fn(meeting)
  }
}

/* ---- „Unser Leben als Christ" -------------------------------------------- */

/** Minuten eines LAC-Punkts ändern (5..45) und Meeting-Ende nachziehen. */
export function lacAdjust(
  weeks: Week[],
  wi: number,
  tab: MeetingKey,
  si: number,
  ii: number,
  delta: number,
): Week[] {
  const next = structuredClone(weeks)
  const meeting = next[wi][tab]
  const item = meeting.sections[si].items[ii]
  if (isSong(item)) return weeks
  const cur = itemMinutes(item)
  if (cur == null) return weeks
  const target = Math.max(5, Math.min(45, cur + delta))
  if (target === cur) return weeks
  item.meta = (item.meta ?? '').replace(MIN_RE, `${target} Min.`)
  meeting.end = shiftEnd(meeting.end, target - cur)
  forEachAltMeeting(next[wi], tab, (m) => {
    const vi = m.sections[si]?.items[ii]
    // Lokalisierte Meta ("15 min.", "15 分" …): erste Zahl ersetzen
    if (vi && !isSong(vi)) vi.meta = (vi.meta ?? '').replace(/\d+/, String(target))
    m.end = shiftEnd(m.end, target - cur)
  })
  return next
}

/** LAC-Punkt entfernen und Meeting-Ende um dessen Minuten kürzen. */
export function lacRemove(
  weeks: Week[],
  wi: number,
  tab: MeetingKey,
  si: number,
  ii: number,
): Week[] {
  const next = structuredClone(weeks)
  const meeting = next[wi][tab]
  const item = meeting.sections[si].items[ii]
  const mins = isSong(item) ? null : itemMinutes(item)
  meeting.sections[si].items.splice(ii, 1)
  if (mins != null) meeting.end = shiftEnd(meeting.end, -mins)
  forEachAltMeeting(next[wi], tab, (m) => {
    m.sections[si]?.items.splice(ii, 1)
    if (mins != null) m.end = shiftEnd(m.end, -mins)
  })
  return next
}

/**
 * Item-Index, mit dem der LAC-Punkt `ii` beim Verschieben in Richtung `dir`
 * tauscht — oder null, wenn kein Tausch möglich ist (Rand). Der Reducer nutzt
 * das, um die Bestätigungen der beiden Positionen mitzutauschen (task_keys sind
 * positionsbasiert), damit der Status beim Programmpunkt bleibt.
 */
export function lacMoveTarget(
  items: Meeting['sections'][number]['items'],
  ii: number,
  dir: -1 | 1,
): number | null {
  const movables = movableIndices(items)
  const pos = movables.indexOf(ii)
  const tpos = pos + dir
  if (pos < 0 || tpos < 0 || tpos >= movables.length) return null
  return movables[tpos]
}

/** Zahl der Namens-Slots eines Items (0 für Lieder). */
export function itemNameCount(item: Meeting['sections'][number]['items'][number]): number {
  return isSong(item) ? 0 : item.names.length
}

/**
 * LAC-Punkt um eine Position verschieben (nur Nicht-Lied-Items tauschen).
 * Die laufenden Nummern bleiben positionsfest.
 */
export function lacMove(
  weeks: Week[],
  wi: number,
  tab: MeetingKey,
  si: number,
  ii: number,
  dir: -1 | 1,
): Week[] {
  const next = structuredClone(weeks)
  const items = next[wi][tab].sections[si].items
  const movables = movableIndices(items)
  const pos = movables.indexOf(ii)
  const tpos = pos + dir
  if (pos < 0 || tpos < 0 || tpos >= movables.length) return weeks
  const a = movables[pos]
  const b = movables[tpos]
  swapKeepNums(items, a, b)
  forEachAltMeeting(next[wi], tab, (m) => {
    const arr = m.sections[si]?.items
    if (arr) swapKeepNums(arr, a, b)
  })
  return next
}

/** Zwei Items tauschen; die laufenden Nummern bleiben positionsfest. */
function swapKeepNums(items: Meeting['sections'][number]['items'], a: number, b: number): void {
  if (a >= items.length || b >= items.length) return
  const movables = movableIndices(items)
  const nums = movables.map((i) => {
    const it = items[i]
    return isSong(it) ? undefined : it.num
  })
  const tmp = items[a]
  items[a] = items[b]
  items[b] = tmp
  movables.forEach((i, k) => {
    const it = items[i]
    if (!isSong(it)) it.num = nums[k]
  })
}

/**
 * Position, an der ein neuer LAC-Punkt landet: vor dem
 * Versammlungsbibelstudium, sonst am Ende. Getrennt exportiert, weil der
 * Reducer sie kennen muss — ab dort rutschen alle Bestätigungen eine Position
 * weiter (task_keys sind positionsbasiert).
 */
export function lacAddIndex(items: Meeting['sections'][number]['items']): number {
  const vbsIdx = items.findIndex(
    (x) => !isSong(x) && x.title.startsWith('Versammlungsbibelstudium'),
  )
  return vbsIdx >= 0 ? vbsIdx : items.length
}

/**
 * Neuen LAC-Punkt (10 Min.) vor dem Versammlungsbibelstudium einfügen und
 * Meeting-Ende um 10 Min. verlängern. Leerer Titel → keine Änderung.
 */
export function lacAdd(
  weeks: Week[],
  wi: number,
  tab: MeetingKey,
  si: number,
  title: string,
): Week[] {
  const trimmed = title.trim()
  if (!trimmed) return weeks
  const next = structuredClone(weeks)
  const meeting = next[wi][tab]
  const items = meeting.sections[si].items
  // Ein eigener Punkt unter „Unser Leben als Christ" ist kein öffentlicher
  // Vortrag — der Bereich blieb hier fälschlich auf 'vortrag' stehen (F6).
  const newItem: PartItem = { title: trimmed, meta: '10 Min.', names: [{ name: '', bereichsKey: 'studium' }] }
  const at = lacAddIndex(items)
  items.splice(at, 0, newItem)
  meeting.end = shiftEnd(meeting.end, 10)
  // Eigener Punkt ist lokaler Text — in allen Varianten identisch einfügen
  forEachAltMeeting(next[wi], tab, (m) => {
    const arr = m.sections[si]?.items
    if (arr) arr.splice(Math.min(at, arr.length), 0, { title: trimmed, meta: '10 Min.', names: [] })
    m.end = shiftEnd(m.end, 10)
  })
  return next
}

/**
 * Gesprächspartner-Slot eines Schülerteils an-/abschalten. Ist bereits ein
 * schulungPartner-Slot vorhanden, wird er entfernt, sonst hinzugefügt. Nur am
 * Primär-Meeting — die Sprachvarianten tragen keine Zuteilungen.
 */
export function togglePartner(weeks: Week[], wi: number, tab: MeetingKey, si: number, ii: number): Week[] {
  const next = structuredClone(weeks)
  const meeting = next[wi][tab]
  const item = meeting.sections[si]?.items[ii]
  if (!item || isSong(item)) return weeks
  const idx = item.names.findIndex((n) => n.bereichsKey === 'schulungPartner')
  if (idx >= 0) item.names.splice(idx, 1)
  else item.names.push({ name: '', rolle: 'Gesprächspartner', bereichsKey: 'schulungPartner' })
  // Die Zusätzliche Klasse mitziehen: sonst hat der Hauptsaal zwei Plätze und
  // die Klasse einen — bis irgendwann setAuxClass erneut läuft. Bereits
  // vergebene Namen bleiben dabei stehen (angleichen ergänzt und kürzt nur).
  if (hatAuxKlasse(meeting)) item.aux = angleichen(item)
  return next
}

/* ---- Öffentlicher Vortrag (Wochenende) ----------------------------------- */

/** Platzhalter-Titel der Wochenend-Vorlage, solange kein Thema eingetragen ist. */
export const TALK_PLACEHOLDER = '(Vortragsthema eintragen)'

/**
 * Vortragsthema frei bearbeiten (nur Wochenende). Leerer Text stellt den
 * Platzhalter wieder her (der wird bei der Anzeige übersetzt). Lokaler
 * Freitext → identisch in alle Sprachvarianten spiegeln (wie lacAdd).
 */
export function editTalkTheme(weeks: Week[], wi: number, si: number, ii: number, title: string): Week[] {
  const next = structuredClone(weeks)
  const item = next[wi].we.sections[si]?.items[ii]
  if (!item || isSong(item)) return weeks
  const value = title.trim() || TALK_PLACEHOLDER
  if (item.title === value) return weeks
  item.title = value
  forEachAltMeeting(next[wi], 'we', (m) => {
    const vi = m.sections[si]?.items[ii]
    if (vi && !isSong(vi)) vi.title = value
  })
  return next
}

/** Erstes Titel-Atom ist das Anfangslied ("Lied" bzw. "Lied 78 …"). */
function isOpeningSongTitle(title: string): boolean {
  const first = title.split(' · ')[0]
  return first === 'Lied' || first.startsWith('Lied ')
}

/** Erstes Titel-Atom komplett ersetzen — räumt auch Altlasten ("Lied 44 fff") ab. */
function replaceSongAtom(title: string, value: string): string {
  const atoms = title.split(' · ')
  atoms[0] = value
  return atoms.join(' · ')
}

/**
 * Anfangslied der Wochenend-Zusammenkunft setzen: "Lied · Gebet" →
 * "Lied 78 · Gebet" (leere Nummer entfernt sie wieder). Kanonisch deutsch —
 * die Anzeige übersetzt "Lied 78" atomweise in die Versammlungssprache.
 * Varianten tragen denselben deutschen Vorlagen-Titel → gleiche Ersetzung.
 */
export function setOpeningSong(weeks: Week[], wi: number, song: string): Week[] {
  const nr = song.replace(/\D/g, '') // nur Ziffern — zweite Verteidigungslinie zum Eingabefeld
  const next = structuredClone(weeks)
  const meeting = next[wi].we
  const si = meeting.sections.findIndex((s) => s.label === LABEL_EROEFFNUNG)
  if (si < 0) return weeks
  const ii = meeting.sections[si].items.findIndex((x) => !isSong(x) && isOpeningSongTitle(x.title))
  if (ii < 0) return weeks
  const item = meeting.sections[si].items[ii] as PartItem
  const value = nr ? `Lied ${nr}` : 'Lied'
  const title = replaceSongAtom(item.title, value)
  if (title === item.title) return weeks
  item.title = title
  forEachAltMeeting(next[wi], 'we', (m) => {
    const vi = m.sections[si]?.items[ii]
    if (vi && !isSong(vi) && isOpeningSongTitle(vi.title)) vi.title = replaceSongAtom(vi.title, value)
  })
  return next
}

/** Aktuelle Anfangslied-Nummer der Wochenend-Eröffnung ("" = keine). */
export function openingSongNr(meeting: Meeting): string {
  for (const section of meeting.sections) {
    if (section.label !== LABEL_EROEFFNUNG) continue
    for (const item of section.items) {
      if (isSong(item)) continue
      const match = /^Lied (\d+)/.exec(item.title)
      if (match) return match[1]
      if (isOpeningSongTitle(item.title)) return ''
    }
  }
  return ''
}
