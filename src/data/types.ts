/**
 * Datenmodell — abgeleitet aus dem Design-Handoff (State-Referenz der
 * Prototyp-Logikklasse, siehe docs/design-handoff/README.md → "State").
 *
 * Verbindlich sind Modell und Regeln; die Demo-Daten (Namen, Wochen) im
 * Prototyp sind Platzhalter. Im Prototyp sind `names` Tupel
 * `[name, rolle, bereichsKey]` — hier als Objekt modelliert (idiomatischer);
 * beim Portieren der Demo-Daten entsprechend umformen.
 */

/**
 * Farbschema (Einstellungen → Profil → Darstellung). 4 helle + 4 dunkle
 * Paletten aus dem Design-Export „Farboptionen Programm" (inzwischen kräftiger
 * abgestimmt), dazu „pastell" (die ursprünglichen, weichen Töne), „grau"
 * (ganz ohne Farbton) und „kontrast" (Barrierefreiheit). Labels/Reihenfolge
 * in THEME_LIST (constants.ts), Paletten in styles/tokens.css. Alte Werte
 * 'light'/'dark' werden beim Laden auf weiss/graphit gemappt.
 */
export type Theme =
  | 'weiss'
  | 'indigo'
  | 'blatt'
  | 'papaya'
  | 'pastell'
  | 'grau'
  | 'kontrast'
  | 'graphit'
  | 'bernstein'
  | 'aubergine'
  | 'koralle'

/**
 * App-Sprache (UI). Programm-Inhalte nutzen separat die Versammlungssprache.
 * ~30 weltweit/in Europa relevante Sprachen; DE ist die Basis, alle anderen
 * überschreiben (fehlt eine Übersetzung, fällt die App auf Englisch zurück).
 * RTL-Sprachen (Arabisch etc.) folgen separat (brauchen dir="rtl"-Layout).
 */
export type Lang =
  | 'de' | 'en' | 'es' | 'fr' | 'it' | 'pt' | 'nl' | 'pl' | 'ru' | 'uk'
  | 'ro' | 'el' | 'cs' | 'sk' | 'hu' | 'hr' | 'sr' | 'bg' | 'sv' | 'da'
  | 'fi' | 'no' | 'tr' | 'zh' | 'ja' | 'ko' | 'id' | 'tl' | 'vi' | 'sw'
  | 'ar' | 'he' | 'fa' | 'ur' // RTL-Sprachen (Rechts-nach-links)

/** Sichtbare Bereiche. Die letzten drei nur für Planer/Koordinatoren. */
export type Screen =
  | 'login'
  | 'start'
  | 'programm'
  | 'aufgaben'
  | 'planen'
  | 'personen'
  | 'einstellungen'
  | 'profil'

/** Tatsächliche Zusammenkunft (Meeting-Daten): unter der Woche | am Wochenende. */
export type MeetingKey = 'mid' | 'we'

/**
 * Ansicht-Tab in Programm/Planen: eine Zusammenkunft (MeetingKey) oder die
 * „Zusammenkünfte für den Predigtdienst" ('fs', eigene Datenquelle fsWeeks).
 */
export type MeetingTab = MeetingKey | 'fs'

/* ---- Zusammenkünfte für den Predigtdienst ("Treffpunkte") ---- */

/**
 * Grundplan-Regel eines Treffpunkts (regelmäßige Zeit/Ort). Aus den Regeln
 * werden pro Woche die konkreten Instanzen (FsInstance) erzeugt.
 */
export interface FsRule {
  id: string
  grp: string // '' = Versammlungstreffpunkt (alle); sonst Group.id (Gruppentreffpunkt)
  wd: number // JS-Wochentag 0=So … 6=Sa
  time: string // "09:30"
  place: string
  monthly: number // 0 = jede Woche; 1..4 = N-ter Wochentag im Monat
  skipCong: boolean // Gruppen-Regel entfällt, wenn am selben Tag ein Versammlungstreffpunkt ist
}

/** Konkreter Treffpunkt einer Woche (aus einer Regel materialisiert oder manuell). */
export interface FsInstance {
  id: string // "wi|ruleId" (aus Regel) oder "x<zeit>" (manuell für diese Woche)
  ruleId: string | null
  grp: string // '' = Versammlung; sonst Group.id
  wd: number
  time: string
  place: string
  leader: string // zugeteilter Leiter ("" = offen)
  lpid?: string // Person-Id des Leiters — stabile Identität statt Name-Match.
  //             Wie `SlotAssignment.pid`; fehlt bei Altdaten.
  manual?: boolean // nur für diese Woche hinzugefügt (kein Grundplan)
}

