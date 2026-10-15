import { beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.hoisted(() => vi.fn())
vi.mock('./supabase', () => ({ supabase: { functions: { invoke } } }))

import { holenNach, importNextWeek, importWeekVariants, latestImportedStart, loadedUntilMs } from './import'
import type { Week } from '../data/types'

/** Minimal-Woche nur mit dem für die Sortierung relevanten `start`. */
const wk = (start?: string): Week => ({ start } as Week)

describe('holenNach — wonach „Holen" sucht', () => {
  /** Mittwoch, 30. September 2026, örtlich — die Woche ab Montag, 28.9. */
  const heute = new Date(2026, 8, 30, 9, 0)

  it('nach der spätesten geladenen Woche, solange sie nicht zurückliegt', () => {
    expect(holenNach([wk('2026-09-28'), wk('2026-10-12'), wk('2026-10-05')], heute)).toBe('2026-10-12')
    // Die Vorwoche selbst: Danach kommt die laufende, wie bisher.
    expect(holenNach([wk('2026-09-21')], heute)).toBe('2026-09-21')
  })

  it('nach einer Pause nicht Wochen zurück, sondern die laufende (16.10.2026)', () => {
    // Zuletzt geladen ist der 7.9. — geholt würde sonst der 14.9.
    expect(holenNach([wk('2026-09-07')], heute)).toBe('2026-09-21')
  })

  it('ohne geladene Woche wählt der Server', () => {
    expect(holenNach([wk(), wk()], heute)).toBeUndefined()
    expect(holenNach([], heute)).toBeUndefined()
  })
})

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

describe('loadedUntilMs', () => {
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10)

  it('liefert den Sonntag der spätesten Woche, nicht deren Montag', () => {
    // "Geladen bis" meint das Ende der Woche — sonst wirkte die Anzeige um
    // sechs Tage zu knapp und man importierte unnötig nach.
    const ms = loadedUntilMs([wk('2026-09-07'), wk('2026-08-31')])
    expect(ms).not.toBeNull()
    expect(iso(ms as number)).toBe('2026-09-13')
  })

  it('rechnet über den Monatswechsel hinweg', () => {
    expect(iso(loadedUntilMs([wk('2026-09-28')]) as number)).toBe('2026-10-04')
  })

  it('ohne ISO-Datum null (Demo- und Vorlagenwochen)', () => {
    expect(loadedUntilMs([wk(), wk()])).toBeNull()
    expect(loadedUntilMs([])).toBeNull()
  })
})

describe('importNextWeek', () => {
  beforeEach(() => {
    invoke.mockReset()
    // Was der Server sagt, geht in die Konsole — hier still.
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('Erfolg → ok mit Woche; ruft import-week mit after/lang/altLangs', async () => {
    const week = wk('2026-07-20')
    invoke.mockResolvedValue({ data: { week }, error: null })
    const res = await importNextWeek('2026-07-13', 'de', ['en'])
    expect(res).toEqual({ ok: true, week })
    expect(invoke).toHaveBeenCalledWith('import-week', { body: { after: '2026-07-13', lang: 'de', altLangs: ['en'] } })
  })

  it('Transportfehler → „unbekannt", die Meldung steht in der Konsole', async () => {
    invoke.mockResolvedValue({ data: null, error: { message: 'HTTP 500' } })
    expect(await importNextWeek()).toEqual({ ok: false, error: 'unbekannt' })
    expect(console.error).toHaveBeenCalledWith('[import-week]', 'HTTP 500')
  })

  it('Status ≠ 2xx: nur Schlüssel — „keine weitere Woche", „Sprache fehlt", sonst „unbekannt"', async () => {
    // `functions.invoke` legt die Antwort hinter `context` und meldet selbst
    // nur „Edge Function returned a non-2xx status code". Bis Phase 10 (T121)
    // kam der deutsche Satz des Servers so in die App — in jeder Sprache.
    const antwort = (body: unknown) => ({
      data: null,
      error: { message: 'Edge Function returned a non-2xx status code', context: { json: async () => body } },
    })
    invoke.mockResolvedValue(antwort({ error: 'Keine kommende Woche gefunden.', ende: true }))
    expect(await importNextWeek('2026-10-05')).toEqual({ ok: false, error: 'ende' })
    invoke.mockResolvedValue(
      antwort({ error: 'Diese Woche ist in der gewählten Sprache (X) noch nicht verfügbar.', code: 'sprache-fehlt' }),
    )
    expect(await importNextWeek('2026-10-05')).toEqual({ ok: false, error: 'sprache-fehlt' })
    invoke.mockResolvedValue(antwort({ error: 'forbidden' }))
    expect(await importNextWeek('2026-10-05')).toEqual({ ok: false, error: 'unbekannt' })
  })

  it('fachlicher Fehler / keine Woche → „unbekannt"', async () => {
    invoke.mockResolvedValue({ data: { error: 'Keine kommende Woche gefunden.' }, error: null })
    expect(await importNextWeek()).toEqual({ ok: false, error: 'unbekannt' })
    invoke.mockResolvedValue({ data: {}, error: null })
    expect((await importNextWeek()).ok).toBe(false)
  })
})

describe('importWeekVariants', () => {
  beforeEach(() => {
    invoke.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('holt eine Woche per ISO-Startdatum nach (start statt after)', async () => {
    const week = wk('2026-07-20')
    invoke.mockResolvedValue({ data: { week }, error: null })
    const res = await importWeekVariants('2026-07-20', 'de', ['fr'])
    expect(res).toEqual({ ok: true, week })
    expect(invoke).toHaveBeenCalledWith('import-week', { body: { start: '2026-07-20', lang: 'de', altLangs: ['fr'] } })
  })

  it('Fehler → ok:false', async () => {
    invoke.mockResolvedValue({ data: { error: 'Woche 2026-07-20 nicht gefunden.' }, error: null })
    expect(await importWeekVariants('2026-07-20', 'de', [])).toEqual({ ok: false, error: 'unbekannt' })
  })
})
