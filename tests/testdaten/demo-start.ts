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
 * Dieselben Daten benutzen die Tests: `demoZustand()` ist der Bestand, den bis
 * dahin `initialState()` im Demo-Modus lieferte.
 *
 * **Ohne Sonderweg in der App.** Bis zum 2.10.2026 lief die Seite im
 * Datenstand `demo`, und an acht Stellen verhielt sich die App dann anders:
 * feste statt abgeleiteter Aufgaben, Bestätigen ohne Zusagen, ein „(Demo)" am
 * Rollennamen. Jetzt startet sie `ready` wie nach dem Laden und läuft dieselben
 * Wege wie der Betrieb — nur ohne Datenbank und mit gestellter Uhr (`uhr.ts`).
 */
import type { AppState } from '../../src/app/context'
import { initialState } from '../../src/app/init'
import { aufgabenAbgeleitet } from '../../src/app/reducer'
import { asFontScale, asTheme, type FontScale } from '../../src/data/constants'
import { fsLeiterBinden } from '../../src/data/fs'
import { pidsNachtragen } from '../../src/data/namensbindung'
import { offeneMeldungen } from '../../src/data/plan-versand'
import { sentKey } from '../../src/data/planning'
import type { FsBereich, Lang, MeetingTab, Screen, SentLog, Theme } from '../../src/data/types'
import { CONG_TO_JW } from '../../src/i18n/langs'
import { buildDemoConfirmations } from './demo-zusagen'
import {
  buildDemoFsWeeks,
  buildDemoWeeks,
  CONGREGATION,
  DEMO_ABSENCES,
  DEMO_FS_RULES,
  DEMO_GROUPS,
  DEMO_GRUPPENBESUCHE,
  DEMO_MY_TASKS,
  DEMO_NOTIFICATIONS,
  DEMO_OZ_EINTRAEGE,
  DEMO_OZ_PERSONEN,
  DEMO_OZ_TERMINE,
  DEMO_OZ_ZUSAGEN,
  DEMO_PERSONS,
  DEMO_PLAENE,
  demoPlanEintraege,
  DEMO_PLANNER,
  DEMO_SERVICES,
  DEMO_UNBESTAETIGT,
} from './testdaten'

/**
 * Der Demo-Bestand als Zustand: die Versammlung „Musterstadt" mit rund hundert
 * Personen, vier Wochen Programm, Treffpunkten, Zusagen und Glocke.
 *
 * „Meine Aufgaben" stehen hier **fest** (`DEMO_MY_TASKS`), nicht abgeleitet:
 * Tests, die eine Aufgabenliste anzeigen, sollen nicht davon abhängen, welcher
 * Tag heute ist. Die Entwicklerseite leitet sie ab (`entwicklerStart`).
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
  tab?: MeetingTab // Programm/Planen-Tab (mid|we|fs|wp) — für Doku-Screenshots
  fsBereich?: FsBereich // fb=<treffpunkte|gruppenbesuche|zeugnis|grundplan> — Reiter im Predigtdienst (T120)
  planner?: boolean // Rechte erzwingen (pl=0 Verkündiger, pl=1 Admin, pl=2 Planer)
  /** `pl=2`: Planer — teilt zu und sendet, ändert die Pläne nicht (4.10.2026). */
  zuteiler?: boolean
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
  if (tab === 'mid' || tab === 'we' || tab === 'fs' || tab === 'wp') out.tab = tab
  const fb = p.get('fb')
  if (fb === 'treffpunkte' || fb === 'gruppenbesuche' || fb === 'zeugnis' || fb === 'grundplan') out.fsBereich = fb
  const pl = p.get('pl')
  if (pl === '0' || pl === '1') out.planner = pl === '1'
  if (pl === '2') {
    out.planner = false
    out.zuteiler = true
  }
  if (p.get('shot') === '1') out.shot = true
  // stale=<Stunden>: Offline-Stand simulieren (ohne Netzabbruch nachstellbar)
  const stale = Number(p.get('stale'))
  if (Number.isFinite(stale) && stale > 0) out.staleAt = jetzt - stale * 3600_000
  return Object.keys(out).length ? out : null
}

