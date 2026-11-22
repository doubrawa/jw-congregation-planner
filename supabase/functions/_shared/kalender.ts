// =============================================================================
// Geteilt: das Kalender-Abo — die Termine einer Person und ihr Kalendertext
// =============================================================================
// Die Function `kalender` liefert je Person einen Kalender nach RFC 5545, den
// eine Kalender-App über einen geheimen Link abonniert. Hier steht, was
// hineingehört und wie es als Text aussieht — ohne Datenbank, damit die Proben
// beides ohne die Function prüfen.
//
// Was hineingehört (Entscheid des Betreibers):
//  - nur die eigenen Aufgaben: Programm und Hilfsdienste der Zusammenkünfte,
//    Treffpunkt-Leitungen, Trolley-Schichten — und keine Namen anderer;
//  - erst, wenn sie gesendet sind („Plan senden", Versand-Tagebuch) oder schon
//    zugesagt — kein Entwurf, den der Planer noch umstellt. Trolley-Schichten
//    trägt man selbst ein, sie stehen gleich darin;
//  - nichts Abgesagtes und keine Zusammenkunft, die ausfällt;
//  - als Termin die ganze Zusammenkunft, nicht der Programmpunkt.
// =============================================================================

import {
  istAusgefallenFuer,
  type MeetingTimes,
  terminDerWoche,
  terminTag,
  uhrzeitPlus,
  ZUSAMMENKUNFT_MINUTEN,
} from './planung.ts'
import { type FsInstance, pendingOfFsWeek, pendingOfMeeting, type ServiceRow, tagebuchSchluessel, type Week } from './zuteilungen.ts'

/**
 * Wie lange eine Treffpunkt-Leitung im Kalender steht. Die Zusammenkunft für
 * den Predigtdienst selbst ist kürzer; danach geht es in den Dienst, und eine
 * Stunde hält den Vormittag im Kalender frei genug, ohne ihn ganz zu belegen.
 */
export const TREFFPUNKT_MINUTEN = 60

/**
 * Die Zeitzone der Termine. Die Versammlung führt ihre Zeiten als Uhrzeit vor
 * Ort („19:00") ohne Zone; alle Versammlungen der App liegen in Deutschland.
 * Mit Zone statt „schwebender" Uhrzeit zeigt jede Kalender-App dieselbe
 * Stunde — Outlook liest eine schwebende Zeit sonst als UTC.
 */
export const KALENDER_ZEITZONE = 'Europe/Berlin'

/** Wer den Kalender bekommt: die Person und ihr Anzeigename (für Plätze ohne Person-Id). */
export interface KalenderPerson {
  id: string
  name: string
}

/** Was es braucht, um die eigenen Plätze zu finden. */
export interface PlatzDaten {
  person: KalenderPerson
  wochen: readonly { start: string; data: Week }[]
  treffpunkte: readonly { start: string; data: FsInstance[] }[]
  dienste: readonly ServiceRow[]
  zeiten: MeetingTimes
  /** Wo die Zusammenkünfte sind — die Anschrift des Saals aus den Einstellungen. */
  saal: string
  /** Der erste Tag, der noch hineingehört (JJJJ-MM-TT). */
  ab: string
}

/** Ein eigener Platz in einer Zusammenkunft oder an einem Treffpunkt — noch ohne Blick auf Zusage und Versand. */
export interface Platz {
  /** Aufgaben-Schlüssel — derselbe, unter dem Zusage und Tagebuch stehen. */
  key: string
  /** Der Name am Platz, wie ihn das Tagebuch führt. */
  name: string
  tag: string
  von: string
  bis: string
  /** Kanonisch deutsch („Bibellesung", „Mikrofone", „Treffpunkt-Leiter"). */
  titel: string
  ort: string
  art: 'zusammenkunft' | 'treffpunkt'
  /** Welche Zusammenkunft — nur bei `art: 'zusammenkunft'`. */
  zusammenkunft?: 'mid' | 'we'
  /** Die Nummer des Programmpunkts, wo er eine trägt. */
  punkt?: number
}

/** Eine eigene Trolley-Schicht, mit Namen und Ort ihres Trolleys. */
export interface KalenderTrolley {
  id: string
  datum: string
  /** „09:00" — aus der Datenbank auch „09:00:00". */
  von: string
  bis: string
  name: string
  ort: string
  hinweis: string
}

/** Ein Termin im Kalender. */
export interface KalenderTermin {
  /** Bleibt über alle Abrufe gleich — daran erkennt die Kalender-App den Termin wieder. */
  uid: string
  tag: string
  von: string
  bis: string
  /** Kanonisch deutsch; beim Trolley sein Name. Übersetzt wird in der Function. */
  titel: string
  ort: string
  art: Platz['art'] | 'trolley'
  zusammenkunft?: Platz['zusammenkunft']
  punkt?: number
  /** `null`: Es gibt nichts zuzusagen (Trolley). */
  zusage: 'offen' | 'bestätigt' | null
  /** Der Hinweis am Trolley, unübersetzt wie alles, was der Planer schreibt. */
  hinweis?: string
}

