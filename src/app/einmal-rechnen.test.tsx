/** @vitest-environment jsdom */
/**
 * **Der Folgezustand wird einmal gerechnet, nicht zweimal.**
 *
 * `dispatch` braucht ihn für `persist` (das den Vorher/Nachher-Vergleich
 * anstellt), React braucht ihn für den Bildschirm. Solange React die Aktion ein
 * zweites Mal auf seinen eigenen Stand anwandte, liefen die beiden
 * auseinander — überall dort, wo der Reducer eine **Kennung** erzeugt.
 *
 * Das ist keine Feinheit. Bei den Treffpunkten kostete es die Planung:
 *
 *   1. Neue Regel anlegen → `fs_rules` bekommt Kennung A, der Bildschirm B.
 *   2. Leiter zuteilen → `fs_weeks` bekommt B (der Client schreibt seinen Stand).
 *   3. Neu laden → `regenFsWeeks` erzeugt aus der Regel wieder A, findet unter
 *      A keine Leitung und wirft die unter B liegende weg.
 *
 * Der Leiter war weg, ohne Fehler und ohne Hinweis. Dieselbe Wirkung wie bei
 * T87, nur über eine andere Ursache — und deshalb steht die Probe hier an der
 * Stelle, wo die Ursache sitzt, und nicht bei den Treffpunkten.
 *
 * Geprüft wird über **alle** Aktionen, die eine Kennung erzeugen. Käme eine
 * dazu und ginge derselbe Weg wieder verloren, fiele es hier auf.
 */
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { AppAction, AppState } from './context'

/** Was `persist` zu sehen bekommt — der Stand, der in die Datenbank geht. */
const persistiert: AppState[] = []
vi.mock('./persist', () => ({
  persist: (_prev: AppState, next: AppState) => {
    persistiert.push(next)
  },
}))
vi.mock('./hydrate', () => ({ loadAndHydrate: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../lib/supabase', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  supabase: null,
  isSupabaseConfigured: false,
}))

const { AppProvider } = await import('./store')
const { useApp } = await import('./context')

const huelle = ({ children }: { children: ReactNode }) => <AppProvider>{children}</AppProvider>

afterEach(cleanup)

/** Eine Aktion auslösen und beide Stände zurückgeben: gespeichert und gezeigt. */
function nachAktion(action: AppAction): { gespeichert: AppState; gezeigt: AppState } {
  const { result } = renderHook(() => useApp(), { wrapper: huelle })
  persistiert.length = 0
  act(() => {
    result.current.dispatch(action)
  })
  const gespeichert = persistiert[persistiert.length - 1]
  if (!gespeichert) throw new Error('persist wurde nicht aufgerufen')
  return { gespeichert, gezeigt: result.current.state }
}

describe('Gespeichert ist, was auf dem Bildschirm steht', () => {
  it('Treffpunkt-Regel: dieselbe Kennung in beiden Ständen', () => {
    // Die Kennung steckt in jeder Treffpunkt-Instanz und über sie im
    // Aufgaben-Schlüssel. Zwei Kennungen hießen: eine Regel, die der nächste
    // Ladevorgang nicht wiedererkennt.
    const { gespeichert, gezeigt } = nachAktion({ type: 'fsRuleAdd', grp: '' })
    expect(gezeigt.fsRules.map((r) => r.id)).toEqual(gespeichert.fsRules.map((r) => r.id))
    // Und die daraus erzeugten Wochen tragen dieselbe.
    const kennungen = (s: AppState) => s.fsWeeks.flat().map((i) => i.id).sort()
    expect(kennungen(gezeigt)).toEqual(kennungen(gespeichert))
  })

  it('Weiterer Termin der Woche: dieselbe Kennung in beiden Ständen', () => {
    const { gespeichert, gezeigt } = nachAktion({ type: 'terminAdd' })
    const ids = (s: AppState) => (s.weeks[s.week]?.termine ?? []).map((t) => t.id)
    expect(ids(gezeigt)).toEqual(ids(gespeichert))
    expect(ids(gezeigt)).toHaveLength(1)
  })

  it('Haushalt: dieselbe Familien-Id in beiden Ständen', () => {
    const { result } = renderHook(() => useApp(), { wrapper: huelle })
    const [a, b] = result.current.state.persons
    if (!a || !b) throw new Error('zu wenige Demo-Personen')
    persistiert.length = 0
    act(() => {
      result.current.dispatch({ type: 'setFamily', id: a.id, memberId: b.id, add: true })
    })
    const gespeichert = persistiert[persistiert.length - 1]!
    const fam = (s: AppState) => s.persons.find((p) => p.id === a.id)?.fam
    expect(fam(result.current.state)).toBe(fam(gespeichert))
    expect(fam(result.current.state)).toBeTruthy()
  })

  it('Mitteilung: dieselbe Kennung und derselbe Zeitpunkt in beiden Ständen', () => {
    // Hier fiel es bisher nicht auf: `insertNotifications` schickt weder Id
    // noch Zeitstempel mit. Die Ungleichheit war trotzdem da — und die nächste
    // Mitteilung, die eine davon braucht, hätte sie geerbt.
    const { gespeichert, gezeigt } = nachAktion({ type: 'declineTask', id: 'a1' })
    expect(gezeigt.notifs[0]?.id).toBe(gespeichert.notifs[0]?.id)
    expect(gezeigt.notifs[0]?.at).toBe(gespeichert.notifs[0]?.at)
  })

  it('auch ohne Kennung: gespeicherter und gezeigter Stand sind dasselbe Objekt', () => {
    // Der eigentliche Vertrag. Er gilt für jede Aktion, nicht nur für die vier
    // oben — deshalb wird hier die **Identität** geprüft, nicht der Inhalt.
    const { gespeichert, gezeigt } = nachAktion({ type: 'navigate', screen: 'planen' })
    expect(gezeigt).toBe(gespeichert)
  })
})
