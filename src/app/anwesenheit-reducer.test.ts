/** @vitest-environment jsdom */
/**
 * **Die Anwesenden im Zustand** (T152): Eintragen legt die Zeile einer
 * Zusammenkunft an oder ersetzt sie — eine je Zusammenkunft —, merkt sich, wer
 * eingetragen hat, und lässt Ungültiges gar nicht erst hinein. Unverändert
 * bleibt der Zustand derselbe: sonst ginge ein Schreibvorgang ohne Änderung
 * hinaus (`kein-leerlauf-schreiben.test.ts`).
 */
import { describe, expect, it } from 'vitest'
import { demoZustand } from '../../tests/testdaten/demo-start'
import type { AppState } from './context'
import { reducer } from './reducer'

const start = (over: Partial<AppState> = {}): AppState => ({ ...demoZustand(), personId: 'p9', anwesenheit: [], ...over })

describe('anwesenheitSetzen', () => {
  it('legt die Zeile einer Zusammenkunft an — mit dem, der eingetragen hat', () => {
    const s = reducer(start(), { type: 'anwesenheitSetzen', woche: '2026-09-07', tab: 'mid', saal: 64, video: 23 })
    expect(s.anwesenheit).toEqual([{ woche: '2026-09-07', tab: 'mid', saal: 64, video: 23, pid: 'p9' }])
    expect(s.toast?.text).toBeTruthy()
  })

  it('eine zweite Eingabe ersetzt die Zeile, statt eine zweite anzulegen', () => {
    const vorher = start({ anwesenheit: [{ woche: '2026-09-07', tab: 'mid', saal: 64, video: null, pid: 'p4' }] })
    const s = reducer(vorher, { type: 'anwesenheitSetzen', woche: '2026-09-07', tab: 'mid', saal: 64, video: 23 })
    expect(s.anwesenheit).toEqual([{ woche: '2026-09-07', tab: 'mid', saal: 64, video: 23, pid: 'p9' }])
  })

  it('die Zusammenkunft am Wochenende ist eine eigene Zeile — sortiert nach Woche und Art', () => {
    const vorher = start({ anwesenheit: [{ woche: '2026-09-14', tab: 'mid', saal: 50, video: 5, pid: null }] })
    const s = reducer(vorher, { type: 'anwesenheitSetzen', woche: '2026-09-07', tab: 'we', saal: 80, video: 10 })
    expect(s.anwesenheit.map((a) => `${a.woche}|${a.tab}`)).toEqual(['2026-09-07|we', '2026-09-14|mid'])
  })

  it('Ungültiges kommt nicht hinein: negativ, gebrochen, über 9999', () => {
    const vorher = start()
    for (const saal of [-1, 8.5, 10000]) {
      expect(reducer(vorher, { type: 'anwesenheitSetzen', woche: '2026-09-07', tab: 'mid', saal, video: null }), String(saal)).toBe(vorher)
    }
  })

  it('unverändert bleibt der Zustand derselbe', () => {
    const vorher = start({ anwesenheit: [{ woche: '2026-09-07', tab: 'mid', saal: 64, video: 23, pid: 'p9' }] })
    expect(reducer(vorher, { type: 'anwesenheitSetzen', woche: '2026-09-07', tab: 'mid', saal: 64, video: 23 })).toBe(vorher)
  })
})
