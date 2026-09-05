import { describe, expect, it } from 'vitest'
import { confirmationMap, generateInviteCode, renameInWeeks } from './data'
import type { Meeting, PartItem, Week } from '../data/types'

describe('confirmationMap: ein Platz, zwei Zeilen', () => {
  const K = '2026-09-07|mid|helper|mik|0'

  it('„bestätigt" gewinnt — in beiden Lesereihenfolgen', () => {
    /*
     * Der Befund am laufenden Stand: Nach dem Einspringen kam das Gesuch beim
     * Neuladen wieder. A hat abgesagt, B ist eingesprungen — beide Zeilen
     * stehen unter demselben Schlüssel, und die Abfrage kommt **ungeordnet**
     * zurück. Vorher gewann schlicht die letzte gelesene Zeile.
     */
    expect(confirmationMap([
      { task_key: K, status: 'verhindert' },
      { task_key: K, status: 'bestätigt' },
    ])[K]).toBe('bestätigt')
    expect(confirmationMap([
      { task_key: K, status: 'bestätigt' },
      { task_key: K, status: 'verhindert' },
    ])[K]).toBe('bestätigt')
  })

  it('eine einzelne Absage bleibt eine Absage', () => {
    expect(confirmationMap([{ task_key: K, status: 'verhindert' }])[K]).toBe('verhindert')
  })

  it('unbekannte Status fallen heraus (offen = keine Zeile)', () => {
    expect(confirmationMap([{ task_key: K, status: 'irgendwas' }])).toEqual({})
  })
})

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
    helpers: { ordner: [{ name }] },
  }
}

function week(midName: string, weName: string): Week {
  return { range: '1.–7.', book: 'Buch', start: '2026-09-07', current: false, mid: meeting(midName), we: meeting(weName) }
}

describe('renameInWeeks', () => {
  it('ersetzt den alten Anzeigenamen in Programmpunkten und Hilfsdiensten', () => {
    const weeks = [week('Simon Krüger', 'Simon Krüger')]
    const next = renameInWeeks(weeks, 'p1', 'Simon Krüger', 'S. Krüger')
    const item = next[0].mid.sections[0].items[1]
    expect('names' in item && item.names[0].name).toBe('S. Krüger')
    expect(next[0].mid.helpers.ordner[0].name).toBe('S. Krüger')
    expect(next[0].we.helpers.ordner[0].name).toBe('S. Krüger')
  })

  it('behält die Referenz unveränderter Wochen (Aufrufer erkennt Dirty-Wochen)', () => {
    const untouched = week('Anna Meier', 'Anna Meier')
    const touched = week('Simon Krüger', 'Anna Meier')
    const next = renameInWeeks([untouched, touched], 'p1', 'Simon Krüger', 'S. Krüger')
    expect(next[0]).toBe(untouched) // keine Namensänderung → identische Referenz
    expect(next[1]).not.toBe(touched) // enthält oldName → neue Referenz
    expect(next[1].we).toBe(touched.we) // Wochenende unberührt → alte Referenz
  })

  it('lässt den gleichnamigen Gastredner stehen', () => {
    /*
      Der Namensweg gilt für Plätze **ohne** `pid` — Altdaten und
      Hilfsdienste. Der auswärtige Redner hat ebenfalls keine, ist aber keine
      Person dieser Versammlung: Er steht als Freitext im Slot, oft in der
      Kurzform „M. Hartmann", und genau die ist auch die Schreibweise, in der
      Zuteilungen einmal gespeichert wurden.

      Berichtigte der Planer den Namen des gleichnamigen Bruders, wurde der
      Gast mit umbenannt — auf dem Programmblatt stand danach jemand anderes,
      als am Sonntag kommt. `gehoertZu` nimmt ihn seit T29 aus, ebenso
      `migrateAssignmentPids` und `mapMeetingNames`; hier fehlte es.
    */
    const eigen = { name: 'M. Hartmann', pid: 'p1' }
    const gast = { name: 'M. Hartmann', rolle: 'Gastredner', herkunft: 'Nordheim' }
    const w: Week = {
      range: '1.–7.',
      book: 'Buch',
      start: '2026-09-07',
      current: false,
      mid: {
        date: '',
        end: '',
        sections: [
          { label: 'SCHÄTZE', farbe: 'petrol', items: [{ title: 'Bibellesung', names: [eigen] }] },
        ],
        helpers: {},
      },
      we: {
        date: '',
        end: '',
        sections: [
          { label: 'VORTRAG', farbe: 'petrol', items: [{ title: 'Vortrag', names: [gast] }] },
        ],
        helpers: {},
      },
    }

    const next = renameInWeeks([w], 'p1', 'M. Hartmann', 'Martin Hartmann')
    const eigenNachher = (next[0].mid.sections[0].items[0] as PartItem).names[0]
    const gastNachher = (next[0].we.sections[0].items[0] as PartItem).names[0]

    // Gegenprobe: Der eigene Bruder heißt jetzt anders.
    expect(eigenNachher.name).toBe('Martin Hartmann')
    expect(gastNachher.name, 'der Auswärtige wurde mit umbenannt').toBe('M. Hartmann')
  })

  it('ist ein No-op bei leerem oder unverändertem Namen', () => {
    const weeks = [week('Simon Krüger', 'Simon Krüger')]
    expect(renameInWeeks(weeks, 'p1', '', 'X')).toBe(weeks)
    expect(renameInWeeks(weeks, 'p1', 'Simon Krüger', 'Simon Krüger')).toBe(weeks)
  })
})
