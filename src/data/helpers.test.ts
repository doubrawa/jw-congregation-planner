import { describe, expect, it } from 'vitest'
import {
  displayName,
  duplicateDisplayNames,
  familyMembers,
  splitOpeningSong,
  initials,
  isPlainPublisher,
  isQualified,
  linkFamily,
  partnerGenderOk,
  personCompare,
  roleLabel,
  serviceQualKey,
  shortDisplayName,
  unlinkFamily,
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
    schulungPartner: false,
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

describe('Schülerteil-Qualifikation & Partner-Geschlecht', () => {
  it('isQualified: schulungPartner deckt schulung UND schulungPartner ab', () => {
    const fuehrer = person({ priv: priv({ schulung: true }) })
    const nurPartner = person({ priv: priv({ schulungPartner: true }) })
    const keiner = person({ priv: priv() })
    expect(isQualified(fuehrer, 'schulungPartner')).toBe(true) // Führer darf auch Partner
    expect(isQualified(nurPartner, 'schulungPartner')).toBe(true)
    expect(isQualified(keiner, 'schulungPartner')).toBe(false)
    expect(isQualified(nurPartner, 'schulung')).toBe(false) // aber nicht Führer
  })

  it('partnerGenderOk: gleiches Geschlecht; ohne Führer keine Einschränkung', () => {
    const bruder = person({ female: false })
    const schwester = person({ female: true })
    expect(partnerGenderOk(bruder, person({ female: false }))).toBe(true)
    expect(partnerGenderOk(bruder, person({ female: true }))).toBe(false)
    expect(partnerGenderOk(schwester, person({ female: true }))).toBe(true)
    expect(partnerGenderOk(undefined, person({ female: true }))).toBe(true)
  })

  it('partnerGenderOk: Familienangehörige dürfen geschlechtsübergreifend', () => {
    const mann = person({ id: 'm', female: false, fam: 'h1' })
    const frau = person({ id: 'f', female: true, fam: 'h1' })
    const fremde = person({ id: 'x', female: true, fam: 'h2' })
    expect(partnerGenderOk(mann, frau)).toBe(true) // gleicher Haushalt
    expect(partnerGenderOk(mann, fremde)).toBe(false) // anderer Haushalt
    expect(partnerGenderOk(person({ female: false }), person({ female: true }))).toBe(false) // ohne fam
  })
})

describe('Familien-/Haushaltszugehörigkeit', () => {
  const ps = () => [
    person({ id: 'a', fn: 'Anna' }),
    person({ id: 'b', fn: 'Ben' }),
    person({ id: 'c', fn: 'Cara' }),
  ]

  it('linkFamily gibt beiden dieselbe (neue) Familien-Id; symmetrisch sichtbar', () => {
    const next = linkFamily(ps(), 'a', 'b')
    const a = next.find((p) => p.id === 'a')!
    const b = next.find((p) => p.id === 'b')!
    expect(a.fam).toBeTruthy()
    expect(a.fam).toBe(b.fam)
    expect(familyMembers(next, a).map((p) => p.id)).toEqual(['b'])
    expect(familyMembers(next, b).map((p) => p.id)).toEqual(['a'])
  })

  it('linkFamily nimmt einen Dritten in den bestehenden Haushalt auf', () => {
    let next = linkFamily(ps(), 'a', 'b')
    next = linkFamily(next, 'a', 'c')
    const ids = next.filter((p) => p.fam === next.find((q) => q.id === 'a')!.fam).map((p) => p.id)
    expect(ids.sort()).toEqual(['a', 'b', 'c'])
  })

  it('unlinkFamily löst eine Person; ein verbleibender Rest wird auch gelöst', () => {
    const two = linkFamily(ps(), 'a', 'b')
    const next = unlinkFamily(two, 'b')
    expect(next.find((p) => p.id === 'b')!.fam).toBeNull()
    // Nur noch a im Haushalt → auch a wird gelöst (Haushalt mit 1 ist sinnlos)
    expect(next.find((p) => p.id === 'a')!.fam).toBeNull()
  })

  it('isPlainPublisher: nur Verkündiger, nicht Ältester/DAG', () => {
    expect(isPlainPublisher(person({ role: 'verkuendiger' }))).toBe(true)
    expect(isPlainPublisher(person({ role: 'aeltester' }))).toBe(false)
    expect(isPlainPublisher(person({ role: 'dienstamtgehilfe' }))).toBe(false)
  })
})

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

describe('splitOpeningSong', () => {
  it('zieht das Lied aus dem Eröffnungs-Sammeltitel (Lied zuerst)', () => {
    expect(splitOpeningSong('Lied 1 · Gebet · Einleitende Worte')).toEqual({
      song: 'Lied 1',
      rest: 'Gebet · Einleitende Worte',
    })
  })

  it('zieht das Lied aus dem Abschluss-Sammeltitel (Lied in der Mitte)', () => {
    expect(splitOpeningSong('Schlussworte · Lied 76 · Gebet')).toEqual({
      song: 'Lied 76',
      rest: 'Schlussworte · Gebet',
    })
  })

  it('funktioniert sprachunabhängig (übersetzter Titel mit Nummer)', () => {
    expect(splitOpeningSong('Song 138 · Prayer')).toEqual({ song: 'Song 138', rest: 'Prayer' })
  })

  it('ohne Nummern-Atom bleibt der Titel unverändert', () => {
    expect(splitOpeningSong('Schlussworte · Gebet')).toEqual({
      song: null,
      rest: 'Schlussworte · Gebet',
    })
  })
})

describe('duplicateDisplayNames', () => {
  it('meldet einen von zwei Personen geteilten Anzeigenamen mit Anzahl', () => {
    const list = [
      person({ id: 'a', fn: 'Josef', ln: 'Mayer' }),
      person({ id: 'b', fn: 'Josef', ln: 'Mayer' }),
      person({ id: 'c', fn: 'Simon', ln: 'Krüger' }),
    ]
    expect(duplicateDisplayNames(list)).toEqual([{ name: 'Josef Mayer', count: 2 }])
  })

  it('zählt drei Gleichnamige und sortiert Namen alphabetisch', () => {
    const list = [
      person({ id: 'a', fn: 'Josef', ln: 'Mayer' }),
      person({ id: 'b', fn: 'Josef', ln: 'Mayer' }),
      person({ id: 'c', fn: 'Josef', ln: 'Mayer' }),
      person({ id: 'd', fn: 'Anna', ln: 'Berg' }),
      person({ id: 'e', fn: 'Anna', ln: 'Berg' }),
    ]
    expect(duplicateDisplayNames(list)).toEqual([
      { name: 'Anna Berg', count: 2 },
      { name: 'Josef Mayer', count: 3 },
    ])
  })

  it('ein per dn eindeutig gemachter Name ist keine Dublette mehr', () => {
    const list = [
      person({ id: 'a', fn: 'Josef', ln: 'Mayer', dn: 'Josef Mayer 1' }),
      person({ id: 'b', fn: 'Josef', ln: 'Mayer', dn: 'Josef Mayer 2' }),
    ]
    expect(duplicateDisplayNames(list)).toEqual([])
  })

  it('leere Namen zählen nicht als Dublette', () => {
    const list = [person({ id: 'a', fn: '', ln: '' }), person({ id: 'b', fn: '', ln: '' })]
    expect(duplicateDisplayNames(list)).toEqual([])
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
