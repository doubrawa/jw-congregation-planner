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
 * Aufgabenbereiche einer Person (9 Toggles im Personen-Detail).
 * true = qualifiziert für diese Art Slot.
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

export interface Notification {
  id: string
  type: NotificationType
  title: string
  text: string
  time: string
  read: boolean
}
