import { describe, expect, it } from 'vitest'
import { itemNameCount, lacMove, lacMoveTarget, lacRemove } from './meeting-edit'
import { partSwapKeyPairs, partTaskKey, shiftPartConfirmations, swapPartConfirmations } from './planning'
import type { ConfirmationMap, Meeting, PartItem, Week } from './types'

/** LAC-Sektion mit drei verschiebbaren Punkten (A/B/C) je einem Namens-Slot. */
function lacMeeting(): Meeting {
  const part = (title: string, name: string): PartItem => ({
    title,
    meta: '10 Min.',
    names: [{ name, bereichsKey: 'vortrag' }],
  })
  return {
    date: '',
    end: 'Ende ca. 20:45',
    sections: [
      {
        label: 'UNSER LEBEN ALS CHRIST',
        farbe: 'wein',
        items: [part('Punkt A', 'Alice'), part('Punkt B', 'Bob'), part('Punkt C', 'Carol')],
      },
    ],
    helpers: {},
  }
}

function week(): Week {
  const empty: Meeting = { date: '', end: '', sections: [], helpers: {} }
  return { range: '', book: '', current: false, mid: lacMeeting(), we: empty }
}

describe('lacMoveTarget / itemNameCount', () => {
  const items = week().mid.sections[0].items

  it('liefert den Tausch-Partnerindex bzw. null am Rand', () => {
    expect(lacMoveTarget(items, 0, 1)).toBe(1) // A nach unten ↔ B
    expect(lacMoveTarget(items, 1, -1)).toBe(0) // B nach oben ↔ A
    expect(lacMoveTarget(items, 0, -1)).toBeNull() // A ganz oben
    expect(lacMoveTarget(items, 2, 1)).toBeNull() // C ganz unten
  })

  it('zählt Namens-Slots (0 für Lieder)', () => {
    expect(itemNameCount(items[0])).toBe(1)
    expect(itemNameCount({ song: 'Lied 1' })).toBe(0)
  })
})

describe('swapPartConfirmations (Bestätigungen folgen dem verschobenen Punkt)', () => {
  const keyA = partTaskKey(0, 'mid', 0, 0, 0)
  const keyB = partTaskKey(0, 'mid', 0, 1, 0)

  it('tauscht die Status der beiden Positionen', () => {
    const map: ConfirmationMap = { [keyA]: 'bestätigt' } // nur A bestätigt
    const next = swapPartConfirmations(map, 0, 'mid', 0, 0, 1, 1)
    expect(next[keyA]).toBeUndefined() // A ist jetzt frei (B war frei)
    expect(next[keyB]).toBe('bestätigt') // Bestätigung bei B (folgt Punkt A)
  })

  it('vertauscht zwei belegte Status', () => {
    const map: ConfirmationMap = { [keyA]: 'bestätigt', [keyB]: 'verhindert' }
    const next = swapPartConfirmations(map, 0, 'mid', 0, 0, 1, 1)
    expect(next[keyA]).toBe('verhindert')
    expect(next[keyB]).toBe('bestätigt')
  })

  it('ohne Statusänderung dieselbe Referenz (beide frei)', () => {
    const map: ConfirmationMap = {}
    expect(swapPartConfirmations(map, 0, 'mid', 0, 0, 1, 1)).toBe(map)
  })

  it('partSwapKeyPairs bildet je Namens-Slot ein Schlüsselpaar', () => {
    expect(partSwapKeyPairs(0, 'mid', 0, 0, 1, 2)).toEqual([
      [partTaskKey(0, 'mid', 0, 0, 0), partTaskKey(0, 'mid', 0, 1, 0)],
      [partTaskKey(0, 'mid', 0, 0, 1), partTaskKey(0, 'mid', 0, 1, 1)],
    ])
  })

  it('E2E: nach lacMove trägt der Punkt seine Bestätigung mit', () => {
    // Alice (Punkt A, Pos 0) hat bestätigt; A wird nach unten geschoben (↔ B).
    const weeks = [week()]
    const keyBefore = partTaskKey(0, 'mid', 0, 0, 0)
    const map: ConfirmationMap = { [keyBefore]: 'bestätigt' }

    const items = weeks[0].mid.sections[0].items
    const b = lacMoveTarget(items, 0, 1)! // = 1
    const moved = lacMove(weeks, 0, 'mid', 0, 0, 1)
    const swapped = swapPartConfirmations(map, 0, 'mid', 0, 0, b, 1)

    // Punkt A steht jetzt an Position 1 und trägt dort die Bestätigung.
    const itemAtPos1 = moved[0].mid.sections[0].items[1] as PartItem
    expect(itemAtPos1.title).toBe('Punkt A')
    expect(itemAtPos1.names[0].name).toBe('Alice')
    expect(swapped[partTaskKey(0, 'mid', 0, 1, 0)]).toBe('bestätigt')
    expect(swapped[partTaskKey(0, 'mid', 0, 0, 0)]).toBeUndefined()
  })
})

