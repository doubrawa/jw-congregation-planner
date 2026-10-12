import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ALTE_DUNKLE_SCHEMATA, FONT_SCALES, THEME_LIST } from '../src/data/constants'
import { APP_LANGS, isRTL } from '../src/i18n/langs'
import { palette } from './paletten'

/**
 * **Was `index.html` schon weiß, bevor die App startet — und woher es das weiß.**
 *
 * Vier Dinge stehen am `<html>`-Element, noch bevor React geladen ist:
 * Darstellung, Schriftgröße, Sprache und Schreibrichtung. Das ist kein Luxus,
 * sondern der Unterschied zwischen einer Seite, die richtig erscheint, und
 * einer, die sichtbar umklappt: Arabisch, Hebräisch, Persisch und Urdu würden
 * sonst erst von links nach rechts rendern und danach spiegeln.
 *
 * Der Preis: **Dieselben vier Tabellen stehen zweimal da** — einmal als
 * TypeScript in `src/`, einmal als handgeschriebenes Skript im HTML-Kopf, das
 * nichts importieren kann. Solche Doppelungen sind in diesem Projekt schon
 * zweimal die Fehlerursache gewesen (B8, T40), und sie fallen hier besonders
 * spät auf: Wer eine fünfte Rechts-nach-links-Sprache aufnimmt, sieht das
 * Umklappen nur, wenn er die App zufällig in genau dieser Sprache neu lädt.
 *
 * Diese Prüfung hält beide Fassungen zusammen. Sie ersetzt die Doppelung nicht
 * — die ist unvermeidlich —, aber sie macht das Auseinanderlaufen laut.
 */

const INDEX = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8')

/** Zeichenketten-Liste aus dem Vorab-Skript: `['a', 'b']` → ['a','b']. */
function listeNach(marke: string): string[] {
  const stelle = INDEX.indexOf(marke)
  if (stelle < 0) return []
  const start = INDEX.indexOf('[', stelle)
  const ende = INDEX.indexOf(']', start)
  if (start < 0 || ende < 0) return []
  return [...INDEX.slice(start + 1, ende).matchAll(/'([^']*)'/g)].map((m) => m[1] ?? '')
}

describe('Das Vorab-Skript kennt dieselben Sprachen wie die App', () => {
  /** Die Liste steht **vor** ihrem `.indexOf(lang)` — deshalb ein eigener Griff. */
  const rtlImHtml = (): string[] => {
    const m = /\[([^\]]*)\]\.indexOf\(lang\)/.exec(INDEX)
    return m ? [...(m[1] ?? '').matchAll(/'([^']*)'/g)].map((x) => x[1] ?? '') : []
  }

  it('die Rechts-nach-links-Liste stimmt mit RTL_LANGS überein', () => {
    const imHtml = rtlImHtml().sort()
    const imCode = APP_LANGS.map((l) => l.code)
      .filter((c) => isRTL(c))
      .sort()
    expect(imHtml, 'index.html kennt andere RTL-Sprachen als src/i18n/langs.ts').toEqual(imCode)
  })

  it('die Prüfung liest wirklich etwas aus dem HTML', () => {
    // Sonst verglichen beide Seiten leere Listen und wären immer gleich.
    expect(rtlImHtml().length).toBeGreaterThan(0)
  })

  it('das Skript setzt lang und dir vor dem ersten Paint', () => {
    expect(INDEX).toContain('documentElement.lang = lang')
    expect(INDEX).toContain('documentElement.dir')
  })

  it('es nimmt nur zweibuchstabige Codes an — wie sie in localStorage stehen', () => {
    /*
      `localStorage` ist Nutzerraum: Was dort steht, hat niemand geprüft. Der
      Wert landet ungefiltert in einem Attribut, deshalb der Ausdruck. Alle
      App-Sprachcodes müssen ihn passieren — sonst bliebe für eine von ihnen
      die Vorbelegung aus, und genau sie klappte beim Laden um.
     */
    const muster = /\/\^\[a-z\]\{2\}\$\//.test(INDEX)
    expect(muster, 'der Ausdruck für den gespeicherten Sprachcode fehlt').toBe(true)
    for (const { code } of APP_LANGS) {
      expect(/^[a-z]{2}$/.test(code), `${code} passiert die Prüfung im HTML nicht`).toBe(true)
    }
  })
})

describe('Und dieselbe Darstellung und dieselben Schriftgrößen', () => {
  it('die alten dunklen Farbschemata werden dort „dunkel" wie in asTheme', () => {
    const imHtml = listeNach("localStorage.getItem('theme')")
    expect(imHtml).toEqual([...ALTE_DUNKLE_SCHEMATA])
  })

  it('das Skript kennt die drei Darstellungen — Hell und Dunkel fest, sonst das Gerät', () => {
    const skript = INDEX.slice(INDEX.indexOf("localStorage.getItem('theme')"), INDEX.indexOf("localStorage.getItem('fontScale')"))
    expect(skript).toContain("stored === 'dunkel'")
    expect(skript).toContain("stored !== 'hell'")
    expect(skript).toContain("matchMedia('(prefers-color-scheme: dark)')")
    expect(THEME_LIST.map((t) => t.key).sort()).toEqual(['auto', 'dunkel', 'hell'])
  })

  it('die Statusleiste vor dem Laden hat den Grund der Palette (tokens.css)', () => {
    // Weicht er ab, blitzt beim Start eine andere Farbe auf, bis die App die
    // Statusleiste aus dem CSS richtigstellt (darstellung.ts).
    const grund = (modus: 'hell' | 'dunkel') => palette(modus).grund
    expect(INDEX).toContain(`dunkel ? '${grund('dunkel')}' : '${grund('hell')}'`)
    expect(INDEX).toContain(`<meta name="theme-color" content="${grund('hell')}" />`)
  })

  it('die Schriftgrößen-Stufen stimmen überein', () => {
    const imHtml = listeNach("localStorage.getItem('fontScale')")
    expect(imHtml).toEqual(FONT_SCALES.map(String))
  })
})
