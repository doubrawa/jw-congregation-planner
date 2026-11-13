/** @vitest-environment happy-dom */
import { describe, expect, it } from 'vitest'
import { helferKey } from '../../supabase/functions/_shared/aufgaben-schluessel.ts'
import { emptyQualifications } from '../data/helpers'
import { offeneMeldungen } from '../data/plan-versand'
import { sentKey, tagebuchUmbenannt } from '../data/planung/schluessel'
import type { Person, Service, Week } from '../data/types'
import type { AppState } from './context'
import { initialState } from './init'
import { reducer } from './reducer'

/**
 * **Wer umbenannt wird, weiß weiter Bescheid** (13.11.2026).
 *
 * Das Versand-Tagebuch führt je Platz und **Name**, wem die Zuteilung schon
 * gemeldet ist. Eine Umbenennung — eine Heirat, ein berichtigter Tippfehler —
 * zog den neuen Namen durch die Wochen, aber nicht durch das Tagebuch: Jeder
 * gemeldete, noch unbestätigte Platz der Person galt danach als ungemeldet. Der
 * Knopf „Plan senden" zählte sie wieder mit, und ein Druck darauf schickte ihr
 * dieselbe Nachricht ein zweites Mal.
 *
 * Hier der offene Zustand der App; dasselbe in der Datenbank hält
 * `supabase/tagebuch-umbenennen.test.ts`.
 */

const W = '2026-11-23'
const HEUTE = new Date(2026, 10, 13, 9)
const ZEITEN = { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } }
const DIENSTE: Service[] = [{ key: 'mik', name: 'Mikrofone', count: 2, groups: false }]
const PLATZ_ANNA = helferKey(W, 'mid', 'mik', 0)
const PLATZ_BERND = helferKey(W, 'mid', 'mik', 1)
const PLATZ_SONNTAG = helferKey(W, 'we', 'mik', 0)
const GEMELDET = '2026-11-10T08:00:00.000Z'

const person = (id: string, fn: string, ln: string): Person => ({
  id, fn, ln, role: 'verkuendiger', priv: { ...emptyQualifications(), 'svc:mik': true },
})

const woche = (): Week => ({
  range: '', book: '', start: W,
  mid: { date: '', end: '', sections: [], helpers: { mik: [{ name: 'Anna Müller', pid: 'anna' }, { name: 'Bernd Klein', pid: 'bernd' }] } },
  we: { date: '', end: '', sections: [], helpers: { mik: [{ name: 'Anna Müller', pid: 'anna' }] } },
})

/** Der Plan der Woche ist gesendet, zugesagt hat noch niemand. */
function gesendet(): AppState {
  return {
    ...initialState(),
    admin: true,
    dataStatus: 'ready',
    congregation: { name: '', hall: '', times: ZEITEN },
    persons: [person('anna', 'Anna', 'Müller'), person('bernd', 'Bernd', 'Klein')],
    services: DIENSTE,
    weeks: [woche()],
    fsWeeks: [[]],
    confirmations: {},
    sentLog: {
      [sentKey(PLATZ_ANNA, 'Anna Müller')]: GEMELDET,
      [sentKey(PLATZ_BERND, 'Bernd Klein')]: GEMELDET,
      [sentKey(PLATZ_SONNTAG, 'Anna Müller')]: GEMELDET,
    },
    // Anna hat kein Konto: Der Planer hat ihr den Dienstag selbst gesagt, den Sonntag noch nicht.
    persoenlich: { [sentKey(PLATZ_ANNA, 'Anna Müller')]: '2026-11-11T18:00:00.000Z', [sentKey(PLATZ_SONNTAG, 'Anna Müller')]: null },
  }
}

/** Auf wen „Plan senden" in dieser Woche noch zeigt. */
const zuSenden = (s: AppState): string[] =>
  offeneMeldungen(s.weeks[0], s.fsWeeks[0], s.services, s.confirmations, s.sentLog, s.congregation.times, HEUTE).map((m) => m.name)

const heiratet = (s: AppState): AppState => reducer(s, { type: 'updatePerson', id: 'anna', patch: { ln: 'Schmidt' } })

