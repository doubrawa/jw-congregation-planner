import { describe, expect, it } from 'vitest'
import { emptyQualifications } from '../data/helpers'
import type { Person } from '../data/types'
import { KEIN_FILTER, passtZumFilter, type PersonFilter } from './person-filter'

function person(patch: Partial<Person> = {}): Person {
  return {
    id: 'x',
    fn: 'Simon',
    ln: 'Krüger',
    role: 'verkuendiger',
    tel: '0170 123 4567',
    mail: 'simon.krueger@example.org',
    priv: emptyQualifications(),
    ...patch,
  }
}

const filter = (patch: Partial<PersonFilter>): PersonFilter => ({ ...KEIN_FILTER, ...patch })

describe('Volltextsuche', () => {
  const p = person()

  it('ohne Eingabe bleibt jeder sichtbar', () => {
    expect(passtZumFilter(p, KEIN_FILTER)).toBe(true)
  })

  it('findet über den Namen — Groß-/Kleinschreibung egal', () => {
    expect(passtZumFilter(p, filter({ q: 'krüger' }))).toBe(true)
    expect(passtZumFilter(p, filter({ q: 'Meier' }))).toBe(false)
  })

  it('findet über die E-Mail-Adresse', () => {
    expect(passtZumFilter(p, filter({ q: 'example.org' }))).toBe(true)
  })

  it('findet über die Telefonnummer, auch mit anderer Schreibweise', () => {
    expect(passtZumFilter(p, filter({ q: '0170 123' }))).toBe(true)
    // Ohne den Ziffernvergleich fände diese Eingabe „0170 123 4567" nicht.
    expect(passtZumFilter(p, filter({ q: '01701234567' }))).toBe(true)
    expect(passtZumFilter(p, filter({ q: '+49 170 1234567' }))).toBe(false)
  })

  it('eine reine Ziffer im Namen macht nicht jeden zum Treffer', () => {
    expect(passtZumFilter(person({ tel: '0555 999' }), filter({ q: '7' }))).toBe(false)
  })

  it('findet auch über den abweichenden Anzeigenamen', () => {
    expect(passtZumFilter(person({ dn: 'Simon K.' }), filter({ q: 'simon k.' }))).toBe(true)
  })
})

describe('Filterfelder', () => {
  it('Geschlecht', () => {
    const bruder = person()
    const schwester = person({ female: true })
    expect(passtZumFilter(bruder, filter({ sex: 'm' }))).toBe(true)
    expect(passtZumFilter(bruder, filter({ sex: 'w' }))).toBe(false)
    expect(passtZumFilter(schwester, filter({ sex: 'w' }))).toBe(true)
  })

  it('Rolle', () => {
    const aeltester = person({ role: 'aeltester' })
    expect(passtZumFilter(aeltester, filter({ role: 'aeltester' }))).toBe(true)
    expect(passtZumFilter(aeltester, filter({ role: 'verkuendiger' }))).toBe(false)
  })

  it('Gruppe — Personen ohne Gruppe fallen heraus', () => {
    expect(passtZumFilter(person({ grp: 'g2' }), filter({ grp: 'g2' }))).toBe(true)
    expect(passtZumFilter(person({ grp: 'g1' }), filter({ grp: 'g2' }))).toBe(false)
    expect(passtZumFilter(person({ grp: null }), filter({ grp: 'g2' }))).toBe(false)
  })

  it('Aufgabenbereich — fest wie dynamisch (svc:<dienst>)', () => {
    const p = person({ priv: { ...emptyQualifications(), gebet: true, 'svc:mik': true } })
    expect(passtZumFilter(p, filter({ priv: 'gebet' }))).toBe(true)
    expect(passtZumFilter(p, filter({ priv: 'vortrag' }))).toBe(false)
    expect(passtZumFilter(p, filter({ priv: 'svc:mik' }))).toBe(true)
    expect(passtZumFilter(p, filter({ priv: 'svc:ton' }))).toBe(false)
  })

  it('mehrere Felder wirken zusammen (UND)', () => {
    const p = person({ role: 'aeltester', grp: 'g1', female: false })
    expect(passtZumFilter(p, filter({ q: 'krüger', role: 'aeltester', grp: 'g1' }))).toBe(true)
    expect(passtZumFilter(p, filter({ q: 'krüger', role: 'aeltester', grp: 'g2' }))).toBe(false)
  })
})
