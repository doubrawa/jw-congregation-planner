import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { werkzeugPfad } from './gemeinsam.mjs'

/**
 * **Die Prüfungen finden ihr Werkzeug so, wie Node es findet.**
 *
 * `check-index-access.mjs` und `mutationsprobe.mjs` starteten tsc und vitest
 * bis zum 26.9.2026 über einen festen Pfad in `<wurzel>/node_modules`. Im
 * Worktree der Desktop-App liegt dort nichts — die Pakete liegen im
 * Hauptcheckout drei Ebenen darüber —, und beide Skripte hielten den
 * Startfehler für ein Messergebnis: „alles aufgeräumt" die eine, „bewacht" die
 * andere.
 *
 * Geprüft wird an einem nachgebauten Paket in einem leeren Ordner. So wird das
 * Hochwandern überall gemessen, auch in der CI: Dort liegt `node_modules`
 * direkt in der Wurzel, und der alte feste Pfad stimmte zufällig.
 */
describe('werkzeugPfad', () => {
  let ordner = ''

  beforeEach(() => {
    ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'werkzeug-'))
  })

  afterEach(() => {
    fs.rmSync(ordner, { recursive: true, force: true })
  })

  /** Ein Paket unter `<ordner>/node_modules` anlegen; `dateien` entstehen leer. */
  function paket(name: string, felder: Record<string, unknown>, dateien: string[] = []) {
    const dir = path.join(ordner, 'node_modules', name)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name, ...felder }))
    for (const datei of dateien) {
      fs.mkdirSync(path.dirname(path.join(dir, datei)), { recursive: true })
      fs.writeFileSync(path.join(dir, datei), '')
    }
    // Node löst Verknüpfungen auf (unter macOS etwa /var → /private/var) —
    // verglichen wird deshalb mit dem echten Pfad.
    return fs.realpathSync(dir)
  }

  it('wandert hinauf wie Node: Das Paket liegt im Hauptcheckout, drei Ebenen über dem Worktree', () => {
    const dir = paket('werkzeug', { bin: { werkzeug: './werkzeug.mjs' } }, ['werkzeug.mjs'])
    const worktree = path.join(ordner, '.claude', 'worktrees', 'probe')
    fs.mkdirSync(worktree, { recursive: true })
    expect(werkzeugPfad(worktree, 'werkzeug')).toBe(path.join(dir, 'werkzeug.mjs'))
  })

  it('nimmt die Datei, die das Paket unter bin nennt, statt eine anzunehmen', () => {
    const dir = paket('werkzeug', { bin: { anders: './bin/anders' } }, ['bin/anders'])
    expect(werkzeugPfad(ordner, 'werkzeug', 'anders')).toBe(path.join(dir, 'bin', 'anders'))
  })

  it('versteht bin als bloße Zeichenkette — der Befehl heißt dann wie das Paket', () => {
    const dir = paket('werkzeug', { bin: './werkzeug.mjs' }, ['werkzeug.mjs'])
    expect(werkzeugPfad(ordner, 'werkzeug')).toBe(path.join(dir, 'werkzeug.mjs'))
    expect(() => werkzeugPfad(ordner, 'werkzeug', 'anders')).toThrow(/keinen Befehl anders/)
  })

  it('wirft, wenn das Paket nirgends liegt — statt einen Pfad ins Leere zu liefern', () => {
    expect(() => werkzeugPfad(ordner, 'gibt-es-nicht-werkzeug')).toThrow(
      /gibt-es-nicht-werkzeug ist von .+ aus nicht zu finden/,
    )
  })

  it('reicht Nodes Meldung durch, wenn das Paket daliegt, seine package.json aber nicht freigibt', () => {
    // „Nicht zu finden" wäre hier falsch — das Paket ist ja da.
    paket('werkzeug', { exports: { '.': './index.js' } })
    expect(() => werkzeugPfad(ordner, 'werkzeug')).toThrow(
      expect.objectContaining({ code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' }),
    )
  })

  it('wirft, wenn die unter bin genannte Datei fehlt', () => {
    // Eine abgebrochene Installation: Die package.json ist da, der Einstieg nicht.
    paket('werkzeug', { bin: { werkzeug: './werkzeug.mjs' } })
    expect(() => werkzeugPfad(ordner, 'werkzeug')).toThrow(/werkzeug\.mjs fehlt/)
  })

  it('findet tsc und vitest dieses Repos', () => {
    /*
      Die Annahme, auf der beide Prüfungen stehen: Beide Pakete lassen ihre
      `package.json` auflösen, und die Befehle heißen so. vitest listet
      `./package.json` ausdrücklich unter `exports`; fiele das bei einem
      Update weg, würde es hier rot — und nicht erst beim nächsten Durchgang
      der Mutationsprobe, der Wochen später kommen kann.
    */
    const wurzel = path.join(import.meta.dirname, '..')
    expect(path.basename(werkzeugPfad(wurzel, 'vitest'))).toBe('vitest.mjs')
    expect(werkzeugPfad(wurzel, 'typescript', 'tsc')).toMatch(/[\\/]bin[\\/]tsc$/)
  })
})
