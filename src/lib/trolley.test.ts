import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TrolleyTermin } from '../data/types'

/**
 * **Trolley-Termine schreiben** (T121, Phase 7) — über die Function `trolley`.
 *
 * Zwei Dinge hält diese Schicht: Was die Function antwortet, kommt in der
 * Form des Zustands an (`trolleyTerminFromRow`), und jeder Grund, an dem sie
 * scheitert, wird zu einem, den die App nennen kann. Ohne Datenbank
 * (Entwicklerseite) gilt der Wunsch als angenommen — nach denselben Regeln.
 */

const invoke = vi.fn()
const db = vi.hoisted(() => ({ an: true }))
vi.mock('./supabase', () => ({
  get supabase() {
    return db.an ? { functions: { invoke: (...a: unknown[]) => invoke(...a) } } : null
  },
}))

const { trolleyAustragen, trolleyDazukommen, trolleyEintragen, trolleyEntfernen } = await import('./trolley')

const TERMIN: TrolleyTermin = {
  id: 'r1',
  trolleyId: 'tr1',
  datum: '2026-09-12',
  von: '09:00',
  bis: '11:00',
  pid: 'p-jonas',
  partner: 'p-simon',
  gemeinsam: true,
}

/** So legt `functions.invoke` einen Status ≠ 2xx ab: die Antwort hinter `error.context`. */
const abgewiesen = (body: unknown) => ({
  data: null,
  error: { message: 'Edge Function returned a non-2xx status code', context: { json: async () => body } },
})

beforeEach(() => {
  invoke.mockReset()
  db.an = true
})

describe('mit Datenbank', () => {
  it('eintragen schickt Termin und Tag — ohne die eigene Person — und nimmt die Zeile in der Form des Zustands', async () => {
    invoke.mockResolvedValue({
      data: {
        ok: true,
        termin: { id: 'r1', trolley_id: 'tr1', datum: '2026-09-12', von: '09:00:00', bis: '11:00:00', person_id: 'p-jonas', partner_id: 'p-simon', gemeinsam: true },
      },
      error: null,
    })
    expect(await trolleyEintragen(TERMIN, '2026-09-07')).toEqual({ ok: true, termin: TERMIN })
    expect(invoke).toHaveBeenCalledWith('trolley', {
      body: {
        aktion: 'eintragen',
        termin: { id: 'r1', trolleyId: 'tr1', datum: '2026-09-12', von: '09:00', bis: '11:00', partner: 'p-simon' },
        heute: '2026-09-07',
      },
    })
  })

  it('austragen: der Termin ist weg (`null`) — oder steht ohne Partner da', async () => {
    invoke.mockResolvedValue({ data: { ok: true, termin: null }, error: null })
    expect(await trolleyAustragen(TERMIN, 'p-jonas', '2026-09-07')).toEqual({ ok: true, termin: null })
    expect(invoke).toHaveBeenCalledWith('trolley', { body: { aktion: 'austragen', id: 'r1', heute: '2026-09-07' } })
  })

  it.each(['belegt', 'doppelt', 'partner-doppelt', 'kein-recht', 'vorbei', 'schon-partner', 'weg', 'stand'])(
    'der Grund %s kommt an, wie die Function ihn nennt',
    async (grund) => {
      invoke.mockResolvedValue(abgewiesen({ error: grund }))
      expect(await trolleyDazukommen(TERMIN, 'p-lena', '2026-09-07')).toEqual({ ok: false, fehler: grund })
    },
  )

  it('ein Grund, den die App nicht kennt, gilt als veralteter Stand — sie lädt dann nach', async () => {
    invoke.mockResolvedValue(abgewiesen({ error: 'server-error' }))
    expect(await trolleyEintragen(TERMIN, '2026-09-07')).toEqual({ ok: false, fehler: 'stand' })
  })

  it('ohne Antwort (Netz weg): „netz"', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    invoke.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } })
    expect(await trolleyEintragen(TERMIN, '2026-09-07')).toEqual({ ok: false, fehler: 'netz' })
  })

  it('einen Trolley entfernen: nur ob es ging', async () => {
    invoke.mockResolvedValue({ data: { ok: true, termine: 2 }, error: null })
    expect(await trolleyEntfernen('tr1', '2026-09-07')).toEqual({ ok: true })
    expect(invoke).toHaveBeenCalledWith('trolley', { body: { aktion: 'entfernen', trolleyId: 'tr1', heute: '2026-09-07' } })
  })
})

describe('ohne Datenbank (Entwicklerseite)', () => {
  beforeEach(() => {
    db.an = false
  })

  it('eintragen: der Termin, wie er gewünscht ist', async () => {
    expect(await trolleyEintragen(TERMIN, '2026-09-07')).toEqual({ ok: true, termin: TERMIN })
    expect(invoke).not.toHaveBeenCalled()
  })

  it('dazukommen: man ist Partner, nicht „gemeinsam" eingetragen', async () => {
    const allein = { ...TERMIN, partner: null, gemeinsam: false }
    expect(await trolleyDazukommen(allein, 'p-lena', '2026-09-07')).toEqual({
      ok: true,
      termin: { ...allein, partner: 'p-lena', gemeinsam: false },
    })
  })

  it('austragen nach denselben Regeln wie die Function: der andere bleibt — oder der Termin ist weg', async () => {
    expect(await trolleyAustragen(TERMIN, 'p-jonas', '2026-09-07')).toEqual({
      ok: true,
      termin: { ...TERMIN, pid: 'p-simon', partner: null, gemeinsam: false },
    })
    expect(await trolleyAustragen({ ...TERMIN, partner: null }, 'p-jonas', '2026-09-07')).toEqual({ ok: true, termin: null })
  })
})
