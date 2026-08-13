import { describe, expect, it } from 'vitest'
import {
  displayName,
  duplicateDisplayNames,
  familyMembers,
  gehoertZu,
  splitOpeningSong,
  initials,
  isPlainPublisher,
  isQualified,
  isSong,
  linkFamily,
  loadWindow,
  partnerGenderOk,
  partWorkload,
  personCompare,
  roleLabel,
  rolleNennt,
  serviceQualKey,
  shortDisplayName,
  tieHash,
  unlinkFamily,
  workloadOf,
} from './helpers'
import { buildDemoWeeks } from './testdaten'
import type { PartItem, Person, Qualifications } from './types'

/** Person, die nur über ihren Anzeigenamen zugeordnet wird (Altdaten-Slots ohne pid). */
import { emptyQualifications } from './helpers'

function alsPerson(name: string): Person {
  return {
    id: `test-${name}`, fn: '', ln: '', dn: name, role: 'verkuendiger', female: false,
    tel: '', mail: '', priv: emptyQualifications(),
  }
}


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

describe('rolleNennt (Begleiter im Rollentext)', () => {
  it('erkennt den Begleiter an der Wortgrenze', () => {
    expect(rolleNennt('mit Anna Berg', 'Anna Berg')).toBe(true)
    expect(rolleNennt('mit Anna Berg', 'Anna')).toBe(true)
    expect(rolleNennt('Gesprächspartner · mit Anna Berg', 'Anna Berg')).toBe(true)
  })

  it('zählt keinen Namen mit, der nur zufällig darin steckt', () => {
    // Der eigentliche Befund: `rolle.includes(name)` gab Anna eine Aufgabe, die
    // Annalena gehört. Bei der Auto-Zuteilung genügt eine solche Phantom-Last,
    // um jemanden dauerhaft hinten anzustellen.
    expect(rolleNennt('mit Annalena Berg', 'Anna')).toBe(false)
    expect(rolleNennt('mit Hanna Berg', 'Anna')).toBe(false)
    expect(rolleNennt('mit Bergmann', 'Berg')).toBe(false)
  })

  it('kommt mit Sonderzeichen in Namen zurecht (kein Regex)', () => {
    expect(rolleNennt("mit O'Brien", "O'Brien")).toBe(true)
    expect(rolleNennt('mit Müller-Lüdenscheidt', 'Müller-Lüdenscheidt')).toBe(true)
    // Als Muster gelesen würde „A.“ auf „Ax“ passen.
    expect(rolleNennt('mit Ax Berg', 'A.')).toBe(false)
  })

  it('leerer Name oder leere Rolle zählt nie', () => {
    expect(rolleNennt('mit Anna Berg', '')).toBe(false)
    expect(rolleNennt(undefined, 'Anna Berg')).toBe(false)
  })
})

describe('partWorkload zählt Begleiter nur bei echter Nennung', () => {
  it('gibt die Aufgabe der genannten Person, nicht der namensähnlichen', () => {
    const weeks = buildDemoWeeks()
    const item = weeks[0].mid.sections[0].items.find((x) => !isSong(x)) as PartItem
    // Alt-Daten tragen den Begleiter als „mit X" im Rollentext.
    item.names[0] = { ...item.names[0], name: 'Rolf Klein', rolle: 'mit Annalena Berg' }
    expect(partWorkload(weeks, alsPerson('Rolf Klein'))).toBe(1)
    expect(partWorkload(weeks, alsPerson('Annalena Berg'))).toBe(1)
    // „Anna" steckt in „Annalena" — mit `rolle.includes(name)` bekam sie hier
    // eine Aufgabe, die einer anderen gehört.
    expect(partWorkload(weeks, alsPerson('Anna'))).toBe(0)
  })
})

describe('loadWindow hält sich an dieselbe Platzgrenze wie workloadOf', () => {
  // Der Fix an `helperWorkload` erreichte die Mini-Quadrate nicht: dieselbe
  // Zeile im Zuteilungs-Sheet zeigte „frei" und daneben ein belegtes Quadrat.
  const dienste = [{ key: 'ton', name: 'Ton', count: 1, qual: false }]

  function wochenMitZweitemTon(): ReturnType<typeof buildDemoWeeks> {
    const weeks = buildDemoWeeks()
    // Platz 0 gehört jemand anderem, Platz 1 liegt hinter `count: 1`.
    weeks[1].mid.helpers.ton = [{ name: 'Erste Person' }, { name: 'Zweite Person' }]
    return weeks
  }

  it('zählt einen Platz hinter svc.count nicht als Belegung', () => {
    const weeks = wochenMitZweitemTon()
    expect(workloadOf(weeks, alsPerson('Zweite Person'), dienste)).toBe(0)
    expect(loadWindow(weeks, alsPerson('Zweite Person'), 1, dienste)).not.toContain('helper')
  })

  it('ohne services zählt weiter alles — beide Seiten gleich', () => {
    const weeks = wochenMitZweitemTon()
    expect(workloadOf(weeks, alsPerson('Zweite Person'))).toBe(1)
    expect(loadWindow(weeks, alsPerson('Zweite Person'), 1)).toContain('helper')
  })

  it('der belegte Platz innerhalb der Grenze zählt weiterhin', () => {
    const weeks = wochenMitZweitemTon()
    expect(workloadOf(weeks, alsPerson('Erste Person'), dienste)).toBe(1)
    expect(loadWindow(weeks, alsPerson('Erste Person'), 1, dienste)).toContain('helper')
  })
})

