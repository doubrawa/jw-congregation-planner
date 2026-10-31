import { describe, expect, it, vi } from 'vitest'
import type { Group, Person, Service, Week } from '../data/types'
import { STANDARD_ZEITEN } from '../data/vorgaben'

vi.mock('./supabase', () => ({ supabase: null }))

const data = await import('./data')

/**
 * **Ohne Datenbank geht nichts hinaus, und nichts bricht** (31.10.2026).
 *
 * Die Entwicklerseite `/demo.html` hat keinen Client (`lib/supabase.ts`), und
 * jede ihrer Aktionen läuft durch dieselben Schreiber wie im Betrieb. Jeder
 * fragt deshalb zuerst, ob es einen Client gibt — und bis hierher prüfte das
 * kein Test: Die übrigen Proben laufen alle mit einer Attrappe, also nie durch
 * den Zweig ohne. Hier steht für jeden Weg, was er dann zurückgibt.
 *
 * Die Liste ist vollständig: Kommt ein neuer Schreiber dazu, wird der erste
 * Fall rot, bis er hier mit seiner Antwort steht.
 */

const person = { id: 'p1', fn: 'A', ln: 'B', role: 'verkuendiger', mail: '', priv: {}, grp: null } as unknown as Person
const group: Group = { id: 'g1', name: 'G', overseerId: null, assistantId: null }
const service: Service = { key: 'mik', name: 'Mikrofone', count: 2, groups: false }
const woche = { start: '2026-09-07' } as Week
const abo = { endpoint: 'e1', p256dh: 'p', auth: 'a' }

/** Je Weg: der Aufruf und was er ohne Datenbank liefert. */
const OHNE_DATENBANK: Record<string, [() => unknown, unknown]> = {
  loadNotifications: [() => data.loadNotifications('c1', [], STANDARD_ZEITEN), null],
  loadCongregationData: [() => data.loadCongregationData('u1'), { ok: false, reason: 'error', message: 'kein Client' }],
  saveWeek: [() => data.saveWeek('c1', woche), false],
  saveFsWeek: [() => data.saveFsWeek('c1', '2026-09-07', []), false],
  wocheGeschrieben: [() => data.wocheGeschrieben('2026-09-07'), undefined],
  savePerson: [() => data.savePerson('c1', person), undefined],
  saveFsRules: [() => data.saveFsRules('c1', [], ['r1']), undefined],
  saveGruppenbesuche: [() => data.saveGruppenbesuche('c1', [], ['b1']), undefined],
  saveVortraege: [() => data.saveVortraege('c1', [], ['v1']), undefined],
  saveAnwesenheit: [() => data.saveAnwesenheit('c1', { woche: '2026-09-07', tab: 'mid', saal: 1, video: 2, pid: null }, ['saal']), undefined],
  saveTrolleys: [() => data.saveTrolleys('c1', []), undefined],
  savePlaene: [() => data.savePlaene('c1', [], ['pl1']), undefined],
  savePlanEintraege: [() => data.savePlanEintraege('c1', [], ['e1']), undefined],
  deletePersonRow: [() => data.deletePersonRow('p1'), undefined],
  saveService: [() => data.saveService('c1', service, 0), undefined],
  deleteServiceRow: [() => data.deleteServiceRow('c1', 'mik'), undefined],
  saveGroupRow: [() => data.saveGroupRow('c1', group, 0), undefined],
  deleteGroupRow: [() => data.deleteGroupRow('g1'), undefined],
  savePersonGroup: [() => data.savePersonGroup(person), undefined],
  saveFamily: [() => data.saveFamily('c1', 'h1', [person]), undefined],
  deleteHouseholdRow: [() => data.deleteHouseholdRow('h1'), undefined],
  savePushSubscription: [() => data.savePushSubscription('c1', 'u1', abo, 'de'), undefined],
  savePushLanguage: [() => data.savePushLanguage('e1', 'de'), undefined],
  deletePushSubscription: [() => data.deletePushSubscription('e1'), undefined],
  pushAboEigen: [() => data.pushAboEigen('e1'), null],
  pushAboEintragen: [() => data.pushAboEintragen('c1', 'u1', abo, 'de'), 'fehler'],
  saveAbsence: [() => data.saveAbsence('c1', { id: 'a1', personId: 'p1', userId: null, from: '2026-09-07', to: '2026-09-08', reason: '' }), undefined],
  deleteAbsenceRow: [() => data.deleteAbsenceRow('a1'), undefined],
  notifyPlanners: [() => data.notifyPlanners('verhindert', 'T', 'B'), undefined],
  persoenlichBescheid: [() => data.persoenlichBescheid('k1', 'Name', true), undefined],
  substituteSeek: [() => data.substituteSeek('k1'), undefined],
  substituteTake: [() => data.substituteTake('k1'), undefined],
  platzFuellen: [() => data.platzFuellen('k1'), undefined],
  substituteWithdraw: [() => data.substituteWithdraw('k1'), undefined],
  sendPlan: [() => data.sendPlan('2026-09-07', '2026-09-08'), null],
  erinnerungSenden: [() => data.erinnerungSenden('2026-09-07', '2026-09-08'), null],
  sendPlanEntzug: [() => data.sendPlanEntzug([{ taskKey: 'k1' } as never]), undefined],
  markNotificationRead: [() => data.markNotificationRead('c1', 'u1', 'n1'), undefined],
  markNotificationsRead: [() => data.markNotificationsRead('c1', 'u1'), undefined],
  deleteNotifications: [() => data.deleteNotifications('c1', 'u1'), undefined],
  saveCongregationInfo: [() => data.saveCongregationInfo('c1', { name: 'X' }), undefined],
  saveSettings: [() => data.saveSettings('c1', {} as never), undefined],
  saveConfirmation: [() => data.saveConfirmation('c1', 'u1', 'k1', 'bestätigt'), undefined],
  deleteConfirmationRows: [() => data.deleteConfirmationRows('c1', ['k1']), undefined],
  saveMemberRow: [() => data.saveMemberRow({ userId: 'u1' } as never), undefined],
  deleteMemberRow: [() => data.deleteMemberRow('u1'), undefined],
  deleteAnmeldeLink: [() => data.deleteAnmeldeLink('p1'), undefined],
}

