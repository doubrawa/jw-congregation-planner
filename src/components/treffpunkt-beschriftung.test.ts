import { describe, expect, it } from 'vitest'
import { treffpunktTitel } from './treffpunkt-beschriftung'
import { dict } from '../i18n/ui'

/*
 * Der Titel eines Treffpunkts. Eine entfernte Gruppe lässt ihre Treffpunkte in
 * den Wochen davor stehen (`fsGruppeEntfernen`, `wirktAb`) — dort stand bis
 * dahin ihre Kennung als Titel, eine UUID.
 */
describe('treffpunktTitel', () => {
  const i18n = { t: dict('de'), tu: (s: string) => s }

  it('die Versammlung, die Gruppe mit ihrem Namen', () => {
    expect(treffpunktTitel({ grp: null }, [], i18n)).toBe(i18n.t.fsVers)
    const gruppen = [{ id: 'g1', name: 'Gruppe Nord', overseerId: null, assistantId: null }]
    expect(treffpunktTitel({ grp: 'g1' }, gruppen, i18n)).toBe('Gruppe Nord')
  })

  it('eine Gruppe, die es nicht mehr gibt: ohne Namen — nicht ihre Kennung', () => {
    expect(treffpunktTitel({ grp: '00000000-0000-4000-8000-000000000011' }, [], i18n)).toBe(i18n.t.gruppeLbl)
  })
})
