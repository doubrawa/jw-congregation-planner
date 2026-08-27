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
import type { SectionKind } from './constants'
import {
  isSong,
  istArt,
  klonWoche,
  MEETING_TABS,
  neueItemId,
  ROLE_CIRCUIT,
  LABEL_DIENSTVORTRAG,
  TITEL_DIENSTVORTRAG,
  TITEL_SCHLUSSVORTRAG,
} from './helpers'
import { meetingDateParts, meetingTimesOf } from './meeting-dates'
import type { Abweichung, Dienstwoche, Meeting, MeetingKey, PartItem, Week } from './types'
import { ersteZahl, ersteZahlErsetzen, zahlErsetzen } from './ziffern'

/**
 * Minuten eines Programmpunkts.
 *
 * Maßgeblich ist `item.mins`: der Import legt die Zahl dort ab, unabhängig
 * davon, wie die Wochenseite sie schreibt.
 *
 * Der Rückfall ist für Wochen da, die vor dieser Änderung importiert wurden.
 * Er nimmt die **erste** Zahl der Meta-Zeile, und das ist keine Schätzung: der
 * Parser setzt sie aus Rahmen · Zeit · Quelle zusammen, der Rahmen enthält per
 * Konstruktion keine Ziffer, und ohne Zeitangabe entsteht gar keine Meta-Zeile.
 * Die erste Zahl ist deshalb immer die Dauer — auch im thailändischen
 * „3 นาที · lmd บทเรียน 1 ข้อ 5“, wo zwei weitere Zahlen folgen.
 *
 * Früher stand hier `/(\d+) Min\./`. Das traf in keiner der 19 gemessenen
 * Sprachen außer Deutsch (T32/T59).
 */
