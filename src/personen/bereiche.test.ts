import { describe, expect, it } from 'vitest'
import { QUALIFICATION_ORDER, WT_ROLE_ORDER } from '../data/constants'
import { emptyQualifications, serviceQualKey } from '../data/helpers'
import type { Person, Service } from '../data/types'
import { dict } from '../i18n/ui'
import { bereicheDerPerson, bereichsGruppen } from './bereiche'

/**
 * **Die Aufgabenbereiche einer Person, nach Gruppen** (T73; T121 als Chips und
 * im Blatt „Ändern").
 *
 * Aufgaben und Hilfsdienste standen bis T73 in **einem** Bereich, in der
 * Reihenfolge des Programms bzw. der Einstellungen. Beides sind verschiedene
 * Dinge, und in einer Liste aus einem Dutzend Schaltern sucht man nach dem
 * Wort. Seit T121 stehen die Bereiche des Predigtdienstes und die festen Rollen
 * je für sich daneben — wie im Entwurf `GPerson`.
 */

const t = dict('de')
const tu = (s: string) => s

const dienst = (key: string, name: string, groups = false): Service => ({ key, name, count: 1, groups })
const DIENSTE = [
  dienst('ton', 'Tonanlage'),
  dienst('eingang', 'Ordner'),
  dienst('mik', 'Mikrofone'),
  dienst('rein', 'Reinigung', true), // Gruppen-Dienst: gehört keiner Person
]

const gruppen = (services: Service[] = DIENSTE) => bereichsGruppen(t, tu, services, 'de-DE')
const gruppe = (art: string, services?: Service[]) => gruppen(services).find((g) => g.art === art)!
const labels = (art: string, services?: Service[]) => gruppe(art, services).bereiche.map((b) => b.label)

describe('Die Gruppen', () => {
  it('stehen in der Folge des Entwurfs, je mit ihrem Titel', () => {
    expect(gruppen().map((g) => g.titel)).toEqual([t.navZusammenkuenfte, t.hilfsdienste, t.tabFs, t.wtRollenLabel])
  })

  it('die Hilfsdienste stehen für sich, nicht bei den Zusammenkünften', () => {
    expect(labels('hilfsdienste')).toContain('Tonanlage')
    expect(labels('zusammenkuenfte')).not.toContain('Tonanlage')
    expect(labels('zusammenkuenfte').some((l) => l.startsWith('Vorsitz'))).toBe(true)
  })

  it('Treffpunkte und Zeugnisgeben gehören zum Predigtdienst', () => {
    expect(gruppe('predigtdienst').bereiche.map((b) => b.key).sort()).toEqual(['treffpunkt', 'zeugnis'])
    expect(gruppe('zusammenkuenfte').bereiche.map((b) => b.key)).not.toContain('treffpunkt')
  })

  it('jede Gruppe steht alphabetisch — die festen Rollen in ihrer Folge: erst der Leiter', () => {
    const sortiert = (liste: string[]) => [...liste].sort((a, b) => a.localeCompare(b, 'de', { numeric: true }))
    expect(labels('hilfsdienste')).toEqual(['Mikrofone', 'Ordner', 'Tonanlage'])
    expect(labels('zusammenkuenfte')).toEqual(sortiert(labels('zusammenkuenfte')))
    expect(gruppe('festeRollen').bereiche.map((b) => b.key)).toEqual([...WT_ROLE_ORDER])
  })

  it('Gruppen-Dienste bleiben draußen — sie rotieren Gruppen statt Personen', () => {
    expect(labels('hilfsdienste')).not.toContain('Reinigung')
  })

  /*
   * **Vollständigkeit.** Fehlte ein Bereich, ließe er sich nirgends setzen —
   * und der zugehörige Platz bliebe für immer offen, ohne dass es auffiele.
   */
  it('jeder feste Bereich, jede feste Rolle und jeder Dienst steht in genau einer Gruppe', () => {
    const alle = gruppen().flatMap((g) => g.bereiche.map((b) => b.key))
    const erwartet = [
      ...QUALIFICATION_ORDER,
      ...WT_ROLE_ORDER,
      ...DIENSTE.filter((s) => !s.groups).map((s) => serviceQualKey(s.key)),
    ]
    expect([...alle].sort()).toEqual([...erwartet].sort())
  })
})

describe('Was die Person hat', () => {
  const person = (...keys: string[]): Person => ({
    id: 'p1', fn: 'Simon', ln: 'Krüger', role: 'verkuendiger', 
    priv: { ...emptyQualifications(), ...Object.fromEntries(keys.map((k) => [k, true])) },
  })

  it('nur die gesetzten Bereiche — und nur Gruppen, in denen dann noch etwas steht', () => {
    const eigene = bereicheDerPerson(gruppen(), person('gebet', serviceQualKey('mik')))
    expect(eigene.map((g) => [g.art, g.bereiche.map((b) => b.key)])).toEqual([
      ['zusammenkuenfte', ['gebet']],
      ['hilfsdienste', [serviceQualKey('mik')]],
    ])
  })

  it('ohne gesetzten Bereich bleibt nichts', () => {
    expect(bereicheDerPerson(gruppen(), person())).toEqual([])
  })
})
