/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { reducer } from '../src/app/reducer'
import type { AppState } from '../src/app/context'
import { demoZustand } from './testdaten/demo-start'

/**
 * **Was die Datenbank beim Löschen einer Person oder Gruppe selbst tut, tut der
 * Reducer auch — abgeleitet aus `schema.sql`, nicht aus einer Liste von Hand.**
 *
 * Löscht der Planer eine Person, räumt die Datenbank ihre Verweise per
 * Fremdschlüssel: `on delete cascade` nimmt die Zeile mit, `on delete set null`
 * leert die Spalte. Der Zustand der App muss dasselbe tun, sonst steht bis zum
 * nächsten Laden eine Zeile da, die es nicht mehr gibt — oder eine, die auf
 * niemanden mehr zeigt. `removePerson` und `removeGroup` bilden das von Hand
 * nach; mit T120 kamen sechs Regeln dazu, und keine Wache prüfte, ob die
 * nächste neue Tabelle es auch tut (3.10.2026).
 *
 * Deshalb liest diese Probe die Fremdschlüssel auf `persons` und `groups` aus
 * dem Schema. Jeder braucht hier eine Entscheidung — einen Spiegel im Zustand
 * oder einen Grund, warum es keinen gibt —, und für jeden Spiegel wird das
 * Verhalten nachgemessen. Eine neue Tabelle mit Verweis auf eine Person fällt
 * so von selbst auf: Was aus dem Schema abgeleitet ist, kann niemand vergessen
 * einzutragen.
 */

// Über das Arbeitsverzeichnis, nicht über `import.meta.url`: Unter jsdom (für
// den Zustand mit `localStorage`) ist das keine Datei-URL.
const schema = readFileSync(join(process.cwd(), 'supabase', 'schema.sql'), 'utf8')

interface Fremdschluessel {
  tabelle: string
  spalte: string
  ziel: 'persons' | 'groups'
  aktion: 'cascade' | 'set null'
}

/** Die Fremdschlüssel auf Personen und Gruppen, mit der Tabelle, in der sie stehen. */
function fremdschluessel(): Fremdschluessel[] {
  const out: Fremdschluessel[] = []
  const muster =
    /foreign key \((\w+), congregation_id\)\s+references public\.(persons|groups) \(id, congregation_id\) on delete (cascade|set null)/g
  for (const m of schema.matchAll(muster)) {
    // Die Tabelle: die letzte, die vor dem Treffer angelegt oder geändert wird.
    const davor = schema.slice(0, m.index)
    const tabellen = [...davor.matchAll(/(?:create table if not exists|alter table) public\.(\w+)/g)]
    const tabelle = tabellen.at(-1)?.[1]
    if (!tabelle) throw new Error(`Fremdschlüssel ohne Tabelle: ${m[0]}`)
    out.push({ tabelle, spalte: m[1]!, ziel: m[2] as Fremdschluessel['ziel'], aktion: m[3] as Fremdschluessel['aktion'] })
  }
  return out
}

interface Spiegel {
  /** Wo die Tabelle im Zustand steht. */
  feld: keyof AppState
  /** Spalte der Datenbank → Eigenschaft im Zustand. */
  spalten: Record<string, string>
  /** Eine Zeile der Tabelle mit der Kennung `zz` — die Spalte wird gleich gesetzt. */
  basis: Record<string, unknown>
  /** Woran die Zeile zu erkennen ist (sonst `id`). */
  schluessel?: string
  /** Die App räumt bewusst gründlicher als die Datenbank — mit Grund. */
  gruendlicher?: string
}

const SPIEGEL: Record<string, Spiegel> = {
  groups: {
    feld: 'groups',
    spalten: { overseer_id: 'overseerId', assistant_id: 'assistantId' },
    basis: { id: 'zz', name: 'Z', overseerId: null, assistantId: null },
  },
  persons: { feld: 'persons', spalten: { grp: 'grp' }, basis: { id: 'zz', fn: 'Zeta', ln: 'Probe', priv: {}, grp: null } },
  members: {
    feld: 'members',
    spalten: { person_id: 'personId' },
    basis: { userId: 'zz', personId: null, planner: false },
    schluessel: 'userId',
  },
  absences: {
    feld: 'absences',
    spalten: { person_id: 'personId' },
    basis: { id: 'zz', personId: null, userId: null, from: '2026-09-07', to: '2026-09-08' },
    // `persist.ts` löscht die Zeilen auch in der Datenbank (T118): Eine
    // Abwesenheit ohne Person gehört niemandem und käme bei jedem Laden wieder.
    gruendlicher: 'eine Abwesenheit ohne Person gehört niemandem (T118)',
  },
  invites: { feld: 'invites', spalten: { person_id: 'personId' }, basis: { id: 'zz', code: 'Z', personId: null, planner: false } },
  fs_rules: {
    feld: 'fsRules',
    spalten: { grp: 'grp' },
    basis: { id: 'zz', grp: null, wd: 6, time: '09:30', place: 'Z', monthly: 0, skipCong: false },
  },
  gruppenbesuche: {
    feld: 'gruppenbesuche',
    spalten: { grp: 'grp', person_id: 'pid' },
    basis: { id: 'zz', woche: '2026-10-05', grp: 'g-andere', pid: null },
  },
  oz_eintraege: {
    feld: 'ozEintraege',
    spalten: { person_id: 'pid' },
    basis: { id: 'zz', terminId: 't1', datum: '2026-09-09', pid: null, selbst: false },
  },
  plan_eintraege: {
    feld: 'planEintraege',
    spalten: { grp: 'grp' },
    basis: { id: 'zz', planId: 'p1', datum: '2026-09-07', grp: null },
  },
}

