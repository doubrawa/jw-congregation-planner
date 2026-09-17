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
  istAusgefallenFuer,
  meetingDayOffsets,
  meetingTimesOf,
  rolleMitHerkunft,
  SKIP_ROLE,
  terminText,
  terminVorbei,
  versatzMitAbweichung,
  zeitMitAbweichung,
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

/** Lied zwischen Programmpunkten — traegt keine Zuteilung. */
export interface SongItem {
  song: string
}

export interface PartItem {
  /**
   * Stabile Kennung des Programmpunkts — Grundlage des Aufgaben-Schluessels.
   *
   * **Pflichtfeld, und das ist der Punkt.** Sie entsteht dort, wo der Punkt
   * entsteht: beim Import (`parse.ts`) und beim Einfuegen von Hand
   * (`meeting-edit.ts` im Client). Damit gibt es keinen Programmpunkt ohne
   * Kennung, und der Aufgaben-Schluessel hat nur noch **eine** Form.
   */
  iid: string
  title?: string
  names?: Slot[]
  /** Zweite Platzreihe der Zusaetzlichen Klasse (jw.org S-38, Absatz 26). */
  aux?: Slot[]
}

export type Item = SongItem | PartItem

/**
 * Neue stabile Kennung fuer einen Programmpunkt — **genau acht Zeichen**.
 *
 * Kurz und ohne `|`, weil der Aufgaben-Schluessel daran zerlegt wird.
 * `crypto.randomUUID` gaebe es auch, waere aber 36 Zeichen lang fuer eine
 * Kennung, die nur innerhalb **einer** Zusammenkunft eindeutig sein muss —
 * Woche und Zusammenkunft stehen im Schluessel ohnehin davor.
 *
 * **Die Schleife ist kein Zierrat.** `Math.random().toString(36).slice(2, 10)`
 * allein hat keine Laengengarantie: Eine Zufallszahl mit wenigen signifikanten
 * Stellen ergibt eine kuerzere Zeichenkette, bei `Math.random() === 0` sogar
 * die leere. Gemessen an 3 Mio. Ziehungen: kuerzeste 6 Zeichen, 23 kuerzer als
 * acht. Eine leere Kennung ergaebe den Schluessel `<woche>|mid|part||0`, und
 * zwei solche Punkte derselben Zusammenkunft teilten sich eine Bestaetigung —
 * wer fuer den einen zusagt, gaelte auch fuer den anderen als bestaetigt.
 * Solange die Kennung ein Feld unter mehreren war, kostete das nichts; als
 * alleiniger Schluessel traegt sie die ganze Zuordnung.
 *
 * Steht hier und nicht im Client, weil beide Seiten Punkte anlegen: der Import
 * laeuft in der Edge Function, das Einfuegen von Hand im Browser.
 */
export function neueItemId(): string {
  let id = ''
  while (id.length < 8) id += Math.random().toString(36).slice(2)
  return id.slice(0, 8)
}

export interface Section {
  /**
   * Kanonisch deutsche Überschrift („ERÖFFNUNG", „ABSCHLUSS", …). Sie
   * entscheidet mit, wie eine Zuteilung benannt wird (`zuteilungsLabel`).
   */
  label?: string
  items?: Item[]
}

/** Hilfsdienst-Platz: `{ name, pid? }`, oder `null` fuer einen offenen Platz. */
export type HelperEntry = { name?: string; pid?: string } | null

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
  /** App-Sprache des Geraets; null → Deutsch. */
  lang: string | null
}

/* ---- Plätze lesen -------------------------------------------------------- */

/** Name eines Hilfsdienst-Platzes; '' = unbesetzt. */
function helperName(entry: HelperEntry | undefined): string {
  return entry?.name ?? ''
}