/** Rolle einer Person (steuert Sichtbarkeit/Rechte). */
export type Role = 'aeltester' | 'dienstamtgehilfe' | 'verkuendiger'

/**
 * Aufgabenbereiche einer Person (Toggles im Personen-Detail).
 * true = qualifiziert für diese Art Slot.
 *
 * Zwei Sorten von Bereichen:
 *  - **fest**: die Bereichs-Keys der Programm-Slots (`vorsitz` … `studium`).
 *    `wtLeiter`/`wtVertreter` sind keine Slot-Keys, sondern kennzeichnen den
 *    fixen Wachtturm-Studium-Leiter bzw. seinen Vertreter (siehe planning.ts).
 *  - **dynamisch**: je konfiguriertem Hilfsdienst genau ein Bereich mit dem Key
 *    `svc:<dienstKey>` (siehe `serviceQualKey`). Ein neuer Hilfsdienst bringt so
 *    automatisch einen eigenen Schalter im Personen-Detail mit.
 *
 * Alle Felder sind optional lesbar (`boolean | undefined`), damit Alt-Datensätze
 * ohne die neueren Bereiche gültig bleiben.
 */
export interface Qualifications {
  vorsitzMid: boolean // Vorsitz unter der Woche
  vorsitzWe: boolean // Vorsitz am Wochenende
  vortrag: boolean
  gebet: boolean
  bibellesung: boolean // Bibellesung (Schätze aus Gottes Wort)
  leser: boolean // Leser (Versammlungsbibelstudium / Wachtturm-Studium)
  schulung: boolean // Schulungsaufgaben (Gesprächsführer/Vortrag; auch Schwestern)
  schulungPartner: boolean // nur als Gesprächspartner im Schülerteil (nicht Führer)
  studium: boolean // Studium leiten
  treffpunkt: boolean // Treffpunkte leiten (Zusammenkünfte für den Predigtdienst)
  ratgeber?: boolean // Ratgeber der Zusätzlichen Klasse (nur Brüder)
  wtLeiter?: boolean // fester Wachtturm-Studium-Leiter
  wtVertreter?: boolean // Vertreter, wenn der Leiter abwesend ist
  [serviceKey: string]: boolean | undefined // `svc:<dienstKey>` je Hilfsdienst
}

/**
 * Die **festen** Bereichs-Keys. Hilfsdienst-Bereiche sind dynamisch und daher
 * nicht Teil dieser Union — sie werden als freie Strings (`svc:<key>`) geführt.
 */
export type QualificationKey =
  | 'vorsitzMid'
  | 'vorsitzWe'
  | 'vortrag'
  | 'gebet'
  | 'bibellesung'
  | 'leser'
  | 'schulung'
  | 'schulungPartner'
  | 'studium'
  | 'treffpunkt'
  | 'ratgeber' // Ratgeber der Zusätzlichen Klasse (Anweisungen S-38, Absatz 26)
  | 'wtLeiter'
  | 'wtVertreter'

export interface Person {
  id: string
  fn: string // Vorname
  ln: string // Nachname
  /**
   * Optionaler Anzeigename (Kurzform). Überschreibt das automatische
   * "V. Nachname" — nötig, wenn zwei Personen sonst denselben Anzeigenamen
   * hätten (z. B. "Jörg Grünwald" statt "J. Grünwald" ×2), denn Zuteilungen
   * hängen am Anzeigenamen.
   */
  dn?: string
  role: Role
  female?: boolean // weibliche Rollenbezeichnung ("Verkündigerin")
  tel: string
  mail: string
  priv: Qualifications
  grp?: string | null // Predigtdienstgruppe (Group.id) oder null = keine
  fam?: string | null // Haushalts-/Familien-Id — gleiche Id = Familienangehörige
  /**
   * Planer-Recht (Feste Rollen im Personen-Detail): sieht Planen/Personen/
   * Einstellungen. Wird beim Einladen in den Code übernommen und bei
   * verknüpften Konten in members.planner gespiegelt (store.tsx).
   */
  planner?: boolean
}

/**
 * Predigtdienstgruppe. Jeder Verkündiger gehört zu höchstens einer Gruppe mit
 * einem Aufseher (`ov`) und einem Gehilfen (`as`) — beides Person-IDs oder null.
 * Die Reinigung rotiert über die Gruppen (Wochenindex mod Anzahl); die Wochen
 * speichern weiterhin den Namens-String ("Gruppe N"), damit alte Daten gültig
 * bleiben.
 */
