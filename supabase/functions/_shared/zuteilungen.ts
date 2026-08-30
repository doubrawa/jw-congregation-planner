/**
 * Wer ist in einer Woche eingeteilt, und wie heißt sein Platz?
 *
 * Diese Datei beantwortet die Frage **einmal** für alle, die sie stellen:
 * `send-reminders` (täglich, „wer hat noch nicht bestätigt?") und `send-plan`
 * (auf Knopfdruck, „wer muss von seiner Zuteilung erfahren?"). Beide brauchen
 * dieselbe Aufzählung über dieselben vier Platzsorten und dieselben
 * Aufgaben-Schlüssel — eine zweite Abschrift war schon einmal die Ursache
 * eines Fehlers, bei dem eine ganze Platzsorte still übergangen wurde
 * (B8/T40, und derselbe Griff in `alle-plaetze.test.ts`).
 *
 * Was hier **nicht** hingehört: der Versand selbst. Wer wann was bekommt, ist
 * die Entscheidung der jeweiligen Function.
 */
import {
  deutschesDatum,
  rolleMitHerkunft,
  SKIP_ROLE,
  taskDateText,
  zuteilungsLabel,
  type Abweichungen,
} from './planung.ts'
import { makeTr } from './i18n/translate.ts'

/* ---- Datenmodell (Teilmengen der Client-Typen aus src/data/types.ts) ---- */

export interface Slot {
  name?: string
  /** Person-Id der Zuteilung — stabile Identität statt Name-Match. */
  pid?: string
  rolle?: string
}

/** Ein Treffpunkt einer Woche (FsInstance im Client). */
export interface FsInstance {
  id: string
  grp?: string
  wd: number
  time?: string
  place?: string
  leader?: string
  /** Person-Id des Leiters. */
  lpid?: string
  /**
   * Leiter ist Freitext (auswaertig, in der Regel der Kreisaufseher) — er hat
   * kein Konto und bekommt keine Erinnerung. Ohne dieses Feld faende der
   * Namensweg unten einen gleichnamigen Bruder und erinnerte **ihn** an eine
   * Leitung, die er gar nicht hat.
   */
  lext?: boolean
}

export interface Item {
  song?: string
  title?: string
  /** Stabile Kennung des Programmpunkts (T37) — Grundlage des Aufgaben-Schluessels. */
  iid?: string
  names?: Slot[]
  /** Zweite Platzreihe der Zusaetzlichen Klasse (jw.org S-38, Absatz 26). */
  aux?: Slot[]
}

export interface Section {
  /**
   * Kanonisch deutsche Überschrift („ERÖFFNUNG", „ABSCHLUSS", …). Sie
   * entscheidet mit, wie eine Zuteilung benannt wird (`zuteilungsLabel`).
   */
  label?: string
  items?: Item[]
}

/**
 * Hilfsdienst-Platz. Aktuell ein Objekt { name, pid? }; Bestandsdaten in der DB
 * können noch reine Namens-Strings sein (siehe normalizeWeekHelpers in
 * src/lib/data.ts — der Client hebt sie beim Laden an, die DB behält das
 * Alt-Format aber, bis die Woche neu gespeichert wird). Beides muss hier
 * gelesen werden können.
 */
export type HelperEntry = string | { name?: string; pid?: string } | null

export interface Meeting {
  date?: string
  sections?: Section[]
  helpers?: Record<string, HelperEntry[]>
  /** Ratgeber der Zusaetzlichen Klasse (eine Zuteilung je Zusammenkunft). */
  auxRatgeber?: Slot
}

export interface Week {
  start?: string
  mid?: Meeting
  we?: Meeting
  /** Abweichungen dieser Woche — verlegter Tag, andere Uhrzeit, Ausfall (T30). */
  dev?: Abweichungen
}

export interface ServiceRow {
  key: string
  name: string
  count: number
  groups: boolean
}

export interface SubscriptionRow {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  /** App-Sprache des Geraets; null bei Abos von vor migration-014 → Deutsch. */
  lang: string | null
}

/* ---- Plätze lesen -------------------------------------------------------- */

/** Name eines Hilfsdienst-Platzes; '' = unbesetzt (beide Datenformate). */
function helperName(entry: HelperEntry | undefined): string {
  if (!entry) return ''
  return typeof entry === 'string' ? entry : (entry.name ?? '')
}

/** Person-Id eines Hilfsdienst-Platzes; Alt-Format (reiner String) hat keine. */
function helperPid(entry: HelperEntry | undefined): string | undefined {
  return entry && typeof entry !== 'string' ? entry.pid : undefined
}

