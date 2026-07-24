import { describe, expect, it } from 'vitest'
import { latestImportedStart } from './import'
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
