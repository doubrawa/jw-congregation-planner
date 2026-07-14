/**
 * Statische Beschriftungen und Zuordnungen aus dem Design-Handoff.
 * Reine Referenzwerte — keine Demo-Daten (die kommen aus dem Prototyp).
 */

import type { QualificationKey, Role, SectionColor } from './types'

export const ROLE_LABEL: Record<Role, string> = {
  aeltester: 'Ältester',
  dienstamtgehilfe: 'Dienstamtgehilfe',
  verkuendiger: 'Verkündiger',
}

/** Nur Planer/Koordinatoren sehen Planen/Personen/Einstellungen. */
export const PLANNER_ROLES: readonly Role[] = ['aeltester', 'dienstamtgehilfe']

/** Aufgabenbereiche (Reihenfolge = Toggle-Reihenfolge im Detail). */
export const QUALIFICATION_LABEL: Record<QualificationKey, string> = {
  vorsitz: 'Vorsitz',
  vortrag: 'Vorträge',
  gebet: 'Gebete',
  bibellesung: 'Bibellesung',
  leser: 'Leser',
  schulung: 'Schulungsaufgaben',
  studium: 'Studium leiten',
  mikrofon: 'Mikrofone',
  ton: 'Ton / Video',
  ordner: 'Ordner / Eingang',
  zoomordner: 'Zoom-Ordner',
  wtLeiter: 'Wachtturm-Studium-Leiter',
  wtVertreter: 'Wachtturm-Studium-Vertreter',
}

/** Die slot-relevanten Aufgabenbereiche (Toggle-Reihenfolge im Detail). */
export const QUALIFICATION_ORDER: readonly QualificationKey[] = [
  'vorsitz',
  'vortrag',
  'gebet',
  'bibellesung',
  'leser',
  'schulung',
  'studium',
  'mikrofon',
  'ton',
  'ordner',
  'zoomordner',
]

/**
 * Aufgabenbereiche, die laut den Anweisungen für die Zusammenkunft nur getaufte
 * Brüder ausführen — also alle außer den Schulungsaufgaben (die auch Schwestern
 * übernehmen). Steuert die Geschlechts-Prüfung bei der Zuteilung (isQualified).
 */
export const BROTHERS_ONLY: ReadonlySet<QualificationKey> = new Set<QualificationKey>([
  'vorsitz',
  'vortrag',
  'gebet',
  'bibellesung',
  'leser',
  'studium',
  'mikrofon',
  'ton',
  'ordner',
  'zoomordner',
])

/** Feste Rollen (fixer Leiter/Vertreter) — eigener Block im Personen-Detail. */
export const WT_ROLE_ORDER: readonly QualificationKey[] = ['wtLeiter', 'wtVertreter']

/**
 * Bereichsfarbe → CSS-Token-Suffixe (Panel-Fläche, Label-/Akzentfarbe,
 * Hairline). Nutzung z. B. `var(--t${Panel})`. Siehe styles/tokens.css.
 */
export const SECTION_TOKENS: Record<
  SectionColor,
  { panel: string; accent: string; hairline: string }
> = {
  neutral: { panel: 'tNeu', accent: 'mut', hairline: 'lineNeu' },
  neutral2: { panel: 'tNeu2', accent: 'mut', hairline: 'lineNeu' },
  petrol: { panel: 'tPet', accent: 'pet', hairline: 'linePet' },
  gold: { panel: 'tGld', accent: 'gld', hairline: 'lineGld' },
  wein: { panel: 'tWein', accent: 'wein', hairline: 'lineWein' },
}

/** Desktop-Breakpoint aus dem Handoff. */
export const DESKTOP_BREAKPOINT = 920
