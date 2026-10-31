/** @vitest-environment happy-dom */
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
    // `persist.ts` löscht die Mitgliedschaft (21.10.2026), die Datenbank mit
    // ihr das Konto — nur das eigene bleibt, ohne Person.
    gruendlicher: 'ein Konto ohne Person sähe weiter alles (21.10.2026)',
  },
  absences: {
    feld: 'absences',
    spalten: { person_id: 'personId' },
    basis: { id: 'zz', personId: null, userId: null, from: '2026-09-07', to: '2026-09-08' },
    // `persist.ts` löscht die Zeilen auch in der Datenbank (T118): Eine
    // Abwesenheit ohne Person gehört niemandem und käme bei jedem Laden wieder.
    gruendlicher: 'eine Abwesenheit ohne Person gehört niemandem (T118)',
  },
  // Die Kennung eines Links ist die Person selbst (eine Zeile je Person) —
  // erkannt wird die Zeile deshalb an einem anderen Feld. An `personId` fände
  // die Probe sie nach dem Löschen nie wieder und hielte jede Kaskade für
  // gespiegelt.
  anmelde_links: {
    feld: 'anmeldeLinks',
    spalten: { person_id: 'personId' },
    basis: { personId: null, gueltigBis: '2026-10-07T09:00:00.000Z', erstelltAt: 'zz', gesendetAt: null, benutztAt: null },
    schluessel: 'erstelltAt',
  },
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
  vortraege: {
    feld: 'vortraege',
    spalten: { person_id: 'pid' },
    basis: { id: 'zz', woche: '2026-11-09', redner: 'Z', versammlung: '', eigener: true, pid: null, thema: '', lied: '' },
  },
  // Die Anwesenden bleiben; wer eingetragen hat, fehlt danach (T152).
  anwesenheit: {
    feld: 'anwesenheit',
    spalten: { person_id: 'pid' },
    basis: { woche: 'zz', tab: 'mid', saal: 80, video: 20, pid: null },
    schluessel: 'woche',
  },
  // Eine Tausch-Anfrage geht mit jeder der beiden Personen (T153): Sie hat dann
  // niemanden mehr, der fragt oder antwortet.
  tausch_anfragen: {
    feld: 'tauschAnfragen',
    spalten: { von_person: 'von', an_person: 'an' },
    basis: { id: 'zz', von: 'p-x', an: 'p-y', gibtAb: '2026-09-07|we|helper|mik|0', nimmt: '2026-09-14|we|helper|mik|0', bis: '2026-09-13' },
  },
  // Wer eingetragen hat, nimmt seinen Termin mit; als Partner fehlt er nur — der
  // andere sucht wieder einen (T121).
  trolley_termine: {
    feld: 'trolleyTermine',
    spalten: { person_id: 'pid', partner_id: 'partner' },
    basis: { id: 'zz', trolleyId: 'tr1', datum: '2026-09-09', von: '10:00', bis: '12:00', pid: 'p-x', partner: null, gemeinsam: false },
  },
  // Eine Woche bleibt, nur offen — ob ihre Gruppe geht oder ihre Person (31.10.2026).
  plan_eintraege: {
    feld: 'planEintraege',
    spalten: { grp: 'grp', person_id: 'pid' },
    basis: { id: 'zz', planId: 'p1', datum: '2026-09-07', grp: null },
  },
  // Geht die Person, gehen ihre Absagen mit (T126) — gezählt werden sie für sie.
  absagen: {
    feld: 'absagen',
    spalten: { person_id: 'personId' },
    basis: { personId: null, taskKey: 'zz' },
    schluessel: 'taskKey',
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
    expect(FK).toContainEqual({ tabelle: 'trolley_termine', spalte: 'person_id', ziel: 'persons', aktion: 'cascade' })
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

/**
 * **Geht die Mitgliedschaft, geht das Konto** (21.10.2026): Der Trigger
 * `members_konto_loeschen` löscht mit jeder `members`-Zeile ihr Konto in
 * `auth.users`, und mit ihm enden seine Sitzungen. Was er tut, ist an der
 * Datenbank gemessen (21.10.2026, auch als Admin über die Richtlinien); hier
 * steht nur, dass er im Schema bleibt. Ohne ihn liefe alles weiter — nur käme
 * ein entferntes Konto mit einem neuen Link samt seinen alten Sitzungen zurück.
 * Gelesen wird ohne Kommentare: Der Kopf des Blocks nennt dieselben Namen.
 */
describe('Geht die Mitgliedschaft, geht das Konto', () => {
  const ohneKommentare = schema.replace(/--[^\n]*/g, '')

  it('der Trigger hängt am Löschen in members und löscht das Konto', () => {
    expect(ohneKommentare).toMatch(
      /create trigger members_konto_loeschen\s+after delete on public\.members\s+for each row execute function public\.konto_mit_mitgliedschaft_loeschen\(\);/,
    )
    const rumpf = ohneKommentare.match(/function public\.konto_mit_mitgliedschaft_loeschen\(\)[^$]*\$\$([^$]*)\$\$/)?.[1] ?? ''
    expect(rumpf).toMatch(/delete from auth\.users where id = old\.user_id;/)
  })

  it('aufrufen lässt sie sich von außen nicht', () => {
    expect(ohneKommentare).toMatch(/revoke all on function public\.konto_mit_mitgliedschaft_loeschen\(\) from anon, authenticated;/)
  })
})
