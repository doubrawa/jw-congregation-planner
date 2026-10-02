/**
 * **Der Start der Entwicklerseite** — die App mit den erfundenen Daten, ohne
 * Login und ohne Datenbank. Der Dev-Server liefert sie unter `/demo.html` aus
 * (`scripts/testdaten-grenze.mjs`); gebaut wird sie nie.
 *
 * Bis zum 2.10.2026 stand dieser Zweig in `src/app/init.ts`, hinter
 * `import.meta.env.DEV`. Die Testdaten landeten trotzdem im ausgelieferten
 * Bündel (siehe `testdaten.ts`). Jetzt kennt die App keinen Demo-Start mehr;
 * sie bekommt ihren Startzustand von hier (`<App start={entwicklerStart} />`).
 *
 * Dieselben Daten benutzen die Tests: `demoZustand()` ist genau der Bestand,
 * den bis dahin `initialState()` im Demo-Modus lieferte.
 */
import type { AppState } from '../../src/app/context'
import { initialState } from '../../src/app/init'
import { asFontScale, asTheme, type FontScale } from '../../src/data/constants'
import { fsLeiterBinden } from '../../src/data/fs'
import { pidsNachtragen } from '../../src/data/namensbindung'
import type { Lang, MeetingTab, Screen, Theme } from '../../src/data/types'
import { CONG_TO_JW } from '../../src/i18n/langs'
import { buildDemoConfirmations } from './demo-zusagen'
import {
  buildDemoFsWeeks,
  buildDemoWeeks,
  CONGREGATION,
  DEMO_ABSENCES,
  DEMO_FS_RULES,
  DEMO_GROUPS,
  DEMO_MY_TASKS,
  DEMO_NOTIFICATIONS,
  DEMO_PERSONS,
  DEMO_PLANNER,
  DEMO_SERVICES,
  DEMO_UNBESTAETIGT,
} from './testdaten'

/**
 * Der Demo-Bestand als Zustand: die Versammlung „Musterstadt" mit rund hundert
 * Personen, vier Wochen Programm, Treffpunkten, Zusagen und Glocke.
 *
 * **Namen an Personen binden wie der echte Ladevorgang** (`lib/data.ts`:
 * `pidsNachtragen`, `fsLeiterBinden`). Die Wochen tragen nur Namen; ohne Id
 * liefen Umbenennungen über den Namensweg, und eine kurzzeitige Namensdublette
 * beim Tippen nahm alle Zuteilungen des Namensvetters mit — gemessen am
 * 1.10.2026: „Manfred Albrecht" auf „Thomas Lindner" und zurück, danach stand
 * jede Aufgabe Lindners bei Albrecht.
 */
export function demoZustand(): AppState {
  // Einmal gebaut: Die Zusagen hängen an genau diesen Wochen.
  const weeks = pidsNachtragen(buildDemoWeeks(), DEMO_PERSONS)
  const fsWeeks = fsLeiterBinden(buildDemoFsWeeks(), DEMO_PERSONS)
  return {
    ...initialState(),
    dataStatus: 'demo',
    planner: DEMO_PLANNER,
    congregation: { ...CONGREGATION },
    weeks,
    persons: DEMO_PERSONS,
    services: DEMO_SERVICES,
    groups: DEMO_GROUPS,
    fsRules: DEMO_FS_RULES,
    fsWeeks,
    absences: DEMO_ABSENCES,
    notifs: DEMO_NOTIFICATIONS,
    myTasks: DEMO_MY_TASKS,
    confirmations: buildDemoConfirmations(weeks, DEMO_SERVICES, fsWeeks, DEMO_UNBESTAETIGT),
  }
}

/**
 * Der Hash der Entwicklerseite: `#s=<screen>&l=<lang>&c=<congLang>&…` springt
 * einen Zustand direkt an — für die Handbuch-Aufnahmen
 * (`docs/user-guide/capture-screenshots.sh`) und für Prüfungen im Browser.
 */
