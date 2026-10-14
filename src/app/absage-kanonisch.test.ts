/** @vitest-environment jsdom */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { aufgabenAbgeleitet, reducer } from './reducer'
import type { AppState } from './context'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { FS_LEITER } from '../../supabase/functions/_shared/zuteilungen.ts'
import { alsFreitext, makeTr } from '../i18n/translate'
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
})

/**
 * **Die Nachricht beim Absagen** (T121) steht als eigenes Atom in der Meldung,
 * als Freitext gekennzeichnet: Der Planer liest sie so, wie sie geschrieben
 * wurde, in jeder Sprache — kein Übersetzer macht aus „Markus 2" ein Bibelbuch.
 */
describe('Nachricht an den Planer', () => {
  const absage = (nachricht?: string) => {
    const leiter = demoZustand().fsWeeks.flat().find((i) => i.lpid)!
    const s = englisch(leiter.lpid!)
    const task = s.myTasks.find((t) => t.id.startsWith('fs|'))!
    return reducer(s, { type: 'declineTask', id: task.id, nachricht }).notifs[0]!.text
  }

  it('steht als letztes Atom da, als Freitext gekennzeichnet', () => {
    expect(absage('bin verreist')).toMatch(new RegExp(` · ${alsFreitext('bin verreist')}$`))
  })

  it('der Übersetzer der Glocke lässt sie stehen, wie sie ist', () => {
    expect(makeTr('en')(absage('Markus 2 übernimmt'))).toContain('Markus 2 übernimmt')
  })

  it('ein „ · " darin wird zum Komma — sonst zerfiele sie an der Atomgrenze', () => {
    expect(absage('heute · morgen')).toContain(alsFreitext('heute, morgen'))
  })

  it('ohne Nachricht — oder nur mit Leerzeichen — kein leeres Atom', () => {
    expect(absage()).toBe(absage('   '))
    expect(absage()).not.toMatch(/ · $/)
  })
})
