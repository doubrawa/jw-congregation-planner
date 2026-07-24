import { beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.hoisted(() => vi.fn())
vi.mock('./supabase', () => ({ supabase: { functions: { invoke } } }))

import { sendInviteMails } from './invite'

const args = [{ personId: 'p1', code: 'ABC' }]

beforeEach(() => invoke.mockReset())

describe('sendInviteMails', () => {
  it('Erfolg → ok mit sent/skipped', async () => {
    invoke.mockResolvedValue({ data: { sent: 2, skipped: 1 }, error: null })
    expect(await sendInviteMails(args)).toEqual({ ok: true, sent: 2, skipped: 1 })
    expect(invoke).toHaveBeenCalledWith('send-invite', { body: { invites: args } })
  })

  it('fehlende Domain-Konfiguration → notConfigured', async () => {
    invoke.mockResolvedValue({ data: { error: 'not-configured' }, error: null })
    expect(await sendInviteMails(args)).toEqual({ ok: false, notConfigured: true, error: 'not-configured' })
  })

  it('fachlicher Fehler der Function → notConfigured false', async () => {
    invoke.mockResolvedValue({ data: { error: 'boom' }, error: null })
    expect(await sendInviteMails(args)).toEqual({ ok: false, notConfigured: false, error: 'boom' })
  })

  it('Transportfehler → notConfigured false mit Meldung', async () => {
    invoke.mockResolvedValue({ data: null, error: { message: 'network down' } })
    expect(await sendInviteMails(args)).toEqual({ ok: false, notConfigured: false, error: 'network down' })
  })

  it('leere Antwort → sent/skipped 0', async () => {
    invoke.mockResolvedValue({ data: null, error: null })
    expect(await sendInviteMails(args)).toEqual({ ok: true, sent: 0, skipped: 0 })
  })
})
