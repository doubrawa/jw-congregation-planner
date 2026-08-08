import { describe, expect, it } from 'vitest'
import { emptyQualifications, gehoertZu, partWorkload } from './helpers'
import { fsDropPersonPid } from './fs'
import { assignSlot } from './planning'
import { dropPersonPid, renameInWeeks } from '../lib/data'
import type { FsInstance, Meeting, PartItem, PartSlotSelection, Person, Week } from './types'

/**
 * T38 — die Person-Id ist der Fremdschlüssel, der Name nur noch Anzeige.
 *
 * Der Umbau selbst kam mit T57: seither trägt jede Zuteilung einer echten
 * Person ihre `pid`, und `gehoertZu` entscheidet daran. Hier geht es um die
 * beiden Stellen, an denen der Fremdschlüssel trotzdem seine Zusage brach:
 *
 *  1. **Umbenennen** zog den Anzeigenamen nicht durch die Zusätzliche Klasse
 *     und nicht über den Ratgeber. Beide tragen `pid`, funktional stimmte also
 *     alles — auf dem Programmblatt stand aber ein Name, den es nicht mehr gibt.
 *  2. **Löschen** ließ die `pid` stehen. Ein Fremdschlüssel ohne Ziel: der Slot
 *     zählte nirgends mehr, und eine neu angelegte Person desselben Namens
 *     bekam eine neue Id und passte nie wieder dazu.
 */

const person = (id: string, dn: string): Person => ({
  id, fn: dn.split(' ')[0] ?? '', ln: dn.split(' ')[1] ?? '', dn,
  role: 'verkuendiger', tel: '', mail: '', priv: emptyQualifications(),
})

const ANNA = person('p-anna', 'Anna Beispiel')

/**
 * Woche mit der Person an **allen vier** Orten, an denen eine Zuteilung sitzen
 * kann: Hauptsaal, Zusätzliche Klasse, Ratgeber der Klasse, Hilfsdienst.
 */
function makeWeek(): Week {
  const meeting = (): Meeting => ({
    date: '7.–13. September',
    end: '',
    sections: [
      {
        label: 'UNS IM DIENST VERBESSERN',
        farbe: 'gold',
        items: [
          {
            title: 'Gespräche beginnen',
            names: [{ name: 'Anna Beispiel', pid: ANNA.id, bereichsKey: 'schulung' }],
            aux: [{ name: 'Anna Beispiel', pid: ANNA.id, bereichsKey: 'schulung' }],
          },
        ],
      },
    ],
    helpers: { mik: [{ name: 'Anna Beispiel', pid: ANNA.id }] },
    auxRatgeber: { name: 'Anna Beispiel', pid: ANNA.id, rolle: 'Ratgeber' },
  })
  return { range: '7.–13. September', book: '', current: false, mid: meeting(), we: meeting() }
}

/** Jeder Ort, an dem ein Name steht — als flache Liste zum Vergleichen. */
function alleSlots(w: Week): Array<{ name: string; pid?: string }> {
  const out: Array<{ name: string; pid?: string }> = []
  for (const tab of ['mid', 'we'] as const) {
    const m = w[tab]
    for (const s of m.sections) {
      for (const it of s.items) {
        if ('song' in it) continue
        out.push(...(it as PartItem).names, ...((it as PartItem).aux ?? []))
      }
    }
    if (m.auxRatgeber) out.push(m.auxRatgeber)
    for (const arr of Object.values(m.helpers)) out.push(...arr)
  }
  return out
}

describe('Umbenennen erreicht jeden Ort', () => {
  it('Hauptsaal, Zusätzliche Klasse, Ratgeber und Hilfsdienst', () => {
    // Vorher blieben Klasse und Ratgeber auf dem alten Namen stehen: sie tragen
    // `pid`, also stimmte alles außer dem, was der Planer liest.
    const next = renameInWeeks([makeWeek()], ANNA.id, 'Anna Beispiel', 'A. Beispiel-Neu')
    const namen = alleSlots(next[0]).map((s) => s.name)
    expect(namen).toHaveLength(8) // 2 Zusammenkünfte × (Hauptsaal, Klasse, Ratgeber, Mikrofon)
    expect(new Set(namen)).toEqual(new Set(['A. Beispiel-Neu']))
  })

  it('lässt die pid unangetastet — sie ist die Identität, nicht der Name', () => {
    const next = renameInWeeks([makeWeek()], ANNA.id, 'Anna Beispiel', 'A. Beispiel-Neu')
    expect(alleSlots(next[0]).every((s) => s.pid === ANNA.id)).toBe(true)
  })

  it('rührt fremde Zuteilungen nicht an', () => {
    const w = makeWeek()
    w.mid.helpers.mik = [{ name: 'Bernd Anders', pid: 'p-bernd' }]
    const next = renameInWeeks([w], ANNA.id, 'Anna Beispiel', 'A. Beispiel-Neu')
    expect(next[0].mid.helpers.mik[0]).toEqual({ name: 'Bernd Anders', pid: 'p-bernd' })
  })

  it('unveränderte Wochen behalten ihre Referenz', () => {
    // Daran erkennt der Aufrufer, welche Wochen er speichern muss.
    const weeks = [makeWeek()]
    expect(renameInWeeks(weeks, 'p-fremd', 'Wer Anders', 'Neu')).toBe(weeks)
  })
})

