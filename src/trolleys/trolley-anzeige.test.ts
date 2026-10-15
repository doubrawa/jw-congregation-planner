import { describe, expect, it } from 'vitest'
// Seit Phase 10 (T121) gemeinsam für Trolleys, Gruppenbesuche und „Holen".
import { wochenSpanne } from '../components/datum-anzeige'
import { emptyQualifications } from '../data/helpers'
import type { Person } from '../data/types'
import { dict } from '../i18n/ui'
import {
  anteilVon,
  lageImPlan,
  nameVon,
  neueEingabe,
  PLAN_STUNDEN,
  trolleyNameVon,
  vornameVon,
  werImTermin,
  wochenTage,
  zeitAnStelle,
} from './trolley-anzeige'

/**
 * **Wie die Trolleys dastehen** — der Tagesplan von 6 bis 22 Uhr als Anteil
 * seiner Höhe (sie wächst mit der Schriftstufe), der Tipp darauf als halbe
 * Stunde, die Woche in Worten.
 */

describe('der Tagesplan', () => {
  it('6 Uhr oben, 22 Uhr unten, 14 Uhr in der Mitte', () => {
    expect(anteilVon('06:00')).toBe(0)
    expect(anteilVon('22:00')).toBe(1)
    expect(anteilVon('14:00')).toBe(0.5)
    expect(PLAN_STUNDEN).toHaveLength(17)
  })

  it('ein Termin von 9 bis 11 steht bei 3/16 und ist 2/16 hoch', () => {
    const { oben, hoehe } = lageImPlan({ von: '09:00', bis: '11:00' })
    expect(oben).toBeCloseTo(3 / 16)
    expect(hoehe).toBeCloseTo(2 / 16)
  })

  it('ein Tipp: abgerundet auf die halbe Stunde, frühestens 6:00, spätestens 21:30', () => {
    expect(zeitAnStelle(3 / 16 + 0.01)).toBe('09:00')
    expect(zeitAnStelle(3.5 / 16 + 0.001)).toBe('09:30')
    expect(zeitAnStelle(-0.2)).toBe('06:00')
    expect(zeitAnStelle(1)).toBe('21:30')
  })
})

describe('Woche und Namen', () => {
  it('sieben Tage ab Montag, auch über den Monatswechsel', () => {
    expect(wochenTage('2026-09-28')).toEqual([
      '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04',
    ])
  })

  it('die Woche in Worten — in der Sprache des Lesers', () => {
    expect(wochenSpanne('2026-09-07', 'de')).toBe('7.–13. September')
    expect(wochenSpanne('2026-09-07', 'en')).toMatch(/September 7\s*–\s*13/)
  })

  it('Namen über die Kennung — leer, wenn es niemanden mehr gibt', () => {
    const p: Person = { id: 'p1', fn: 'Jonas', ln: 'Berger', role: 'verkuendiger', female: false, tel: '', mail: '', priv: emptyQualifications() }
    expect(nameVon([p], 'p1')).toBe('Jonas Berger')
    expect(vornameVon([p], 'p1')).toBe('Jonas')
    expect(nameVon([p], null)).toBe('')
    expect(trolleyNameVon([{ id: 't', name: 'Trolley 3', ort: '', hinweis: '' }], 'weg')).toBe('')
  })

  it('wer im Termin steht, für Vorleseprogramme — zu zweit oder allein', () => {
    const t = dict('de')
    const p = (id: string, fn: string): Person => ({ id, fn, ln: 'Berger', role: 'verkuendiger', female: false, tel: '', mail: '', priv: emptyQualifications() })
    const leute = [p('p1', 'Jonas'), p('p2', 'Lena')]
    expect(werImTermin({ pid: 'p1', partner: 'p2' }, leute, t)).toBe('Jonas Berger und Lena Berger')
    expect(werImTermin({ pid: 'p1', partner: null }, leute, t)).toBe('Jonas Berger sucht einen Partner')
  })

  it('das Formular geht mit Partner auf, 10 bis 12 Uhr — oder mit dem Zeitraum unter dem Tipp', () => {
    expect(neueEingabe('tr1', '2026-09-12')).toEqual({ trolleyId: 'tr1', datum: '2026-09-12', von: '10:00', bis: '12:00', mitPartner: true, partner: null })
    expect(neueEingabe('tr1', '2026-09-12', { von: '15:00', bis: '17:00' })).toMatchObject({ von: '15:00', bis: '17:00' })
  })
})
