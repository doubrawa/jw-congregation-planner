/**
 * Statische Beschriftungen und Zuordnungen aus dem Design-Handoff.
 * Reine Referenzwerte — keine Demo-Daten (die kommen aus dem Prototyp).
 */

import type { FarbModus, QualificationKey, Role, Theme } from './types'

/*
 * Hier stand `PLANNER_ROLES = ['aeltester', 'dienstamtgehilfe']` mit dem Satz
 * „Nur Planer/Koordinatoren sehen Planen/Personen/Einstellungen". Beides ist
 * überholt: Das Planer-Recht hängt seit den Mitgliedschaften an
 * `members.planner` bzw. `Person.planner`, **nicht** an der Rolle — ein
 * Ältester ohne Haken plant nichts, ein Verkündiger mit Haken schon. Die
 * Konstante hatte keinen Aufrufer mehr und behauptete das Gegenteil der
 * geltenden Regel; ein falscher Wegweiser ist schlechter als keiner.
 */

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
  'besprechung',
  'gebet',
  'bibellesung',
  'leser',
  'schulung',
  'schulungPartner',
  'schulungVortrag',
  'studium',
  'treffpunkt',
  'zeugnis',
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
 * Schülerteil-Vortrag (`schulungVortrag`).
 */
export const BRUDER_BEREICHE: ReadonlySet<QualificationKey> = new Set<QualificationKey>([
  'vorsitzMid',
  'vorsitzWe',
  'vortrag',
  'besprechung',
  'schulungVortrag',
  'gebet',
  'bibellesung',
  'leser',
  'studium',
  'treffpunkt',
  'ratgeber',
  'wtLeiter',
  'wtVertreter',
])

/*
 * Hier stand `SECTION_TOKENS` — eine Zuordnung Bereichsfarbe → CSS-Token-
 * Namen, gedacht für `var(--t${Panel})` im JSX. Gebaut wurde es nie so: Die
 * Panels tragen `data-farbe="petrol"`, und die Farben stehen als
 * Attribut-Regeln in `styles/tokens.css`. Damit lag die Zuordnung zweimal
 * vor — einmal wirksam im CSS, einmal unbenutzt hier —, und nur eine der
 * beiden wurde gepflegt.
 */

/**
 * Darstellungen (Profil → Darstellung) in der Reihenfolge des Entwurfs (T121):
 * Dunkel, Hell, Automatisch. Bis zum 12.10.2026 waren es elf Farbschemata
 * mit Eigennamen; „Automatisch" folgt dem Gerät und ist der Standard.
 */
export const THEME_LIST: ReadonlyArray<{
  key: Theme
  labelKey: 'themeDunkel' | 'themeHell' | 'themeAuto'
}> = [
  { key: 'dunkel', labelKey: 'themeDunkel' },
  { key: 'hell', labelKey: 'themeHell' },
  { key: 'auto', labelKey: 'themeAuto' },
]

export const DEFAULT_THEME: Theme = 'auto'

/**
 * Die dunklen der elf Farbschemata, die bis zum 12.10.2026 im Gerät
 * gespeichert wurden (dazu `dark` aus der Zeit davor). Wer eines gewählt hatte,
 * wollte es dunkel und bekommt „dunkel"; die hellen fallen auf den Standard —
 * fast jeder hatte das helle Standardschema nie selbst gewählt, es stand nur
 * gespeichert da. index.html führt dieselbe Liste (tests/vorab-paint.test.ts).
 */
export const ALTE_DUNKLE_SCHEMATA: readonly string[] = ['graphit', 'bernstein', 'aubergine', 'koralle', 'dark']

/** Gespeicherten/übergebenen Wert auf eine Darstellung eingrenzen. */
export function asTheme(value: string | null): Theme | null {
  if (!value) return null
  if (ALTE_DUNKLE_SCHEMATA.includes(value)) return 'dunkel'
  return THEME_LIST.some((t) => t.key === value) ? (value as Theme) : null
}

/** Welche Palette gerade gilt: „auto" folgt dem Gerät. */
export function farbModus(theme: Theme, geraetDunkel: boolean): FarbModus {
  if (theme !== 'auto') return theme
  return geraetDunkel ? 'dunkel' : 'hell'
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
export const LABEL_SCHAETZE = 'SCHÄTZE AUS GOTTES WORT'
export const LABEL_DIENST = 'UNS IM DIENST VERBESSERN'
/**
 * Der Dienstvortrag der Dienstwoche — kein Abschnitt des Arbeitshefts, sondern
 * einer, den die App selbst einsetzt (`setDienstwoche`). Stand bis hierher als
 * einziger seiner Art in `helpers.ts`, also außerhalb dieser Gruppe.
 */
export const LABEL_DIENSTVORTRAG = 'DIENSTVORTRAG'

/**
 * Was ein Abschnitt **ist** — unabhängig davon, wie er heißt.
 *
 * Bis hierher entschied der Anzeigetext über Verhalten: „Ist das der
 * Wachtturm-Abschnitt?" wurde als `section.label === 'WACHTTURM-STUDIUM'`
 * gefragt, an über dreißig Stellen, zwei davon als fest verdrahtetes Deutsch in
 * der Deno-Laufzeit. Die Wochendaten sind zwar kanonisch deutsch — aber ein
 * Anzeigetext ist trotzdem der falsche Schlüssel: Er ist zum Lesen da, nicht
 * zum Entscheiden, und wer ihn ändert, ändert stillschweigend Verhalten.
 */
export type SectionKind =
  | 'eroeffnung'
  | 'schaetze'
  | 'dienst'
  | 'lac'
  | 'wtStudium'
  | 'vortrag'
  | 'dienstvortrag'
  | 'abschluss'

/**
 * Die Stelle im Client, an der ein Abschnittsname auf seine Art abgebildet
 * wird. Alles andere fragt nach der Art, nicht nach dem Namen. Die Edge
 * Functions können `src` nicht einbinden: Die beiden Namen, nach denen ihre
 * Regeln fragen, stehen deshalb in `_shared/planung.ts` noch einmal
 * (`ART_IM_ALTBESTAND`) — dass beide gleich entscheiden, prüft
 * `edge-parity.test.ts`.
 */
const ART_JE_LABEL: Record<string, SectionKind> = {
  [LABEL_EROEFFNUNG]: 'eroeffnung',
  [LABEL_SCHAETZE]: 'schaetze',
  [LABEL_DIENST]: 'dienst',
  [LABEL_LAC]: 'lac',
  [LABEL_WT_STUDIUM]: 'wtStudium',
  [LABEL_VORTRAG]: 'vortrag',
  [LABEL_DIENSTVORTRAG]: 'dienstvortrag',
  [LABEL_ABSCHLUSS]: 'abschluss',
}

/**
 * Art eines Abschnitts aus seinem kanonischen Namen — `undefined`, wenn der
 * Name keiner bekannten Art entspricht (dann hängt auch kein Verhalten daran).
 */
export function artVonLabel(label: string): SectionKind | undefined {
  return ART_JE_LABEL[label]
}
