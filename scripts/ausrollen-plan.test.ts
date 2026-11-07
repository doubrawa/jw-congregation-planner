import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { functionsAusConfig, letzterGruenerStand, wasAusrollen } from './ausrollen-plan.mjs'
import { REPO } from './sicherung.mjs'

/**
 * **Was ausgerollt wird, und gemessen woran.** Die Regel hier entscheidet, ob
 * eine Migration die Produktion erreicht — eine falsche Zuordnung fiele erst
 * auf, wenn eine Function mit altem Code gegen ein neues Schema läuft.
 */

const CONFIG = fs.readFileSync(path.join(REPO, 'supabase', 'config.toml'), 'utf8')

describe('wasAusrollen', () => {
  it('eine Migration → db push', () => {
    expect(wasAusrollen(['supabase/migrations/20261108000000_probe.sql'])).toEqual({ migrationen: true, functions: false })
  })

  it('Code einer Function, auch unter `_shared/` → alle Functions', () => {
    expect(wasAusrollen(['supabase/functions/_shared/rest.ts'])).toEqual({ migrationen: false, functions: true })
    expect(wasAusrollen(['supabase/functions/send-plan/index.ts'])).toEqual({ migrationen: false, functions: true })
  })

  it('`config.toml` → alle Functions, denn dort steht `verify_jwt`', () => {
    expect(wasAusrollen(['supabase/config.toml'])).toEqual({ migrationen: false, functions: true })
  })

  it('Proben, der Gesamtstand und alles außerhalb → nichts', () => {
    // Eine Probe neben einer Function wird nicht mitgebündelt (die CLI folgt den
    // Importen ab dem Einstiegspunkt); `schema.sql` erreicht die Produktion nie.
    expect(
      wasAusrollen([
        'supabase/functions/send-plan/texte.test.ts',
        'supabase/functions/_test/hilfen.ts',
        'supabase/schema.sql',
        'supabase/migrationen.test.ts',
        'src/App.tsx',
        'README.md',
      ]),
    ).toEqual({ migrationen: false, functions: false })
  })
})

describe('functionsAusConfig', () => {
  it('nennt jede Function, die es im Repo gibt — und keine, die es nicht gibt', () => {
    // Eine Function ohne Eintrag in `config.toml` würde nie ausgerollt und
    // bekäme sonst die Vorgabe der CLI statt einer Entscheidung über `verify_jwt`.
    const ordner = fs
      .readdirSync(path.join(REPO, 'supabase', 'functions'), { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
      .map((d) => d.name)
      .sort()
    expect(functionsAusConfig(CONFIG).map((f) => f.name).sort()).toEqual(ordner)
  })

  it('liest `verify_jwt` je Function — offen ist allein `send-reminders`', () => {
    expect(functionsAusConfig(CONFIG).filter((f) => !f.verifyJwt).map((f) => f.name)).toEqual(['send-reminders'])
  })

  it('übersieht keinen Eintrag ohne Leerzeile davor und keinen am Dateiende', () => {
    const text = '[functions.a]\nverify_jwt = false\n[functions.b]\n# ohne Angabe\n\n[functions.c]\nverify_jwt = true'
    expect(functionsAusConfig(text)).toEqual([
      { name: 'a', verifyJwt: false },
      { name: 'b', verifyJwt: true },
      { name: 'c', verifyJwt: true },
    ])
  })
})

describe('letzterGruenerStand', () => {
  const antwort = (status: number, rumpf: unknown): Response => new Response(JSON.stringify(rumpf), { status })

  it('fragt nach dem letzten grünen Lauf von deploy.yml auf main', async () => {
    let gefragt = ''
    const sha = await letzterGruenerStand({
      repo: 'probe/repo',
      token: 'probe',
      holen: async (adresse: RequestInfo | URL) => {
        gefragt = String(adresse)
        return antwort(200, { workflow_runs: [{ head_sha: 'abc123' }] })
      },
    })
    expect(sha).toBe('abc123')
    expect(gefragt).toContain('/repos/probe/repo/actions/workflows/deploy.yml/runs?')
    expect(gefragt).toContain('branch=main')
    expect(gefragt).toContain('status=success')
  })

  it('ohne grünen Lauf: null — dann wird alles ausgerollt', async () => {
    expect(await letzterGruenerStand({ repo: 'p/r', token: 't', holen: async () => antwort(200, { workflow_runs: [] }) })).toBeNull()
  })

  it('bricht ab, wenn GitHub nicht antwortet, statt still nichts auszurollen', async () => {
    await expect(letzterGruenerStand({ repo: 'p/r', token: 't', holen: async () => antwort(403, { message: 'nein' }) })).rejects.toThrow(/403/)
  })
})