export function itemMinutes(item: PartItem): number | null {
  if (typeof item.mins === 'number') return item.mins
  return ersteZahl(item.meta ?? '')
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
  for (const tab of MEETING_TABS) {
    const a = minuten(alteZeit[tab])
    const n = minuten(neueZeit[tab])
    if (a === null || n === null) return weeks
    delta[tab] = n - a
  }
  if (delta.mid === 0 && delta.we === 0) return weeks

  let geaendert = false
  const next = weeks.map((week) => {
    const kopie = { ...week }
    for (const tab of MEETING_TABS) {
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

/**
 * Die Kette `weeks[wi][tab].sections[si]` in einem Griff — Woche, Zusammenkunft
 * und Punkte des Abschnitts, oder `undefined`, sobald ein Glied fehlt.
 *
 * Jede Bearbeitungsfunktion hier läuft diese Kette ab, und jedes Glied kann
 * fehlen: die Woche ist aus dem geladenen Fenster gerutscht (T35), den
 * Abschnitt gibt es in dieser Woche nicht (die Kreisaufseher-Woche baut sie
 * um, T62), der Punkt wurde nebenher gelöscht. Ungeprüft warf der Zugriff —
 * und weil diese Funktionen aus dem Reducer laufen, riss das die ganze Ansicht
 * mit. Fehlt etwas, heißt die Antwort durchweg: nichts ändern (T42).
 */
function stelle(
  weeks: Week[],
  wi: number,
  tab: MeetingKey,
  si: number,
): { week: Week; meeting: Meeting; items: Meeting['sections'][number]['items'] } | undefined {
  const week = weeks[wi]
  const meeting = week?.[tab]
  const items = meeting?.sections[si]?.items
  return week && meeting && items ? { week, meeting, items } : undefined
}

/** Minuten eines LAC-Punkts ändern (5..45) und Meeting-Ende nachziehen. */
export function lacAdjust(
  weeks: Week[],
  wi: number,
  tab: MeetingKey,
  si: number,
  ii: number,
  delta: number,
): Week[] {
  const next = klonWoche(weeks, wi)
  if (!next) return weeks
  const an = stelle(next, wi, tab, si)
  if (!an) return weeks
  const { week, meeting, items } = an
  const item = items[ii]
  if (!item || isSong(item)) return weeks
  const cur = itemMinutes(item)
  if (cur == null) return weeks
  const target = Math.max(5, Math.min(45, cur + delta))
  if (target === cur) return weeks
  // Die Zahl ist die Wahrheit, die Meta-Zeile nur ihre Anzeige — beide müssen
  // mit, sonst widersprechen sich Knopf und Text. Ersetzt wird in der Schrift,
  // die dort steht: aus „٣ دق“ wird „١٥ دق“, nicht „15 دق“.
  item.mins = target
  item.meta = ersteZahlErsetzen(item.meta ?? '', target)
  meeting.end = shiftEnd(meeting.end, target - cur)
  forEachAltMeeting(week, tab, (m) => {
    const vi = m.sections[si]?.items[ii]
    if (vi && !isSong(vi)) {
      vi.mins = target
      vi.meta = ersteZahlErsetzen(vi.meta ?? '', target)
    }
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
  const next = klonWoche(weeks, wi)
  if (!next) return weeks
  const an = stelle(next, wi, tab, si)
  if (!an) return weeks
  const { week, meeting, items } = an
  const item = items[ii]
  if (!item) return weeks
  const mins = isSong(item) ? null : itemMinutes(item)
  items.splice(ii, 1)
  if (mins != null) meeting.end = shiftEnd(meeting.end, -mins)
  forEachAltMeeting(week, tab, (m) => {
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
  return movables[tpos] ?? null
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
  const next = klonWoche(weeks, wi)
  if (!next) return weeks
  const an = stelle(next, wi, tab, si)
  if (!an) return weeks
  const { week, items } = an
  // Welcher Tausch zulässig ist, steht in `lacMoveTarget` — dieselbe Auskunft,
  // die Reducer und `persist.ts` nutzen, um die Bestätigungen mitzutauschen.
  // Eine zweite Rechnung hier wäre eine zweite Antwort auf dieselbe Frage.
  const b = lacMoveTarget(items, ii, dir)
  if (b == null) return weeks
  swapKeepNums(items, ii, b)
  forEachAltMeeting(week, tab, (m) => {
    const arr = m.sections[si]?.items
    if (arr) swapKeepNums(arr, ii, b)
  })
  return next
}

/** Zwei Items tauschen; die laufenden Nummern bleiben positionsfest. */
function swapKeepNums(items: Meeting['sections'][number]['items'], a: number, b: number): void {
  const ia = items[a]
  const ib = items[b]
  if (!ia || !ib) return
  const movables = movableIndices(items)
  const nums = movables.map((i) => {
    const it = items[i]
    return !it || isSong(it) ? undefined : it.num
  })
  items[a] = ib
  items[b] = ia
  movables.forEach((i, k) => {
    const it = items[i]
    if (it && !isSong(it)) it.num = nums[k]
  })
}

/**
 * Position, an der ein neuer LAC-Punkt landet: vor dem
 * Versammlungsbibelstudium, sonst am Ende. Getrennt exportiert, weil der
 * Reducer sie kennen muss — ab dort rutschen alle Bestätigungen eine Position
 * weiter (task_keys sind positionsbasiert).
 *
 * **Erkannt wird das Bibelstudium an seinem Leser-Slot, nicht am Titel** (T61):
 * `startsWith('Versammlungsbibelstudium')` traf bei fremdsprachiger
 * Versammlung nie, und der neue Punkt landete dann dahinter statt davor.
 * Derselbe Fehlertyp wie T32 — eine deutsche Annahme in einer Sprachdatei.
 *
 * Der Leser-Slot ist die verlässliche Marke: der Import vergibt ihn genau
 * einmal je Zusammenkunft (`parse.ts` — letzter Unser-Leben-Punkt bekommt
 * Leiter + Leser), und die von `lacAdd` erzeugten Punkte tragen nur `studium`.
 * Ein zweiter eigener Punkt reiht sich damit hinter dem ersten ein, nicht
 * davor.
 */
export function lacAddIndex(items: Meeting['sections'][number]['items']): number {
  const vbsIdx = items.findIndex(
    (x) => !isSong(x) && x.names.some((n) => n.bereichsKey === 'leser'),
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
  const next = klonWoche(weeks, wi)
  if (!next) return weeks
  const an = stelle(next, wi, tab, si)
  if (!an) return weeks
  const { week, meeting, items } = an
  // Ein eigener Punkt unter „Unser Leben als Christ" ist kein öffentlicher
  // Vortrag — der Bereich blieb hier fälschlich auf 'vortrag' stehen (F6).
  // Die stabile Kennung (T37) macht die Bestätigungen unabhängig von der
  // Position: der neue Punkt schiebt die folgenden weiter, ihre Bestätigungen
  // bleiben trotzdem bei ihnen.
  const newItem: PartItem = { iid: neueItemId(), title: trimmed, meta: '10 Min.', mins: 10, names: [{ name: '', bereichsKey: 'studium' }] }
  const at = lacAddIndex(items)
  items.splice(at, 0, newItem)
  meeting.end = shiftEnd(meeting.end, 10)
  // Eigener Punkt ist lokaler Text — in allen Varianten identisch einfügen
  forEachAltMeeting(week, tab, (m) => {
    const arr = m.sections[si]?.items
    if (arr) arr.splice(Math.min(at, arr.length), 0, { title: trimmed, meta: '10 Min.', mins: 10, names: [] })
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
  const next = klonWoche(weeks, wi)
  if (!next) return weeks
  const meeting = next[wi]?.[tab]
  const item = meeting?.sections[si]?.items[ii]
  if (!meeting || !item || isSong(item)) return weeks
  const idx = item.names.findIndex((n) => n.bereichsKey === 'schulungPartner')
  if (idx >= 0) item.names.splice(idx, 1)
  else item.names.push({ name: '', rolle: 'Gesprächspartner', bereichsKey: 'schulungPartner' })
  // Die Zusätzliche Klasse mitziehen: sonst hat der Hauptsaal zwei Plätze und
  // die Klasse einen — bis irgendwann setAuxClass erneut läuft. Bereits
  // vergebene Namen bleiben dabei stehen (angleichen ergänzt und kürzt nur).
  if (hatAuxKlasse(meeting)) item.aux = angleichen(item)
  return next
}

/* ---- Sonderwoche: Verlegung, Ausfall, Grund (T30) ------------------------- */

/** Trägt diese Abweichung überhaupt noch etwas? */
function abweichungLeer(a: Abweichung): boolean {
  return !a.day && !a.time && !a.cancelled && !a.reason
}

/**
 * Abweichung einer Zusammenkunft setzen — verlegter Tag, andere Uhrzeit,
 * Ausfall, Grund. `patch` überschreibt nur die genannten Felder; ein Feld auf
 * `undefined` (bzw. `''`/`false`) nimmt es zurück.
 *
 * **Leere Abweichungen werden entfernt, nicht gespeichert.** Bliebe ein
 * `{ day: undefined }` stehen, gälte die Woche als abweichend, obwohl sie der
 * Regel folgt — Chips und Banner erschienen ohne Anlass, und `weichtAb` sagte
 * die Unwahrheit. Aus demselben Grund verschwindet `dev` ganz, sobald keine
 * der beiden Zusammenkünfte mehr abweicht: eine reguläre Woche soll auch in
 * den Daten aussehen wie eine reguläre Woche.
 */
export function setAbweichung(
  weeks: Week[],
  wi: number,
  tab: MeetingKey,
  patch: Partial<Abweichung>,
): Week[] {
  const week = weeks[wi]
  if (!week) return weeks
  const zusammen: Abweichung = { ...week.dev?.[tab], ...patch }
  // Leerwerte gar nicht erst behalten — sonst entstünde `{ day: '' }`.
  const bereinigt: Abweichung = {}
  if (zusammen.day) bereinigt.day = zusammen.day
  if (zusammen.time) bereinigt.time = zusammen.time
  if (zusammen.cancelled) bereinigt.cancelled = true
  if (zusammen.reason?.trim()) bereinigt.reason = zusammen.reason.trim()

  const dev = { ...week.dev }
  if (abweichungLeer(bereinigt)) delete dev[tab]
  else dev[tab] = bereinigt

  const next = [...weeks]
  next[wi] = { ...week, dev: Object.keys(dev).length ? dev : undefined }
  return next
}

/* ---- Kreisaufseher-Woche (T62) ------------------------------------------- */

/** Der Punkt mit dem Leser-Slot — Bibelstudium bzw. Wachtturm-Studium (wie T61). */
function mitLeser(items: Meeting['sections'][number]['items']): number {
  return items.findIndex((x) => !isSong(x) && x.names.some((n) => n.bereichsKey === 'leser'))
}

/** Abschnitt an seinem kanonischen Label finden; −1, wenn es ihn nicht gibt. */
function abschnitt(meeting: Meeting, art: SectionKind): number {
  return meeting.sections.findIndex((s) => istArt(s, art))
}

/** Titel aus festem Begriff und optionalem Thema: „Dienstvortrag · <Thema>". */
function mitThema(begriff: string, thema: string | undefined): string {
  const t = (thema ?? '').trim()
  return t ? `${begriff} · ${t}` : begriff
}

/** Thema eines solchen Titels zurücklesen ("" = keins). */
export function themaVon(titel: string, begriff: string): string {
  return titel.startsWith(`${begriff} · `) ? titel.slice(begriff.length + 3) : ''
}

/**
 * Besuch des Kreisaufsehers ein- oder ausschalten (T62).
 *
 * **Unter der Woche** wird das Versammlungsbibelstudium zum Dienstvortrag:
 * 30 Minuten, ein Platz als Freitext, kein Leser.
 *
 * **Am Wochenende** wird das Wachtturm-Studium auf 30 Minuten verkürzt und
 * verliert seinen Leser — die Absätze werden dann nicht gelesen, es werden nur
 * die Fragen des Artikels besprochen —, und dahinter kommt der Schlussvortrag,
 * ebenfalls 30 Minuten und Freitext.
 *
 * **Die Endzeiten bleiben, wie sie sind**: unter der Woche 30 gegen 30, am
 * Wochenende −30 (Studium) +30 (Schlussvortrag). `shiftEnd` bleibt außen vor.
 *
 * **Was ersetzt wurde, bleibt erhalten** (`week.coData`) — mitsamt seinen
 * Zuteilungen. Ausschalten stellt es wieder her; niemand verliert seine
 * Einteilung, weil der Kreisaufseher angekündigt und wieder abgesagt wurde.
 *
 * Die Sprachvarianten (`Week.alt`) werden mitgeführt: `localizedWeek` gleicht
 * die Struktur ab und ließe die Woche sonst stumm auf die kanonische Sprache
 * zurückfallen.
 */
export function setDienstwoche(weeks: Week[], wi: number, on: boolean): Week[] {
  const week = weeks[wi]
  if (!week || Boolean(week.co) === on) return weeks
  const next = klonWoche(weeks, wi)
  if (!next) return weeks
  const w = next[wi]
  if (!w) return weeks

  if (on) {
    const coData: Dienstwoche = {}

    // --- unter der Woche: Dienstvortrag statt Bibelstudium ---
    const lacIdx = abschnitt(w.mid, 'lac')
    const lacItems = lacIdx >= 0 ? w.mid.sections[lacIdx]?.items : undefined
    const vbsIdx = lacItems ? mitLeser(lacItems) : -1
    if (lacItems && vbsIdx >= 0) {
      const vbs = lacItems[vbsIdx]
      if (vbs && !isSong(vbs)) {
        // Ohne Kennung fände das Zurücknehmen den Punkt nicht wieder — es
        // suchte nach `iid === undefined` und träfe irgendeinen. Demo- und
        // Vorlagenwochen laufen nicht durch die Lade-Migration (T37), tragen
        // also keine; hier wird sie nachgeholt.
        vbs.iid ??= neueItemId()
        coData.midOrig = structuredClone(vbs)
        lacItems[vbsIdx] = {
          ...vbs,
          title: TITEL_DIENSTVORTRAG,
          meta: '30 Min.',
          mins: 30,
          names: [{ name: '', rolle: ROLE_CIRCUIT, bereichsKey: 'vortrag' }],
        }
        // Die Varianten tragen ihre eigenen Titel; `localizedWeek` übernimmt
        // sie bei der Anzeige. Bliebe dort „Congregation Bible Study" stehen,
        // stünde das über dem Dienstvortrag. Der alte Titel wird gemerkt,
        // sonst käme er beim Zurücknehmen nur kanonisch-deutsch wieder.
        coData.midOrigAlt = {}
        for (const [code, variant] of Object.entries(w.alt ?? {})) {
          const it = variant.mid?.sections[lacIdx]?.items[vbsIdx]
          if (!it || isSong(it)) continue
          coData.midOrigAlt[code] = it.title
          it.title = TITEL_DIENSTVORTRAG
        }
      }
    }

    // --- Wochenende: Studium verkürzt, Schlussvortrag dahinter ---
    const wtIdx = abschnitt(w.we, 'wtStudium')
    const wtItems = wtIdx >= 0 ? w.we.sections[wtIdx]?.items : undefined
    const studIdx = wtItems ? mitLeser(wtItems) : -1
    if (wtItems && studIdx >= 0) {
      const stud = wtItems[studIdx]
      if (stud && !isSong(stud)) {
        stud.iid ??= neueItemId() // wie beim Bibelstudium: sonst kein Rückweg
        coData.weOrig = structuredClone(stud)
        // **Nicht** die erste Zahl ersetzen: die Meta-Zeile des
        // Wachtturm-Studiums beginnt mit der Nummer des Studienartikels
        // („Studienartikel 28 · 60 Min."). Ersetzt wird die alte Dauer selbst —
        // die steht in `mins` (T32) und muss nicht aus dem Text gelesen werden.
        // **Nur `mins`, nicht `itemMinutes`.** Dessen Rückfall nimmt die erste
        // Zahl der Meta-Zeile — bei einem LAC-Punkt ist das die Dauer, beim
        // Wachtturm-Studium aber die Nummer des Studienartikels
        // („Studienartikel 28 · 60 Min."). Mit dem Rückfall wurde aus 28 eine
        // 30 und die Dauer blieb stehen; im Browser sofort zu sehen. Fehlt
        // `mins`, wissen wir die Dauer nicht — dann bleibt der Anzeigetext, wie
        // er ist, statt geraten zu werden.
        const alt = typeof stud.mins === 'number' ? stud.mins : null
        if (alt != null) stud.meta = zahlErsetzen(stud.meta ?? '', alt, 30)
        stud.mins = 30
        // Der Leser fällt weg; der Leiter bleibt.
        stud.names = stud.names.filter((n) => n.bereichsKey !== 'leser')
        // Auch die Varianten zeigen ihre eigene Meta-Zeile — dort stünde sonst
        // weiter „60 Min." über einem Studium, das 30 dauert.
        coData.weOrigAlt = {}
        for (const [code, variant] of Object.entries(w.alt ?? {})) {
          const it = variant.we?.sections[wtIdx]?.items[studIdx]
          if (!it || isSong(it) || it.meta === undefined) continue
          coData.weOrigAlt[code] = it.meta
          if (alt != null) it.meta = zahlErsetzen(it.meta, alt, 30)
        }
      }
    }
    if (wtIdx >= 0) {
      const iid = neueItemId()
      coData.weVortragIid = iid
      const vortrag: PartItem = {
        iid,
        title: TITEL_SCHLUSSVORTRAG,
        meta: '30 Min.',
        mins: 30,
        names: [{ name: '', rolle: ROLE_CIRCUIT, bereichsKey: 'vortrag' }],
      }
      // **Eine eigene Sektion, kein Anhängsel des Studiums** (T64). Vorher stand
      // der Vortrag unter der Überschrift WACHTTURM-STUDIUM — ein zweiter Punkt
      // dort, der keiner ist. Sie kommt direkt hinter das Studium und vor den
      // ABSCHLUSS, in Gold (siehe LABEL_DIENSTVORTRAG).
      w.we.sections.splice(wtIdx + 1, 0, {
        label: LABEL_DIENSTVORTRAG,
        kind: 'dienstvortrag',
        farbe: 'gold',
        items: [vortrag],
      })
      // Die Varianten brauchen dieselbe Sektion an derselben Stelle: fehlt sie,
      // ist die Woche nicht mehr strukturgleich und `localizedWeek` fällt stumm
      // aufs Deutsche zurück — die ganze Woche, nicht nur dieser Punkt.
      forEachAltMeeting(w, 'we', (m) => {
        m.sections.splice(wtIdx + 1, 0, {
          label: LABEL_DIENSTVORTRAG,
          kind: 'dienstvortrag',
          farbe: 'gold',
          items: [{ iid, title: TITEL_SCHLUSSVORTRAG, meta: '30 Min.', mins: 30, names: [] }],
        })
      })
    }

    w.co = true
    w.coData = coData
    return next
  }

  // --- zurücknehmen ---
  const coData = w.coData ?? {}
  const lacIdx = abschnitt(w.mid, 'lac')
  const lacItems = lacIdx >= 0 ? w.mid.sections[lacIdx]?.items : undefined
  if (lacItems && coData.midOrig) {
    let idx = lacItems.findIndex((x) => !isSong(x) && x.iid === coData.midOrig?.iid)
    if (idx < 0) {
      // Der Planer hat den Dienstvortrag zwischendurch gelöscht. Das
      // Bibelstudium deshalb zu verlieren wäre die böseste Überraschung von
      // allen — es kommt ans Ende des Abschnitts zurück.
      lacItems.push(structuredClone(coData.midOrig))
      idx = lacItems.length - 1
    }
    if (idx >= 0) {
      lacItems[idx] = structuredClone(coData.midOrig)
      // Jede Variante bekommt ihren eigenen Titel zurück; fehlt einer (Variante
      // erst später dazugeholt), bleibt der kanonische — besser als
      // „Dienstvortrag" in einer Woche ohne Kreisaufseher.
      const titel = coData.midOrig.title
      for (const [code, variant] of Object.entries(w.alt ?? {})) {
        const it = variant.mid?.sections[lacIdx]?.items[idx]
        if (!it || isSong(it)) continue
        it.title = coData.midOrigAlt?.[code] ?? titel
      }
    }
  }
  const wtIdx = abschnitt(w.we, 'wtStudium')
  const wtSection = wtIdx >= 0 ? w.we.sections[wtIdx] : undefined
  if (wtSection) {
    if (coData.weOrig) {
      const idx = wtSection.items.findIndex((x) => !isSong(x) && x.iid === coData.weOrig?.iid)
      if (idx >= 0) {
        wtSection.items[idx] = structuredClone(coData.weOrig)
        // Und die Meta-Zeile jeder Variante ebenso — sonst zeigte die
        // englische Fassung weiter 30 Minuten für ein Studium mit 60.
        for (const [code, variant] of Object.entries(w.alt ?? {})) {
          const it = variant.we?.sections[wtIdx]?.items[idx]
          const alt = coData.weOrigAlt?.[code]
          if (it && !isSong(it) && alt !== undefined) it.meta = alt
        }
      }
    }
  }
  if (coData.weVortragIid) {
    // Seit T64 ist der Schlussvortrag eine **eigene Sektion** — zurückgenommen
    // wird sie als Ganzes. Gesucht wird trotzdem über die Kennung des Punktes,
    // nicht über die Überschrift: Wochen, die vor T64 eingeschaltet wurden,
    // tragen ihn noch im Wachtturm-Abschnitt, und auch die müssen sauber
    // zurückkommen.
    const weg = (m: Meeting) => {
      const si = m.sections.findIndex((s) =>
        s.items.some((x) => !isSong(x) && x.iid === coData.weVortragIid),
      )
      const section = m.sections[si]
      if (!section) return
      if (istArt(section, 'dienstvortrag')) m.sections.splice(si, 1)
      else {
        const idx = section.items.findIndex((x) => !isSong(x) && x.iid === coData.weVortragIid)
        if (idx >= 0) section.items.splice(idx, 1)
      }
    }
    weg(w.we)
    forEachAltMeeting(w, 'we', weg)
  }
  w.co = false
  delete w.coData
  return next
}

/**
 * Thema eines Vortragspunkts setzen — Dienstvortrag oder Schlussvortrag.
 *
 * Geschrieben wird der ganze Titel („Dienstvortrag · <Thema>"), damit die
 * Anzeige den Begriff weiterhin übersetzen kann; leeres Thema lässt nur den
 * Begriff stehen. Lokaler Freitext, also in alle Sprachvarianten gespiegelt —
 * wie beim Vortragsthema am Wochenende.
 */
export function setPartThema(
  weeks: Week[],
  wi: number,
  tab: MeetingKey,
  si: number,
  ii: number,
  begriff: string,
  thema: string,
): Week[] {
  const item = weeks[wi]?.[tab].sections[si]?.items[ii]
  if (!item || isSong(item)) return weeks
  const titel = mitThema(begriff, thema)
  if (item.title === titel) return weeks
  const next = klonWoche(weeks, wi)
  if (!next) return weeks
  const ziel = next[wi]?.[tab].sections[si]?.items[ii]
  if (!ziel || isSong(ziel)) return weeks
  ziel.title = titel
  const w = next[wi]
  if (w) {
    forEachAltMeeting(w, tab, (m) => {
      const vi = m.sections[si]?.items[ii]
      if (vi && !isSong(vi)) vi.title = titel
    })
  }
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
  const next = klonWoche(weeks, wi)
  if (!next) return weeks
  const week = next[wi]
  const item = week?.we.sections[si]?.items[ii]
  if (!week || !item || isSong(item)) return weeks
  const value = title.trim() || TALK_PLACEHOLDER
  if (item.title === value) return weeks
  item.title = value
  forEachAltMeeting(week, 'we', (m) => {
    const vi = m.sections[si]?.items[ii]
    if (vi && !isSong(vi)) vi.title = value
  })
  return next
}

/**
 * Stelle des Lied-Atoms in einem zusammengesetzten Titel — −1, wenn keins da ist.
 *
 * Bei der Eröffnung steht es vorn („Lied · Gebet"), beim Abschluss in der Mitte
 * („Schlussworte · Lied · Gebet"). Früher wurde stur Atom 0 genommen; genau
 * deshalb ließ sich nur das Anfangslied setzen und das Schlusslied nicht (F11).
 *
 * Der Vergleich ist deutsch, und das ist hier ausnahmsweise richtig: die
 * Wochenend-Vorlage steht kanonisch auf Deutsch im Datenmodell und wird erst
 * bei der Anzeige übersetzt (`weekendTemplate` im Import).
 */
function songAtomIndex(title: string): number {
  return title.split(' · ').findIndex((a) => a === 'Lied' || a.startsWith('Lied '))
}

/** Lied-Atom komplett ersetzen — räumt auch Altlasten ("Lied 44 fff") ab. */
function replaceSongAtom(title: string, value: string): string {
  const atoms = title.split(' · ')
  const i = songAtomIndex(title)
  if (i < 0) return title
  atoms[i] = value
  return atoms.join(' · ')
}

/**
 * Lied eines Wochenend-Abschnitts setzen: „Lied · Gebet" → „Lied 78 · Gebet"
 * (leere Nummer entfernt sie wieder). Kanonisch deutsch — die Anzeige übersetzt
 * „Lied 78" atomweise in die Versammlungssprache. Varianten tragen denselben
 * deutschen Vorlagen-Titel → gleiche Ersetzung.
 */
function setSong(weeks: Week[], wi: number, art: SectionKind, song: string): Week[] {
  const nr = song.replace(/\D/g, '') // nur Ziffern — zweite Verteidigungslinie zum Eingabefeld
  const next = klonWoche(weeks, wi)
  if (!next) return weeks
  const week = next[wi]
  const si = week?.we.sections.findIndex((s) => istArt(s, art)) ?? -1
  const items = week?.we.sections[si]?.items
  if (!week || !items) return weeks
  const value = nr ? `Lied ${nr}` : 'Lied'

  // Wochen, die vor dieser Änderung importiert wurden, tragen das Schlusslied
  // als eigenes Item vor dem Abschluss. Dann gehört die Nummer dorthin — würde
  // sie stattdessen in den Titel geschrieben, stünde das Lied zweimal da.
  const altItem = items.findIndex(isSong)
  if (altItem >= 0) {
    const s = items[altItem]
    if (!s || !isSong(s) || s.song === value) return weeks
    s.song = value
    forEachAltMeeting(week, 'we', (m) => {
      const vi = m.sections[si]?.items[altItem]
      if (vi && isSong(vi)) vi.song = value
    })
    return next
  }

  const ii = items.findIndex((x) => !isSong(x) && songAtomIndex(x.title) >= 0)
  const item = items[ii]
  if (!item || isSong(item)) return weeks
  const title = replaceSongAtom(item.title, value)
  if (title === item.title) return weeks
  item.title = title
  forEachAltMeeting(week, 'we', (m) => {
    const vi = m.sections[si]?.items[ii]
    if (vi && !isSong(vi) && songAtomIndex(vi.title) >= 0) vi.title = replaceSongAtom(vi.title, value)
  })
  return next
}

/** Anfangslied der Wochenend-Zusammenkunft setzen. */
export function setOpeningSong(weeks: Week[], wi: number, song: string): Week[] {
  return setSong(weeks, wi, 'eroeffnung', song)
}

/** Schlusslied der Wochenend-Zusammenkunft setzen (F11: ging bisher gar nicht). */
export function setClosingSong(weeks: Week[], wi: number, song: string): Week[] {
  return setSong(weeks, wi, 'abschluss', song)
}

/**
 * Lied-Nummer eines Wochenend-Abschnitts ("" = keine).
 *
 * Liest beide Formen: das Atom im Titel (so legt der Import es heute an) und
 * das eigenständige Lied-Item (so lag es in Wochen von früher).
 */
function songNr(meeting: Meeting, art: SectionKind): string {
  const section = meeting.sections.find((s) => istArt(s, art))
  for (const item of section?.items ?? []) {
    if (isSong(item)) {
      const match = /(\d+)/.exec(item.song)
      if (match?.[1]) return match[1]
      continue
    }
    const i = songAtomIndex(item.title)
    if (i < 0) continue
    return /(\d+)/.exec(item.title.split(' · ')[i] ?? '')?.[1] ?? ''
  }
  return ''
}

/** Aktuelle Anfangslied-Nummer der Wochenend-Eröffnung ("" = keine). */
export function openingSongNr(meeting: Meeting): string {
  return songNr(meeting, 'eroeffnung')
}

/** Aktuelle Schlusslied-Nummer des Wochenend-Abschlusses ("" = keine). */
export function closingSongNr(meeting: Meeting): string {
  return songNr(meeting, 'abschluss')
}
