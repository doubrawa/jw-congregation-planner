import { describe, expect, it } from 'vitest'
import { dienstSchluessel, mitDienstSchluessel } from '../_shared/rest.ts'

/*
 * Die Schlüssel mit Dienstrechten, an denen `import-week` die Wartungsskripte
 * erkennt. Die Plattform gibt jeder gehosteten Function die neuen als
 * JSON-Wörterbuch (`SUPABASE_SECRET_KEYS`) und den alten Service-Role-Schlüssel
 * mit; gelesen wird beides vom Aufrufer, hier nur ausgewertet.
 */

const mitKopf = (kopf: Record<string, string>) => new Request('https://fn.test/x', { method: 'POST', headers: kopf })

describe('dienstSchluessel', () => {
  it('nimmt jeden Schlüssel aus dem Wörterbuch und den alten dazu', () => {
    expect(dienstSchluessel('{"default":"sb_secret_a","zweiter":"sb_secret_b"}', 'alt')).toEqual([
      'sb_secret_a',
      'sb_secret_b',
      'alt',
    ])
  })

  it('kaputtes JSON oder nichts davon — dann zählt nur, was übrig bleibt', () => {
    expect(dienstSchluessel('kein json', 'alt')).toEqual(['alt'])
    expect(dienstSchluessel(undefined, undefined)).toEqual([])
    // Leere Werte sind kein Schlüssel: Sonst öffnete ein leerer Kopf die Tür.
    expect(dienstSchluessel('{"default":""}', '')).toEqual([])
  })
})

describe('mitDienstSchluessel', () => {
  const schluessel = ['sb_secret_a', 'alt']

  it('erkennt einen Dienstschlüssel im apikey-Kopf', () => {
    expect(mitDienstSchluessel(mitKopf({ apikey: 'sb_secret_a' }), schluessel)).toBe(true)
    expect(mitDienstSchluessel(mitKopf({ apikey: 'alt' }), schluessel)).toBe(true)
  })

  it('nicht ohne Kopf, nicht mit einem fremden Schlüssel', () => {
    expect(mitDienstSchluessel(mitKopf({}), schluessel)).toBe(false)
    expect(mitDienstSchluessel(mitKopf({ apikey: 'sb_publishable_x' }), schluessel)).toBe(false)
  })

  it('ein leerer Kopf trifft auch dann nicht, wenn die Liste leer ist', () => {
    expect(mitDienstSchluessel(mitKopf({ apikey: '' }), [])).toBe(false)
  })
})