export interface Group {
  id: string
  name: string // z. B. "Gruppe 1"
  ov: string | null // Aufseher (Person.id)
  as: string | null // Gehilfe (Person.id)
}

/** Farb-/Bereichslogik der Panels (wie im Arbeitsheft). */
export type SectionColor =
  | 'neutral' // Eröffnung / Abschluss
  | 'petrol' // Schätze aus Gottes Wort
  | 'gold' // Uns im Dienst verbessern
  | 'wein' // Unser Leben als Christ
  | 'neutral2' // Hilfsdienste

/** Ein zugeteilter Name auf einem Programmpunkt. Leerer Name = offener Slot. */
export interface SlotAssignment {
  name: string // Anzeigename (Cache); bei pid aus der Person abgeleitet/gepflegt
  pid?: string // Person-Id der Zuteilung — stabile Identität (statt Name-Match).
  //            Fehlt bei externen Rednern (Gastredner/Kreisaufseher) und Altdaten.
  rolle?: string // Rollenlabel: Vorsitz, Gebet, Leiter, Leser, Gesprächspartner …
  bereichsKey?: QualificationKey | string // nötige Qualifikation für den Slot
  male?: boolean // Slot nur männlich besetzbar (z. B. Schülerteil-Vortrag)
}

/** Lied zwischen Programmpunkten (zentriert, kursiv) — eigene Zeile. */
export interface SongItem {
  song: string // z. B. "Lied 128"
}

/** Regulärer Programmpunkt. */
export interface PartItem {
  num?: number // laufende Nummer (kursiv, Bereichsfarbe)
  title: string
  meta?: string // Dauer / Quelle / Rahmen, z. B. "Von Haus zu Haus · 3 Min."
  names: SlotAssignment[] // Zuteilungen im Hauptsaal
  /**
   * Dieselben Plätze noch einmal für die Zusätzliche Klasse — nur bei
   * Schülerteilen. Struktur identisch zu `names`.
   *
   * Bewusst ein zweites Feld statt weiterer Einträge in `names`: die
   * Bestätigungs-Schlüssel, das S-89-Formular und die Partner-Regeln greifen
   * über den Index in `names` zu. Angehängte Plätze würden all das verschieben.
   *
   * Ob die Klasse gerade besteht, sagt NICHT dieses Feld — es bleibt beim
   * Ausschalten stehen, damit die Planung erhalten bleibt. Die Antwort gibt
   * `hatAuxKlasse(meeting)`.
   */
  aux?: SlotAssignment[]
}

export type ProgramItem = SongItem | PartItem

/**
 * Ein Hilfsdienst-Platz (Mikrofon, Ton, Ordner …). Wie beim Programm-Slot ist
 * `pid` die stabile Identität; sie fehlt bei der Reinigungs-Rotation (dort steht
 * im Namen „Gruppe N") und bei Altdaten. `{ name: '' }` = offener Platz.
 */
export interface HelperSlot {
  name: string
  pid?: string
}

export interface Section {
  label: string // Caps-Label, z. B. "SCHÄTZE AUS GOTTES WORT"
  farbe: SectionColor
  items: ProgramItem[]
}

export interface Meeting {
  date: string // z. B. "Dienstag, 8. September · 19:00 · Königreichssaal"
  end: string // "Ende ca. 20:45"
  sections: Section[]
  helpers: Record<string, HelperSlot[]> // dienstKey -> Plätze ({ name: '' } = offen)
  /**
   * Ratgeber der Zusätzlichen Klasse (nur Zusammenkunft unter der Woche).
   * Einer je Zusammenkunft, nicht je Programmpunkt: er begleitet die ganze
   * Klasse.
   *
   * Dieses Feld ist zugleich die Marke „hier gibt es eine Zusätzliche Klasse"
   * — ohne Ratgeber keine Klasse (S-38, Absatz 26). Siehe `hatAuxKlasse`.
   */
  auxRatgeber?: SlotAssignment
}