const taskDate = (meeting: Meeting): string => taskDateText(meeting.date)

/**
 * Kennung eines Treffpunkts ohne führende Wochennummer (T87).
 *
 * Der Client hebt beim Laden beides — die Kennungen im Blob und die
 * `task_key` der Bestätigungen. Der Versand liest den Blob aber **direkt aus
 * der Datenbank**, und der bleibt so lange auf dem alten Stand, bis ein Planer
 * die Woche das nächste Mal anfasst. Ohne diesen Griff rechnete er in der
 * Zwischenzeit mit `fs|<Montag>|3|r1`, während die Bestätigung längst
 * `fs|<Montag>|r1` heißt: Der Leiter hätte bestätigt und würde trotzdem weiter
 * erinnert.
 *
 * Regel-Kennungen sind `r<uuid>`, von Hand angelegte `x<uuid>` — eine Zahl
 * vorn hat nur der Altbestand.
 */
function stabileKennung(instId: string): string {
  const treffer = /^\d+\|(.+)$/.exec(instId)
  return treffer?.[1] ?? instId
}

/**
 * Schlüssel im Versand-Tagebuch: Platz **und** Name, durch ein Leerzeichen
 * getrennt.
 *
 * Der Name gehört dazu, weil ein Platz die Person wechseln kann: Teilt der
 * Planer um, ist es ein anderer Schlüssel — die neue Person zählt als noch
 * nicht benachrichtigt.
 *
 * **Zweitschrift beachten:** `sentKey` in `src/data/planning.ts` bildet
 * denselben Schlüssel für die Anzeige im Planen-Screen. Laufen die beiden
 * auseinander, zeigt der Knopf eine Zahl an, die nach dem Drücken nicht auf
 * null geht — und niemand sieht, woran es liegt. `edge-parity.test.ts` hält
 * sie zusammen; genau dieser Trenner war schon einmal auf beiden Seiten
 * verschieden.
 */
export function tagebuchSchluessel(taskKey: string, name: string): string {
  return `${taskKey} ${name}`
}

export interface Pending {
  name: string
  /**
   * Person-Id, wo die Zuteilung eine trägt. Zugeordnet wird darüber und erst
   * ersatzweise über den Anzeigenamen: zwei Personen desselben Namens bekamen
   * sonst gegenseitig die Erinnerungen des anderen.
   */
  pid?: string
  label: string
  /**
   * Aufgaben-Schlüssel des Platzes — derselbe, unter dem die Bestätigung
   * steht.
   *
   * Er wurde hier immer schon gebildet (zum Nachschlagen im
   * Bestätigungs-Bestand), aber nicht herausgegeben. Er wird an zwei Stellen
   * gebraucht: `notifications.task_key` macht aus der Mitteilung eine, auf der
   * man gleich bestätigen kann, und das Versand-Tagebuch merkt sich damit,
   * welcher Platz schon gemeldet wurde.
   */
  key: string
}

/**
 * Unbestätigte Treffpunkt-Leitungen einer Woche.
 *
 * Zweite Datenquelle (`fs_weeks`), die hier lange gar nicht gelesen wurde: ein
 * zugeteilter Treffpunkt-Leiter bekam nie eine Erinnerung und konnte nichts
 * bestätigen — er erfuhr von seiner Einteilung nur beim Nachschauen.
 *
 * Der Wochentag steht am Treffpunkt selbst (`wd`, 0=So … 6=Sa), nicht in den
 * Zusammenkunftszeiten; als Versatz ab Montag gerechnet wie im Client
 * (`fsTag`). task_key `fs|<Montag>|<instId>` — dieselbe Form wie dort (T66:
 * vorn steht die **Kennung** der Woche, nicht mehr ihre Position).
 */
export function pendingOfFsWeek(
  woche: string,
  insts: FsInstance[],
  conf: Map<string, string>,
): Array<Pending & { offset: number; zeit: string }> {
  const out: Array<Pending & { offset: number; zeit: string }> = []
  for (const inst of insts) {
    if (!inst?.leader || inst.lext) continue
    const key = `fs|${woche}|${stabileKennung(inst.id)}`
    if (conf.has(key)) continue
    const ort = inst.place ? ` · ${inst.place}` : ''
    out.push({
      name: inst.leader,
      pid: inst.lpid,
      label: `Treffpunkt-Leiter${ort}`,
      key,
      offset: ((inst.wd ?? 1) + 6) % 7,
      zeit: inst.time ?? '',
    })
  }
  return out
}

