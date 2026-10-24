/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { AppDispatchContext, AppStateContext, AppStoreContext, type AppState, useStaticStore } from '../app/context'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { ENTWICKLER_HEUTE } from '../../tests/testdaten/uhr'
import { displayName } from '../data/helpers'
import type { FsInstance } from '../data/types'
import { dict } from '../i18n/ui'
import { fill } from '../i18n/useT'
import { zahlBinden } from '../i18n/zahl-binden'
import { PersonTimeline } from './PersonTimeline'

/**
 * **Die Zeitleiste einer Person rückt um Mitternacht weiter** (16.10.2026).
 *
 * Was vergangen ist, wurde beim Rechnen festgestellt — und gerechnet wurde nur
 * neu, wenn sich Person oder Zustand änderten. Wer die Person über Mitternacht
 * offen hatte, sah den gestrigen Termin weiter als kommenden.
 */

function zeige(state: AppState) {
  const person = state.persons.find((p) => p.id === 'p1')!
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={vi.fn()}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <PersonTimeline person={person} />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return render(<Buehne />)
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('PersonTimeline', () => {
  it('was heute ist, steht ab Mitternacht als vergangen da — auch ohne andere Änderung', () => {
    vi.useFakeTimers()
    // Dienstag, 8. September 2026, kurz vor Mitternacht. Der Demo-Bestand hat
    // an diesem Tag den Vorsitz von p1 (Woche ab 7. September).
    vi.setSystemTime(new Date(2026, 8, 8, 23, 59, 30))
    const { container } = zeige({ ...demoZustand(), dataStatus: 'ready' })
    const vergangen = () => container.querySelectorAll('.zeit li.is-past').length
    const vorher = vergangen()
    act(() => {
      vi.advanceTimersByTime(2 * 60 * 1000)
    })
    expect(vergangen()).toBeGreaterThan(vorher)
  })

  it('unter dem Titel steht, wie viel die Person zuletzt hatte — so viele, wie blass in der Leiste stehen (T136)', () => {
    /*
     * Statt der Karte „Auslastung": Die Zahl muss sich an der Liste nachzählen
     * lassen. Die Karte zählte die laufende Woche mit und zeigte je Woche einen
     * Kreis — Zahl und Kreise widersprachen sich (Betreiber 24.10.2026).
     * Mittwoch, 16. September: Vorbei sind Di 8.9., Sa 12.9., Mo 14.9. und Di
     * 15.9. (zwei Aufgaben); die Abwesenheit davor zählt nicht.
     */
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 16, 9, 0))
    const t = dict('de')
    const demo: AppState = { ...demoZustand(), dataStatus: 'ready' }
    const { container } = zeige({
      ...demo,
      absences: [{ id: 'a', personId: 'p1', userId: null, from: '2026-09-02', to: '2026-09-02', reason: '' }],
    })
    const blass = container.querySelectorAll('.zeit li.is-past:not(:has(.zeit-dot--abw))').length
    expect(blass).toBe(5)
    expect(container.querySelector('.zeit-zusatz')?.textContent).toBe(zahlBinden(fill(t.aufgabenLetzteW, { w: 8, n: 5 })))
  })

  it('ein geleiteter Treffpunkt ohne Ort heißt nur „Treffpunkte leiten" — ohne Punkt am Ende', () => {
    // Gemeldet am 18.10.2026 am Blatt der Gruppe; die Zeitleiste hatte dieselbe Lücke.
    // Die Uhr der Entwicklerseite: Die Leiste reicht nur acht Wochen zurück, die Treffpunkte liegen im September 2026.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(ENTWICKLER_HEUTE)
    const t = dict('de')
    const demo: AppState = { ...demoZustand(), dataStatus: 'ready' }
    const p1 = demo.persons.find((p) => p.id === 'p1')!
    const treffpunkt = (id: string, place: string): FsInstance =>
      ({ id, ruleId: 'r1', grp: null, wd: 6, time: '09:30', place, leader: displayName(p1), lpid: 'p1' }) as FsInstance
    const fsWeeks = demo.weeks.map((_w, wi) =>
      wi === 0 ? [treffpunkt('f1', ''), treffpunkt('f2', '  '), treffpunkt('f3', 'Am Markt')] : [],
    )
    const { container } = zeige({ ...demo, fsWeeks })
    const arten = [...container.querySelectorAll('.zeit-art')].map((s) => s.textContent ?? '')
    // Leer und nur Leerzeichen heißen gleich; mit Ort steht er dahinter.
    expect(arten.filter((a) => a === t.privTreffpunkt)).toHaveLength(2)
    expect(arten).toContain(`${t.privTreffpunkt} · Am Markt`)
    expect(arten.filter((a) => a.trimEnd().endsWith('·'))).toEqual([])
  })
})
