import { describe, expect, it, vi } from 'vitest'
import type { Group, Person, Service, Week } from '../data/types'
import { STANDARD_ZEITEN } from '../data/vorgaben'

vi.mock('./supabase', () => ({ supabase: null }))

const konto = await import('./daten/konto')
const laden = await import('./daten/laden')
const mitteilungen = await import('./daten/mitteilungen')
const personen = await import('./daten/personen')
const plaene = await import('./daten/plaene')
const predigtdienst = await import('./daten/predigtdienst')
const schreibweg = await import('./daten/schreibweg')
const versammlung = await import('./daten/versammlung')
const versand = await import('./daten/versand')
const wochen = await import('./daten/wochen')
const zusagen = await import('./daten/zusagen')

/** Alle Module der Datenschicht — für die Vollständigkeit; ein neues zählt von selbst mit. */
const MODULE = import.meta.glob<Record<string, unknown>>(['./daten/*.ts', '!./daten/*.test.ts'], { eager: true })

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
  loadNotifications: [() => mitteilungen.loadNotifications('c1', [], STANDARD_ZEITEN), null],
  loadCongregationData: [() => laden.loadCongregationData('u1'), { ok: false, reason: 'error', message: 'kein Client' }],
  saveWeek: [() => wochen.saveWeek('c1', woche), false],
  saveFsWeek: [() => wochen.saveFsWeek('c1', '2026-09-07', []), false],
  wocheGeschrieben: [() => wochen.wocheGeschrieben('2026-09-07'), undefined],
  savePerson: [() => personen.savePerson('c1', person), undefined],
  saveFsRules: [() => predigtdienst.saveFsRules('c1', [], ['r1']), undefined],
  saveGruppenbesuche: [() => predigtdienst.saveGruppenbesuche('c1', [], ['b1']), undefined],
  saveVortraege: [() => wochen.saveVortraege('c1', [], ['v1']), undefined],
  saveAnwesenheit: [() => wochen.saveAnwesenheit('c1', { woche: '2026-09-07', tab: 'mid', saal: 1, video: 2, pid: null }, ['saal']), undefined],
  saveTrolleys: [() => predigtdienst.saveTrolleys('c1', []), undefined],
  savePlaene: [() => plaene.savePlaene('c1', [], ['pl1']), undefined],
  savePlanEintraege: [() => plaene.savePlanEintraege('c1', [], ['e1']), undefined],
  deletePersonRow: [() => personen.deletePersonRow('p1'), undefined],
  saveService: [() => versammlung.saveService('c1', service, 0), undefined],
  deleteServiceRow: [() => versammlung.deleteServiceRow('c1', 'mik'), undefined],
  saveGroupRow: [() => versammlung.saveGroupRow('c1', group, 0), undefined],
  deleteGroupRow: [() => versammlung.deleteGroupRow('g1'), undefined],
  savePersonGroup: [() => personen.savePersonGroup(person), undefined],
  saveFamily: [() => personen.saveFamily('c1', 'h1', [person]), undefined],
  deleteHouseholdRow: [() => personen.deleteHouseholdRow('h1'), undefined],
  savePushSubscription: [() => mitteilungen.savePushSubscription('c1', 'u1', abo, 'de'), undefined],
  savePushLanguage: [() => mitteilungen.savePushLanguage('e1', 'de'), undefined],
  deletePushSubscription: [() => mitteilungen.deletePushSubscription('e1'), undefined],
  pushAboEigen: [() => mitteilungen.pushAboEigen('e1'), null],
  pushAboEintragen: [() => mitteilungen.pushAboEintragen('c1', 'u1', abo, 'de'), 'fehler'],
  saveAbsence: [() => personen.saveAbsence('c1', { id: 'a1', personId: 'p1', userId: null, from: '2026-09-07', to: '2026-09-08', reason: '' }), undefined],
  deleteAbsenceRow: [() => personen.deleteAbsenceRow('a1'), undefined],
  notifyPlanners: [() => mitteilungen.notifyPlanners('verhindert', 'T', 'B'), undefined],
  persoenlichBescheid: [() => versand.persoenlichBescheid('k1', 'Name', true), undefined],
  substituteSeek: [() => zusagen.substituteSeek('k1'), undefined],
  absageMelden: [() => zusagen.absageMelden('k1', 'bin verreist'), undefined],
  substituteTake: [() => zusagen.substituteTake('k1'), undefined],
  platzFuellen: [() => zusagen.platzFuellen('k1'), undefined],
  substituteWithdraw: [() => zusagen.substituteWithdraw('k1'), undefined],
  sendPlan: [() => versand.sendPlan('2026-09-07', '2026-09-08'), null],
  erinnerungSenden: [() => versand.erinnerungSenden('2026-09-07', '2026-09-08'), null],
  sendPlanEntzug: [() => versand.sendPlanEntzug([{ taskKey: 'k1' } as never]), undefined],
  markNotificationRead: [() => mitteilungen.markNotificationRead('c1', 'u1', 'n1'), undefined],
  markNotificationsRead: [() => mitteilungen.markNotificationsRead('c1', 'u1'), undefined],
  deleteNotifications: [() => mitteilungen.deleteNotifications('c1', 'u1'), undefined],
  saveCongregationInfo: [() => versammlung.saveCongregationInfo('c1', { name: 'X' }), undefined],
  saveSettings: [() => versammlung.saveSettings('c1', {} as never), undefined],
  saveConfirmation: [() => zusagen.saveConfirmation('c1', 'u1', 'k1', 'bestätigt'), undefined],
  gesuchAblehnen: [() => zusagen.gesuchAblehnen('c1', 'u1', 'k1', 'Max Platzhalter'), undefined],
  deleteConfirmationRows: [() => zusagen.deleteConfirmationRows('c1', ['k1']), undefined],
  saveMemberRow: [() => konto.saveMemberRow({ userId: 'u1' } as never), undefined],
  deleteMemberRow: [() => konto.deleteMemberRow('u1'), undefined],
  deleteAnmeldeLink: [() => konto.deleteAnmeldeLink('p1'), undefined],
}