/** Person-Id eines Hilfsdienst-Platzes, wo eine Person dahintersteht. */
function helperPid(entry: HelperEntry | undefined): string | undefined {
  return entry?.pid
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
): Array<Pending & { offset: number; datum: string }> {
  const out: Array<Pending & { offset: number; datum: string }> = []
  for (const inst of insts) {
    if (!inst?.leader || inst.lext) continue
    const key = `fs|${woche}|${inst.id}`
    if (conf.has(key)) continue
    const offset = ((inst.wd ?? 1) + 6) % 7
    out.push({
      name: inst.leader,
      pid: inst.lpid,
      label: FS_LEITER,
      key,
      offset,
      datum: fsTerminText(woche, offset, inst.time ?? '', inst.place ?? ''),
    })
  }
  return out
}

/**
 * Unbestätigte Zuteilungen; task_key-Schema wie itemTaskKey/helperTaskKey.
 *
 * Der Schlüssel hat **eine** Form: Montag der Woche, Zusammenkunft, Raum,
 * Kennung des Punkts, Platz. Weder die Woche noch der Punkt werden über eine
 * Ordnungszahl angesprochen — die Woche nicht mehr seit T66, der Punkt nicht
 * mehr, seit der Import jedem Punkt seine Kennung mitgibt (`PartItem.iid`).
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
  for (const section of sections) {
    for (const item of section.items ?? []) {
      if ('song' in item) continue
      /*
       * **Ohne Kennung wird nicht erinnert.**
       *
       * `PartItem.iid` ist Pflichtfeld — aber hier kommt rohes JSON aus der
       * Datenbank, und dort kann kein Typ etwas erzwingen. Fehlte die Kennung,
       * lautete der Schlüssel `<woche>|mid|part|undefined|0`; die Bestätigung
       * des Eingeteilten steht unter einem anderen, und er bekäme dieselbe
       * Erinnerung Tag für Tag, ohne dass jemand die Ursache sähe.
       *
       * Lieber gar nicht erinnern und es in die Logs schreiben: Eine fehlende
       * Erinnerung merkt der Planer, eine endlose merkt niemand.
       */
      if (!item.iid) {
        console.error(`[zuteilungen] Punkt ohne Kennung (${woche}|${tab}): "${item.title ?? ''}"`)
        continue
      }
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
          // Schlüssel über die stabile Kennung des Punkts — dieselbe Regel wie
          // `itemTaskKey` im Client.
          const key = `${woche}|${tab}|${abschnitt}|${item.iid}|${ni}`
          if (conf.has(key)) continue
          out.push({
            name: slot.name,
            pid: slot.pid,
            // Dieselbe Regel wie in der Aufgabenliste des Clients: in
            // ERÖFFNUNG/ABSCHLUSS trägt die Rolle allein, sonst Titel · Rolle.
            label: zuteilungsLabel(section.label ?? '', item.title ?? 'Zuteilung', rolleMitHerkunft(slot)),
            // Derselbe Schlüssel, unter dem auch der Client die Bestätigung ablegt.
            key,
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

/**
 * **Was „Plan senden" für eine Woche verschickt** — die noch unbestätigten,
 * noch anstehenden Plätze, jeder mit seiner fertigen Zeile.
 *
 * Stand bis T95 als Schleife im Handler von `send-plan` und war damit nur über
 * einen ganzen Aufruf zu prüfen. Die Gegenprobe gegen die Vorschau des Clients
 * (`offeneMeldungen`, `edge-parity.test.ts`) verglich deshalb nur die
 * Aufzählung darunter — nicht die Ausschlüsse, die hier obendrauf kommen. Genau
 * dort kam einer hinzu: **Was vorbei ist, geht nicht mehr hinaus.** Am
 * Donnerstag eine Nachricht über den Dienstag zu schicken, hilft niemandem, und
 * der Knopf zählte dann eine andere Menge als die Planungs-Karte daneben.
 *
 * Tagesgenau wie im Client: am Tag der Zusammenkunft zählt sie noch. `heuteUTC`
 * liefert `heuteUtc` (planung.ts) — der Kalendertag des Planers, soweit er
 * glaubhaft ist.
 */
export function offeneDerWoche(
  weekStart: string,
  week: Week,
  fsInsts: FsInstance[],
  services: ServiceRow[],
  conf: Map<string, string>,
  meetingTimes: string,
  heuteUTC: number,
): Array<Pending & { eintrag: Eintrag }> {
  const offsets = meetingDayOffsets(meetingTimes)
  const zeiten = meetingTimesOf(meetingTimes)
  const offen: Array<Pending & { eintrag: Eintrag }> = []
  for (const tab of ['mid', 'we'] as const) {
    const meeting = week[tab]
    if (!meeting) continue
    // Entfällt die Zusammenkunft, gibt es nichts mitzuteilen (T30).
    if (istAusgefallenFuer(week.dev, tab)) continue
    const offset = versatzMitAbweichung(week.dev, tab, meeting.date, offsets[tab])
    // Vorbei ist sie am Tag danach — und dann braucht es keine Nachricht mehr.
    if (terminVorbei(weekStart, offset, heuteUTC)) continue
    const zeit = zeitMitAbweichung(week.dev, tab, meeting.date, zeiten[tab])
    // Der Termin trägt die Verlegung bereits in sich: steht sie zur Planzeit
    // fest, nennt die Nachricht von vornherein den richtigen Tag.
    const datum = terminText(weekStart, offset, meeting.date, zeit, week.dev, tab)
    for (const pend of pendingOfMeeting(weekStart, tab, meeting, services, conf)) {
      offen.push({ ...pend, eintrag: { datum, label: pend.label } })
    }
  }
  for (const pend of pendingOfFsWeek(weekStart, fsInsts, conf)) {
    // Jeder Treffpunkt hat seinen eigenen Tag.
    if (terminVorbei(weekStart, pend.offset, heuteUTC)) continue
    // Termin und Bezeichnung stehen fertig in der Aufzählung — beim Treffpunkt
    // trägt der Termin den Ort (siehe `FS_LEITER`).
    offen.push({ ...pend, eintrag: { datum: pend.datum, label: pend.label } })
  }
  return offen
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

/*
 * `terminText` steht in `_shared/planung.ts` — die Regel „Termin einer
 * Zusammenkunft" gehört in die untere, abhängigkeitsfreie Schicht, damit auch
 * `substitute` sie benutzen kann, ohne den Fragment-Übersetzer mitzuladen.
 * Hier nur weitergereicht, damit die bestehenden Import-Wege gültig bleiben.
 */
export { terminText }

/**
 * „Treffpunkt-Leiter" — die Bezeichnung eines Treffpunkt-Platzes, kanonisch
 * deutsch.
 *
 * **Ohne den Ort.** Hier stand einmal `Treffpunkt-Leiter · <Ort>`, während der
 * Client den Ort in den *Termin* schrieb — dieselbe Auskunft in zwei
 * Reihenfolgen, je nachdem, ob die Nachricht aus der Function oder aus dem
 * Browser kam. Der Ort gehört zum Termin: Er beantwortet „wo und wann", nicht
 * „was". So steht es auch in „Meine Aufgaben", und nur so liest der Empfänger
 * in Erinnerung, Zuteilung und Entzug dreimal dasselbe.
 *
 * Der Client bindet diese Konstante mit ein (`src/data/plan-versand.ts`) —
 * eine zweite Abschrift war genau der Grund, aus dem die beiden auseinander
 * liefen.
 */
export const FS_LEITER = 'Treffpunkt-Leiter'

/**
 * Termin eines Treffpunkts: „Samstag, 12. September · 09:30 · Bahnhof".
 *
 * Gegenstück zu `fsTerminText` im Client (`src/data/fs.ts`) — dieselbe Form,
 * dieselbe Reihenfolge, leere Teile fallen heraus. Der Tag kommt hier aus der
 * Wochenkennung plus Versatz statt aus einem fertigen `Date`, weil die Function
 * nur die Zeile aus `fs_weeks` vor sich hat. `edge-parity.test.ts` vergleicht
 * die beiden an denselben Eingaben.
 */
export function fsTerminText(
  woche: string,
  offset: number,
  zeit: string,
  ort: string,
): string {
  const termin = terminText(woche, offset, undefined, zeit)
  return ort ? `${termin} · ${ort}` : termin
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
