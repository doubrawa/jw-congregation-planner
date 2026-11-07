import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * **Die Zusagen der Ausroll-Strecke, am Text der Workflows gehalten** (T170).
 *
 * Was hier steht, sieht man einem grünen Lauf nicht an: dass ein neuer Push ein
 * laufendes Ausrollen nicht abbricht, dass der Zugangstoken nicht in Schritten
 * steht, die fremden Code ausführen (`npm ci` mit seinen
 * Installationsskripten), und dass das Frontend erst nach Datenbank und
 * Functions hinausgeht. Bräche eine davon, liefe alles weiter — bis zum einen
 * Mal, an dem es darauf ankommt.
 */

const WURZEL = path.resolve(import.meta.dirname, '..')
const lies = (datei: string): string => fs.readFileSync(path.join(WURZEL, '.github', 'workflows', datei), 'utf8').replace(/\r/g, '')
const DEPLOY = lies('deploy.yml')
const AUSROLLEN = lies('ausrollen.yml')

/** Die Schritte eines Jobs als Textblöcke — je ab `- name:` oder `- uses:` auf Schritt-Ebene. */
function schritte(yaml: string): string[] {
  return yaml.split(/\n(?= {6}- (?:name|uses):)/).slice(1)
}

describe('deploy.yml', () => {
  it('veröffentlicht erst nach dem Ausrollen', () => {
    expect(DEPLOY).toMatch(/\n {2}ausrollen:\n {4}needs: build\n(?: {4}if: .*\n)? {4}uses: \.\/\.github\/workflows\/ausrollen\.yml\n/)
    expect(DEPLOY).toMatch(/\n {2}deploy:\n {4}needs: \[build, ausrollen\]\n/)
  })

  it('rollt nur von main aus — „Run workflow" auf einem anderen Zweig erreicht die Produktion nicht', () => {
    expect(DEPLOY).toMatch(/\n {2}ausrollen:\n {4}needs: build\n {4}if: github\.ref == 'refs\/heads\/main'\n/)
    // Ohne Ausrollen auch kein Veröffentlichen: `deploy` darf das Überspringen nicht übergehen.
    const deployJob = DEPLOY.slice(DEPLOY.indexOf('\n  deploy:\n'))
    expect(deployJob).not.toMatch(/if: (?:always|!cancelled)\(\)/)
  })

  it('sperrt nicht über den ganzen Lauf — ein neuer Push bräche sonst das Ausrollen ab', () => {
    expect(DEPLOY).not.toMatch(/^concurrency:/m)
  })
})

describe('ausrollen.yml', () => {
  it('läuft nie doppelt und wird nie mittendrin abgebrochen', () => {
    expect(AUSROLLEN).toMatch(/concurrency:\n {6}group: supabase-ausrollen\n {6}cancel-in-progress: false\n/)
    expect(AUSROLLEN).not.toMatch(/cancel-in-progress: true/)
  })

  it('der Zugangstoken steht nur an Schritten, die die CLI rufen — nie an Job, Workflow oder npm ci', () => {
    const mitToken = schritte(AUSROLLEN).filter((s) => s.includes('secrets.SUPABASE_ACCESS_TOKEN'))
    expect(mitToken.length).toBeGreaterThan(3)
    for (const s of mitToken) expect(s, s.split('\n')[0]).toMatch(/npx --yes "\$SUPABASE_CLI"|ausrollen-pruefen\.mjs|SUPABASE_ACCESS_TOKEN" \]/)
    // Jede Nennung auf Schritt-Ebene (zehn Leerzeichen): keine darüber.
    for (const zeile of AUSROLLEN.split('\n').filter((z) => z.includes('secrets.SUPABASE_ACCESS_TOKEN'))) {
      expect(zeile).toMatch(/^ {10}SUPABASE_ACCESS_TOKEN: \$\{\{ secrets\.SUPABASE_ACCESS_TOKEN \}\}$/)
    }
    const npmCi = schritte(AUSROLLEN).find((s) => /run: npm ci\b/.test(s))
    expect(npmCi).toBeDefined()
    expect(npmCi).not.toMatch(/SUPABASE_ACCESS_TOKEN|secrets\./)
  })

  it('ruft die CLI in einer festen Version, nie ungenannt', () => {
    expect(AUSROLLEN).toMatch(/\n {2}SUPABASE_CLI: supabase@\d+\.\d+\.\d+\n/)
    expect(AUSROLLEN).not.toMatch(/npx (?:--yes )?supabase\b/)
  })

  it('prüft nach dem Ausrollen, ob die Produktion auf dem Stand des Commits steht', () => {
    const pruefen = schritte(AUSROLLEN).at(-1) ?? ''
    expect(pruefen).toMatch(/run: node scripts\/ausrollen-pruefen\.mjs/)
    expect(pruefen).toMatch(/if: steps\.plan\.outputs\.etwas == 'true'/)
  })
})