export interface DebugHash {
  screen?: Screen
  lang?: Lang
  congLang?: string
  theme?: Theme
  fontScale?: FontScale // fs=<Faktor> — Schriftgrößen-Stufe für Doku-Screenshots
  personId?: string
  /**
   * `me=<Person-Id>` — **wessen** App das hier ist (`state.personId`).
   *
   * Nicht dasselbe wie `p=`: Das wählt eine Person im Personen-Screen aus
   * (`selectedPersonId`), das hier meldet einen an. Ohne `me=` gehört die Seite
   * niemandem, und alles, was von der eigenen Person abhängt, ist nicht
   * anzusehen: der DU-Chip, „Deine Einträge" — und die Treffpunkte der
   * **eigenen** Predigtdienstgruppe.
   */
  me?: string
  tab?: MeetingTab // Programm/Planen-Tab (mid|we|fs) — für Doku-Screenshots
  planner?: boolean // Rechte erzwingen (pl=0 Verkündiger, pl=1 Planer)
  shot?: boolean // Screenshot-Modus: Spaltenschatten aus (randloses Zuschneiden)
  staleAt?: number // Offline-Stand vortäuschen (stale=<Stunden alt>) — Banner + nur lesen
}

export function parseDebugHash(hash: string, jetzt = Date.now()): DebugHash | null {
  const raw = hash.replace(/^#/, '')
  if (!raw) return null
  const p = new URLSearchParams(raw)
  const out: DebugHash = {}
  const s = p.get('s')
  if (s) out.screen = s as Screen
  const l = p.get('l')
  if (l) out.lang = l as Lang
  const c = p.get('c')
  // Der Hash darf den deutschen Namen tragen („c=Englisch") — getippt wird er
  // von Hand, und der Code ist nicht jedem geläufig. Geführt wird der Code.
  if (c) out.congLang = CONG_TO_JW[c] ?? c
  const th = asTheme(p.get('t'))
  if (th) out.theme = th
  const fs = asFontScale(p.get('fs'))
  if (fs) out.fontScale = fs
  const person = p.get('p')
  if (person) out.personId = person
  const me = p.get('me')
  if (me) out.me = me
  const tab = p.get('tab')
  if (tab === 'mid' || tab === 'we' || tab === 'fs') out.tab = tab
  const pl = p.get('pl')
  if (pl === '0' || pl === '1') out.planner = pl === '1'
  if (p.get('shot') === '1') out.shot = true
  // stale=<Stunden>: Offline-Stand simulieren (ohne Netzabbruch nachstellbar)
  const stale = Number(p.get('stale'))
  if (Number.isFinite(stale) && stale > 0) out.staleAt = jetzt - stale * 3600_000
  return Object.keys(out).length ? out : null
}

/**
 * Startzustand der Entwicklerseite: der Demo-Bestand, dazu was der Hash
 * verlangt. Ohne `s=` beginnt sie auf dem Start-Bildschirm, angemeldet ist
 * niemand — wer die Anmeldemaske sehen will, nennt sie (`#s=login`).
 */
export function entwicklerStart(hash: string = location.hash): AppState {
  const debug = parseDebugHash(hash)
  // Screenshot-Modus: Spaltenschatten per Attribut abschalten, damit die
  // Doku-Screenshots randlos zugeschnitten werden können (siehe shell.css).
  if (debug?.shot) document.documentElement.dataset.shot = '1'
  const basis = demoZustand()
  return {
    ...basis,
    screen: debug?.screen ?? 'start',
    tab: debug?.tab ?? basis.tab,
    theme: debug?.theme ?? basis.theme,
    fontScale: debug?.fontScale ?? basis.fontScale,
    planner: debug?.planner ?? basis.planner,
    personId: debug?.me ?? null,
    selectedPersonId: debug?.personId ?? null,
    staleAt: debug?.staleAt ?? null,
    lang: debug?.lang ?? basis.lang,
    congLang: debug?.congLang ?? basis.congLang,
    // Ein Hash mit `tab=` ist eine Wahl — sonst spränge der Reiter beim
    // ersten Navigieren weg und die Doku-Screenshots zeigten das Falsche.
    terminGewaehlt: debug?.tab != null,
  }
}
