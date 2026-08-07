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