/**
 * **Der Plan der ersten Woche ist gesendet** (4.10.2026): Jeder Platz, den
 * „Plan senden" verschicken würde, steht im Versand-Tagebuch. Erst danach
 * bietet „Meine Aufgaben" die freien Plätze dieser Woche an — ohne Tagebuch
 * gäbe es auf der Seite nichts davon zu sehen. Mit der echten Uhr (Tests)
 * liegt die Woche zurück, und das Tagebuch bleibt leer.
 */
function demoVersand(s: AppState): SentLog {
  const meldungen = offeneMeldungen(s.weeks[0], undefined, s.services, s.confirmations, {}, s.congregation.times)
  return Object.fromEntries(meldungen.map((m) => [sentKey(m.key, m.name), '2026-09-06T18:00:00.000Z']))
}

/**
 * Startzustand der Entwicklerseite: der Demo-Bestand, dazu was der Hash
 * verlangt. Ohne `s=` beginnt sie auf dem Start-Bildschirm, angemeldet ist
 * niemand — wer die Anmeldemaske sehen will, nennt sie (`#s=login`).
 *
 * „Meine Aufgaben" und Ersatzgesuche werden **abgeleitet** wie nach dem Laden
 * im Betrieb — aus den Wochen, den Zusagen und der Person aus `me=`. Ohne
 * `me=` gehört die Seite niemandem, und es gibt keine eigenen Aufgaben.
 */
export function entwicklerStart(hash: string = location.hash): AppState {
  const debug = parseDebugHash(hash)
  // Screenshot-Modus: Spaltenschatten per Attribut abschalten, damit die
  // Doku-Screenshots randlos zugeschnitten werden können (siehe shell.css).
  if (debug?.shot) document.documentElement.dataset.shot = '1'
  const basis = demoZustand()
  return aufgabenAbgeleitet({
    ...basis,
    // Gruppenbesuche (T120) nur hier, nicht in `demoZustand`: Die Tests laufen
    // mit der echten Uhr, und ein Besuch im Bestand machte jede Ansicht des
    // Predigtdienstes vom Kalender abhängig. Die Seite hat ihre gestellte.
    gruppenbesuche: DEMO_GRUPPENBESUCHE,
    // Öffentliches Zeugnisgeben (T120) ebenso nur hier — samt dem
    // Aufgabenbereich der Beteiligten und einer bestätigten Zuteilung.
    ozTermine: DEMO_OZ_TERMINE,
    ozEintraege: DEMO_OZ_EINTRAEGE,
    persons: basis.persons.map((p) =>
      DEMO_OZ_PERSONEN.includes(p.id) ? { ...p, priv: { ...p.priv, zeugnis: true } } : p,
    ),
    // Und die Weiteren Pläne (Phase 5).
    plaene: DEMO_PLAENE,
    planEintraege: demoPlanEintraege(),
    confirmations: { ...basis.confirmations, ...DEMO_OZ_ZUSAGEN },
    sentLog: demoVersand(basis),
    screen: debug?.screen ?? 'start',
    tab: debug?.tab ?? basis.tab,
    fsBereich: debug?.fsBereich ?? basis.fsBereich,
    theme: debug?.theme ?? basis.theme,
    fontScale: debug?.fontScale ?? basis.fontScale,
    planner: debug?.planner ?? basis.planner,
    zuteiler: debug?.zuteiler ?? basis.zuteiler,
    personId: debug?.me ?? null,
    selectedPersonId: debug?.personId ?? null,
    staleAt: debug?.staleAt ?? null,
    lang: debug?.lang ?? basis.lang,
    congLang: debug?.congLang ?? basis.congLang,
    // Ein Hash mit `tab=` ist eine Wahl — sonst spränge der Reiter beim
    // ersten Navigieren weg und die Doku-Screenshots zeigten das Falsche.
    terminGewaehlt: debug?.tab != null,
  })
}