export interface Week {
  range: string // z. B. "7.–13. September"
  book: string // Bibelbuch (kursiv)
  start?: string // ISO-Startdatum (nur bei jw.org-Import; für die Reihenfolge)
  lang?: string // jw.org-Sprachcode, in dem der Import geholt wurde (Herkunft)
  current: boolean // aktuelle Woche (Chip "AKTUELLE WOCHE")
  co?: boolean // Besuch des Kreisaufsehers (Chip, Dienstvortrag statt VBS)
  mem?: boolean // Gedächtnismahl-Woche (Chip + Banner)
  memCancel?: MeetingTab // ausfallende Zusammenkunft (deren Tab zeigt das Gedächtnismahl)
  mid: Meeting // Unter der Woche
  we: Meeting // Wochenende
  /**
   * Sprachvarianten derselben Woche (jw.org-Sprachcode → strukturgleiche Woche
   * ohne Zuteilungen). Beim Import mitgeholt („Weitere Programmsprachen");
   * die Anzeige übernimmt daraus nur die Texte — Zuteilungen, Flags und
   * Struktur bleiben kanonisch (siehe localizedWeek in data/localize.ts).
   */
  alt?: Record<string, Week>
  /**
   * Platzhalter für eine Woche, die nicht geladen wurde (älter als das
   * Ladefenster, siehe WEEK_LIMIT in lib/data.ts).
   *
   * Der Platz im Array MUSS erhalten bleiben, weil der Index zugleich die
   * `position` in der Datenbank ist und in jedem gespeicherten `task_key`
   * steckt („60|mid|part|2|1|0"). Würde man nur die geladenen Wochen
   * durchnummerieren, zeigten alle bestehenden Bestätigungen auf die falsche
   * Woche. Der Platzhalter ist leer, trägt also nirgends etwas bei — und wird
   * **nie gespeichert** (siehe saveWeek), damit er die echte Zeile in der
   * Datenbank nicht überschreibt.
   */
  stub?: true
}

/**
 * Hilfsdienst (Einstellungen). Konfiguriert Anzahl der Slots.
 *
 * Jeder Dienst besitzt genau einen Aufgabenbereich — abgeleitet aus `key`
 * (`serviceQualKey`), nicht gespeichert. Ausnahme: Dienste mit `groups`
 * rotieren Gruppen statt Personen und brauchen daher keinen Bereich.
 */
export interface Service {
  key: string
  name: string
  count: number // 1..6
  groups?: boolean // Gruppen-Rotation (Reinigung: "Gruppe 1–3")
  /**
   * Nur Alt-Datensätze: der früher fest zugeordnete Bereichs-Key (z. B. teilten
   * sich Eingangs- und Saalordner den Bereich `ordner`). Dient ausschließlich der
   * Migration auf `svc:<key>` beim Laden — neue Dienste setzen das Feld nie.
   */
  legacyPriv?: string | null
}

/**
 * Abwesenheit einer Person (Von–Bis als Datum).
 *
 * Wird versammlungsweit geladen, nicht nur die eigene: die Planung muss wissen,
 * wer fehlt. `userId` bleibt daneben stehen, damit „Deine Einträge" im
 * persönlichen Bereich auch dann die eigenen zeigt, wenn das Konto noch keiner
 * Person zugeordnet ist (`personId` null).
 */
export interface Absence {
  id: string
  personId: string | null // verknüpfte Person — nur damit zählt sie für die Planung
  userId: string // Ersteller
  from: string // ISO-Datum
  to: string // ISO-Datum
  reason: string // optional
}

/* ---- Mitglieder & Einladungen (Produktionsmodus) ---- */

/** Mitglied der Versammlung (Konto ↔ Person); Planer sehen alle. */
export interface Member {
  userId: string
  email: string
  personId: string | null
  planner: boolean
}

/** Offener Einladungscode (nur Planer sichtbar). */
export interface Invite {
  id: string
  code: string
  personId: string | null
  planner: boolean
}

/* ---- Persönliche Aufgaben & Bestätigungs-Flow ---- */

/** Status einer dem Nutzer zugeteilten Aufgabe. */
export type TaskStatus = 'offen' | 'bestätigt' | 'verhindert'

/** Ausgefülltes S-89-Formular („Aufgabe in der Leben-und-Dienst-Zusammenkunft“). */
export interface S89Payload {
  name: string
  partner: string // Gesprächspartner/in (leer = kein Partner)
  date: string // "Di, 8. September · 19:00"
  type: string // Aufgabe inkl. Rahmen ("Gespräche beginnen · Informell")
  point: string // Schulungspunkt ("lmd Lektion 1" / "th Lektion 10"), leer möglich
  /** Durchzuführen in der Zusätzlichen Klasse statt im Hauptsaal. */
  aux?: boolean
}

/** Eine dem eingeloggten Nutzer zugeteilte Aufgabe (persönlicher Bereich). */
export interface MyTask {
  id: string
  title: string // "Gespräche beginnen (informell)"
  date: string // "Di, 8. September · ca. 19:35"
  chip: string // Countdown-Text NUR im Demo-Modus (z. B. "in 4 Tagen")
  at?: number | null // UTC-ms des Zusammenkunftstags → Live-Countdown (Intl); null = keiner
  status: TaskStatus
  s89: S89Payload | null // Schulungsaufgabe → S-89 anzeigbar
}

