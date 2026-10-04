/** @vitest-environment jsdom */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { aufgabenAbgeleitet, reducer } from './reducer'
import type { AppState } from './context'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { FS_LEITER, OZ_DIENST } from '../../supabase/functions/_shared/zuteilungen.ts'
import { loadOverlay } from '../i18n/ui'

/**
 * **Die Verhinderungs-Meldung ist kanonisch deutsch — aus jeder App-Sprache.**
 *
 * Sie steht in der Datenbank und wird erst in der Glocke des Planers in seine
 * Sprache gebracht, Atom für Atom über den Fragment-Übersetzer. Der kennt nur
 * Deutsches. Stand die Rolle schon in der Sprache des Absagenden, blieb sie
 * so stehen: Ein deutscher Planer las „Field service meeting conductor", wenn
 * ein Treffpunkt-Leiter mit englischer App absagte (bis zum 3.10.2026). Die
 * Anzeige in „Meine Aufgaben" übersetzt die Rolle ohnehin (`aufgabenLabel`).
 */

beforeAll(async () => {
  await loadOverlay('en')
})
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 7, 9, 0))
})
afterEach(() => vi.useRealTimers())

/** Eine englische App, angemeldet als `personId`, mit abgeleiteten Aufgaben. */
function englisch(personId: string, over: Partial<AppState> = {}): AppState {
  return aufgabenAbgeleitet({ ...demoZustand(), lang: 'en', personId, notifs: [], confirmations: {}, ...over })
}

describe('Verhinderung aus einer englischen App', () => {
  it('Treffpunkt-Leiter', () => {
    const leiter = demoZustand().fsWeeks.flat().find((i) => i.lpid)!
    const s = englisch(leiter.lpid!)
    const task = s.myTasks.find((t) => t.id.startsWith('fs|'))!
    expect(task).toBeDefined()
    const text = reducer(s, { type: 'declineTask', id: task.id }).notifs[0]!.text
    expect(text).toContain(FS_LEITER)
    expect(text).not.toContain('conductor')
  })

  it('öffentliches Zeugnisgeben', () => {
    const s = englisch('p9', {
      ozTermine: [{ id: 't1', wd: 3, von: '10:00', bis: '12:00', ort: 'Marktplatz', plaetze: 2 }],
      ozEintraege: [{ id: 'e1', terminId: 't1', datum: '2026-09-09', pid: 'p9', selbst: true }],
    })
    const text = reducer(s, { type: 'declineTask', id: 'oz|2026-09-07|e1' }).notifs[0]!.text
    expect(text).toContain(`${OZ_DIENST} · Mittwoch, 9. September`)
    expect(text).not.toContain('Public witnessing')
  })
})
