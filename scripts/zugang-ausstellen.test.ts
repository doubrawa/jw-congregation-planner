import { describe, expect, it, vi } from 'vitest'
import { linkAusstellen } from '../supabase/functions/_shared/anmelde-links.ts'
import { pruefsumme } from '../supabase/functions/_shared/anmeldung.ts'
import { linkKlient } from './gemeinsam.mjs'
import { personZumNamen } from './zugang-ausstellen.mjs'

/**
 * **Der Notzugang** (T121, Phase 8): ein Link für eine Person, ausgestellt mit
 * dem Service-Role-Key, wenn niemand mit Admin-Recht mehr hineinkommt. Der
 * Netzteil (`main`) bleibt ungeprüft; geprüft ist, wer gemeint ist und dass der
 * Link auf demselben Weg entsteht wie in den Functions.
 */

const PERSONEN = [
  { id: 'p1', fn: 'Anna', ln: 'Beispiel' },
  { id: 'p2', fn: 'Bernd', ln: 'Brand' },
  { id: 'p3', fn: 'Maria', ln: 'de la Cruz' },
]

describe('Wer gemeint ist', () => {
  it('genau die Person dieses Namens — ohne Rücksicht auf Groß- und Kleinschreibung und Leerzeichen', () => {
    expect(personZumNamen(PERSONEN, '  anna   BEISPIEL ').id).toBe('p1')
    expect(personZumNamen(PERSONEN, 'Maria de la Cruz').id).toBe('p3')
  })

  it('kein Treffer bricht ab — es wird nicht geraten', () => {
    expect(() => personZumNamen(PERSONEN, 'Anna')).toThrow('Keine Person')
  })

  it('mehrere Treffer brechen ab und nennen den Ausweg', () => {
    const doppelt = [...PERSONEN, { id: 'p4', fn: 'Anna', ln: 'Beispiel' }]
    expect(() => personZumNamen(doppelt, 'Anna Beispiel')).toThrow('--person-id')
  })
})

describe('Der Link entsteht wie in den Functions', () => {
  it('ein Upsert je Person, Token und Code nur als Prüfsumme — und das Skript bekommt sie im Klartext', async () => {
    const rest = vi.fn((_pfad: string, _init: { method: string; headers: Record<string, string>; body: string }) => Promise.resolve(null))
    const neu = await linkAusstellen(linkKlient(rest), 'p1', 'c1', new Date('2026-10-15T09:00:00.000Z'))
    expect(neu).not.toBeNull()
    const [pfad, init] = rest.mock.calls[0]!
    expect(pfad).toBe('anmelde_links?on_conflict=person_id')
    expect(init.method).toBe('POST')
    expect(init.headers.Prefer).toContain('resolution=merge-duplicates')
    const [zeile] = JSON.parse(init.body) as Array<Record<string, unknown>>
    expect(zeile).toMatchObject({ person_id: 'p1', congregation_id: 'c1', gesendet_at: null, benutzt_at: null })
    expect(zeile!.token_hash).toBe(await pruefsumme(neu!.token))
    expect(zeile!.code_hash).toBe(await pruefsumme(neu!.code))
    expect(JSON.stringify(zeile)).not.toContain(neu!.token)
  })

  it('lehnt die Datenbank ab, gibt es keinen Link — der Fehler geht durch', async () => {
    const rest = vi.fn(() => Promise.reject(new Error('POST anmelde_links 401')))
    await expect(linkAusstellen(linkKlient(rest), 'p1', 'c1')).rejects.toThrow('401')
  })
})
