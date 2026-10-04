/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { PrivToggle, RechteToggles } from './PrivToggle'
import { emptyQualifications } from '../data/helpers'
import type { Member, Person } from '../data/types'
 import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppState,
  useStaticStore,
} from '../app/context'
 import { demoZustand } from '../../tests/testdaten/demo-start'
 import type { ReactNode } from 'react'

 function Buehne({ state, children }: { state: AppState; children: ReactNode }) {
  const store = useStaticStore(state)
  return (
    <AppDispatchContext.Provider value={() => {}}>
      <AppStoreContext.Provider value={store}>
        <AppStateContext.Provider value={state}>{children}</AppStateContext.Provider>
      </AppStoreContext.Provider>
    </AppDispatchContext.Provider>
  )
 }

const person = (patch: Partial<Person['priv']> = {}): Person => ({
  id: 'p', fn: 'A', ln: 'B', role: 'verkuendiger', tel: '', mail: '',
  priv: { ...emptyQualifications(), ...patch },
})

afterEach(cleanup)

describe('PrivToggle — Kopplung Schulungsaufgaben → Partner', () => {
  it('aktiviert mit „schulung" automatisch „schulungPartner"', () => {
    const update = vi.fn()
    const { getByRole } = render(
      <PrivToggle qkey="schulung" label="Schulung" person={person()} update={update} />,
    )
    fireEvent.click(getByRole('switch'))
    expect(update).toHaveBeenCalledWith({
      priv: expect.objectContaining({ schulung: true, schulungPartner: true }),
    })
  })

  it('beim Abschalten von „schulung" bleibt „schulungPartner" wie es ist (kein Zwang)', () => {
    const update = vi.fn()
    const p = person({ schulung: true, schulungPartner: true })
    const { getByRole } = render(<PrivToggle qkey="schulung" label="Schulung" person={p} update={update} />)
    fireEvent.click(getByRole('switch'))
    expect(update).toHaveBeenCalledWith({
      priv: expect.objectContaining({ schulung: false, schulungPartner: true }),
    })
  })

  it('andere Bereiche koppeln den Partner-Schalter nicht', () => {
    const update = vi.fn()
    const { getByRole } = render(
      <PrivToggle qkey="vortrag" label="Vortrag" person={person()} update={update} />,
    )
    fireEvent.click(getByRole('switch'))
    expect(update).toHaveBeenCalledWith({
      priv: expect.objectContaining({ vortrag: true, schulungPartner: false }),
    })
  })
})

