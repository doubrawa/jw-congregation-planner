import { describe, expect, it } from 'vitest'
import { generateInviteCode, renameInWeeks } from './data'
import type { Meeting, Week } from '../data/types'

describe('Einladungscodes', () => {
  it('erzeugt 8 Zeichen aus dem eindeutigen Alphabet (ohne 0/O/1/I)', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateInviteCode()).toMatch(/^[A-HJ-NP-Z2-9]{8}$/)
    }
  })
})

/** Minimale Zusammenkunft mit einem Programmpunkt-Slot + einem Hilfsdienst. */
function meeting(name: string): Meeting {
  return {
    date: 'Di · 19:00',
    end: 'Ende ca. 20:45',
    sections: [
      {
        label: 'SCHÄTZE',
        farbe: 'petrol',
        items: [{ song: 'Lied 1' }, { title: 'Bibellesung', names: [{ name }] }],
      },
    ],
    helpers: { ordner: [name] },
  }
}

function week(midName: string, weName: string): Week {
  return { range: '1.–7.', book: 'Buch', current: false, mid: meeting(midName), we: meeting(weName) }
}

describe('renameInWeeks', () => {
  it('ersetzt den alten Anzeigenamen in Programmpunkten und Hilfsdiensten', () => {
    const weeks = [week('Simon Krüger', 'Simon Krüger')]
    const next = renameInWeeks(weeks, 'Simon Krüger', 'S. Krüger')
    const item = next[0].mid.sections[0].items[1]
    expect('names' in item && item.names[0].name).toBe('S. Krüger')
    expect(next[0].mid.helpers.ordner[0]).toBe('S. Krüger')
    expect(next[0].we.helpers.ordner[0]).toBe('S. Krüger')
  })

  it('behält die Referenz unveränderter Wochen (Aufrufer erkennt Dirty-Wochen)', () => {
    const untouched = week('Anna Meier', 'Anna Meier')
    const touched = week('Simon Krüger', 'Anna Meier')
    const next = renameInWeeks([untouched, touched], 'Simon Krüger', 'S. Krüger')
    expect(next[0]).toBe(untouched) // keine Namensänderung → identische Referenz
    expect(next[1]).not.toBe(touched) // enthält oldName → neue Referenz
    expect(next[1].we).toBe(touched.we) // Wochenende unberührt → alte Referenz
  })

  it('ist ein No-op bei leerem oder unverändertem Namen', () => {
    const weeks = [week('Simon Krüger', 'Simon Krüger')]
    expect(renameInWeeks(weeks, '', 'X')).toBe(weeks)
    expect(renameInWeeks(weeks, 'Simon Krüger', 'Simon Krüger')).toBe(weeks)
  })
})