/** Tabellen mit Verweis, die im Zustand keinen Spiegel haben — mit Grund. */
const OHNE_SPIEGEL: Record<string, string> = {
  assignment_log: 'Das Versand-Tagebuch steht im Zustand nur als `sentLog` (Schlüssel und Name → Zeitpunkt), ohne Person.',
}

const FK = fremdschluessel()

describe('Fremdschlüssel auf Personen und Gruppen — jeder hat eine Entscheidung', () => {
  it('die Probe findet die Fremdschlüssel überhaupt (sonst prüfte sie nichts)', () => {
    expect(FK.length).toBeGreaterThanOrEqual(12)
    expect(FK).toContainEqual({ tabelle: 'oz_eintraege', spalte: 'person_id', ziel: 'persons', aktion: 'cascade' })
    expect(FK).toContainEqual({ tabelle: 'persons', spalte: 'grp', ziel: 'groups', aktion: 'set null' })
  })

  it.each(FK.map((f) => [`${f.tabelle}.${f.spalte} → ${f.ziel}`, f] as const))('%s', (_name, f) => {
    if (f.tabelle in OHNE_SPIEGEL) return
    const spiegel = SPIEGEL[f.tabelle]
    expect(spiegel, `${f.tabelle}: Verweis auf ${f.ziel} ohne Spiegel im Reducer — nachbilden und hier eintragen`).toBeDefined()
    expect(spiegel!.spalten[f.spalte], `${f.tabelle}.${f.spalte}: Spalte ohne Eigenschaft im Zustand`).toBeDefined()
  })

  it('jede Entscheidung hier gehört zu einem Fremdschlüssel, den es noch gibt', () => {
    const imSchema = new Set(FK.map((f) => `${f.tabelle}.${f.spalte}`))
    const eingetragen = Object.entries(SPIEGEL).flatMap(([tabelle, s]) => Object.keys(s.spalten).map((sp) => `${tabelle}.${sp}`))
    for (const eintrag of eingetragen) expect(imSchema, eintrag).toContain(eintrag)
    for (const tabelle of Object.keys(OHNE_SPIEGEL)) expect(FK.some((f) => f.tabelle === tabelle), tabelle).toBe(true)
  })
})

describe('Der Reducer tut, was die Datenbank tut', () => {
  const zuPruefen = FK.filter((f) => f.tabelle in SPIEGEL)

  it.each(zuPruefen.map((f) => [`${f.tabelle}.${f.spalte} (${f.aktion})`, f] as const))('%s', (_name, f) => {
    const spiegel = SPIEGEL[f.tabelle]!
    const demo = demoZustand()
    const ref = f.ziel === 'persons' ? 'p1' : demo.groups[0]!.id
    const eigenschaft = spiegel.spalten[f.spalte]!
    const schluessel = spiegel.schluessel ?? 'id'
    const zeile = { ...spiegel.basis, [eigenschaft]: ref }
    const vorher = { ...demo, [spiegel.feld]: [zeile] } as AppState
    const nachher = reducer(vorher, f.ziel === 'persons' ? { type: 'removePerson', id: ref } : { type: 'removeGroup', id: ref })
    const liste = nachher[spiegel.feld] as unknown as Record<string, unknown>[]
    const danach = liste.find((z) => z[schluessel] === 'zz')
    if (f.aktion === 'cascade' || spiegel.gruendlicher) {
      expect(danach, `${f.tabelle}: Die Zeile geht mit (${spiegel.gruendlicher ?? 'on delete cascade'})`).toBeUndefined()
    } else {
      expect(danach, `${f.tabelle}: Die Zeile bleibt (on delete set null)`).toBeDefined()
      expect(danach![eigenschaft], `${f.tabelle}.${f.spalte}: zeigt danach auf niemanden`).toBeNull()
    }
  })
})