/** Was nichts mit der Datenbank zu tun hat: Umformer, Melder, Zähler. */
const OHNE_DATENBANKWEG = new Set([
  'trolleyTerminFromRow',
  'confirmationMap',
  'anmeldeLinkAusZeile',
  'setSchreibfehlerMelder',
  'setKonfliktMelder',
  'setEntzugMelder',
  'ladungJetzt',
  'tauschStaendeUebernehmen',
  // Seit der Aufteilung in Module (T172) für die Nachbarmodule exportiert:
  'schreibfehler',
  'konfliktMelden',
  'standVeraltet',
  'standDerFunctionUebernehmen',
  'groupFromRow',
  'serviceFromRow',
  'trolleyFromRow',
  'planFromRow',
  'planEintragFromRow',
  'rueckblickAb',
  'absageFromRow',
  'notificationsAus',
])

/**
 * Bausteine der Wege, seit T172 für die Nachbarmodule exportiert: Client,
 * Anfrage oder Schreiber kommen vom Aufrufer, und der hat vorher gefragt, ob es
 * einen Client gibt. Für sich allein gehen sie nirgends hin.
 */
const BAUSTEINE = new Set(['run', 'zeilenRun', 'schreibSchlange', 'loeschenDannSchreiben', 'zeileSchreiben', 'notifAbfrage'])

describe('Ohne Datenbank', () => {
  it('jeder Weg zur Datenbank steht in der Liste', () => {
    expect(Object.keys(MODULE).length, 'Module unter daten/ nicht gefunden — Glob nachziehen').toBeGreaterThanOrEqual(11)
    const wege = Object.values(MODULE)
      .flatMap((modul) => Object.entries(modul))
      .filter(([, wert]) => typeof wert === 'function')
      .map(([name]) => name)
      .filter((name) => !OHNE_DATENBANKWEG.has(name) && !BAUSTEINE.has(name))
    expect(wege.filter((name) => !(name in OHNE_DATENBANK))).toEqual([])
    expect(Object.keys(OHNE_DATENBANK).filter((name) => !wege.includes(name))).toEqual([])
  })

  it.each(Object.entries(OHNE_DATENBANK))('%s geht nicht hinaus und bricht nicht', async (_name, [aufruf, erwartet]) => {
    const fehler = vi.spyOn(console, 'error').mockImplementation(() => {})
    const melder = vi.fn()
    schreibweg.setSchreibfehlerMelder(melder)
    try {
      expect(await aufruf()).toEqual(erwartet)
      // Kein Schreibfehler gemeldet: Ohne Client ist nichts gescheitert, es wurde nur nichts versucht.
      expect(melder).not.toHaveBeenCalled()
      expect(fehler).not.toHaveBeenCalled()
    } finally {
      schreibweg.setSchreibfehlerMelder(null)
      fehler.mockRestore()
    }
  })
})
