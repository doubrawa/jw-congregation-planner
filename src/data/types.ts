/**
 * Datenmodell — abgeleitet aus dem Design-Handoff (State-Referenz der
 * Prototyp-Logikklasse, siehe docs/design-handoff/README.md → "State").
 *
 * Verbindlich sind Modell und Regeln; die Demo-Daten (Namen, Wochen) im
 * Prototyp sind Platzhalter. Im Prototyp sind `names` Tupel
 * `[name, rolle, bereichsKey]` — hier als Objekt modelliert (idiomatischer);
 * beim Portieren der Demo-Daten entsprechend umformen.
 */

export type Theme = 'light' | 'dark'

/** App-Sprache (UI). Programm-Inhalte nutzen separat die Versammlungssprache. */
export type Lang = 'de' | 'en' | 'es' | 'fr'

/** Sichtbare Bereiche. Die letzten drei nur für Planer/Koordinatoren. */
export type Screen =
  | 'login'
  | 'programm'
  | 'aufgaben'
  | 'planen'
  | 'personen'
  | 'einstellungen'

/** Meeting-Tab: Zusammenkunft unter der Woche | Wochenende. */
export type MeetingTab = 'mid' | 'we'

/** Rolle einer Person (steuert Sichtbarkeit/Rechte). */
export type Role = 'aeltester' | 'dienstamtgehilfe' | 'verkuendiger'

/**
 * Aufgabenbereiche einer Person (Toggles im Personen-Detail).
 * true = qualifiziert für diese Art Slot. Die ersten neun entsprechen den
 * Bereichs-Keys der Programm-Slots; `wtLeiter`/`wtVertreter` sind keine
 * Slot-Keys, sondern kennzeichnen den fixen Wachtturm-Studium-Leiter bzw.
 * seinen Vertreter (Auto-Zuteilung, siehe planning.ts). Optional, damit
 * Alt-Datensätze ohne diese Felder gültig bleiben.
 */
export interface Qualifications {
  vorsitz: boolean
  vortrag: boolean
  gebet: boolean
  lesen: boolean // Bibellesung / Leser
  schulung: boolean // Schulungsaufgaben
  studium: boolean // Studium leiten
  mikrofon: boolean // Mikrofone
  ton: boolean // Ton / Video
  ordner: boolean // Ordner / Eingang
  wtLeiter?: boolean // fester Wachtturm-Studium-Leiter
  wtVertreter?: boolean // Vertreter, wenn der Leiter abwesend ist
}

export type QualificationKey = keyof Qualifications

export interface Person {
  id: string
  fn: string // Vorname
  ln: string // Nachname
  role: Role
  female?: boolean // weibliche Rollenbezeichnung ("Verkündigerin")
  tel: string
  mail: string
  absent: number[] // Wochenindizes, an denen die Person abwesend ist
  priv: Qualifications
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
  name: string
  rolle?: string // Rollenlabel: Vorsitz, Gebet, Leiter, Leser, "mit A. Hoffmann" …
  bereichsKey?: QualificationKey | string // nötige Qualifikation für den Slot
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
  names: SlotAssignment[]
}

export type ProgramItem = SongItem | PartItem

export interface Section {
  label: string // Caps-Label, z. B. "SCHÄTZE AUS GOTTES WORT"
  farbe: SectionColor
  items: ProgramItem[]
}

export interface Meeting {
  date: string // z. B. "Dienstag, 8. September · 19:00 · Königreichssaal"
  end: string // "Ende ca. 20:45"
  sections: Section[]
  helpers: Record<string, string[]> // dienstKey -> zugeteilte Namen ("" = offen)
}

export interface Week {
  range: string // z. B. "7.–13. September"
  book: string // Bibelbuch (kursiv)
  current: boolean // aktuelle Woche (Chip "AKTUELLE WOCHE")
  co?: boolean // Besuch des Kreisaufsehers (Chip, Dienstvortrag statt VBS)
  mem?: boolean // Gedächtnismahl-Woche (Chip + Banner)
  memCancel?: MeetingTab // ausfallende Zusammenkunft (deren Tab zeigt das Gedächtnismahl)
  mid: Meeting // Unter der Woche
  we: Meeting // Wochenende
}

/** Hilfsdienst (Einstellungen). Konfiguriert Anzahl der Slots. */
export interface Service {
  key: string
  name: string
  count: number // 1..6
  priv: QualificationKey | null // nötige Qualifikation, oder null (z. B. Reinigung)
  groups?: boolean // Gruppen-Rotation (Reinigung: "Gruppe 1–3")
}

/** Eigene Abwesenheit (persönlicher Bereich). */
export interface Absence {
  id: string
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
}

/** Eine dem eingeloggten Nutzer zugeteilte Aufgabe (persönlicher Bereich). */
export interface MyTask {
  id: string
  title: string // "Gespräche beginnen (informell)"
  date: string // "Di, 8. September · ca. 19:35"
  chip: string // Countdown "in 4 Tagen" (leer = kein Chip)
  status: TaskStatus
  s89: S89Payload | null // Schulungsaufgabe → S-89 anzeigbar
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
  tab: MeetingTab
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
}

/** Slot eines Hilfsdienstes (Dienst-Key + Position). */
export interface HelperSlotSelection extends SlotSelectionBase {
  kind: 'helper'
  svc: string
  pos: number
}

export type SlotSelection = PartSlotSelection | HelperSlotSelection

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
}
