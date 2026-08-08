import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Verkettbarer Supabase-Stub: jede Methode liefert dasselbe Objekt zurück und
 * ist zugleich „thenable" (löst zu {data:null,error:null} auf) — so funktioniert
 * jede Kette `.from().upsert()`, `.delete().eq()`, `.update().eq().eq()`,
 * `.rpc()`. Geprüft wird, WELCHE Tabelle + Terminal-Operation aufgerufen wurde.
 */
const chain = vi.hoisted(() => {
  const c: Record<string, ReturnType<typeof vi.fn>> & {
    then: unknown
    functions: { invoke: ReturnType<typeof vi.fn> }
  } = {} as never
  for (const m of ['from', 'select', 'insert', 'upsert', 'update', 'delete', 'eq', 'in', 'is', 'order', 'maybeSingle', 'rpc']) {
    c[m] = vi.fn(() => c)
  }
  c.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null })
  // Edge Functions laufen nicht über die Kette, sondern über einen eigenen Zweig.
  c.functions = { invoke: vi.fn(() => Promise.resolve({ data: null, error: null })) }
  return c
})

vi.mock('./supabase', () => ({ supabase: chain }))

import {
  deleteAbsenceRow,
  deleteConfirmationRows,
  deleteGroupRow,
  deleteInviteRow,
  deleteMemberRow,
  deleteNotifications,
  deletePersonRow,
  deletePushSubscription,
  deleteServiceRow,
  generateInviteCode,
  insertNotifications,
  markNotificationsRead,
  redeemInvite,
  saveAbsence,
  saveConfirmation,
  saveCongregationInfo,
  saveFsRules,
  saveFsWeek,
  saveGroupRow,
  saveInvite,
  saveInvitePlanner,
  saveMemberRow,
  savePerson,
  savePersonGroup,
  savePushSubscription,
  saveService,
  saveSettings,
  saveWeek,
  setSchreibfehlerMelder,
  substituteTake,
  swapConfirmationKeys,
} from './data'
import type { Group, Person, Service, Week } from '../data/types'

const person = { id: 'p1', fn: 'A', ln: 'B', role: 'verkuendiger', tel: '', mail: '', priv: {} as Person['priv'], grp: null } as Person
const group: Group = { id: 'g1', name: 'G', ov: null, as: null }
const service: Service = { key: 'mik', name: 'Mikrofone', count: 2, groups: false }

beforeEach(() => vi.clearAllMocks())

describe('Upsert-Schreiber (onConflict)', () => {
  /*
    `saveWeek` ist seit T39 **kein** Upsert mehr: die Woche trägt einen Stand
    (`weeks.updated_at`), und der Schreibvorgang nennt den Stand, auf dem er
    beruht. Ein Upsert kennt diese Bedingung nicht — er überschreibt immer, und
    genau daran verlor der zweite Planer die Arbeit des ersten.

    Der Ablauf mit allen Verzweigungen steht in `week-konflikt.test.ts`. Hier
    bleibt nur, was in diese Datei gehört: dass ein Platzhalter nie geschrieben
    wird, und dass es kein Upsert mehr ist.
  */
  // `saveWeek` schreibt seit T39 über eine positionsweise Warteschlange und ist
  // damit asynchron — die Kette läuft erst im nächsten Tick.
  const geschrieben = () => new Promise((r) => setTimeout(r, 0))

  it('saveWeek ist kein Upsert mehr — der Stand entscheidet (T39)', async () => {
    saveWeek('c1', 3, { range: 'X' } as Week)
    await geschrieben()
    expect(chain.from).toHaveBeenCalledWith('weeks')
    expect(chain.upsert).not.toHaveBeenCalled()
  })
  it('saveWeek schreibt KEINE Platzhalter-Woche', async () => {
    // An dieser Position steht in der Datenbank die echte, nur nicht geladene
    // Woche — ein Schreibvorgang mit dem leeren Platzhalter würde sie löschen.
    saveWeek('c1', 3, { range: '', stub: true } as Week)
    await geschrieben()
    expect(chain.from).not.toHaveBeenCalledWith('weeks')
  })

  it('savePerson → persons upsert (Row-Mapping)', () => {
    savePerson('c1', person)
    expect(chain.from).toHaveBeenCalledWith('persons')
    expect(chain.upsert).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1', congregation_id: 'c1' }))
  })
  it('saveFsRules → fs_rules upsert je Versammlung', () => {
    saveFsRules('c1', '2026-09-07', [])
    expect(chain.from).toHaveBeenCalledWith('fs_rules')
    expect(chain.upsert).toHaveBeenCalledWith({ congregation_id: 'c1', base: '2026-09-07', rules: [] }, { onConflict: 'congregation_id' })
  })
  it('saveFsWeek → fs_weeks upsert je Position', () => {
    saveFsWeek('c1', 2, [])
    expect(chain.upsert).toHaveBeenCalledWith({ congregation_id: 'c1', position: 2, data: [] }, { onConflict: 'congregation_id,position' })
  })
  it('saveService → services upsert', () => {
    saveService('c1', service, 4)
    expect(chain.from).toHaveBeenCalledWith('services')
    expect(chain.upsert).toHaveBeenCalledWith(expect.objectContaining({ key: 'mik', position: 4 }), { onConflict: 'congregation_id,key' })
  })
  it('saveGroupRow → groups upsert; saveConfirmation → confirmations upsert', () => {
    saveGroupRow('c1', group)
    expect(chain.from).toHaveBeenCalledWith('groups')
    saveConfirmation('c1', 'u1', 'k1', 'bestätigt')
    expect(chain.from).toHaveBeenCalledWith('confirmations')
    expect(chain.upsert).toHaveBeenCalledWith(expect.objectContaining({ task_key: 'k1', status: 'bestätigt' }), { onConflict: 'congregation_id,task_key,user_id' })
  })
  it('savePushSubscription → push_subscriptions upsert (endpoint)', () => {
    savePushSubscription('c1', 'u1', { endpoint: 'e', p256dh: 'p', auth: 'a' }, 'fr')
    expect(chain.from).toHaveBeenCalledWith('push_subscriptions')
    // Die Sprache muss mit: Push-Text entsteht beim Versand und ist danach fest.
    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: 'e', lang: 'fr' }),
      { onConflict: 'endpoint' },
    )
  })
})