/**
 * Offenes Ersatzgesuch für einen Hilfsdienst: Der Bearbeiter hat „verhindert"
 * gemeldet; qualifizierte Personen (gleicher Dienst) können einspringen. Rein
 * abgeleitet (planning.ts deriveSubstituteReqs), nicht gespeichert.
 */
export interface SubstituteReq {
  key: string // Hilfsdienst-task_key
  svc: string // Dienst-Key
  title: string // Dienstname (Anzeige über tu)
  date: string
  at?: number | null // UTC-ms des Zusammenkunftstags → Countdown
  declinedBy: string // Anzeigename der Person, die nicht kann
}

/**
 * Bestätigungs-Status je Aufgabe (Produktionsmodus). Schlüssel = stabiler
 * Slot-Pfad (siehe taskKey in planning.ts); nur bestätigt/verhindert werden
 * gespeichert — fehlender Eintrag bedeutet „offen“.
 */
export type ConfirmationMap = Record<string, TaskStatus>

/** Erinnerungs-Einstellungen (Einstellungen → ERINNERUNGEN). */
export interface Reminders {
  first: number // erste Erinnerung: N Tage vorher (1..21)
  last: number // letzte Erinnerung: N Tage vorher (0..7, 0 = am Tag)
  repeat: boolean // täglich wiederholen, bis bestätigt
}

/* ---- Zuteilungs-Sheet (Planen) ---- */

interface SlotSelectionBase {
  wi: number // Wochenindex
  tab: MeetingKey
  label: string // Sheet-Titel, z. B. "Bibellesung · Jer 32:6-18 · Leser"
  priv: QualificationKey | string | null // nötige Qualifikation (null = alle)
  groups: boolean // Gruppen-Rotation (Reinigung): Kandidaten sind Gruppe 1–3
}

/** Slot eines Programmpunkts (Section/Item/Name-Index). */
export interface PartSlotSelection extends SlotSelectionBase {
  kind: 'part'
  si: number
  ii: number
  ni: number
  guest?: boolean // externer Redner (Gastredner/Kreisaufseher): Freitext statt Personenliste
  /**
   * Platz in der Zusätzlichen Klasse statt im Hauptsaal (PartItem.aux).
   * Bewusst ein Zusatz zur bestehenden Auswahl statt einer eigenen Art: das
   * Zuteilungs-Sheet, die Konfliktprüfung und das S-89-Formular arbeiten
   * dadurch unverändert weiter.
   */
  aux?: boolean
}

/** Slot eines Hilfsdienstes (Dienst-Key + Position). */
export interface HelperSlotSelection extends SlotSelectionBase {
  kind: 'helper'
  svc: string
  pos: number
}

/** Leiter-Slot eines Treffpunkts (Zusammenkunft für den Predigtdienst). */
export interface FsSlotSelection {
  kind: 'fs'
  wi: number // Wochenindex
  instId: string // FsInstance.id
  label: string
  priv: QualificationKey | string | null
  groups: boolean
}

/**
 * Ratgeber-Platz der Zusätzlichen Klasse. Eigene Art, weil er an der
 * Zusammenkunft hängt und nicht an einem Programmpunkt — er hat also weder
 * Sektions- noch Punkt-Index.
 */
export interface RatgeberSlotSelection extends SlotSelectionBase {
  kind: 'ratgeber'
  tab: MeetingKey
}

export type SlotSelection =
  | PartSlotSelection
  | HelperSlotSelection
  | FsSlotSelection
  | RatgeberSlotSelection

/** Slot einer echten Zusammenkunft (Programmpunkt, Hilfsdienst oder Ratgeber). */
export type MeetingSlotSelection =
  | PartSlotSelection
  | HelperSlotSelection
  | RatgeberSlotSelection

export type NotificationType =
  | 'zuteilung' // Neue Zuteilung
  | 'erinnerung' // Erinnerung
  | 'gesendet' // Zuteilung(en) gesendet
  | 'import' // Programm importiert
  | 'verhindert' // Verhinderung gemeldet (an Koordinator)

export interface Notification {
  id: string
  type: NotificationType
  title: string
  text: string
  time: string
  read: boolean
  taskId?: string // verknüpfte MyTask → Inline-„Bestätigen“ in der Mitteilung
  /**
   * In dieser App gerade entstanden und noch nicht verteilt. Aus der Datenbank
   * geladene Mitteilungen tragen das Kennzeichen nie — daran erkennt persist.ts,
   * was an die Planer zu schicken ist, ohne eine Liste von Aktionen zu pflegen.
   */
  local?: true
}