/**
 * Unbestätigte Zuteilungen; task_key-Schema wie partTaskKey/helperTaskKey.
 *
 * Vorn steht seit T66 der **Montag der Woche** statt ihrer Position. Der
 * Positions-Schlüssel wurde eine Zeit lang mitgeprüft; seit Stufe 3 nicht mehr
 * — migration-018 hat den Rest umgeschrieben und die Spalte gelöscht, an der er
 * hing. Was jetzt noch positionsförmig wäre, zeigt auf eine Woche, die es nicht
 * gibt.
 */
export function pendingOfMeeting(
  woche: string,
  tab: 'mid' | 'we',
  meeting: Meeting,
  services: ServiceRow[],
  conf: Map<string, string>,
): Pending[] {
  const out: Pending[] = []
  const sections = meeting.sections ?? []
  /*
   * Über `entries()` statt über Zählschleifen: Ein Index-Zugriff liefert unter
   * `noUncheckedIndexedAccess` ein `| undefined`, und zwölf davon in einer
   * Schleife wären zwölf Prüfungen, die alle nie zutreffen. Die Aufzählung
   * gibt Nummer und Wert zusammen heraus — dieselbe Form, die `programmPlaetze`
   * im Client benutzt. Die Nummern werden gebraucht: Sie bilden den
   * positionsbasierten Aufgaben-Schlüssel für Punkte ohne `iid`.
   */
  for (const [si, section] of sections.entries()) {
    for (const [ii, item] of (section.items ?? []).entries()) {
      if ('song' in item) continue
      // Hauptsaal ("part") und Zusätzliche Klasse ("aux") — gleichwertige
      // Zuteilungen mit eigenen Schlüsseln; ohne die zweite Runde bliebe die
      // halbe Klasse ohne Erinnerung. Ob es eine Klasse gibt, sagt der
      // Ratgeber-Platz (wie hatAuxKlasse im Client): die Namen der Klasse
      // bleiben beim Ausschalten stehen, erinnert wird dann aber nicht mehr.
      const raeume: Array<['part' | 'aux', Slot[]]> = [['part', item.names ?? []]]
      if (meeting.auxRatgeber) raeume.push(['aux', item.aux ?? []])
      for (const [abschnitt, names] of raeume) {
        for (const [ni, slot] of names.entries()) {
          if (!slot.name || SKIP_ROLE.test(slot.rolle ?? '')) continue
          // Schlüssel über die stabile Kennung des Punkts, sonst über seine
          // Position **innerhalb** der Zusammenkunft (T37) — dieselbe Regel wie
          // `slotTaskKey` im Client. Beide Formen werden geprüft, weil Punkte
          // ohne `iid` erst beim nächsten Laden eine bekommen.
          const posKey = `${woche}|${tab}|${abschnitt}|${si}|${ii}|${ni}`
          const idKey = item.iid ? `${woche}|${tab}|${abschnitt}|${item.iid}|${ni}` : null
          if (conf.has(posKey) || (idKey !== null && conf.has(idKey))) continue
          out.push({
            name: slot.name,
            pid: slot.pid,
            // Dieselbe Regel wie in der Aufgabenliste des Clients: in
            // ERÖFFNUNG/ABSCHLUSS trägt die Rolle allein, sonst Titel · Rolle.
            label: zuteilungsLabel(section.label ?? '', item.title ?? 'Zuteilung', rolleMitHerkunft(slot)),
            // Der stabile Schlüssel, wo es einen gibt — unter dem legt auch der
            // Client die Bestätigung ab.
            key: idKey ?? posKey,
          })
        }
      }
    }
  }
  // Ratgeber der Zusätzlichen Klasse: eine Zuteilung je Zusammenkunft.
  const ratgeber = meeting.auxRatgeber
  const ratgeberKey = `${woche}|${tab}|ratgeber`
  if (ratgeber?.name && !conf.has(ratgeberKey)) {
    out.push({
      name: ratgeber.name,
      pid: ratgeber.pid,
      label: ratgeber.rolle ?? 'Ratgeber',
      key: ratgeberKey,
    })
  }
  for (const svc of services) {
    if (svc.groups) continue
    const arr = meeting.helpers?.[svc.key] ?? []
    for (let pos = 0; pos < svc.count; pos++) {
      const name = helperName(arr[pos])
      if (!name) continue // unbesetzter Platz
      const key = `${woche}|${tab}|helper|${svc.key}|${pos}`
      if (conf.has(key)) continue
      out.push({ name, pid: helperPid(arr[pos]), label: svc.name, key })
    }
  }
  return out
}

/* ---- Texte --------------------------------------------------------------- */

