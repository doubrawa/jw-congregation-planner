import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * **„Bezeichnung: Zahl", von Hand gebaut, bindet die Zahl** (T128).
 *
 * `fill` bindet jede Vorlage der Wörterbücher (`zahl-binden.test.ts`). Wer eine
 * Zeile selbst zusammensetzt — `${t.saalBesetzung}: ${besetzt}/${gesamt}` —,
 * geht an `fill` vorbei: Unter „Meine Aufgaben" brach so bei 320 px und Stufe
 * 1,45 „Чекають на підтвердження: |5", im Blatt „Automatisch" „cubiertos:
 * |15/15". Solche Zeilen gehen durch `zahlBinden`.
 *
 * Gelesen über `node:fs`, wie die übrigen Quelltext-Proben unter `tests/`.
 */

const SRC = fileURLToPath(new URL('../src', import.meta.url))

/** Alle `.ts`/`.tsx` unter `src/` ohne Tests, als [Pfad relativ zu `src/`, Inhalt]. */
function quellen(dir = SRC): Array<[string, string]> {
  const out: Array<[string, string]> = []
  for (const eintrag of readdirSync(dir, { withFileTypes: true })) {
    const pfad = join(dir, eintrag.name)
    if (eintrag.isDirectory()) out.push(...quellen(pfad))
    else if (/\.tsx?$/.test(eintrag.name) && !/\.test\.tsx?$/.test(eintrag.name)) {
      out.push([relative(SRC, pfad).replaceAll('\\', '/'), readFileSync(pfad, 'utf8')])
    }
  }
  return out
}

/** Eine Zeile aus einem Wort des Wörterbuchs, Doppelpunkt und einem Wert. */
const VON_HAND = /`\$\{t\.\w+\}: \$\{/g
const BINDER = 'zahlBinden('

describe('Von Hand gebaute „Bezeichnung: Wert"-Zeilen', () => {
  const treffer = quellen().flatMap(([pfad, text]) =>
    [...text.matchAll(VON_HAND)].map((m) => ({
      stelle: `${pfad}: ${text.slice(m.index, m.index + 48)}`,
      gebunden: text.slice(m.index - BINDER.length, m.index) === BINDER,
    })),
  )

  it('es gibt sie — sonst prüfte die Probe nichts', () => {
    expect(treffer.length).toBeGreaterThanOrEqual(5)
  })

  it('jede geht durch zahlBinden — die Zahl bricht nicht von ihrer Bezeichnung ab', () => {
    expect(treffer.filter((t) => !t.gebunden).map((t) => t.stelle)).toEqual([])
  })
})
