import { beforeAll, describe, expect, it } from 'vitest'
import { APP_LANGS } from '../i18n/langs'
import { dict, loadOverlay } from '../i18n/ui'
import { KONTAKT_MAIL, kontaktVerweis } from './kontakt'

/**
 * **Der Kontakt für eine neue Versammlung (T113): eine Adresse, und ein
 * Betreff, der ankommt.**
 *
 * Die Anmeldeseite nennt jedem, der ohne Einladung kommt, die Adresse des
 * Betreibers — eine Versammlung legt nur er an. Drei Dinge müssen dafür
 * halten, und keins davon sieht man der deutschen Anmeldeseite an:
 *
 * - Der Betreff kommt in **jeder** Sprache unversehrt an. Leerzeichen, breite
 *   Doppelpunkte, arabische und chinesische Schrift zerbrächen einen
 *   unkodierten Verweis; ein `&` in einer Übersetzung schnitte ihn still ab.
 * - Er trägt in jeder Sprache den **Namen der App**. Der Betreiber soll die
 *   Anfrage erkennen, auch wenn er ihre Schrift nicht lesen kann.
 * - Die Adresse steht an **einer** Stelle im Quelltext. In 34 Wörterbüchern
 *   liefe sie beim nächsten Wechsel auseinander, und eine vergessene Kopie
 *   schickte Anfragen an ein totes Postfach.
 */

beforeAll(async () => {
  await Promise.all(APP_LANGS.map(({ code }) => loadOverlay(code)))
})

describe('Der Betreff der Anfrage', () => {
  it('kommt in allen 34 Sprachen Zeichen für Zeichen so an, wie er übersetzt ist', () => {
    const verloren: string[] = []
    for (const { code } of APP_LANGS) {
      const betreff = dict(code).anfrageBetreff
      const url = new URL(kontaktVerweis(betreff))
      if (url.searchParams.get('subject') !== betreff) verloren.push(`${code}: ${url.searchParams.get('subject')}`)
    }
    expect(verloren).toEqual([])
  })

  it('steht nur kodiert im Verweis — keine rohe Schrift, kein Leerzeichen, das ein Mail-Programm abschneiden könnte', () => {
    const roh: string[] = []
    for (const { code } of APP_LANGS) {
      const verweis = kontaktVerweis(dict(code).anfrageBetreff)
      if (!/^[\x21-\x7e]+$/.test(verweis)) roh.push(`${code}: ${verweis}`)
    }
    expect(roh).toEqual([])
  })

  it('ein & oder # in einer Übersetzung schneidet ihn nicht ab', () => {
    const betreff = 'Fragen & Antworten #1: Versammlung.app'
    expect(new URL(kontaktVerweis(betreff)).searchParams.get('subject')).toBe(betreff)
  })

  it('trägt in jeder Sprache den Namen der App, damit der Betreiber die Anfrage auch in fremder Schrift erkennt', () => {
    const ohneName = APP_LANGS.map(({ code }) => code).filter(
      (code) => !dict(code).anfrageBetreff.includes('Versammlung.app'),
    )
    expect(ohneName).toEqual([])
  })

  it('geht an den Betreiber und an niemanden sonst', () => {
    const url = new URL(kontaktVerweis('Neue Versammlung: Versammlung.app'))
    expect(url.protocol).toBe('mailto:')
    expect(url.pathname).toBe(KONTAKT_MAIL)
    expect([...url.searchParams.keys()]).toEqual(['subject'])
  })
})

/* ---- Die Adresse steht an genau einer Stelle ----------------------------- */

/** Quelltext aller Dateien unter `src/` — über Vite, ohne Node-Abhängigkeit. */
const ROH = import.meta.glob('../**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/**
 * Auf `verzeichnis/datei.tsx` normiert. Vite kürzt Dateien **dieses**
 * Verzeichnisses auf `./name.ts` — wer nur `../` abschneidet, verliert sie
 * (derselbe Fallstrick wie in `beschriftungen-quelle.test.ts`).
 */
const QUELLEN = Object.entries(ROH)
  .map(([pfad, text]): [string, string] => [
    pfad.startsWith('./') ? `login/${pfad.slice(2)}` : pfad.replace(/^(\.\.\/)+/, ''),
    text,
  ])
  .filter(([pfad]) => !/\.test\.tsx?$/.test(pfad))

describe('Die Adresse des Betreibers', () => {
  it('steht im Quelltext nur in login/kontakt.ts — nicht in den Wörterbüchern, nicht als Kopie in der Anzeige', () => {
    const fundorte = QUELLEN.filter(([, text]) => text.includes(KONTAKT_MAIL)).map(([pfad]) => pfad)
    expect(fundorte).toEqual(['login/kontakt.ts'])
  })

  it('die Suche sieht die Wörterbücher und die Anmeldeseite wirklich — sonst bewiese sie nichts', () => {
    const pfade = QUELLEN.map(([pfad]) => pfad)
    expect(pfade).toContain('i18n/de.ts')
    expect(pfade).toContain('i18n/overlays/ja.ts')
    expect(pfade).toContain('login/LoginScreen.tsx')
  })
})
