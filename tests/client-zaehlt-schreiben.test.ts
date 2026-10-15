import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * **Der Supabase-Client zählt mit, was hinausgeht** (15.10.2026).
 *
 * Das Nachladen wartet auf unterwegs befindliche Schreibvorgänge und lädt
 * nach, wenn während des Ladens einer hinausging (`app/hydrate.ts`). Wissen
 * kann es das nur, wenn der Client seinen `fetch` über
 * `lib/schreiben-unterwegs.ts` schickt. Unter vitest gibt es keinen Client
 * (keine Datenbank in der Umgebung) — deshalb steht die Verdrahtung hier als
 * Probe am Quelltext, am Aufruf selbst, nicht an Kommentaren.
 */
const QUELLE = readFileSync(fileURLToPath(new URL('../src/lib/supabase.ts', import.meta.url)), 'utf8')

/** Die Zeilen, die `createClient` aufrufen — Kommentare zählen nicht. */
const aufrufe = QUELLE.split('\n').filter((zeile) => /\bcreateClient\(/.test(zeile) && !/^\s*(\*|\/\/)/.test(zeile))

describe('lib/supabase.ts', () => {
  it('erzeugt genau einen Client', () => {
    expect(aufrufe).toHaveLength(1)
  })

  it('und gibt ihm den mitzählenden fetch', () => {
    expect(aufrufe[0]).toContain('global: { fetch: verfolgterFetch() }')
  })
})
