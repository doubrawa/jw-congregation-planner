import { describe, expect, it } from 'vitest'
import type { WeitererPlan } from '../data/types'
import { dict } from '../i18n/ui'
import { planUnterzeile, spannenAnzahl, zeitraumText } from './weitere-plaene-anzeige'

/**
 * **Beschriftungen der Weiteren Pläne beim Planen** (T121, `GPlaeneListe`,
 * `GPlaenePlanen`): was die Liste unter dem Namen eines Plans sagt, und wie
 * die Vorschau ihre Wochen oder Monate zählt.
 */

const t = dict('de')
const HEUTE = '2026-10-12'
const plan = (over: Partial<WeitererPlan> = {}): WeitererPlan => ({
  id: 'p',
  name: 'Reinigung',
  von: '2026-09-07',
  bis: '2026-11-29',
  entwurf: false,
  ...over,
})

describe('Was die Liste unter dem Namen eines Plans sagt', () => {
  it('beim laufenden, bis wann er gilt — auch, wenn er heute beginnt', () => {
    expect(planUnterzeile(plan(), 'aktuell', HEUTE, 'de', t)).toBe('bis 29. November 2026')
    expect(planUnterzeile(plan({ von: HEUTE }), 'aktuell', HEUTE, 'de', t)).toBe('bis 29. November 2026')
  })

  it('beim kommenden, ab wann', () => {
    const winter = plan({ von: '2026-11-30', bis: '2027-02-28' })
    expect(planUnterzeile(winter, 'aktuell', HEUTE, 'de', t)).toBe('ab 30. November 2026')
  })

  it('beim abgeschlossenen, wann er endete — mit Jahr: Sie sammeln sich über die Jahre', () => {
    const garten = plan({ von: '2025-03-01', bis: '2025-10-25' })
    expect(planUnterzeile(garten, 'abgeschlossen', HEUTE, 'de', t)).toBe('endete am 25. Oktober 2025')
  })

  it('beim Entwurf seinen Zeitraum — wann er gelten soll', () => {
    const entwurf = plan({ von: '2027-03-01', bis: '2027-10-31', entwurf: true })
    expect(planUnterzeile(entwurf, 'entwurf', HEUTE, 'de', t)).toBe(zeitraumText(entwurf, 'de'))
  })

  it('in jeder Sprache mit ihrem eigenen Satz', () => {
    expect(planUnterzeile(plan(), 'aktuell', HEUTE, 'en', dict('en'))).toBe('until November 29, 2026')
  })
})

describe('Wie viele Wochen oder Monate die Vorschau nennt', () => {
  it('in Worten der Sprache, mit ihrer Mehrzahl — die kennt Intl', () => {
    expect(spannenAnzahl({}, 13, 'de')).toBe('13 Wochen')
    expect(spannenAnzahl({ takt: 'monat' }, 1, 'de')).toBe('1 Monat')
    expect(spannenAnzahl({ takt: 'monat' }, 8, 'en')).toBe('8 months')
    // Slawische Sprachen haben eine eigene Form für 2 bis 4.
    expect(spannenAnzahl({}, 2, 'pl')).toBe('2 tygodnie')
    expect(spannenAnzahl({}, 5, 'pl')).toBe('5 tygodni')
  })
})
