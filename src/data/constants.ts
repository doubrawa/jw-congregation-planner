/**
 * Statische Beschriftungen und Zuordnungen aus dem Design-Handoff.
 * Reine Referenzwerte — keine Demo-Daten (die kommen aus dem Prototyp).
 */

import type { QualificationKey, Role, SectionColor, Theme } from './types'

export const ROLE_LABEL: Record<Role, string> = {
  aeltester: 'Ältester',
  dienstamtgehilfe: 'Dienstamtgehilfe',
  verkuendiger: 'Verkündiger',
}

/** Nur Planer/Koordinatoren sehen Planen/Personen/Einstellungen. */
export const PLANNER_ROLES: readonly Role[] = ['aeltester', 'dienstamtgehilfe']

/** Feste Aufgabenbereiche (Reihenfolge = Toggle-Reihenfolge im Detail). */
export const QUALIFICATION_LABEL: Record<QualificationKey, string> = {
  vorsitz: 'Vorsitz',
  vortrag: 'Vorträge',
  gebet: 'Gebete',
  bibellesung: 'Bibellesung',
  leser: 'Leser',
  schulung: 'Schulungsaufgaben',
  studium: 'Studium leiten',
  wtLeiter: 'Wachtturm-Studium-Leiter',
  wtVertreter: 'Wachtturm-Studium-Vertreter',
}

/**
 * Die festen, slot-relevanten Aufgabenbereiche (Toggle-Reihenfolge im Detail).
 * Die Hilfsdienst-Bereiche folgen dahinter und kommen aus `state.services`.
 */
export const QUALIFICATION_ORDER: readonly QualificationKey[] = [
  'vorsitz',
  'vortrag',
  'gebet',
  'bibellesung',
  'leser',
  'schulung',
  'studium',
]

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

/**
 * Farbschemata (Profil → Darstellung), Reihenfolge = Combobox. Die Labels
 * sind Eigennamen der Paletten und bleiben in allen App-Sprachen deutsch.
 */
export const THEME_LIST: ReadonlyArray<{ key: Theme; label: string; dark: boolean }> = [
  { key: 'weiss', label: 'Reinweiß', dark: false },
  { key: 'indigo', label: 'Indigo', dark: false },
  { key: 'blatt', label: 'Blattgrün', dark: false },
  { key: 'papaya', label: 'Papaya', dark: false },
  { key: 'graphit', label: 'Graphit', dark: true },
  { key: 'bernstein', label: 'Bernstein', dark: true },
  { key: 'aubergine', label: 'Aubergine', dark: true },
  { key: 'koralle', label: 'Koralle', dark: true },
]

/** true für die dunklen Paletten (steuert data-dark / color-scheme). */
export function isDarkTheme(theme: Theme): boolean {
  return THEME_LIST.some((t) => t.key === theme && t.dark)
}

/** Desktop-Breakpoint aus dem Handoff. */
export const DESKTOP_BREAKPOINT = 920
