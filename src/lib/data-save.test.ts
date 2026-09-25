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
  for (const m of ['from', 'select', 'insert', 'upsert', 'update', 'delete', 'eq', 'in', 'is', 'not', 'order', 'maybeSingle', 'rpc']) {
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
  markNotificationsRead,
  notifyPlanners,
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
  substituteSeek,
  substituteTake,
} from './data'
import type { Group, Person, Service, Week } from '../data/types'
import { STANDARD_ZEITEN } from '../data/vorgaben'

const person = { id: 'p1', fn: 'A', ln: 'B', role: 'verkuendiger', tel: '', mail: '', priv: {} as Person['priv'], grp: null } as Person
const group: Group = { id: 'g1', name: 'G', overseerId: null, assistantId: null }
const service: Service = { key: 'mik', name: 'Mikrofone', count: 2, groups: false }

beforeEach(() => vi.clearAllMocks())

describe('Upsert-Schreiber (onConflict)', () => {
  /*
    `saveWeek` ist seit T39 **kein** Upsert mehr: die Woche trägt einen Stand
    (`weeks.updated_at`), und der Schreibvorgang nennt den Stand, auf dem er
    beruht. Ein Upsert kennt diese Bedingung nicht — er überschreibt immer, und
    genau daran verlor der zweite Planer die Arbeit des ersten.

    Der Ablauf mit allen Verzweigungen steht in `week-konflikt.test.ts`. Hier
    bleibt nur, was in diese Datei gehört: dass ohne Kennung nichts geschrieben
    wird, und dass es kein Upsert mehr ist.
  */
  // `saveWeek` schreibt seit T39 über eine Warteschlange je Woche und ist damit
  // asynchron — die Kette läuft erst im nächsten Tick.
  const geschrieben = () => new Promise((r) => setTimeout(r, 0))

  it('saveWeek ist kein Upsert mehr — der Stand entscheidet (T39)', async () => {
    saveWeek('c1', { range: 'X', start: '2026-09-07' } as Week)
    await geschrieben()
    expect(chain.from).toHaveBeenCalledWith('weeks')
    expect(chain.upsert).not.toHaveBeenCalled()
  })
  it('saveWeek schreibt nichts ohne Kennung der Woche (T66)', async () => {
    // Die Kennung sagt, welche Zeile gemeint ist. Ohne sie gibt es keine —
    // und ein Schreibvorgang ins Ungefähre wäre schlimmer als keiner.
    saveWeek('c1', { range: 'X', start: '' } as Week)
    await geschrieben()
    expect(chain.from).not.toHaveBeenCalledWith('weeks')
  })

  it('savePerson → persons upsert (Row-Mapping)', () => {
    savePerson('c1', person)
    expect(chain.from).toHaveBeenCalledWith('persons')
    expect(chain.upsert).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1', congregation_id: 'c1' }))
  })
  it('saveFsRules → eine Zeile je Regel', async () => {
    // Der Grundplan war bis T105 ein JSONB-Blob je Versammlung (samt einer
    // Spalte `base`, die nie gelesen wurde). Jetzt ist jede Regel eine Zeile.
    saveFsRules('c1', [
      { id: 'r1', grp: null, wd: 6, time: '09:30', place: 'Saal', monthly: 0, skipCong: false },
    ])
    await geschrieben()
    expect(chain.from).toHaveBeenCalledWith('fs_rules')
    expect(chain.upsert).toHaveBeenCalledWith([
      {
        id: 'r1',
        congregation_id: 'c1',
        grp: null,
        wd: 6,
        time: '09:30',
        place: 'Saal',
        monthly: 0,
        skip_cong: false,
      },
    ])
  })

  it('saveFsRules ohne Streichungen löscht nichts — auch nicht die Regel eines anderen', async () => {
    /*
      Hier stand `delete … where id not in (<meine Regeln>)`. Das räumte jede
      Zeile weg, die der Aufrufer nicht kannte — also auch die Regel, die ein
      zweiter Planer gerade angelegt hatte. Ohne Fehler und auf beiden
      Bildschirmen unbemerkt: Der Grundplan hat keine Vergleiche-und-Tausche-
      Sperre wie die Wochen (T39), darf also nichts anfassen, wovon er nichts
      weiß. Gelöscht wird jetzt nur, was **dieser** Planer entfernt hat.
    */
    saveFsRules('c1', [
      { id: 'r1', grp: null, wd: 6, time: '09:30', place: 'Saal', monthly: 0, skipCong: false },
    ])
    await geschrieben()
    expect(chain.delete).not.toHaveBeenCalled()
  })

  it('saveFsRules löscht die gestrichenen Regeln — über ihre Kennung', async () => {
    // Erst weg, dann der Rest per upsert. Die beiden Schritte laufen
    // **nacheinander**, der zweite also erst im nächsten Tick.
    saveFsRules(
      'c1',
      [{ id: 'r1', grp: null, wd: 6, time: '09:30', place: 'Saal', monthly: 0, skipCong: false }],
      ['r7', 'r8'],
    )
    await geschrieben()
    expect(chain.delete).toHaveBeenCalled()
    expect(chain.in).toHaveBeenCalledWith('id', ['r7', 'r8'])
    expect(chain.upsert).toHaveBeenCalled()
  })
  it('saveFsWeek → fs_weeks upsert je Wochen-Kennung', () => {
    saveFsWeek('c1', '2026-09-14', [])
    expect(chain.upsert).toHaveBeenCalledWith({ congregation_id: 'c1', start: '2026-09-14', data: [] }, { onConflict: 'congregation_id,start' })
  })
  it('saveFsWeek schreibt ebenfalls nichts ohne Kennung', () => {
    saveFsWeek('c1', '', [])
    expect(chain.from).not.toHaveBeenCalledWith('fs_weeks')
  })
  it('saveService → services upsert', () => {
    saveService('c1', service, 4)
    expect(chain.from).toHaveBeenCalledWith('services')
    expect(chain.upsert).toHaveBeenCalledWith(expect.objectContaining({ key: 'mik', position: 4 }), { onConflict: 'congregation_id,key' })
  })
  it('saveGroupRow → groups upsert; saveConfirmation → confirmations upsert', () => {
    saveGroupRow('c1', group, 2)
    expect(chain.from).toHaveBeenCalledWith('groups')
    // Die Position muss mit: geladen wird `.order('position')`, und bei lauter
    // Nullen entscheidet die Ablage der Datenbank — auch über die Reihenfolge,
    // in der die Reinigung rotiert.
    expect(chain.upsert).toHaveBeenCalledWith(expect.objectContaining({ id: group.id, position: 2 }))
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
  it('saveAbsence → absences insert, Person und Ersteller aus dem Datensatz', () => {
    /*
     * Beide standen bis August 2026 als eigene Parameter daneben — und der
     * Aufrufer füllte sie aus dem angemeldeten Konto. Seit der Planer im
     * Personen-Detail für **andere** einträgt, wäre das die falsche Person, ohne
     * dass es auffiele. Deshalb hier ausdrücklich geprüft: geschrieben wird, was
     * im Datensatz steht.
     */
    saveAbsence('c1', { id: 'a1', personId: 'p-fremd', userId: 'u1', from: '2026-01-01', to: '2026-01-02', reason: 'r' })
    expect(chain.from).toHaveBeenCalledWith('absences')
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'a1', person_id: 'p-fremd', user_id: 'u1',
        from_date: '2026-01-01', to_date: '2026-01-02',
      }),
    )
  })

  it('saveAbsence → importierte Abwesenheit ohne Ersteller bleibt ohne', () => {
    // `user_id` null = importiert. Ein hier eingesetztes Konto
    // trüge die Zeile in dessen „Deine Einträge".
    saveAbsence('c1', { id: 'a2', personId: 'p1', userId: null, from: '2026-02-01', to: '2026-02-02', reason: '' })
    expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({ id: 'a2', user_id: null }))
  })
  it('saveInvite → invites insert', () => {
    saveInvite('c1', { id: 'i1', code: 'ABC', personId: 'p1', planner: false })
    expect(chain.from).toHaveBeenCalledWith('invites')
    expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({ id: 'i1', code: 'ABC' }))
  })
  it('notifyPlanners → rpc notify_planners; die Empfänger sucht die Datenbank', () => {
    notifyPlanners('verhindert', 'Verhinderung gemeldet', 'B')
    expect(chain.rpc).toHaveBeenCalledWith('notify_planners', {
      kind: 'verhindert', subject: 'Verhinderung gemeldet', message: 'B',
    })
    // Keine Empfängerliste und kein eigener Insert aus dem Client: Ein
    // Verkündiger kennt die Planer nicht (RLS zeigt ihm nur die eigene Zeile).
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
    saveCongregationInfo('c1', { name: 'N', hall: 'H', times: STANDARD_ZEITEN })
    expect(chain.from).toHaveBeenCalledWith('congregations')
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'N', mid_wd: 2, mid_time: '19:00', we_wd: 0, we_time: '10:00' }),
    )
    vi.clearAllMocks()
    // Einstellungen sind Spalten, kein JSONB-Beutel mehr. Der Zustand führt den
    // Anzeigenamen, gespeichert wird der jw.org-Code — ein Name ist keine
    // Kennung (Kopf von schema.sql), und die Liste der 482 Namen kann sich
    // ändern, ohne dass eine Versammlung davon wüsste.
    saveSettings('c1', {
      reminders: { first: 7, last: 1, repeat: false },
      congLang: 'de',
      progLangs: ['en', 'es'],
      auxClass: false,
    })
    expect(chain.update).toHaveBeenCalledWith({
      reminder_first: 7,
      reminder_last: 1,
      reminder_repeat: false,
      cong_lang: 'de',
      prog_langs: ['en', 'es'],
      aux_class: false,
    })
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
    substituteTake('k1')
    await abwarten()
    expect(melder).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['Einspringen', () => substituteTake('k1'), 'take'],
    ['Ersatzsuche', () => substituteSeek('k1'), 'seek'],
  ])('%s schickt keine Versammlung mit — die liest der Server selbst (S10)', async (_name, ruf, action) => {
    // Der Server nahm die Versammlung früher aus diesem Rumpf. Ein angehängtes
    // `#` schnitt dort die folgenden Filter ab, und ein einfaches Mitglied
    // konnte damit die Wochen der ganzen Versammlung überschreiben. Er liest
    // sie jetzt aus der eigenen Mitgliedszeile — und was der Client gar nicht
    // erst schickt, kann auch niemand fälschen.
    chain.functions.invoke.mockClear()
    ruf()
    await abwarten()
    const [name, optionen] = chain.functions.invoke.mock.calls[0] as [string, { body: unknown }]
    expect(name).toBe('substitute')
    expect(optionen.body).toEqual({ action, taskKey: 'k1' })
  })
})
