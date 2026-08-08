/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { PrivToggle } from './PrivToggle'
import { emptyQualifications } from '../data/helpers'
import type { Person } from '../data/types'

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
