import { describe, expect, it } from 'vitest'
import { RATGEBER_ROLLE } from '../data/aux-class'
import { ROLE_CIRCUIT, ROLE_GUEST_SPEAKER, ROLE_OWN_SPEAKER } from '../data/helpers'
import { FS_LEITER } from '../../supabase/functions/_shared/zuteilungen.ts'
import { APP_LANGS } from './langs'
import { bibelbuecherLaden, makeTr } from './translate'
import { dict, loadOverlay } from './ui'

for (const { code } of APP_LANGS) await loadOverlay(code)
await bibelbuecherLaden()

/**
 * **Rollen, die die App selbst schreibt, müssen der Fragment-Übersetzer kennen.**
 *
 * Zwei Wörterbücher, zwei Wege (siehe `i18n/translate.ts`): Was in der
 * Oberfläche steht, kommt aus dem App-Wörterbuch (`Dict`); was in einer
 * **Mitteilung** oder einem **Push** steht, kommt kanonisch deutsch aus der
 * Datenbank und wird Atom für Atom über FRAG übersetzt. Eine Rolle geht beide
 * Wege — und muss deshalb in beiden Tabellen stehen.
 *
 * Genau das war für „Treffpunkt-Leiter" nicht der Fall: Als einzige aller
 * Rollen fehlte sie in FRAG. Der Leiter las in „Meine Aufgaben" seine Sprache
 * und in der Glocke daneben Deutsch — und im Push erst recht, denn dort gibt es
 * keine zweite Gelegenheit zu übersetzen.
 *
 * Die Rollen aus dem Arbeitsheft (Vorsitz, Leser, Bibellesung …) stehen seit je
 * in FRAG; geprüft werden hier die, die **wir** vergeben.
 */
describe('Rollen der App im Fragment-Übersetzer', () => {
  /**
   * Die Rollen des **Imports** — aus seinem Quelltext gelesen, nicht
   * abgeschrieben. Kommt dort eine hinzu und fehlt sie in FRAG, fällt es hier
   * auf und nicht erst in einer fremdsprachigen Glocke.
   */
  const PARSE = import.meta.glob('../../supabase/functions/import-week/parse.ts', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>

  const importRollen = (): string[] => {
    const quelle = String(Object.values(PARSE)[0] ?? '')
    const gefunden = [...quelle.matchAll(/rolle: '([^']+)'/g)].map((m) => m[1]!)
    if (gefunden.length < 5) throw new Error(`Rollen im Import nicht gefunden (${gefunden.length})`)
    return [...new Set(gefunden)]
  }

  /** Rollen, die die App selbst in die Wochendaten bzw. Mitteilungen schreibt. */
  const ROLLEN = [
    ...new Set([
      ROLE_OWN_SPEAKER,
      ROLE_GUEST_SPEAKER,
      ROLE_CIRCUIT,
      RATGEBER_ROLLE,
      'Gesprächspartner',
      FS_LEITER,
      ...importRollen(),
    ]),
  ]

  const fremdsprachen = APP_LANGS.filter(({ code }) => code !== 'de')

  it('jede Sprache übersetzt jede von ihnen', () => {
    const luecken: string[] = []
    for (const { code } of fremdsprachen) {
      const tr = makeTr(code)
      for (const rolle of ROLLEN) if (tr(rolle) === rolle) luecken.push(`${code}: ${rolle}`)
    }
    expect(luecken, luecken.slice(0, 8).join(' | ')).toEqual([])
  })

  it('und „Treffpunkt-Leiter" genau so wie das App-Wörterbuch', () => {
    // Dieselbe Übersetzung liegt zweimal: `fsLeiterLbl` im Overlay (Oberfläche)
    // und `FS_LEADER_WORD` in `translate-data.ts` (Mitteilung, Push). Die
    // Edge-Laufzeit kommt nicht an `src/` heran, also ist die zweite Ablage
    // unvermeidlich — auseinanderlaufen darf sie trotzdem nicht.
    for (const { code } of APP_LANGS) {
      expect(makeTr(code)(FS_LEITER), code).toBe(dict(code).fsLeiterLbl)
    }
  })
})
