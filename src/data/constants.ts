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
  vorsitzMid: 'Vorsitz (unter der Woche)',
  vorsitzWe: 'Vorsitz (Wochenende)',
  vortrag: 'Vorträge',
  gebet: 'Gebete',
  bibellesung: 'Bibellesung',
  leser: 'Leser',
  schulung: 'Schulungsaufgaben',
  schulungPartner: 'Schulungsaufgaben Partner',
  studium: 'Studium leiten',
  treffpunkt: 'Treffpunkte leiten',
  ratgeber: 'Ratgeber (Zusätzliche Klasse)',
  wtLeiter: 'Wachtturm-Studium-Leiter',
  wtVertreter: 'Wachtturm-Studium-Vertreter',
}

/**
 * Die festen, slot-relevanten Aufgabenbereiche (Toggle-Reihenfolge im Detail).
 * Die Hilfsdienst-Bereiche folgen dahinter und kommen aus `state.services`.
 */
export const QUALIFICATION_ORDER: readonly QualificationKey[] = [
  'vorsitzMid',
  'vorsitzWe',
  'vortrag',
  'gebet',
  'bibellesung',
  'leser',
  'schulung',
  'schulungPartner',
  'studium',
  'treffpunkt',
  'ratgeber',
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
  { key: 'pastell', label: 'Pastell', dark: false },
  { key: 'grau', label: 'Grau', dark: false },
  { key: 'kontrast', label: 'Hoher Kontrast', dark: false },
  { key: 'graphit', label: 'Graphit', dark: true },
  { key: 'bernstein', label: 'Bernstein', dark: true },
  { key: 'aubergine', label: 'Aubergine', dark: true },
  { key: 'koralle', label: 'Koralle', dark: true },
]

/** true für die dunklen Paletten (steuert data-dark / color-scheme). */
export function isDarkTheme(theme: Theme): boolean {
  return THEME_LIST.some((t) => t.key === theme && t.dark)
}

/**
 * Schriftgrößen-Stufen (Profil → Schriftgröße). Der Faktor landet als --fs auf
 * <html>; jede font-size im CSS ist calc(<px> * var(--fs)). 1 = unveränderter
 * Auslieferungszustand, eine Stufe darunter, drei darüber (Lesbarkeit).
 */
export const FONT_SCALES = [0.9, 1, 1.15, 1.3, 1.45] as const
export type FontScale = (typeof FONT_SCALES)[number]
export const DEFAULT_FONT_SCALE: FontScale = 1

/** Gespeicherten/übergebenen Wert auf eine bekannte Stufe eingrenzen. */
export function asFontScale(value: unknown): FontScale | null {
  const n = typeof value === 'string' ? Number(value) : value
  return FONT_SCALES.find((s) => s === n) ?? null
}

/**
 * Kanonische Sektions-Labels — Logik-Keys der Planungs-/Zuteilungslogik.
 * Bleiben in den Wochendaten immer deutsch; übersetzt wird nur die Anzeige.
 */
export const LABEL_EROEFFNUNG = 'ERÖFFNUNG'
export const LABEL_WT_STUDIUM = 'WACHTTURM-STUDIUM'
export const LABEL_LAC = 'UNSER LEBEN ALS CHRIST'
export const LABEL_VORTRAG = 'ÖFFENTLICHER VORTRAG'
export const LABEL_ABSCHLUSS = 'ABSCHLUSS'