/** Was nichts mit der Datenbank zu tun hat: Umformer, Melder, Zähler. */
const OHNE_DATENBANKWEG = new Set([
  'trolleyTerminFromRow',
  'confirmationMap',
  'anmeldeLinkAusZeile',
  'setSchreibfehlerMelder',
  'setKonfliktMelder',
  'ladungJetzt',
  'tauschStaendeUebernehmen',
])

describe('Ohne Datenbank', () => {
  it('jeder Weg zur Datenbank steht in der Liste', () => {
    const wege = Object.entries(data)
      .filter(([, wert]) => typeof wert === 'function')
      .map(([name]) => name)
      .filter((name) => !OHNE_DATENBANKWEG.has(name))
    expect(wege.filter((name) => !(name in OHNE_DATENBANK))).toEqual([])
    expect(Object.keys(OHNE_DATENBANK).filter((name) => !wege.includes(name))).toEqual([])
  })

  it.each(Object.entries(OHNE_DATENBANK))('%s geht nicht hinaus und bricht nicht', async (_name, [aufruf, erwartet]) => {
    const fehler = vi.spyOn(console, 'error').mockImplementation(() => {})
    const melder = vi.fn()
    data.setSchreibfehlerMelder(melder)
    try {
      expect(await aufruf()).toEqual(erwartet)
      // Kein Schreibfehler gemeldet: Ohne Client ist nichts gescheitert, es wurde nur nichts versucht.
      expect(melder).not.toHaveBeenCalled()
      expect(fehler).not.toHaveBeenCalled()
    } finally {
      data.setSchreibfehlerMelder(null)
      fehler.mockRestore()
    }
  })
})