describe('PrivToggle — Hinweis auf Brüder-Bereiche (F4)', () => {
  const schwester = (patch: Partial<Person['priv']> = {}): Person => ({
    ...person(patch),
    female: true,
  })
  const zeichen = (c: HTMLElement) => c.querySelector('.priv-warn')

  it('zeigt das Zeichen bei einer Schwester mit gesetztem Brüder-Bereich', () => {
    const { container } = render(
      <PrivToggle
        qkey="gebet"
        label="Gebete"
        person={schwester({ gebet: true })}
        update={vi.fn()}
        bruderLabel="Bruder"
      />,
    )
    expect(zeichen(container)).not.toBeNull()
    expect(zeichen(container)?.getAttribute('aria-label')).toBe('Bruder')
  })

  it('nicht bei einem Bruder und nicht bei abgeschaltetem Schalter', () => {
    const bruder = render(
      <PrivToggle qkey="gebet" label="Gebete" person={person({ gebet: true })} update={vi.fn()} bruderLabel="Bruder" />,
    )
    expect(zeichen(bruder.container)).toBeNull()
    cleanup()
    const aus = render(
      <PrivToggle qkey="gebet" label="Gebete" person={schwester()} update={vi.fn()} bruderLabel="Bruder" />,
    )
    expect(zeichen(aus.container)).toBeNull()
  })

  it('nicht bei Schulungsaufgaben — die übernehmen auch Schwestern', () => {
    const { container } = render(
      <PrivToggle
        qkey="schulung"
        label="Schulungsaufgaben"
        person={schwester({ schulung: true })}
        update={vi.fn()}
        bruderLabel="Bruder"
      />,
    )
    expect(zeichen(container)).toBeNull()
  })

  it('der Schalter bleibt bedienbar — der Hinweis sperrt nichts', () => {
    // Ausdrücklich so gewollt: übernehmen Schwestern Bereiche, weil Brüder
    // fehlen, darf die App das nicht verhindern (F4: „ohne Bevormundung").
    const update = vi.fn()
    const { getByRole } = render(
      <PrivToggle
        qkey="gebet"
        label="Gebete"
        person={schwester({ gebet: true })}
        update={update}
        bruderLabel="Bruder"
      />,
    )
    expect((getByRole('switch') as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(getByRole('switch'))
    expect(update).toHaveBeenCalledWith({ priv: expect.objectContaining({ gebet: false }) })
  })
})

/**
 * Die Rechte-Schalter zeigen das **wirksame** Recht — Planer und Admin
 * (4.10.2026).
 *
 * Es steht an zwei Stellen: `persons.planner_vorgemerkt` bzw.
 * `zuteiler_vorgemerkt` ist die Vormerkung für die Einladung, `members.planner`
 * bzw. `zuteiler` das, wonach App und Datenbank entscheiden. Wer die
 * Vormerkung anzeigt, zeigt bei jedem, dessen Person aus dem NWS-Import
 * stammt, „aus" — auch beim Betreiber selbst, der sehr wohl Admin ist.
 */
describe('RechteToggles — welches der beiden Rechte gilt', () => {
  const konto = (userId: string, personId: string | null, rechte: { planner?: boolean; zuteiler?: boolean }): Member => ({
    userId,
    email: `${userId}@example.org`,
    personId,
    planner: rechte.planner ?? false,
    zuteiler: rechte.zuteiler ?? false,
  })

  const zeige = (over: Partial<AppState>, p: Person = person(), update = vi.fn()) =>
    render(
      <Buehne state={{ ...demoZustand(), userId: 'u-ich', ...over }}>
        <RechteToggles person={p} update={update} />
      </Buehne>,
    )
  const schalter = (r: ReturnType<typeof zeige>, name: 'Admin' | 'Planer') =>
    r.getByRole('switch', { name }) as HTMLButtonElement

  it('nimmt das Konto, nicht die Vormerkung an der Person', () => {
    // Genau der gemeldete Fall: `persons.planner` false (der Personen-Import
    // schreibt die Spalte nicht), das Konto hat das Recht trotzdem.
    const r = zeige({ members: [konto('u-fremd', 'p', { planner: true })] })
    expect(schalter(r, 'Admin').getAttribute('aria-checked')).toBe('true')
  })

  it('ohne Konto trägt die Vormerkung an der Person — für beide Rechte', () => {
    // Für Eingeladene, die sich noch nicht angemeldet haben — sie sollen das
    // Recht ab der ersten Anmeldung haben.
    const admin = zeige({ members: [] }, { ...person(), plannerVorgemerkt: true })
    expect(schalter(admin, 'Admin').getAttribute('aria-checked')).toBe('true')
    cleanup()
    const planer = zeige({ members: [] }, { ...person(), zuteilerVorgemerkt: true })
    expect(schalter(planer, 'Planer').getAttribute('aria-checked')).toBe('true')
    expect(schalter(planer, 'Admin').getAttribute('aria-checked')).toBe('false')
  })

  it('ein Planer-Konto: Planer an, Admin aus — und der Schalter nimmt das Recht wieder', () => {
    const update = vi.fn()
    const r = zeige({ members: [konto('u-fremd', 'p', { zuteiler: true })] }, person(), update)
    expect(schalter(r, 'Planer').getAttribute('aria-checked')).toBe('true')
    expect(schalter(r, 'Admin').getAttribute('aria-checked')).toBe('false')
    fireEvent.click(schalter(r, 'Planer'))
    expect(update).toHaveBeenCalledWith({ zuteilerVorgemerkt: false })
  })

  it('ein Admin hat das Planer-Recht ohnehin: an und gesperrt', () => {
    // Ein Schalter „Planer: aus" bei einem Admin behauptete, er dürfe nicht
    // zuteilen — und ihn auszuschalten nähme ihm nichts.
    const r = zeige({ members: [konto('u-fremd', 'p', { planner: true })] })
    expect(schalter(r, 'Planer').getAttribute('aria-checked')).toBe('true')
    expect(schalter(r, 'Planer').disabled).toBe(true)
  })

  it('am eigenen Konto sind beide Schalter gesperrt', () => {
    // Sonst nimmt sich jemand mit einem Fingertipp den Zugang zu Planen,
    // Personen und Einstellungen — zurückgeben könnte ihn nur ein zweiter
    // Admin. Die Datenbank zieht dieselbe Grenze (`user_id <> auth.uid()`).
    const r = zeige({ members: [konto('u-ich', 'p', { planner: true })] })
    expect(schalter(r, 'Admin').disabled).toBe(true)
    expect(schalter(r, 'Planer').disabled).toBe(true)
  })
})
