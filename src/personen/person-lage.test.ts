import { describe, expect, it } from 'vitest'
import { emptyQualifications } from '../data/helpers'
import type { Absence, Invite, Member, Person } from '../data/types'
import { mitLage } from './person-lage'

/**
 * **Was die Personenliste über jede Person sagt** (T121, Entwurf
 * `GPersonen`): der Stand der Anmeldung, ob sie heute fehlt, ihr Recht.
 */

const person = (id: string, over: Partial<Person> = {}): Person => ({
  id, fn: id, ln: id, role: 'verkuendiger', tel: '', mail: '', priv: emptyQualifications(), ...over,
})
const konto = (personId: string | null, over: Partial<Member> = {}): Member => ({
  userId: `u-${personId}`, email: '', personId, planner: false, zuteiler: false, ...over,
})
const code = (personId: string): Invite => ({ id: `i-${personId}`, code: 'ABC', personId, planner: false, zuteiler: false })
const abwesend = (personId: string, from: string, to: string): Absence => ({
  id: `a-${personId}-${from}`, personId, userId: null, from, to, reason: '',
})

const keine = { members: [], invites: [], absences: [] }

describe('Stand der Anmeldung', () => {
  it('angemeldet ist, wer ein verknüpftes Konto hat — eingeladen, wer nur einen offenen Code hat', () => {
    const lagen = mitLage([person('a'), person('b'), person('c')], { members: [konto('a')], invites: [code('b')], absences: [] }, '2026-09-07')
    expect(lagen.map((e) => e.lage.stand)).toEqual(['angemeldet', 'eingeladen', 'ohne'])
  })

  it('ein Konto schlägt einen offenen Code — wer angemeldet ist, ist nicht mehr bloß eingeladen', () => {
    const [e] = mitLage([person('a')], { members: [konto('a')], invites: [code('a')], absences: [] }, '2026-09-07')
    expect(e?.lage.stand).toBe('angemeldet')
  })

  it('ein Konto ohne Person macht niemanden angemeldet', () => {
    const [e] = mitLage([person('a')], { ...keine, members: [konto(null)] }, '2026-09-07')
    expect(e?.lage.stand).toBe('ohne')
  })

  it('die Folge bleibt die gegebene — die Liste sortiert vorher', () => {
    expect(mitLage([person('z'), person('a')], keine, '2026-09-07').map((e) => e.person.id)).toEqual(['z', 'a'])
  })
})

describe('Heute abwesend', () => {
  it('trifft, wer heute in einem Zeitraum steht — die Ränder eingeschlossen', () => {
    const absences = [abwesend('a', '2026-09-01', '2026-09-07'), abwesend('b', '2026-09-07', '2026-09-07')]
    const lagen = mitLage([person('a'), person('b')], { ...keine, absences }, '2026-09-07')
    expect(lagen.map((e) => e.lage.abwesenheit?.to)).toEqual(['2026-09-07', '2026-09-07'])
  })

  it('was schon vorbei ist oder erst kommt, zählt nicht', () => {
    const absences = [abwesend('a', '2026-08-01', '2026-09-06'), abwesend('a', '2026-09-08', '2026-09-20')]
    const [e] = mitLage([person('a')], { ...keine, absences }, '2026-09-07')
    expect(e?.lage.abwesenheit).toBeUndefined()
  })
})

describe('Das Recht in der Zeile', () => {
  it('mit Konto zählt das Konto — die Vormerkung an der Person nicht', () => {
    const vorgemerkt = person('a', { plannerVorgemerkt: true })
    const [e] = mitLage([vorgemerkt], { ...keine, members: [konto('a')] }, '2026-09-07')
    expect(e?.lage.rechte).toEqual({ admin: false, planer: false })
  })

  it('ohne Konto trägt die Vormerkung', () => {
    const [e] = mitLage([person('a', { zuteilerVorgemerkt: true })], keine, '2026-09-07')
    expect(e?.lage.rechte).toEqual({ admin: false, planer: true })
  })

  it('die Konten der anderen zählen nicht mit', () => {
    const lagen = mitLage([person('a'), person('b')], { ...keine, members: [konto('a', { planner: true })] }, '2026-09-07')
    expect(lagen.map((e) => e.lage.rechte.admin)).toEqual([true, false])
  })
})