describe('Eine Person wird umbenannt, nachdem der Plan gesendet ist', () => {
  it('„Plan senden" zeigt danach nicht wieder auf sie', () => {
    const vorher = gesendet()
    expect(zuSenden(vorher)).toEqual([])
    const nachher = heiratet(vorher)
    // Positivkontrolle: Die Woche trägt wirklich den neuen Namen.
    expect(nachher.weeks[0]!.mid.helpers.mik![0]).toEqual({ name: 'Anna Schmidt', pid: 'anna' })
    expect(zuSenden(nachher)).toEqual([])
  })

  it('Gegenprobe: Mit dem Tagebuch von vorher stünde sie für beide Plätze wieder auf der Liste', () => {
    const nachher = heiratet(gesendet())
    expect(zuSenden({ ...nachher, sentLog: gesendet().sentLog })).toEqual(['Anna Schmidt', 'Anna Schmidt'])
  })

  it('ihre Einträge stehen unter dem neuen Namen, mit dem Zeitpunkt von damals — der alte Name ist fort', () => {
    const { sentLog } = heiratet(gesendet())
    expect(sentLog).toEqual({
      [sentKey(PLATZ_ANNA, 'Anna Schmidt')]: GEMELDET,
      [sentKey(PLATZ_BERND, 'Bernd Klein')]: GEMELDET,
      [sentKey(PLATZ_SONNTAG, 'Anna Schmidt')]: GEMELDET,
    })
  })

  it('der Haken „persönlich Bescheid gesagt" bleibt, wo er war — gesetzt wie offen', () => {
    const { persoenlich } = heiratet(gesendet())
    expect(persoenlich).toEqual({
      [sentKey(PLATZ_ANNA, 'Anna Schmidt')]: '2026-11-11T18:00:00.000Z',
      [sentKey(PLATZ_SONNTAG, 'Anna Schmidt')]: null,
    })
  })

  it('wer sonst etwas an der Person ändert, lässt das Tagebuch, wie es ist', () => {
    const vorher = gesendet()
    const nachher = reducer(vorher, { type: 'updatePerson', id: 'anna', patch: { role: 'keine', fn: 'Anna' } })
    expect(nachher.sentLog).toBe(vorher.sentLog)
    expect(nachher.persoenlich).toBe(vorher.persoenlich)
  })
})

describe('tagebuchUmbenannt', () => {
  it('trifft nur den ganzen Namen — wer bloß so anfängt oder so aufhört, bleibt', () => {
    const log = {
      [sentKey(PLATZ_ANNA, 'Anna Müller')]: 'a',
      [sentKey(PLATZ_BERND, 'Anna Müller-Lang')]: 'b',
      [sentKey(PLATZ_SONNTAG, 'Hanna Anna Müller')]: 'c',
    }
    expect(tagebuchUmbenannt(log, 'Anna Müller', 'Anna Schmidt')).toEqual({
      [sentKey(PLATZ_ANNA, 'Anna Schmidt')]: 'a',
      [sentKey(PLATZ_BERND, 'Anna Müller-Lang')]: 'b',
      [sentKey(PLATZ_SONNTAG, 'Hanna Anna Müller')]: 'c',
    })
  })

  it('stand am selben Platz schon etwas unter dem neuen Namen, gilt der Eintrag der Umbenannten', () => {
    const log = { [sentKey(PLATZ_ANNA, 'Anna Schmidt')]: 'von früher', [sentKey(PLATZ_ANNA, 'Anna Müller')]: 'ihrer' }
    expect(tagebuchUmbenannt(log, 'Anna Müller', 'Anna Schmidt')).toEqual({ [sentKey(PLATZ_ANNA, 'Anna Schmidt')]: 'ihrer' })
    // Auch in der anderen Reihenfolge der Einträge.
    const andersherum = { [sentKey(PLATZ_ANNA, 'Anna Müller')]: 'ihrer', [sentKey(PLATZ_ANNA, 'Anna Schmidt')]: 'von früher' }
    expect(tagebuchUmbenannt(andersherum, 'Anna Müller', 'Anna Schmidt')).toEqual({ [sentKey(PLATZ_ANNA, 'Anna Schmidt')]: 'ihrer' })
  })

  it('ohne Treffer, ohne Namen oder bei gleichem Namen kommt dasselbe Objekt zurück', () => {
    const log = { [sentKey(PLATZ_BERND, 'Bernd Klein')]: 'x' }
    expect(tagebuchUmbenannt(log, 'Anna Müller', 'Anna Schmidt')).toBe(log)
    expect(tagebuchUmbenannt(log, '', 'Bernd Klein')).toBe(log)
    expect(tagebuchUmbenannt(log, 'Bernd Klein', 'Bernd Klein')).toBe(log)
    expect(tagebuchUmbenannt(log, 'Bernd Klein', '')).toBe(log)
  })
})
