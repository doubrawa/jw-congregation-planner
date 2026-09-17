import { describe, expect, it } from 'vitest'
import { normalizePriv, pidsNachtragen, renameInWeeks } from './data'
import type { Meeting, PartItem, Person, Qualifications, Week } from '../data/types'

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

describe('normalizePriv (gespeicherte Qualifikationen)', () => {
  it('leerer/fehlender Bestand → alle festen Bereiche false', () => {
    const priv = normalizePriv(null)
    for (const key of ['vorsitzMid', 'vorsitzWe', 'vortrag', 'gebet', 'bibellesung', 'leser', 'schulung', 'studium']) {
      expect(priv[key], key).toBe(false)
    }
  })

  it('Dienst-Bereiche (svc:*) und Wahrheitswerte bleiben erhalten', () => {
    const priv = normalizePriv({ 'svc:ton': true, vortrag: 1 } as never)
    expect(priv['svc:ton']).toBe(true)
    expect(priv.vortrag).toBe(true)
  })
})

describe('renameInWeeks (Personen-Umbenennung in geplanten Wochen)', () => {
  const meeting = (): Meeting => ({
    date: '',
    end: '',
    sections: [
      {
        label: 'X',
        farbe: 'petrol',
        items: [
          { iid: 'i70', num: 1, title: 'Punkt', meta: '', names: [{ name: 'Simon Krüger' }, { name: 'Bernhard Mauz' }] },
          { song: 'Lied 1' },
        ],
      },
    ],
    helpers: { mik: [{ name: 'Simon Krüger' }, { name: 'Gruppe 1' }] },
  })
  const week = (): Week => ({ range: '', book: '', start: '2026-09-07', current: false, mid: meeting(), we: meeting() })

  it('ersetzt exakt den alten Anzeigenamen in Programmpunkten und Hilfsdiensten', () => {
    const [w] = renameInWeeks([week()], 'p1', 'Simon Krüger', 'Simon Müller')
    const item = w.mid.sections[0].items[0]
    expect('names' in item && item.names[0].name).toBe('Simon Müller')
    expect('names' in item && item.names[1].name).toBe('Bernhard Mauz') // andere unberührt
    expect(w.mid.helpers.mik).toEqual([{ name: 'Simon Müller' }, { name: 'Gruppe 1' }])
    expect(w.we.helpers.mik[0].name).toBe('Simon Müller') // beide Zusammenkünfte
  })

  it('lässt Wochen ohne Treffer als identische Referenz', () => {
    const weeks = [week()]
    expect(renameInWeeks(weeks, 'p1', 'Niemand Da', 'Neu')).toBe(weeks)
    expect(renameInWeeks(weeks, 'p1', 'Simon Krüger', 'Simon Krüger')).toBe(weeks) // kein Wechsel
  })

  it('rührt nur die betroffene Woche an (unbetroffene behalten ihre Referenz)', () => {
    const w0 = week() // enthält Simon Krüger
    const w1: Week = { range: 'leer', book: '', start: '2026-09-07', current: false, mid: emptyMeeting(), we: emptyMeeting() }
    const next = renameInWeeks([w0, w1], 'p1', 'Simon Krüger', 'Simon Müller')
    expect(next[0]).not.toBe(w0)
    expect(next[1]).toBe(w1) // unverändert → gleiche Referenz (kein DB-Write)
  })
})