describe('tieHash (gemeinsamer Tie-Break)', () => {
  it('mischt nach: benachbarte Schlüssel liegen nicht benachbart', () => {
    // Ohne Avalanche bestimmt der Namensteil die hohen Bits und die Woche nur
    // die niedrigsten — dann ist die Rangfolge in JEDER Woche dieselbe.
    const a = tieHash('Anton Muster|0|1')
    const b = tieHash('Anton Muster|1|1')
    expect(Math.abs(a - b)).toBeGreaterThan(0xffffff)
  })

  it('ist stabil (gleicher Schlüssel, gleicher Wert)', () => {
    expect(tieHash('Anton Muster|3|1')).toBe(tieHash('Anton Muster|3|1'))
  })
})

describe('gehoertZu — wem eine Zuteilung gehört', () => {
  const anton = person({ id: 'p1', fn: 'Anton', ln: 'Muster' })
  const zwilling = person({ id: 'p2', fn: 'Anton', ln: 'Muster' }) // gleicher Anzeigename

  it('die Id entscheidet, sobald die Zuteilung eine trägt', () => {
    const slot = { name: 'Anton Muster', pid: 'p1' }
    expect(gehoertZu(slot, anton)).toBe(true)
    expect(gehoertZu(slot, zwilling)).toBe(false)
  })

  it('fällt NICHT auf den Namen zurück, wenn eine fremde Id dasteht', () => {
    // Sonst zählte eine Zuteilung, die ausdrücklich p1 meint, auch für p2 mit.
    expect(gehoertZu({ name: 'Anton Muster', pid: 'p1' }, zwilling)).toBe(false)
  })

  it('ohne Id (Altdaten) zählt der Anzeigename — für beide Gleichnamigen', () => {
    // Diese Zweideutigkeit kann keine Auflösung beheben; deshalb warnt die App
    // vor doppelten Anzeigenamen (duplicateDisplayNames).
    const alt = { name: 'Anton Muster' }
    expect(gehoertZu(alt, anton)).toBe(true)
    expect(gehoertZu(alt, zwilling)).toBe(true)
  })

  it('ein leerer Platz gehört niemandem', () => {
    expect(gehoertZu({ name: '' }, anton)).toBe(false)
    expect(gehoertZu(undefined, anton)).toBe(false)
    expect(gehoertZu({ name: '', pid: 'p1' }, anton)).toBe(false)
  })
})

describe('Auslastung zählt je Person, nicht je Name', () => {
  const anton = person({ id: 'p1', fn: 'Anton', ln: 'Muster' })
  const zwilling = person({ id: 'p2', fn: 'Anton', ln: 'Muster' })

  function wocheMitBeiden(): ReturnType<typeof buildDemoWeeks> {
    const weeks = buildDemoWeeks()
    const item = weeks[0].mid.sections[0].items.find((x) => !isSong(x)) as PartItem
    // Zwei Plätze, zwei verschiedene Personen — mit identischem Anzeigenamen.
    item.names[0] = { ...item.names[0], name: 'Anton Muster', pid: 'p1' }
    item.names[1] = { ...item.names[1], name: 'Anton Muster', pid: 'p2' }
    return weeks
  }

  it('zwei Gleichnamige teilen sich keine Strichliste', () => {
    // Über den Namen gezählt hätten beide je 2 — und die Auto-Zuteilung
    // stellte beide doppelt so weit hinten an, wie es stimmt.
    const weeks = wocheMitBeiden()
    expect(partWorkload(weeks, anton)).toBe(1)
    expect(partWorkload(weeks, zwilling)).toBe(1)
  })

  it('auch Hilfsdienste zählen je Person', () => {
    const weeks = buildDemoWeeks()
    weeks[0].mid.helpers.ton = [
      { name: 'Anton Muster', pid: 'p1' },
      { name: 'Anton Muster', pid: 'p2' },
    ]
    const dienste = [{ key: 'ton', name: 'Ton', count: 2, qual: false }]
    expect(workloadOf(weeks, anton, dienste)).toBe(1)
    expect(workloadOf(weeks, zwilling, dienste)).toBe(1)
  })
})