describe('Löschen löst den Fremdschlüssel', () => {
  it('nimmt die pid überall weg, lässt den Namen stehen', () => {
    const next = dropPersonPid([makeWeek()], ANNA.id)
    const slots = alleSlots(next[0])
    expect(slots).toHaveLength(8)
    expect(slots.every((s) => s.pid === undefined)).toBe(true)
    expect(slots.every((s) => s.name === 'Anna Beispiel')).toBe(true)
  })

  it('danach greift wieder der Namensweg', () => {
    // Genau darum geht es: ohne Id ist die Zuteilung ein Altdatensatz und wird
    // beim nächsten Laden erneut zugeordnet, sobald es wieder jemanden dieses
    // Namens gibt. Mit toter Id passte sie nie wieder.
    const neuAngelegt = person('p-anna-neu', 'Anna Beispiel')
    const mitToterId = [makeWeek()]
    expect(partWorkload(mitToterId, neuAngelegt)).toBe(0)
    const geloest = dropPersonPid(mitToterId, ANNA.id)
    expect(partWorkload(geloest, neuAngelegt)).toBeGreaterThan(0)
  })

  it('trifft nur diese eine Person', () => {
    const w = makeWeek()
    w.mid.helpers.mik = [{ name: 'Bernd Anders', pid: 'p-bernd' }]
    const next = dropPersonPid([w], ANNA.id)
    expect(next[0].mid.helpers.mik[0]).toEqual({ name: 'Bernd Anders', pid: 'p-bernd' })
  })

  it('geht NICHT über den Namen — Gleichnamige bleiben verschont', () => {
    // Beim Lösen einer Id ist nur sie gemeint. Über den Namen zu gehen, träfe
    // eine zweite Person desselben Anzeigenamens mit.
    const w = makeWeek()
    w.we.helpers.mik = [{ name: 'Anna Beispiel', pid: 'p-zwilling' }]
    const next = dropPersonPid([w], ANNA.id)
    expect(next[0].we.helpers.mik[0]).toEqual({ name: 'Anna Beispiel', pid: 'p-zwilling' })
  })

  it('unveränderte Wochen behalten ihre Referenz', () => {
    const weeks = [makeWeek()]
    expect(dropPersonPid(weeks, 'p-fremd')).toBe(weeks)
  })
})

describe('Treffpunkte: dieselbe Regel', () => {
  const inst = (id: string, leader: string, lpid?: string): FsInstance => ({
    id, ruleId: null, grp: '', wd: 6, time: '09:30', place: 'Saal', leader, lpid,
  })

  it('löst die lpid, lässt den Namen stehen', () => {
    const vorher = [[inst('a', 'Anna Beispiel', ANNA.id), inst('b', 'Bernd Anders', 'p-bernd')]]
    const next = fsDropPersonPid(vorher, ANNA.id)
    expect(next[0][0]).toEqual({ ...inst('a', 'Anna Beispiel'), lpid: undefined })
    expect('lpid' in next[0][0]).toBe(false)
    expect(next[0][1].lpid).toBe('p-bernd')
  })

  it('unveränderte Wochen behalten ihre Referenz', () => {
    const vorher = [[inst('a', 'Anna Beispiel', ANNA.id)]]
    expect(fsDropPersonPid(vorher, 'p-fremd')).toBe(vorher)
  })
})

describe('Die Zusage des Fremdschlüssels', () => {
  const SLOT: PartSlotSelection = {
    kind: 'part', wi: 0, tab: 'mid', si: 0, ii: 0, ni: 0,
    label: '', priv: 'schulung', groups: false,
  }

  it('assignSlot schreibt pid — und löscht sie beim Leeren', () => {
    const belegt = assignSlot([makeWeek()], SLOT, 'Neue Person', undefined, 'p-neu')
    const slot = (belegt[0].mid.sections[0].items[0] as PartItem).names[0]
    expect(slot.pid).toBe('p-neu')

    const geleert = assignSlot(belegt, SLOT, '')
    expect((geleert[0].mid.sections[0].items[0] as PartItem).names[0].pid).toBeUndefined()
  })

  it('die Id schlägt den Namen — nie umgekehrt', () => {
    // Trägt die Zuteilung eine Id, wird NICHT auf den Namen zurückgefallen.
    // Sonst zählte eine Zuteilung, die ausdrücklich Person A meint, auch für
    // die gleichnamige Person B mit.
    const zwilling = person('p-zwilling', 'Anna Beispiel')
    expect(gehoertZu({ name: 'Anna Beispiel', pid: ANNA.id }, ANNA)).toBe(true)
    expect(gehoertZu({ name: 'Anna Beispiel', pid: ANNA.id }, zwilling)).toBe(false)
    // Ohne Id bleibt der Name der einzige Anhalt (Altdaten, Hilfsdienste).
    expect(gehoertZu({ name: 'Anna Beispiel' }, zwilling)).toBe(true)
  })
})