describe('Personen-Id-Bindung (pid)', () => {
  const emptyMid = (): Meeting => ({ date: '', end: '', sections: [], helpers: {} })
  const wk = (slots: Array<{ name: string; pid?: string }>): Week => ({
    range: '', book: '', start: '2026-09-07', current: false,
    mid: {
      date: '', end: '',
      sections: [{ label: 'X', farbe: 'petrol', items: [{ iid: 'i69', num: 1, title: 'P', meta: '', names: slots }] }],
      helpers: {},
    },
    we: emptyMid(),
  })
  const p = (id: string, fn: string): Person => ({
    id, fn, ln: '', role: 'verkuendiger', tel: '', mail: '', priv: priv(),
  })
  const partNames = (w: Week): PartItem['names'] => (w.mid.sections[0].items[0] as PartItem).names

  it('pidsNachtragen: eindeutige Namen bekommen pid, mehrdeutige nicht', () => {
    const persons = [p('pA', 'Anna'), p('pM1', 'Max'), p('pM2', 'Max')] // "Max" mehrdeutig
    const [w] = pidsNachtragen([wk([{ name: 'Anna' }, { name: 'Max' }])], persons)
    expect(partNames(w)[0].pid).toBe('pA') // eindeutig zugeordnet
    expect(partNames(w)[1].pid).toBeUndefined() // Dublette → keine Zuordnung
  })

  it('pidsNachtragen lässt gesetzte pid unberührt (idempotent, Referenz stabil)', () => {
    const weeks = [wk([{ name: 'Anna', pid: 'schon' }])]
    expect(pidsNachtragen(weeks, [p('pA', 'Anna')])).toBe(weeks)
  })

  /*
   * Die Zusätzliche Klasse und ihr Ratgeber gehörten hier lange nicht dazu —
   * dieselbe Lücke, die T38 an `mapPersonSlots` geschlossen hat, nur in der
   * Gegenrichtung. Sie fällt auf, sobald eine Person gelöscht und neu angelegt
   * wird: `dropPersonPid` nimmt die Id überall heraus, zurück bekam sie nur
   * der Hauptsaal. Der Platz der Klasse zählte danach in keiner Auslastung,
   * keiner Konfliktprüfung und keiner Aufgabenliste mehr.
   */
  it('pidsNachtragen bindet auch Klasse und Ratgeber', () => {
    const w = wk([{ name: 'Anna' }])
    const item = w.mid.sections[0]!.items[0] as PartItem
    item.aux = [{ name: 'Anna' }]
    w.mid.auxRatgeber = { name: 'Anna', rolle: 'Ratgeber', bereichsKey: 'ratgeber' }

    const [next] = pidsNachtragen([w], [p('pA', 'Anna')])
    const nextItem = next!.mid.sections[0]!.items[0] as PartItem
    expect(nextItem.names[0]!.pid).toBe('pA')
    expect(nextItem.aux?.[0]!.pid).toBe('pA')
    expect(next!.mid.auxRatgeber?.pid).toBe('pA')
  })

  it('pidsNachtragen erfindet keinen Ratgeber, wo keiner ist', () => {
    // Ohne Zusätzliche Klasse darf der Schlüssel nicht auftauchen: `hatAuxKlasse`
    // liest ihn als Marke „hier gibt es eine Klasse".
    const [next] = pidsNachtragen([wk([{ name: 'Anna' }])], [p('pA', 'Anna')])
    expect('auxRatgeber' in next!.mid).toBe(false)
  })

  it('renameInWeeks über pid: nur der Slot der richtigen Person; Namensgleiche bleiben', () => {
    const [w] = renameInWeeks([wk([{ name: 'Max', pid: 'pM1' }, { name: 'Max', pid: 'pM2' }])], 'pM1', 'Max', 'Max Eins')
    expect(partNames(w)[0].name).toBe('Max Eins') // pid pM1 → umbenannt
    expect(partNames(w)[1].name).toBe('Max') // pid pM2 → unberührt trotz gleichem Namen
  })
})

describe('Hilfsdienst-Id-Bindung (helpers)', () => {
  const emptyMid = (): Meeting => ({ date: '', end: '', sections: [], helpers: {} })
  const wkH = (mik: Array<{ name: string; pid?: string }>): Week => ({
    range: '', book: '', start: '2026-09-07', current: false,
    mid: { date: '', end: '', sections: [], helpers: { mik } },
    we: emptyMid(),
  })
  const p = (id: string, fn: string): Person => ({
    id, fn, ln: '', role: 'verkuendiger', tel: '', mail: '', priv: priv(),
  })

  it('pidsNachtragen trägt pid an Hilfsdiensten nach (Gruppe bleibt ohne)', () => {
    const [w] = pidsNachtragen([wkH([{ name: 'Anna' }, { name: 'Gruppe 1' }])], [p('pA', 'Anna')])
    expect(w.mid.helpers.mik[0]).toEqual({ name: 'Anna', pid: 'pA' })
    expect(w.mid.helpers.mik[1]).toEqual({ name: 'Gruppe 1' }) // Rotation → keine pid
  })

  it('renameInWeeks trifft den Hilfsdienst über die pid', () => {
    const [w] = renameInWeeks([wkH([{ name: 'Anna', pid: 'pA' }])], 'pA', 'Anna', 'Anna Neu')
    expect(w.mid.helpers.mik[0].name).toBe('Anna Neu')
  })
})

function emptyMeeting(): Meeting {
  return { date: '', end: '', sections: [], helpers: {} }
}