describe('Insert-Schreiber', () => {
  it('saveAbsence → absences insert', () => {
    saveAbsence('c1', 'u1', 'p1', { id: 'a1', personId: 'p1', userId: 'u1', from: '2026-01-01', to: '2026-01-02', reason: 'r' })
    expect(chain.from).toHaveBeenCalledWith('absences')
    expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1', from_date: '2026-01-01', to_date: '2026-01-02' }))
  })
  it('saveInvite → invites insert', () => {
    saveInvite('c1', { id: 'i1', code: 'ABC', personId: 'p1', planner: false })
    expect(chain.from).toHaveBeenCalledWith('invites')
    expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({ id: 'i1', code: 'ABC' }))
  })
  it('insertNotifications → eine Zeile je Empfänger; leere Liste = kein Schreiben', () => {
    insertNotifications('c1', ['u1', 'u2'], 'gesendet', 'T', 'B')
    expect(chain.insert).toHaveBeenCalledWith([
      expect.objectContaining({ user_id: 'u1', type: 'gesendet' }),
      expect.objectContaining({ user_id: 'u2' }),
    ])
    vi.clearAllMocks()
    insertNotifications('c1', [], 'gesendet', 'T', 'B')
    expect(chain.from).not.toHaveBeenCalled()
  })
})

describe('Update-Schreiber', () => {
  it('savePersonGroup → persons update(grp).eq(id)', () => {
    savePersonGroup(person)
    expect(chain.from).toHaveBeenCalledWith('persons')
    expect(chain.update).toHaveBeenCalledWith({ grp: null })
    expect(chain.eq).toHaveBeenCalledWith('id', 'p1')
  })
  it('markNotificationsRead → notifications update(read).eq.eq', () => {
    markNotificationsRead('c1', 'u1')
    expect(chain.update).toHaveBeenCalledWith({ read: true })
    expect(chain.eq).toHaveBeenCalledWith('congregation_id', 'c1')
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'u1')
  })
  it('saveCongregationInfo / saveSettings → congregations update', () => {
    saveCongregationInfo('c1', { name: 'N', hall: 'H', meetings: 'M' })
    expect(chain.from).toHaveBeenCalledWith('congregations')
    expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({ name: 'N', meeting_times: 'M' }))
    vi.clearAllMocks()
    saveSettings('c1', { reminders: { first: 7, last: 1, repeat: false }, congLang: 'Deutsch', progLangs: [], auxClass: false })
    expect(chain.update).toHaveBeenCalledWith({ settings: expect.objectContaining({ congLang: 'Deutsch' }) })
  })
  it('saveMemberRow / saveInvitePlanner', () => {
    saveMemberRow({ userId: 'u1', email: '', personId: 'p1', planner: true })
    expect(chain.from).toHaveBeenCalledWith('members')
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'u1')
    saveInvitePlanner('i1', true)
    expect(chain.update).toHaveBeenCalledWith({ planner: true })
    expect(chain.eq).toHaveBeenCalledWith('id', 'i1')
  })
})

