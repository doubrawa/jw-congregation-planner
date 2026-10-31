import { describe, expect, it } from 'vitest'
import { emptyQualifications } from '../data/helpers'
import type { Absence, AnmeldeLink, Member, Person } from '../data/types'
import { linkGilt, mitLage } from './person-lage'

/**
 * **Was die Personenliste über jede Person sagt** (T121, Entwurf
 * `GPersonen`): der Stand der Anmeldung, ob sie heute fehlt, ihr Recht.
 */

const person = (id: string, over: Partial<Person> = {}): Person => ({
  id, fn: id, ln: id, role: 'verkuendiger', priv: emptyQualifications(), ...over,
})
const konto = (personId: string | null, over: Partial<Member> = {}): Member => ({
  userId: `u-${personId}`, email: '', personId, planner: false, zuteiler: false, ...over,
})
const link = (personId: string, gueltigBis = '2026-10-07T09:00:00.000Z'): AnmeldeLink => ({
  personId, gueltigBis, erstelltAt: '2026-09-07T09:00:00.000Z', gesendetAt: null, benutztAt: null,
})
const abwesend = (personId: string, from: string, to: string): Absence => ({
  id: `a-${personId}-${from}`, personId, userId: null, from, to, reason: '',
})

const keine = { members: [], anmeldeLinks: [], absences: [] }

describe('Stand der Anmeldung', () => {
  it('angemeldet ist, wer ein verknüpftes Konto hat — „Link gesendet", wer nur einen gültigen Link hat', () => {
    const lagen = mitLage([person('a'), person('b'), person('c')], { members: [konto('a')], anmeldeLinks: [link('b')], absences: [] }, '2026-09-07')
    expect(lagen.map((e) => e.lage.stand)).toEqual(['angemeldet', 'link', 'ohne'])
  })

  it('ein abgelaufener Link zählt wie keiner — wer so steht, braucht einen neuen', () => {
    const [e] = mitLage([person('a')], { ...keine, anmeldeLinks: [link('a', '2026-09-06T23:00:00.000Z')] }, '2026-09-07')
    expect(e?.lage.stand).toBe('ohne')
  })

  it('ein Konto schlägt den Link — wer angemeldet ist, hat nicht mehr bloß einen Link', () => {
    const [e] = mitLage([person('a')], { members: [konto('a')], anmeldeLinks: [link('a')], absences: [] }, '2026-09-07')
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

describe('Gilt der Link noch?', () => {
  it('tagesgenau: am Tag, an dem er abläuft, noch — am Tag danach nicht mehr', () => {
    const bis = { gueltigBis: '2026-10-07T09:00:00.000Z' }
    expect(linkGilt(bis, '2026-10-06')).toBe(true)
    expect(linkGilt(bis, '2026-10-07')).toBe(true)
    expect(linkGilt(bis, '2026-10-08')).toBe(false)
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
