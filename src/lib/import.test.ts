import { beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.hoisted(() => vi.fn())
vi.mock('./supabase', () => ({ supabase: { functions: { invoke } } }))

import { importNextWeek, importWeekVariants, latestImportedStart } from './import'
import type { Week } from '../data/types'

/** Minimal-Woche nur mit dem für die Sortierung relevanten `start`. */
const wk = (start?: string): Week => ({ start } as Week)

describe('latestImportedStart', () => {
  it('liefert das späteste ISO-Startdatum', () => {
    expect(latestImportedStart([wk('2026-07-06'), wk('2026-07-20'), wk('2026-07-13')])).toBe('2026-07-20')
  })

  it('ignoriert Wochen ohne Startdatum (Demo/Vorlagen)', () => {
    expect(latestImportedStart([wk(), wk('2026-08-03'), wk()])).toBe('2026-08-03')
  })

  it('liefert undefined, wenn keine Woche ein Startdatum hat', () => {
    expect(latestImportedStart([wk(), wk()])).toBeUndefined()
    expect(latestImportedStart([])).toBeUndefined()
  })

  it('sortiert lexikografisch korrekt (ISO ist sortierbar)', () => {
    expect(latestImportedStart([wk('2026-12-28'), wk('2027-01-04')])).toBe('2027-01-04')
  })
})

describe('importNextWeek', () => {
  beforeEach(() => invoke.mockReset())

  it('Erfolg → ok mit Woche; ruft import-week mit after/lang/altLangs', async () => {
    const week = wk('2026-07-20')
    invoke.mockResolvedValue({ data: { week }, error: null })
    const res = await importNextWeek('2026-07-13', 'de', ['en'])
    expect(res).toEqual({ ok: true, week })
    expect(invoke).toHaveBeenCalledWith('import-week', { body: { after: '2026-07-13', lang: 'de', altLangs: ['en'] } })
  })

  it('Transportfehler → ok:false mit Meldung', async () => {
    invoke.mockResolvedValue({ data: null, error: { message: 'HTTP 500' } })
    expect(await importNextWeek()).toEqual({ ok: false, error: 'HTTP 500' })
  })

  it('fachlicher Fehler / keine Woche → Fehlertext', async () => {
    invoke.mockResolvedValue({ data: { error: 'Keine kommende Woche gefunden.' }, error: null })
    expect(await importNextWeek()).toEqual({ ok: false, error: 'Keine kommende Woche gefunden.' })
    invoke.mockResolvedValue({ data: {}, error: null })
    expect((await importNextWeek()).ok).toBe(false)
  })
})

describe('importWeekVariants', () => {
  beforeEach(() => invoke.mockReset())

  it('holt eine Woche per ISO-Startdatum nach (start statt after)', async () => {
    const week = wk('2026-07-20')
    invoke.mockResolvedValue({ data: { week }, error: null })
    const res = await importWeekVariants('2026-07-20', 'de', ['fr'])
    expect(res).toEqual({ ok: true, week })
    expect(invoke).toHaveBeenCalledWith('import-week', { body: { start: '2026-07-20', lang: 'de', altLangs: ['fr'] } })
  })

  it('Fehler → ok:false', async () => {
    invoke.mockResolvedValue({ data: { error: 'Woche 2026-07-20 nicht gefunden.' }, error: null })
    expect(await importWeekVariants('2026-07-20', 'de', [])).toEqual({ ok: false, error: 'Woche 2026-07-20 nicht gefunden.' })
  })
})
