import { describe, expect, it } from 'vitest'
import { itemNameCount, lacMove, lacMoveTarget, lacRemove } from './meeting-edit'
import { punktKey, itemZusagenKeys } from './planning'
import type { ConfirmationMap, Meeting, PartItem, Week } from './types'

/**
 * **Was Einfügen, Löschen und Verschieben mit den Bestätigungen machen — und
 * warum das heute fast nichts ist.**
 *
 * Hier standen drei Mechaniken: `swapPartConfirmations` beim Verschieben,
 * `shiftPartConfirmations` beim Einfügen und Löschen, `partSwapKeyPairs` als
 * Schlüsselrechnung dazu — dazu ihre Gegenstücke in der Datenbank
 * (`renameConfirmationKeys`, `swapConfirmationKeys`). Alle nur deshalb, weil im
 * Aufgaben-Schlüssel die **Position** des Punkts stand (T16).
 *
 * Seit der Punkt seine eigene Kennung trägt, verschiebt sich kein Schlüssel
 * mehr. Übrig bleibt eine einzige Regel: Was verschwindet, verfällt.
 */

const A = 'aaa111'
const B = 'bbb222'
const C = 'ccc333'

/** LAC-Sektion mit drei verschiebbaren Punkten (A/B/C) je einem Namens-Slot. */
function lacMeeting(): Meeting {
  const part = (iid: string, title: string, name: string): PartItem => ({
    iid,
    title,
    meta: '10 Min.',
    mins: 10,
    names: [{ name, bereichsKey: 'vortrag' }],
  })
  return {
    date: '',
    end: 'Ende ca. 20:45',
    sections: [
      {
        label: 'UNSER LEBEN ALS CHRIST',
        farbe: 'wein',
        items: [part(A, 'Punkt A', 'Alice'), part(B, 'Punkt B', 'Bob'), part(C, 'Punkt C', 'Carol')],
      },
    ],
    helpers: {},
  }
}

function week(): Week {
  const empty: Meeting = { date: '', end: '', sections: [], helpers: {} }
  return { range: '', book: '', start: '2026-09-07', mid: lacMeeting(), we: empty }
}

const key = (iid: string, ni = 0, aux = false) => punktKey('2026-09-07', 'mid', iid, ni, aux)

/** Die Punkte des LAC-Abschnitts, mit Wächter statt `!` (T42). */
function lacPunkte(w: Week | undefined): PartItem[] {
  const items = w?.mid.sections[0]?.items
  if (!items) throw new Error('Testaufbau: die Woche hat keinen LAC-Abschnitt')
  return items as PartItem[]
}

/** Ein Punkt daraus. */
function punkt(w: Week | undefined, ii: number): PartItem {
  const p = lacPunkte(w)[ii]
  if (!p) throw new Error(`Testaufbau: Punkt ${ii} fehlt`)
  return p
}

describe('lacMoveTarget / itemNameCount', () => {
  const items = lacPunkte(week())

  it('liefert den Tausch-Partnerindex bzw. null am Rand', () => {
    expect(lacMoveTarget(items, 0, 1)).toBe(1) // A nach unten ↔ B
    expect(lacMoveTarget(items, 1, -1)).toBe(0) // B nach oben ↔ A
    expect(lacMoveTarget(items, 0, -1)).toBeNull() // A ganz oben
    expect(lacMoveTarget(items, 2, 1)).toBeNull() // C ganz unten
  })

  it('zählt Namens-Slots (0 für Lieder)', () => {
    expect(itemNameCount(punkt(week(), 0))).toBe(1)
    expect(itemNameCount({ song: 'Lied 1' })).toBe(0)
  })
})

describe('Verschieben lässt die Bestätigungen in Ruhe', () => {
  it('der Punkt nimmt seinen Schlüssel mit — es gibt nichts zu tauschen', () => {
    // Alice (Punkt A, Position 0) hat bestätigt; A wird nach unten geschoben.
    const map: ConfirmationMap = { [key(A)]: 'bestätigt' }
    const moved = lacMove([week()], 0, 'mid', 0, 0, 1)

    const a = punkt(moved[0], 1)
    expect(a.title).toBe('Punkt A')
    expect(a.names?.[0]?.name).toBe('Alice')
    // Derselbe Schlüssel wie vorher, ohne dass jemand etwas umgeschrieben hat.
    expect(punktKey('2026-09-07', 'mid', a.iid, 0)).toBe(key(A))
    expect(map[key(A)]).toBe('bestätigt')
  })
})

describe('itemZusagenKeys — was mit einem gelöschten Punkt verfällt', () => {
  const alleDrei = (): ConfirmationMap => ({
    [key(A)]: 'bestätigt',
    [key(B)]: 'verhindert',
    [key(C)]: 'bestätigt',
  })

  it('findet genau die Schlüssel des einen Punkts', () => {
    expect(itemZusagenKeys(alleDrei(), '2026-09-07', 'mid', B)).toEqual([key(B)])
  })

  it('nimmt alle Plätze eines Punkts mit — beide Räume', () => {
    const map: ConfirmationMap = {
      [key(B, 0)]: 'bestätigt',
      [key(B, 1)]: 'bestätigt',
      [key(B, 0, true)]: 'bestätigt', // Zusätzliche Klasse
      [key(C, 0)]: 'bestätigt',
    }
    expect(itemZusagenKeys(map, '2026-09-07', 'mid', B).sort()).toEqual(
      [key(B, 0), key(B, 1), key(B, 0, true)].sort(),
    )
  })

  it('lässt andere Wochen und Zusammenkünfte unangetastet', () => {
    const map: ConfirmationMap = {
      [key(B)]: 'bestätigt',
      [punktKey('2026-09-14', 'mid', B, 0)]: 'bestätigt', // andere Woche
      [punktKey('2026-09-07', 'we', B, 0)]: 'bestätigt', // anderes Treffen
    }
    expect(itemZusagenKeys(map, '2026-09-07', 'mid', B)).toEqual([key(B)])
  })

  it('ohne Bestätigung zu diesem Punkt: leere Liste', () => {
    expect(itemZusagenKeys({}, '2026-09-07', 'mid', B)).toEqual([])
  })

  it('E2E: nach dem Löschen hängt keine Bestätigung am falschen Punkt', () => {
    // Punkt B wird entfernt. Seine Bestätigung verfällt; A und C behalten ihre,
    // obwohl C eine Position nach vorn rückt.
    const map = alleDrei()
    const weg = itemZusagenKeys(map, '2026-09-07', 'mid', B)
    for (const k of weg) delete map[k]

    const nachher = lacRemove([week()], 0, 'mid', 0, 1)[0]
    expect(lacPunkte(nachher).map((i) => i.title)).toEqual(['Punkt A', 'Punkt C'])
    expect(map[key(A)]).toBe('bestätigt')
    expect(map[key(B)]).toBeUndefined()
    expect(map[punktKey('2026-09-07', 'mid', punkt(nachher, 1).iid, 0)]).toBe('bestätigt') // C
  })
})