/**
 * Gehört der Platz dieser Person? Über die Person-Id, wo er eine trägt; sonst
 * über den Namen — wie die Erinnerungen. Ein Platz mit fremder Id gehört ihr
 * nie, auch wenn der Name passt (zwei Gleichnamige).
 */
function istEigen(platz: { pid?: string; name: string }, person: KalenderPerson): boolean {
  return platz.pid ? platz.pid === person.id : platz.name === person.name
}

/**
 * **Die eigenen Plätze** ab `ab`: Programm, Hilfsdienste und Ratgeber der
 * Zusammenkünfte, die stattfinden, und die eigenen Treffpunkt-Leitungen. Ob sie
 * in den Kalender gehören, entscheidet erst `kalenderTermine` — dafür braucht
 * die Function die Zusagen genau dieser Plätze.
 */
export function eigenePlaetze(d: PlatzDaten): Platz[] {
  const plaetze: Platz[] = []
  // Leer: alle Plätze, nicht nur die unbestätigten (siehe `pendingOfMeeting`).
  const alle = new Map<string, string>()
  for (const { start, data: week } of d.wochen) {
    for (const tab of ['mid', 'we'] as const) {
      const meeting = week[tab]
      if (!meeting || istAusgefallenFuer(week.dev, tab)) continue
      const { versatz, zeit } = terminDerWoche(d.zeiten, tab, start, week.dev)
      const tag = terminTag(start, versatz)
      const bis = uhrzeitPlus(zeit, ZUSAMMENKUNFT_MINUTEN)
      if (!tag || tag < d.ab || !bis) continue
      for (const p of pendingOfMeeting(start, tab, meeting, d.dienste, alle)) {
        if (!istEigen(p, d.person)) continue
        plaetze.push({
          key: p.key,
          name: p.name,
          tag,
          von: zeit,
          bis,
          titel: p.label,
          ort: d.saal,
          art: 'zusammenkunft',
          zusammenkunft: tab,
          ...(p.num ? { punkt: p.num } : {}),
        })
      }
    }
  }
  for (const { start, data } of d.treffpunkte) {
    for (const l of pendingOfFsWeek(start, data, alle)) {
      const tag = terminTag(start, l.offset)
      const bis = uhrzeitPlus(l.zeit, TREFFPUNKT_MINUTEN)
      if (!tag || tag < d.ab || !bis || !istEigen(l, d.person)) continue
      plaetze.push({ key: l.key, name: l.name, tag, von: l.zeit, bis, titel: l.label, ort: l.ort, art: 'treffpunkt' })
    }
  }
  return plaetze
}

/** Was über einen Platz feststeht: seine Zusage und ob „Plan senden" ihn gemeldet hat. */
export interface PlatzStand {
  /** Zusagen nach Aufgaben-Schlüssel: `bestätigt` oder `verhindert`. */
  zusagen: ReadonlyMap<string, string>
  /** Gesendete Plätze als `tagebuchSchluessel(task_key, name)`. */
  gesendet: ReadonlySet<string>
}

/**
 * **Die Termine des Kalenders**, nach Tag und Uhrzeit: die eigenen Plätze, die
 * gesendet oder zugesagt sind — Abgesagtes nie —, und die eigenen
 * Trolley-Schichten ab `ab`.
 */
export function kalenderTermine(
  plaetze: readonly Platz[],
  stand: PlatzStand,
  trolleys: readonly KalenderTrolley[],
  ab: string,
): KalenderTermin[] {
  const termine: KalenderTermin[] = []
  for (const { key, name, ...termin } of plaetze) {
    const status = stand.zusagen.get(key)
    if (status === 'verhindert') continue
    const zusage = status === 'bestätigt' ? 'bestätigt' : stand.gesendet.has(tagebuchSchluessel(key, name)) ? 'offen' : null
    if (!zusage) continue
    termine.push({ uid: key, ...termin, zusage })
  }
  for (const t of trolleys) {
    if (t.datum < ab) continue
    termine.push({
      uid: `trolley|${t.id}`,
      tag: t.datum,
      von: t.von.slice(0, 5),
      bis: t.bis.slice(0, 5),
      titel: t.name,
      ort: t.ort,
      art: 'trolley',
      zusage: null,
      ...(t.hinweis ? { hinweis: t.hinweis } : {}),
    })
  }
  return termine.sort((a, b) => `${a.tag} ${a.von}`.localeCompare(`${b.tag} ${b.von}`) || a.uid.localeCompare(b.uid))
}

/* ---- Der Kalendertext (RFC 5545) ----------------------------------------- */

/** Was die Function je Sprache zum Text beisteuert. */
export interface KalenderBeschriftung {
  /** Name des Kalenders in der App („Versammlung.app · Meine Aufgaben"). */
  name: string
  /** Titel eines Termins, in der Sprache des Abos. */
  titel: (t: KalenderTermin) => string
  /** Notiz eines Termins, in der Sprache des Abos — leer: keine. */
  notiz: (t: KalenderTermin) => string
  /** Wohin ein Tipp auf den Termin führt (die App). */
  url: string
}

