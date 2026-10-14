import { describe, expect, it } from 'vitest'
import { emptyQualifications } from '../data/helpers'
import type { Member, Person } from '../data/types'
import { dict } from '../i18n/ui'
import { erinnerungKurz, werPlant, zusammenkunftText } from './einstellungen-anzeige'

/**
 * **Was die Einstellungen in ihren Zeilen sagen** — am Handy rechts in der
 * Zeile, am Desktop unter dem Abschnitt. Hier, was dabei Fachlogik trägt: die
 * Mehrzahl der Tage, die Rechte hinter „Wer plant".
 */

const t = dict('de')

const person = (id: string, fn: string, ln: string, over: Partial<Person> = {}): Person => ({
  id, fn, ln, role: 'verkuendiger', female: false, tel: '', mail: '', priv: emptyQualifications(), grp: null, ...over,
})
const konto = (personId: string, over: Partial<Member> = {}): Member => ({
  userId: `u-${personId}`, email: '', personId, planner: false, zuteiler: false, ...over,
})

describe('Die Zusammenkunft in einer Zeile', () => {
  it('nennt Wochentag und Uhrzeit — den Tag in der Sprache des Lesers', () => {
    expect(zusammenkunftText({ wd: 2, time: '19:00' }, 'de')).toBe('Dienstag 19:00')
    expect(zusammenkunftText({ wd: 0, time: '10:00' }, 'en')).toBe('Sunday 10:00')
  })
})

describe('Der Rhythmus der Erinnerungen in einer Zeile', () => {
  it('nennt erste und letzte Erinnerung in Worten', () => {
    expect(erinnerungKurz({ first: 7, last: 0, repeat: true }, t, 'de')).toBe('Erste 7 Tage vorher, letzte am Tag')
  })

  it('die Mehrzahl kommt aus Intl — „1 Tag", nicht „1 Tage"', () => {
    expect(erinnerungKurz({ first: 3, last: 1, repeat: false }, t, 'de')).toBe('Erste 3 Tage vorher, letzte 1 Tag vorher')
  })

  it('und in jeder Sprache ihre eigene: Russisch kennt drei Formen', () => {
    const ru = dict('ru')
    const text = (n: number) => erinnerungKurz({ first: n, last: 0, repeat: false }, ru, 'ru')
    expect(text(1)).toContain('1 день')
    expect(text(3)).toContain('3 дня')
    expect(text(7)).toContain('7 дней')
  })
})

describe('Wer plant', () => {
  const ANNA = person('p-a', 'Anna', 'Aal')
  const BERND = person('p-b', 'Bernd', 'Berg')
  const CARL = person('p-c', 'Carl', 'Cohn')

  it('wer planen darf und wer Admin ist — beide, nach dem Namen geordnet', () => {
    const konten = [konto('p-c', { planner: true }), konto('p-a', { zuteiler: true })]
    expect(werPlant([CARL, BERND, ANNA], konten, 'de').map((p) => p.id)).toEqual(['p-a', 'p-c'])
  })

  it('ohne Konto zählt die Vormerkung — sie gilt, sobald die Person sich anmeldet', () => {
    const vorgemerkt = { ...BERND, zuteilerVorgemerkt: true }
    expect(werPlant([ANNA, vorgemerkt], [], 'de').map((p) => p.id)).toEqual(['p-b'])
  })

  it('mit Konto entscheidet das Konto, nicht eine alte Vormerkung', () => {
    const vorgemerkt = { ...BERND, plannerVorgemerkt: true }
    expect(werPlant([vorgemerkt], [konto('p-b')], 'de')).toEqual([])
  })
})
