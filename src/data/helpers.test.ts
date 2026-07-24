import { describe, expect, it } from 'vitest'
import {
  displayName,
  initials,
  isQualified,
  personCompare,
  roleLabel,
  serviceQualKey,
  shortDisplayName,
} from './helpers'
import type { Person, Qualifications } from './types'

function priv(overrides: Record<string, boolean> = {}): Qualifications {
  return {
    vorsitzMid: false,
    vorsitzWe: false,
    vortrag: false,
    gebet: false,
    bibellesung: false,
    leser: false,
    schulung: false,
    studium: false,
    treffpunkt: false,
    ...overrides,
  }
}

function person(patch: Partial<Person>): Person {
  return {
    id: 'x',
    fn: 'Simon',
    ln: 'Krüger',
    role: 'verkuendiger',
    tel: '',
    mail: '',
    absent: [],
    priv: priv(),
    ...patch,
  }
}

describe('Anzeigenamen', () => {
  it('displayName ist der volle Name', () => {
    expect(displayName(person({}))).toBe('Simon Krüger')
  })

  it('dn überschreibt den automatischen Namen (echte Duplikate)', () => {
    expect(displayName(person({ fn: 'Josef', ln: 'Mayer', dn: 'Josef Mayer 1' }))).toBe(
      'Josef Mayer 1',
    )
  })

  it('leere Felder ergeben keinen Leerzeichen-Rest', () => {
    expect(displayName(person({ fn: '', ln: '' }))).toBe('')
  })

  it('shortDisplayName ist die frühere Kurzform (nur Migration)', () => {
    expect(shortDisplayName(person({}))).toBe('S. Krüger')
  })

  it('initials aus Vor- und Nachname; leer → Platzhalter', () => {
    expect(initials(person({}))).toBe('SK')
    expect(initials(person({ fn: '', ln: '' }))).toBe('–')
  })
})

describe('personCompare (alphabetisch: Nachname, dann Vorname)', () => {
  it('sortiert nach Nachname mit deutscher Kollation (Umlaute einsortiert)', () => {
    const list = [person({ ln: 'Zimmer' }), person({ ln: 'Öhler' }), person({ ln: 'Adler' })]
    expect(list.sort(personCompare).map((p) => p.ln)).toEqual(['Adler', 'Öhler', 'Zimmer'])
  })

  it('bei gleichem Nachnamen entscheidet der Vorname', () => {
    const list = [person({ fn: 'Sven', ln: 'Keller' }), person({ fn: 'Anna', ln: 'Keller' })]
    expect(list.sort(personCompare).map((p) => p.fn)).toEqual(['Anna', 'Sven'])
  })
})

describe('Rollen & Qualifikation', () => {
  it('roleLabel: weibliche Form nur für Verkündigerinnen', () => {
    expect(roleLabel(person({ role: 'verkuendiger', female: true }))).toBe('Verkündigerin')
    expect(roleLabel(person({ role: 'aeltester' }))).toBe('Ältester')
  })

  it('isQualified prüft nur den Schalter — keine Geschlechts-Sperre', () => {
    const sister = person({ female: true, priv: priv({ 'svc:mik': true }) })
    expect(isQualified(sister, 'svc:mik')).toBe(true)
    expect(isQualified(sister, 'svc:ton')).toBe(false) // Schalter aus
    expect(isQualified(sister, 'unbekannt')).toBe(false) // unbekannter Bereich
  })

  it('serviceQualKey präfixt Dienst-Bereiche', () => {
    expect(serviceQualKey('ton')).toBe('svc:ton')
  })
})