/**
 * Eine Zeile der Mitteilung — **in zwei Hälften**, nicht als fertiger Satz.
 *
 * Beide sind kanonisch deutsch, und beide müssen einzeln durch den Übersetzer:
 * `datum` („Dienstag, 8. September · 19:00") und `label`
 * („Versammlungsbibelstudium · Leiter"). Zusammengefügt ginge das nicht — der
 * Fragment-Übersetzer zerlegt an „ · ", und in „…19:00: Bibellesung" steckte
 * das „19:00: Bibellesung" dann als ein einziges, unbekanntes Stück.
 *
 * Die **Glocke** bekommt sie weiterhin deutsch zusammengesetzt: Mitteilungen
 * stehen kanonisch in der Datenbank und werden erst beim Anzeigen übersetzt.
 */
export interface Eintrag {
  datum: string
  label: string
}

/** Kanonisch deutsch — so steht die Zeile in der Glocke. */
export const kanonisch = (e: Eintrag): string => `${e.datum}: ${e.label}`

/**
 * Dieselbe Zeile in der Sprache eines Push-Abos.
 *
 * **Warum das überhaupt hier passiert.** Ein Push ist fertiger Text, sobald er
 * das Gerät erreicht — der Service Worker zeigt `title` und `body` unverändert
 * an (`public/sw.js`), und die App ist dabei gar nicht beteiligt. Der Titel
 * wurde deshalb längst übersetzt; der Rumpf ging bis zum 28.8.2026 kanonisch
 * deutsch hinaus. Ein koreanischer Verkündiger las einen koreanischen Titel
 * über einer deutschen Zeile.
 *
 * Möglich wurde es, indem der Fragment-Übersetzer nach `_shared/` gezogen ist —
 * **dieselbe** Datei, die der Client benutzt, keine zweite Abschrift.
 */
export const uebersetzt = (e: Eintrag, tr: (s: string) => string): string =>
  `${tr(e.datum)}: ${tr(e.label)}`

/**
 * Ein Übersetzer je Sprache, einmal gebaut.
 *
 * `makeTr` stellt bei jedem Aufruf ein paar Dutzend reguläre Ausdrücke
 * zusammen; bei hundert Empfängern in derselben Sprache wäre das hundertmal
 * dieselbe Arbeit.
 */
export function uebersetzerFuer(): (lang: string | null) => (s: string) => string {
  const gebaut = new Map<string, (s: string) => string>()
  return (lang) => {
    const code = lang ?? 'de'
    let tr = gebaut.get(code)
    if (!tr) {
      tr = makeTr(code)
      gebaut.set(code, tr)
    }
    return tr
  }
}

/**
 * Termin im Mitteilungstext: „Dienstag, 8. September · 19:00".
 *
 * Importierte Wochen tragen im `date`-Feld nur die Wochenspanne — die
 * Erinnerung nannte deshalb eine Woche statt eines Tages. Rangfolge wie im
 * Client (`meetingDateText`): eigener Termin vor gerechnetem Datum.
 */
export function terminText(
  startISO: string,
  offset: number,
  meeting: Meeting,
  zeit: string,
  dev?: Abweichungen,
  tab?: 'mid' | 'we',
): string {
  // Eine Abweichung schlägt auch den eigenen Termin im `date`-Feld: der Planer
  // hat den Tag ausdrücklich verlegt, das `date`-Feld nennt noch den alten
  // (gleiche Regel wie `meetingDateText` im Client).
  const abw = tab ? dev?.[tab] : undefined
  const verlegt = Boolean(abw?.day || abw?.time)
  if (
    !verlegt &&
    /\b(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonnabend|Sonntag)\b/.test(meeting.date ?? '')
  ) {
    return taskDate(meeting)
  }
  const ms = Date.parse(startISO)
  if (Number.isNaN(ms)) return taskDate(meeting)
  const d = new Date(ms + offset * 864e5)
  const text = deutschesDatum(d, true)
  return zeit ? `${text} · ${zeit}` : text
}

/**
 * Abos eines Nutzers nach Sprache gruppieren — je Gruppe geht ein eigener
 * Versand hinaus, weil der Text beim Verschicken feststeht.
 *
 * Ohne Abos bleibt eine leere deutsche Gruppe übrig: dann wird nichts
 * verschickt (keine Empfänger), die Vorschau des Probelaufs zeigt den Eintrag
 * aber weiterhin an.
 */
export function nachSprache(subs: SubscriptionRow[]): Array<[string, SubscriptionRow[]]> {
  if (subs.length === 0) return [['de', []]]
  const nach = new Map<string, SubscriptionRow[]>()
  for (const s of subs) {
    const lang = s.lang ?? 'de'
    nach.set(lang, [...(nach.get(lang) ?? []), s])
  }
  return [...nach]
}