describe('shiftPartConfirmations — Löschen und Einfügen (T16)', () => {
  /** Alle drei Punkte bestätigt: A=Pos 0, B=Pos 1, C=Pos 2. */
  const dreiBestaetigt = (): ConfirmationMap => ({
    [partTaskKey(0, 'mid', 0, 0, 0)]: 'bestätigt',
    [partTaskKey(0, 'mid', 0, 1, 0)]: 'verhindert',
    [partTaskKey(0, 'mid', 0, 2, 0)]: 'bestätigt',
  })

  it('Löschen: der gelöschte Status fällt weg, die dahinter rücken nach', () => {
    // Vorher erbte der nachfolgende Punkt die fremde Bestätigung, und der
    // eigentliche galt wieder als offen — und wurde erneut erinnert.
    const { map, removed, renames } = shiftPartConfirmations(dreiBestaetigt(), 0, 'mid', 0, 0, -1)
    expect(removed).toEqual([partTaskKey(0, 'mid', 0, 0, 0)])
    expect(map[partTaskKey(0, 'mid', 0, 0, 0)]).toBe('verhindert') // war B
    expect(map[partTaskKey(0, 'mid', 0, 1, 0)]).toBe('bestätigt') // war C
    expect(map[partTaskKey(0, 'mid', 0, 2, 0)]).toBeUndefined()
    // Von vorn nach hinten umbenennen, sonst kollidiert es mit belegten Keys.
    expect(renames.map(([von]) => von)).toEqual([
      partTaskKey(0, 'mid', 0, 1, 0),
      partTaskKey(0, 'mid', 0, 2, 0),
    ])
  })

  it('Einfügen: ab der Stelle rutscht alles eine Position weiter', () => {
    const { map, removed, renames } = shiftPartConfirmations(dreiBestaetigt(), 0, 'mid', 0, 1, 1)
    expect(removed).toEqual([])
    expect(map[partTaskKey(0, 'mid', 0, 0, 0)]).toBe('bestätigt') // A bleibt
    expect(map[partTaskKey(0, 'mid', 0, 1, 0)]).toBeUndefined() // neuer Punkt: offen
    expect(map[partTaskKey(0, 'mid', 0, 2, 0)]).toBe('verhindert') // war B
    expect(map[partTaskKey(0, 'mid', 0, 3, 0)]).toBe('bestätigt') // war C
    // Von hinten nach vorn, sonst überschreibt 1→2 den Status von C.
    expect(renames.map(([von]) => von)).toEqual([
      partTaskKey(0, 'mid', 0, 2, 0),
      partTaskKey(0, 'mid', 0, 1, 0),
    ])
  })

  it('lässt andere Wochen, Zusammenkünfte und Sektionen unangetastet', () => {
    const map: ConfirmationMap = {
      [partTaskKey(1, 'mid', 0, 2, 0)]: 'bestätigt', // andere Woche
      [partTaskKey(0, 'we', 0, 2, 0)]: 'bestätigt', // andere Zusammenkunft
      [partTaskKey(0, 'mid', 1, 2, 0)]: 'bestätigt', // andere Sektion
      '0|mid|helper|mik|2': 'bestätigt', // Hilfsdienst
    }
    expect(shiftPartConfirmations(map, 0, 'mid', 0, 0, -1).map).toEqual(map)
  })

  it('nimmt die Plätze der Zusätzlichen Klasse mit', () => {
    const auxKey = (ii: number) => partTaskKey(0, 'mid', 0, ii, 0, true)
    const map: ConfirmationMap = { [auxKey(2)]: 'bestätigt' }
    expect(shiftPartConfirmations(map, 0, 'mid', 0, 0, -1).map[auxKey(1)]).toBe('bestätigt')
  })

  it('E2E: nach lacRemove hängt keine Bestätigung am falschen Punkt', () => {
    const weeks = [week()]
    const map = dreiBestaetigt()
    const gekuerzt = lacRemove(weeks, 0, 'mid', 0, 0)
    const { map: neu } = shiftPartConfirmations(map, 0, 'mid', 0, 0, -1)

    const items = gekuerzt[0].mid.sections[0].items
    expect((items[0] as PartItem).title).toBe('Punkt B')
    expect(neu[partTaskKey(0, 'mid', 0, 0, 0)]).toBe('verhindert') // Bobs Status
    expect((items[1] as PartItem).title).toBe('Punkt C')
    expect(neu[partTaskKey(0, 'mid', 0, 1, 0)]).toBe('bestätigt') // Carols Status
  })
})
