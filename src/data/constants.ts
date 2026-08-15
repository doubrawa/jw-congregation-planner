/**
 * Statische Beschriftungen und Zuordnungen aus dem Design-Handoff.
 * Reine Referenzwerte — keine Demo-Daten (die kommen aus dem Prototyp).
 */

import type { QualificationKey, Role, SectionColor, Theme } from './types'

export const ROLE_LABEL: Record<Role, string> = {
  aeltester: 'Ältester',
  dienstamtgehilfe: 'Dienstamtgehilfe',
  verkuendiger: 'Verkündiger',
  keine: 'Keine',
}

/** Nur Planer/Koordinatoren sehen Planen/Personen/Einstellungen. */
export const PLANNER_ROLES: readonly Role[] = ['aeltester', 'dienstamtgehilfe']

/** Rollen-Reihenfolge in der Oberfläche (Chips im Detail, Filter der Liste). */
export const ROLE_ORDER: readonly Role[] = ['aeltester', 'dienstamtgehilfe', 'verkuendiger', 'keine']

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
 * Bereiche, die fachlich Brüdern vorbehalten sind.
 *
 * **Kein Verbot.** Die Schalter im Personen-Detail bleiben frei bedienbar —
 * das ist Absicht (siehe `PrivToggle`). Diese Liste dient allein dem Hinweis:
 * ein versehentlich gesetzter Schalter führte die Auto-Zuteilung bisher ohne
 * jede Rückmeldung zu Gebet oder Vorsitz (F4).
 *
 * Nicht enthalten sind `schulung` und `schulungPartner` — Schülerteile
 * übernehmen auch Schwestern. `ratgeber` steht hier der Vollständigkeit halber
 * mit; am Slot trägt er ohnehin schon `male: true`, ebenso der
 * Schülerteil-Vortrag.
 */
export const BRUDER_BEREICHE: ReadonlySet<QualificationKey> = new Set<QualificationKey>([
  'vorsitzMid',
  'vorsitzWe',
  'vortrag',
  'gebet',
  'bibellesung',
  'leser',
  'studium',
  'treffpunkt',
  'ratgeber',
  'wtLeiter',
  'wtVertreter',
])

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
 * Farbschemata (Profil → Darstellung), Reihenfolge = Combobox.
 *
 * Die Namen sind Eigennamen und stehen in jeder App-Sprache gleich da —
 * deshalb eine Familie aus Pflanzen und Lebensmitteln, deren Wörter in nahezu
 * allen 34 Sprachen als Lehnwort existieren (Indigo, Olive, Papaya, Matcha,
 * Mango …). Vorher waren es deutsche Wörter („Reinweiß", „Blattgrün"), die
 * außerhalb des deutschen Sprachraums niemand einordnen konnte.
 *
 * Die technischen Schlüssel bleiben unverändert: sie stehen so im Profil jedes
 * Nutzers und in `data-theme` — ein Umbenennen würde jede gespeicherte Wahl
 * ungültig machen. `labelKey` gibt es nur für „Hoher Kontrast": das ist kein
 * Name, sondern eine Funktionsbeschreibung, und ausgerechnet die
 * Barrierefreiheits-Option muss man verstehen können.
 */
export const THEME_LIST: ReadonlyArray<{
  key: Theme
  label: string
  labelKey?: 'themeKontrast'
  dark: boolean
}> = [
  { key: 'weiss', label: 'Jasmin', dark: false },
  { key: 'indigo', label: 'Indigo', dark: false },
  { key: 'blatt', label: 'Olive', dark: false },
  { key: 'papaya', label: 'Papaya', dark: false },
  { key: 'pastell', label: 'Vanille', dark: false },
  { key: 'grau', label: 'Sesam', dark: false },
  { key: 'kontrast', label: 'Hoher Kontrast', labelKey: 'themeKontrast', dark: false },
  { key: 'graphit', label: 'Matcha', dark: true },
  { key: 'bernstein', label: 'Safran', dark: true },
  { key: 'aubergine', label: 'Aubergine', dark: true },
  { key: 'koralle', label: 'Mango', dark: true },
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