describe('Delete-Schreiber', () => {
  it('deletePersonRow / deleteGroupRow / deleteInviteRow (.eq id)', () => {
    deletePersonRow('p1')
    expect(chain.from).toHaveBeenCalledWith('persons')
    deleteGroupRow('g1')
    deleteInviteRow('i1')
    expect(chain.delete).toHaveBeenCalledTimes(3)
    expect(chain.eq).toHaveBeenCalledWith('id', 'i1')
  })
  it('deleteServiceRow (.eq.eq) / deleteMemberRow / deleteAbsenceRow / deletePushSubscription', () => {
    deleteServiceRow('c1', 'mik')
    expect(chain.eq).toHaveBeenCalledWith('key', 'mik')
    deleteMemberRow('u1')
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'u1')
    deleteAbsenceRow('a1')
    deletePushSubscription('e1')
    expect(chain.eq).toHaveBeenCalledWith('endpoint', 'e1')
  })
  it('deleteNotifications (.eq.eq); deleteConfirmationRows leert per .in, leer = No-op', () => {
    deleteNotifications('c1', 'u1')
    expect(chain.from).toHaveBeenCalledWith('notifications')
    deleteConfirmationRows('c1', ['k1', 'k2'])
    expect(chain.in).toHaveBeenCalledWith('task_key', ['k1', 'k2'])
    vi.clearAllMocks()
    deleteConfirmationRows('c1', [])
    expect(chain.from).not.toHaveBeenCalled()
  })
})

describe('RPC / Sonstiges', () => {
  it('swapConfirmationKeys tauscht paarweise über einen Zwischenschlüssel', async () => {
    await swapConfirmationKeys('c1', [['a', 'b']])
    // 3 Updates je Paar (a→tmp, b→a, tmp→b)
    expect(chain.update).toHaveBeenCalledTimes(3)
  })
  it('redeemInvite ruft die RPC redeem_invite (Erfolg → null)', async () => {
    const res = await redeemInvite('CODE')
    expect(chain.rpc).toHaveBeenCalledWith('redeem_invite', { invite_code: 'CODE' })
    expect(res).toBeNull() // Stub liefert data:null
  })

  it('redeemInvite reicht den Fehlercode der RPC durch', async () => {
    for (const code of ['invalid-code', 'already-member'] as const) {
      chain.rpc.mockReturnValueOnce(Promise.resolve({ data: code, error: null }))
      expect(await redeemInvite('X')).toBe(code)
    }
  })

  it('redeemInvite gibt bei RPC-Fehler die Meldung zurück', async () => {
    chain.rpc.mockReturnValueOnce(Promise.resolve({ data: null, error: { message: 'boom' } }))
    expect(await redeemInvite('X')).toBe('boom')
  })

  it('redeemInvite: leerer/Leerzeichen-Code → invalid-code ohne Netzaufruf', async () => {
    expect(await redeemInvite('   ')).toBe('invalid-code')
    expect(await redeemInvite('')).toBe('invalid-code')
    expect(chain.rpc).not.toHaveBeenCalled()
  })
  it('generateInviteCode: 8 Zeichen ohne 0/O/1/I, praktisch eindeutig', () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateInviteCode()))
    for (const c of codes) expect(c).toMatch(/^[A-HJ-NP-Z2-9]{8}$/)
    expect(codes.size).toBeGreaterThan(45) // kaum Kollisionen
  })
})

describe('Fehlgeschlagene Schreibvorgänge werden gemeldet', () => {
  // Die Schreiber sind fire-and-forget: der Erfolgs-Toast entsteht im Reducer,
  // bevor die Datenbank geantwortet hat. Ohne Meldung sah der Nutzer
  // „Zugeteilt", während RLS-Verstoß oder abgelaufenes Token nichts schrieben.
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    setSchreibfehlerMelder(null)
    vi.restoreAllMocks()
  })

  /** Ein Durchlauf der Mikrotask-Warteschlange — run() ist async. */
  const abwarten = () => new Promise((r) => setTimeout(r, 0))

  it('meldet, wenn der Schreibvorgang einen Fehler liefert', async () => {
    const melder = vi.fn()
    setSchreibfehlerMelder(melder)
    chain.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: { message: 'rls' } })
    savePerson('c1', person)
    await abwarten()
    expect(melder).toHaveBeenCalledTimes(1)
    chain.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null })
  })

  it('schweigt, solange alles durchgeht', async () => {
    const melder = vi.fn()
    setSchreibfehlerMelder(melder)
    savePerson('c1', person)
    await abwarten()
    expect(melder).not.toHaveBeenCalled()
  })

  it('meldet auch fehlgeschlagene Edge-Function-Aufrufe (Einspringen)', async () => {
    // takeSubstitute ist der Fall, in dem ein stiller Fehlschlag am meisten
    // wehtut: der Aufrufer hat „Übernommen" gesehen, der Slot blieb unverändert.
    const melder = vi.fn()
    setSchreibfehlerMelder(melder)
    chain.functions.invoke.mockReturnValueOnce(Promise.resolve({ data: null, error: { message: 'boom' } }))
    substituteTake('c1', 'k1')
    await abwarten()
    expect(melder).toHaveBeenCalledTimes(1)
  })
})
