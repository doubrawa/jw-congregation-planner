import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { antwortet, reset as resetPush, sent as gesendetePush } from './web-push.stub'
import { PUSH_FRIST_MS, PUSH_NUTZLAST_BYTES, pushNutzlast, type Zustellung, zustellen } from '../_shared/push.ts'

/*
 * Das Zustellen, das jede Function mit Push teilt. Ein Gerät darf den Lauf
 * nicht aufhalten und nicht zu Fall bringen: Nach dem Zustellen kommen die
 * Glocken und das Versand-Tagebuch.
 */

const zustellung = (endpoint: string): Zustellung => ({
  abo: { id: `abo-${endpoint}`, endpoint, p256dh: 'k', auth: 'a' },
  titel: 'Probe',
  body: 'Probe-Rumpf',
  url: 'https://app.test/',
})

beforeEach(() => {
  resetPush()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  resetPush()
})

describe('zustellen', () => {
  it('ein Dienst, der nicht antwortet, hält den Lauf nur bis zur Frist auf — die Zustellung ist gescheitert', async () => {
    vi.useFakeTimers()
    antwortet((endpoint) => (endpoint === 'stumm' ? new Promise<void>(() => {}) : Promise.resolve()))
    const lauf = zustellen([zustellung('stumm'), zustellung('da')], async () => {})
    await vi.advanceTimersByTimeAsync(PUSH_FRIST_MS)
    expect(await lauf).toEqual({ gesendet: 1, abgelaufen: 0, fehlgeschlagen: 1 })
  })

  it('vor der Frist zählt die Antwort, nicht die Frist', async () => {
    vi.useFakeTimers()
    antwortet(() => new Promise<void>((fertig) => setTimeout(fertig, PUSH_FRIST_MS - 1)))
    const lauf = zustellen([zustellung('langsam')], async () => {})
    await vi.advanceTimersByTimeAsync(PUSH_FRIST_MS)
    expect(await lauf).toEqual({ gesendet: 1, abgelaufen: 0, fehlgeschlagen: 0 })
  })

  it('scheitert das Abbestellen eines abgelaufenen Abos, gehen die übrigen trotzdem hinaus', async () => {
    antwortet((endpoint) => (endpoint === 'alt' ? Promise.reject(Object.assign(new Error('Gone'), { statusCode: 410 })) : Promise.resolve()))
    const abbestellen = vi.fn(async () => {
      throw new Error('Netz weg')
    })
    const erg = await zustellen([zustellung('alt'), zustellung('neu')], abbestellen)
    expect(erg).toEqual({ gesendet: 1, abgelaufen: 1, fehlgeschlagen: 0 })
    expect(abbestellen).toHaveBeenCalledWith('abo-alt')
  })
})

/*
 * Die Länge der Nutzlast. Ein Push-Dienst weist ab, was verschlüsselt über
 * 4096 Bytes hat — und zwar für jeden Empfänger: Die Sammelmeldung „nicht
 * erreichbar" mit Dutzenden Namen käme bei keinem Planer an, ohne dass es
 * jemand merkt. Lieber gekürzt als gar nicht; die ganze Liste steht in der
 * Glocke.
 */
describe('pushNutzlast', () => {
  const bytes = (text: string): number => new TextEncoder().encode(text).length
  const lesen = (nutzlast: string) => JSON.parse(nutzlast) as { title: string; body: string; url: string; tag?: string }
  const eintraege = (anzahl: number, name: (i: number) => string): string =>
    Array.from({ length: anzahl }, (_, i) => `${name(i)} — Dienstag, 8. September · 19:00: Mikrofone`).join(' · ')
  const kopf = { titel: 'Unbestätigte Zuteilungen (nicht erreichbar)', url: 'https://app.test/#go=planen' }

  it('eine gewöhnliche Meldung geht unverändert hinaus, samt Bündel-Kennung', () => {
    const body = eintraege(3, (i) => `Person ${i}`)
    expect(lesen(pushNutzlast({ ...kopf, body, tag: 'k1' }))).toEqual({ title: kopf.titel, body, url: kopf.url, tag: 'k1' })
    expect(lesen(pushNutzlast({ ...kopf, body }))).not.toHaveProperty('tag')
  })

  it('achtzig nicht Erreichbare passen nicht in einen Push — er geht gekürzt hinaus und endet an einem ganzen Eintrag', () => {
    const body = eintraege(80, (i) => `Person ${i}`)
    // Positivkontrolle: Ungekürzt läge die Meldung über der Grenze.
    expect(bytes(JSON.stringify({ title: kopf.titel, body, url: kopf.url }))).toBeGreaterThan(PUSH_NUTZLAST_BYTES)
    const nutzlast = pushNutzlast({ ...kopf, body })
    expect(bytes(nutzlast)).toBeLessThanOrEqual(PUSH_NUTZLAST_BYTES)
    const kurz = lesen(nutzlast)
    expect(kurz.title).toBe(kopf.titel)
    expect(kurz.url).toBe(kopf.url)
    expect(kurz.body.endsWith(' …')).toBe(true)
    // Was bleibt, ist der Anfang der Liste — und kein angeschnittener Eintrag.
    const rest = kurz.body.slice(0, -2)
    expect(body.startsWith(rest)).toBe(true)
    expect(body.slice(rest.length).startsWith(' · ')).toBe(true)
    // Möglichst viel davon: Der nächste Eintrag hätte nicht mehr gepasst.
    expect(bytes(nutzlast) + bytes(' · Person 99 — Dienstag, 8. September · 19:00: Mikrofone')).toBeGreaterThan(PUSH_NUTZLAST_BYTES)
  })

  it('zählt Bytes, nicht Zeichen: Kyrillisch, Arabisch und Anführungszeichen bleiben unter der Grenze und gültiger Text', () => {
    for (const name of ['Владимир Константинопольский', 'عبد الرحمن', 'Paul "Pauli" Müller', '👨‍👩‍👧 Familie']) {
      const nutzlast = pushNutzlast({ ...kopf, body: eintraege(120, (i) => `${name} ${i}`) })
      expect(bytes(nutzlast)).toBeLessThanOrEqual(PUSH_NUTZLAST_BYTES)
      const { body } = lesen(nutzlast)
      expect(body.endsWith(' …')).toBe(true)
      // Kein halbes Zeichenpaar: Der Text übersteht das Kodieren unverändert.
      expect(new TextDecoder().decode(new TextEncoder().encode(body))).toBe(body)
    }
  })

  it('ein einziger überlanger Eintrag wird mitten im Text gekürzt, statt ganz zu verschwinden', () => {
    const { body } = lesen(pushNutzlast({ ...kopf, body: 'x'.repeat(10_000) }))
    expect(body.length).toBeGreaterThan(2000)
    expect(body.endsWith(' …')).toBe(true)
  })

  it('zustellen schickt die begrenzte Nutzlast — auch die überlange Meldung kommt an', async () => {
    const z = zustellung('lang')
    await zustellen([{ ...z, body: eintraege(80, (i) => `Person ${i}`) }], async () => {})
    expect(gesendetePush).toHaveLength(1)
    expect(bytes(gesendetePush[0]!.payload)).toBeLessThanOrEqual(PUSH_NUTZLAST_BYTES)
  })
})
