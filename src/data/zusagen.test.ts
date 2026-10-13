import { describe, expect, it } from 'vitest'
import { sentKey, type Conflict } from './planning'
import type {
  ConfirmationMap,
  Meeting,
  MeetingKey,
  PartItem,
  PersoenlichLog,
  SentLog,
  Service,
  SlotAssignment,
  Week,
} from './types'
import { zusagenDerWoche } from './zusagen'

/**
 * **Die Zusagen der Woche** (T121, Phase 5g, `GRueckmeldungen`): Nach „Plan
 * senden" sieht der Planer, was zu klären ist, wer noch nicht zugesagt hat und
 * wer schon. Jeder Platz steht dabei in **derselben Lage wie im Plan** — eine
 * eigene Einteilung nennte über kurz oder lang „zugesagt", was der Plan rot
 * zeigt.
 */

const MONTAG = '2026-09-07'
/** Dienstag 8.9. und Sonntag 13.9. */
const ZEITEN = { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } }
/** Montagmorgen: Noch ist nichts vorbei. */
const MONTAG_FRUEH = new Date(2026, 8, 7, 8, 0)

const DIENSTE: Service[] = [
  { key: 'mik', name: 'Mikrofone', count: 2, groups: false },
  // Gruppen-Rotation: gehört keiner Person, hat nichts zu bestätigen.
  { key: 'rein', name: 'Reinigung', count: 1, groups: true },
]

const punkt = (titel: string, name: string): PartItem => ({ iid: `i-${titel}`, title: titel, mins: 5, names: [{ name, rolle: '' }] })

function zusammenkunft(items: PartItem[], helpers: Record<string, { name: string }[]> = {}): Meeting {
  return { date: '', end: '', sections: [{ label: 'SCHÄTZE AUS GOTTES WORT', kind: 'schatz', items }], helpers } as unknown as Meeting
}

/**
 * Dienstag: Anna hat zugesagt, Carl abgesagt, Dora wartet (Nachricht ist
 * draußen); am Mikrofon Emil (noch nicht gesendet) und Fritz (abwesend). Die
 * Reinigung hat eine Gruppe. Sonntag: Gustav betet und wartet.
 */
const WOCHE = {
  range: '7.–13. September',
  book: '',
  start: MONTAG,
  mid: zusammenkunft([punkt('Bibellesung', 'Anna Test'), punkt('Gespräche beginnen', 'Carl Test'), punkt('Interesse fördern', 'Dora Test')], {
    mik: [{ name: 'Emil Test' }, { name: 'Fritz Test' }],
    rein: [{ name: 'Gruppe 1' }],
  }),
  we: zusammenkunft([punkt('Gebet', 'Gustav Test')]),
} as unknown as Week

const key = (tab: MeetingKey, titel: string) => `${MONTAG}|${tab}|part|i-${titel}|0`
const CONFIRMATIONS: ConfirmationMap = { [key('mid', 'Bibellesung')]: 'bestätigt', [key('mid', 'Gespräche beginnen')]: 'verhindert' }
const GUSTAV = sentKey(key('we', 'Gebet'), 'Gustav Test')
const SENT: SentLog = {
  [sentKey(key('mid', 'Interesse fördern'), 'Dora Test')]: '2026-09-06T20:00:00Z',
  [GUSTAV]: '2026-09-06T20:00:00Z',
}
/** Gustav hat kein Konto: Die Nachricht hat ihn nicht erreicht, gesagt hat es ihm noch niemand. */
const PERSOENLICH: PersoenlichLog = { [GUSTAV]: null }
const FRITZ_ABWESEND: Conflict = { kind: 'absent', name: 'Fritz Test', kennung: 'Fritz Test', tab: 'mid' } as Conflict
const konfliktVon = (_tab: MeetingKey, slot: SlotAssignment) => (slot.name === 'Fritz Test' ? FRITZ_ABWESEND : undefined)

const zusagen = (over: { week?: Week; heute?: Date; persoenlich?: PersoenlichLog } = {}) =>
  zusagenDerWoche({
    week: over.week ?? WOCHE,
    services: DIENSTE,
    confirmations: CONFIRMATIONS,
    sentLog: SENT,
    persoenlich: over.persoenlich ?? PERSOENLICH,
    zeiten: ZEITEN,
    konfliktVon,
    heute: over.heute ?? MONTAG_FRUEH,
  })
const lagen = (liste: ReturnType<typeof zusagen>) => Object.fromEntries(liste.map((p) => [p.slot.name, p.lage]))

describe('Die Zusagen der Woche', () => {
  it('jeder Platz in seiner Lage wie im Plan: zugesagt, Problem (abgesagt, abwesend), wartet', () => {
    expect(lagen(zusagen())).toEqual({
      'Anna Test': 'voll',
      'Carl Test': 'problem',
      'Dora Test': 'wartet',
      'Emil Test': 'wartet',
      'Fritz Test': 'problem',
      'Gustav Test': 'wartet',
    })
  })

  it('ein Problem nennt seinen Konflikt — ohne Konflikt ist es die Absage', () => {
    const liste = zusagen()
    expect(liste.find((p) => p.slot.name === 'Fritz Test')?.konflikt).toBe(FRITZ_ABWESEND)
    expect(liste.find((p) => p.slot.name === 'Carl Test')?.konflikt).toBeUndefined()
  })

  it('wann die Nachricht hinausging, steht aus dem Versand-Tagebuch dabei — sonst noch nicht', () => {
    const liste = zusagen()
    expect(liste.find((p) => p.slot.name === 'Dora Test')?.gesendet).toBe('2026-09-06T20:00:00Z')
    expect(liste.find((p) => p.slot.name === 'Emil Test')?.gesendet).toBeNull()
  })

  it('wer kein Konto hat, ist erkannt — mit dem Haken des Planers, sobald er es ihm gesagt hat', () => {
    const gustav = (persoenlich?: PersoenlichLog) => zusagen({ persoenlich }).find((p) => p.slot.name === 'Gustav Test')
    expect(gustav()?.ohneKonto).toEqual({ bescheid: null })
    expect(gustav({ [GUSTAV]: '2026-09-07T08:00:00Z' })?.ohneKonto).toEqual({ bescheid: '2026-09-07T08:00:00Z' })
    // Wer ein Konto hat, steht nicht im Verzeichnis — er wartet auf die Nachricht.
    expect(zusagen().find((p) => p.slot.name === 'Dora Test')?.ohneKonto).toBeUndefined()
  })

  it('Hilfsdienste sind als solche erkannt — dort sucht die App nach einer Absage selbst Ersatz', () => {
    const liste = zusagen()
    expect(liste.filter((p) => p.hilfsdienst).map((p) => p.slot.name)).toEqual(['Emil Test', 'Fritz Test'])
  })

  it('eine Gruppe am Dienst hat nichts zu bestätigen und fehlt', () => {
    expect(zusagen().map((p) => p.slot.name)).not.toContain('Gruppe 1')
  })

  it('was vorbei ist, fehlt: am Mittwoch nur noch der Sonntag', () => {
    const mittwoch = new Date(2026, 8, 9, 12, 0)
    expect(zusagen({ heute: mittwoch }).map((p) => p.slot.name)).toEqual(['Gustav Test'])
  })

  it('eine ausgefallene Zusammenkunft fehlt', () => {
    const aus = { ...WOCHE, dev: { we: { cancelled: true } } } as unknown as Week
    expect(zusagen({ week: aus }).map((p) => p.slot.name)).not.toContain('Gustav Test')
  })
})
