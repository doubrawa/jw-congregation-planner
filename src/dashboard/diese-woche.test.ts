/**
 * „Diese Woche in der Versammlung" auf dem Start (T121): was noch kommt, in
 * der Folge der Tage, und von den Treffpunkten nur die, die einen angehen.
 */
import { describe, expect, it } from 'vitest'
import type { FsInstance, MeetingTimes, Week } from '../data/types'
import { termineDieserWoche } from './diese-woche'

const ZEITEN: MeetingTimes = { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } }

const woche = (over: Partial<Week> = {}): Week => ({
  range: '', book: '', start: '2026-09-07',
  mid: { date: '', end: '', sections: [], helpers: {} },
  we: { date: '', end: '', sections: [], helpers: {} },
  ...over,
})

const treffpunkt = (id: string, grp: string | null, wd: number): FsInstance => ({
  id, ruleId: id, grp, wd, time: '09:30', place: '', leader: '',
})

/** Was der Leser sieht: der Tag im Monat und welcher Termin. */
const folge = (heute: Date, fs: FsInstance[] = [], gruppen: string[] = ['g1'], weeks = [woche()]) =>
  termineDieserWoche(weeks, [fs], ZEITEN, new Set(gruppen), heute).map(
    (t) => `${t.tag.getDate()} ${t.art === 'zusammenkunft' ? t.tab : t.inst.id}`,
  )

const MONTAG = new Date(2026, 8, 7, 9, 0)

describe('Diese Woche in der Versammlung', () => {
  it('Zusammenkünfte und Treffpunkte stehen gemischt in der Folge ihrer Tage', () => {
    expect(folge(MONTAG, [treffpunkt('sa', 'g1', 6)])).toEqual(['8 mid', '12 sa', '13 we'])
  })

  it('am selben Tag entscheidet die Uhrzeit', () => {
    const frueh = { ...treffpunkt('frueh', null, 0), time: '08:00' }
    const spaet = { ...treffpunkt('spaet', null, 0), time: '15:00' }
    expect(folge(MONTAG, [spaet, frueh])).toEqual(['8 mid', '13 frueh', '13 we', '13 spaet'])
  })

  it('nur, was noch kommt — am Donnerstag nicht mehr der Dienstag, heute aber schon', () => {
    expect(folge(new Date(2026, 8, 10, 9, 0), [treffpunkt('do', 'g1', 4)])).toEqual(['10 do', '13 we'])
  })

  it('Treffpunkte der eigenen Gruppe und der ganzen Versammlung — nicht die fremder Gruppen', () => {
    const fs = [treffpunkt('eigen', 'g1', 3), treffpunkt('fremd', 'g2', 3), treffpunkt('alle', null, 5)]
    expect(folge(MONTAG, fs)).toEqual(['8 mid', '9 eigen', '11 alle', '13 we'])
  })

  it('ohne Gruppe nur die der ganzen Versammlung', () => {
    const fs = [treffpunkt('eigen', 'g1', 3), treffpunkt('alle', null, 5)]
    expect(folge(MONTAG, fs, [])).toEqual(['8 mid', '11 alle', '13 we'])
  })

  it('auch die der Gruppe, die man leitet, ohne in ihr geführt zu sein', () => {
    // Dieselbe Menge wie im Predigtdienst (`eigeneGruppen`): Bis zum
    // 13.10.2026 fragte der Start nur die eigene Gruppe und ließ die
    // geleitete weg.
    const fs = [treffpunkt('eigen', 'g1', 3), treffpunkt('geleitet', 'g2', 4), treffpunkt('fremd', 'g3', 5)]
    expect(folge(MONTAG, fs, ['g1', 'g2'])).toEqual(['8 mid', '9 eigen', '10 geleitet', '13 we'])
  })

  it('was entfällt, steht nicht da — in der Kongresswoche nur die Treffpunkte', () => {
    const kongress = woche({ dev: { mid: { cancelled: true }, we: { cancelled: true } } })
    expect(folge(MONTAG, [treffpunkt('sa', 'g1', 6)], ['g1'], [kongress])).toEqual(['12 sa'])
  })

  it('ohne geladene laufende Woche: nichts', () => {
    expect(folge(new Date(2026, 9, 20, 9, 0))).toEqual([])
  })
})