/**
 * Die Regeln von Mitteleuropa, wie jede Kalender-App sie versteht: Sommerzeit
 * vom letzten Sonntag im März, 2 Uhr, bis zum letzten im Oktober, 3 Uhr.
 */
const ZEITZONE_BERLIN = [
  'BEGIN:VTIMEZONE',
  `TZID:${KALENDER_ZEITZONE}`,
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
]

/**
 * Text für eine Eigenschaft: Gegenschrägstrich, Komma und Semikolon tragen in
 * RFC 5545 Bedeutung und werden maskiert, ein Zeilenumbruch wird `\n`. Ohne das
 * zerfiele „Gruppe 1, Bei Familie Albrecht" an der Kalender-App in zwei Werte.
 */
export function kalenderMaskiert(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
    .replace(/\r/g, '')
}

/**
 * **Lange Zeilen falten**: höchstens 75 Byte je Zeile, die Fortsetzung beginnt
 * mit einem Leerzeichen (RFC 5545, 3.1). Gezählt wird in UTF-8 und nie mitten in
 * einem Zeichen geteilt — „ü" sind zwei Byte, ein kyrillischer Titel bricht
 * sonst ein Zeichen entzwei, und die App zeigt Ersatzzeichen.
 */
export function kalenderGefaltet(zeile: string): string {
  const kodierer = new TextEncoder()
  const teile: string[] = []
  let aktuell = ''
  let bytes = 0
  let grenze = 75
  for (const zeichen of zeile) {
    const laenge = kodierer.encode(zeichen).length
    if (bytes + laenge > grenze) {
      teile.push(aktuell)
      aktuell = ''
      bytes = 0
      grenze = 74 // Das Leerzeichen vorn zählt mit.
    }
    aktuell += zeichen
    bytes += laenge
  }
  teile.push(aktuell)
  return teile.join('\r\n ')
}

/** „2026-09-08" + „19:00" → „20260908T190000" (Uhrzeit vor Ort). */
function ortszeit(tag: string, zeit: string): string {
  return `${tag.replace(/-/g, '')}T${zeit.replace(':', '')}00`
}

/** Ein Zeitpunkt in UTC: „20260907T080000Z". */
function utcStempel(d: Date): string {
  return `${d.toISOString().slice(0, 19).replace(/[-:]/g, '')}Z`
}

/**
 * Eine Kennung, die über alle Abrufe gleich bleibt: der Aufgaben-Schlüssel
 * (beim Trolley seine Kennung) mit dem Namen der App dahinter, wie RFC 5545 es
 * empfiehlt. Ändert sich Zeit oder Titel, ist es derselbe Termin, nicht ein
 * zweiter.
 */
function terminUid(t: KalenderTermin): string {
  return `${t.uid}@versammlung.app`
}

/**
 * **Der ganze Kalender als Text** — mit CRLF, wie RFC 5545 es verlangt.
 * `REFRESH-INTERVAL` und `X-PUBLISHED-TTL` bitten die Kalender-App um einen
 * Abruf je Stunde; verbindlich ist das für sie nicht (Google entscheidet
 * selbst).
 */
export function kalenderText(termine: readonly KalenderTermin[], b: KalenderBeschriftung, jetzt = new Date()): string {
  const stempel = utcStempel(jetzt)
  const eigenschaft = (name: string, wert: string) => `${name}:${kalenderMaskiert(wert)}`
  const zeilen = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Versammlung.app//Kalender-Abo//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    eigenschaft('X-WR-CALNAME', b.name),
    `X-WR-TIMEZONE:${KALENDER_ZEITZONE}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
    ...ZEITZONE_BERLIN,
  ]
  for (const t of termine) {
    const notiz = b.notiz(t)
    zeilen.push(
      'BEGIN:VEVENT',
      eigenschaft('UID', terminUid(t)),
      `DTSTAMP:${stempel}`,
      `DTSTART;TZID=${KALENDER_ZEITZONE}:${ortszeit(t.tag, t.von)}`,
      `DTEND;TZID=${KALENDER_ZEITZONE}:${ortszeit(t.tag, t.bis)}`,
      eigenschaft('SUMMARY', b.titel(t)),
    )
    if (t.ort) zeilen.push(eigenschaft('LOCATION', t.ort))
    if (notiz) zeilen.push(eigenschaft('DESCRIPTION', notiz))
    zeilen.push(`URL:${b.url}`)
    if (t.zusage) zeilen.push(`STATUS:${t.zusage === 'bestätigt' ? 'CONFIRMED' : 'TENTATIVE'}`)
    zeilen.push('TRANSP:OPAQUE', 'END:VEVENT')
  }
  zeilen.push('END:VCALENDAR')
  return `${zeilen.map(kalenderGefaltet).join('\r\n')}\r\n`
}
