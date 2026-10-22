import { describe, expect, it } from 'vitest'
import { LOGO_GROSS } from '../src/bausteine/logo-form'
import { cssDateien, cssRegeln, deklarationen } from './css-quellen'

/**
 * **Die Plätze füllen sich im Startbild** (22.10.2026, im Stil des Clips „Erste
 * Schritte"; bis dahin lief eine Welle durch die Reihen).
 *
 * Solange die App lädt, wird der Saal des Logos blass und füllt sich dann vom
 * Pult aus (`Startbild.tsx`, `shell.css`). Diese Regeln halten es ruhig und
 * lesbar:
 *
 *  - **Immer wieder**, solange geladen wird — nicht nur einmal.
 *  - **Der ganze Saal zugleich blass, dann Reihe für Reihe voll**, vorn zuerst.
 *    Sonst blinkte das Logo als Ganzes, statt dass es sich vom Pult aus füllt.
 *  - **In jeder Reihe von der Mitte nach außen**, vom Pult weg.
 *  - **Der leere Platz bleibt, bis der volle ihn deckt**, und ruhig ist er
 *    fort: Die hinteren Reihen sind durchscheinend, ein leerer Platz darunter
 *    machte sie kräftiger als im Logo.
 *  - **Ohne Bewegung hängt keine Animation am Logo**, auch keine auf einen
 *    Augenblick gekürzte: Schon das Anhängen änderte die Kanten der Plätze.
 *  - **„Lädt …" ist nie zu sehen**, auch ohne Bewegung nicht — der Betreiber
 *    wollte das Wort nicht mehr im Startbild (22.10.2026).
 *
 * Dass es erst nach einer halben Sekunde beginnt, prüft
 * `startbild-vorab.test.tsx` am Startbild selbst. jsdom rechnet kein CSS, und
 * unter vitest kommt es leer an. Gesichert ist hier, dass die Regeln dastehen,
 * die es im Browser richten.
 */

const DATEI = 'app/shell.css'
const CSS = Object.fromEntries(cssDateien())[DATEI] ?? ''

/**
 * Die Reihen des großen Logos, von vorn gezählt ab 1, mit der Zahl ihrer
 * Plätze — aus `logo-form.ts`, nicht abgeschrieben: Bekäme das Logo eine
 * Reihe mehr, fehlten ihr in `shell.css` die Abläufe, und sie füllte sich nie.
 */
const REIHEN = LOGO_GROSS.reihen.map((plaetze, i) => ({ reihe: i + 1, plaetze: plaetze.length }))

/** Zeitangaben einer Deklaration in Millisekunden, in ihrer Reihenfolge. */
function zeiten(wert: string): number[] {
  return [...wert.matchAll(/(\d+(?:\.\d+)?)(ms|s)\b/g)].map(([, zahl, einheit]) => Number(zahl) * (einheit === 's' ? 1000 : 1))
}

/** Der Wert einer Eigenschaft in einer Regel. */
function wert(regel: string, eigenschaft: string): string {
  return new RegExp(`^\\s*${eigenschaft}:\\s*([^;]+);`, 'm').exec(regel)?.[1]?.trim() ?? ''
}

/** Die Schritte eines `@keyframes` in `shell.css`: ihre Stellen in Prozent und ihre Deklarationen. */
function schritte(name: string): Array<{ bei: number[]; rumpf: string }> {
  const kopf = `@keyframes ${name} {`
  const ab = CSS.indexOf(kopf)
  expect(ab, `${kopf} in ${DATEI}`).toBeGreaterThanOrEqual(0)
  // Der Block endet an der ersten Klammer am Zeilenanfang; die der Schritte sind eingerückt.
  const block = CSS.slice(ab + kopf.length, CSS.indexOf('\n}', ab))
  return [...block.matchAll(/([\d.%,\s]+)\{([^}]*)\}/g)].map(([, stellen = '', rumpf = '']) => ({
    bei: stellen.split(',').map((s) => Number.parseFloat(s)),
    rumpf,
  }))
}

/** Die Stellen der Schritte, deren `eigenschaft` den Wert `ist` trägt. */
function stellen(name: string, eigenschaft: string, ist: (w: string) => boolean): number[] {
  return schritte(name)
    .filter((s) => ist(wert(s.rumpf, eigenschaft)))
    .flatMap((s) => s.bei)
}

/** Ab wann der volle Platz einer Reihe ganz blass ist (Deckkraft 0). */
function blass(reihe: number): number {
  return Math.min(...stellen(`startbild-voll-${reihe}`, 'opacity', (w) => w === '0'))
}

/** Von wo bis wo der volle Platz einer Reihe aus dem Nichts (`scale(0)`) wieder ganz wird. */
function wachsen(reihe: number): { ab: number; bis: number } {
  const name = `startbild-voll-${reihe}`
  const ab = Math.max(...stellen(name, 'transform', (w) => w === 'scale(0)'))
  const bis = Math.min(...stellen(name, 'transform', (w) => w === 'scale(1)').filter((b) => b > ab))
  return { ab, bis }
}

/** Von wann bis wann der leere Platz einer Reihe ganz zu sehen ist, ab wann er fort ist und wie er den Takt beendet. */
function leer(reihe: number): { sichtbarAb: number; sichtbarBis: number; fortAb: number; amEnde: string } {
  const name = `startbild-leer-${reihe}`
  const sichtbar = stellen(name, 'opacity', (w) => Number(w) > 0)
  const sichtbarBis = Math.max(...sichtbar)
  const fortAb = Math.min(...stellen(name, 'opacity', (w) => w === '0').filter((b) => b > sichtbarBis))
  const amEnde = wert(schritte(name).find((s) => s.bei.includes(100))?.rumpf ?? '', 'opacity')
  return { sichtbarAb: Math.min(...sichtbar), sichtbarBis, fortAb, amEnde }
}

describe('Die Plätze füllen sich', () => {
  it('immer wieder — solange geladen wird, nicht nur einmal', () => {
    expect(wert(deklarationen(DATEI, '.startbild-fuellen .logo-platz circle'), 'animation-iteration-count')).toBe('infinite')
  })

  it('jede Reihe des Logos hat ihre Abläufe — für die leeren und für die vollen Plätze', () => {
    expect(REIHEN.length).toBeGreaterThan(1)
    for (const { reihe } of REIHEN) {
      for (const art of ['leer', 'voll']) {
        const regel = deklarationen(DATEI, `.startbild-fuellen .logo-platz:nth-of-type(${reihe}) .logo-${art} circle`)
        expect(wert(regel, 'animation-name'), `Reihe ${reihe}, ${art}`).toBe(`startbild-${art}-${reihe}`)
      }
    }
  })

  it('der ganze Saal wird zugleich blass — jede Reihe gleich früh', () => {
    const vorn = blass(1)
    expect(Number.isFinite(vorn), 'die erste Reihe wird blass').toBe(true)
    for (const { reihe } of REIHEN) expect(blass(reihe), `Reihe ${reihe}`).toBe(vorn)
  })

  it('erst danach füllt er sich, Reihe für Reihe nach hinten', () => {
    const jeReihe = REIHEN.map(({ reihe }) => wachsen(reihe))
    expect(jeReihe[0]?.ab, 'die erste Reihe wächst, wenn der Saal blass ist').toBeGreaterThanOrEqual(blass(1))
    for (let i = 1; i < jeReihe.length; i++) expect(jeReihe[i]?.ab, `Reihe ${i + 1}`).toBeGreaterThan(jeReihe[i - 1]?.ab ?? 0)
    for (const reihe of jeReihe) expect(reihe.bis).toBeGreaterThan(reihe.ab)
  })

  it('in jeder Reihe von der Mitte nach außen — je weiter außen, desto später', () => {
    const regeln = cssRegeln(CSS)
    // Die Verzögerung der Plätze mit diesem Abstand vom Rand (1 = ganz außen).
    const verzoegerung = (reihe: number, vonAussen: number): number => {
      const stelle = vonAussen === 1 ? ':is(:first-child, :last-child)' : `:is(:nth-child(${vonAussen}), :nth-last-child(${vonAussen}))`
      const selektor = `.startbild-fuellen .logo-platz:nth-of-type(${reihe}) circle${stelle}`
      const regel = regeln.find((r) => r.selektoren.includes(selektor) && r.deklarationen.some(([e]) => e === 'animation-delay'))
      return zeiten(regel?.deklarationen.find(([e]) => e === 'animation-delay')?.[1] ?? '0ms')[0] ?? 0
    }
    // Je Reihe die halbe Zahl ihrer Plätze: so viele Abstände vom Rand bis zur Mitte.
    for (const { reihe, plaetze } of REIHEN) {
      expect(plaetze % 2, `Reihe ${reihe}: eine gerade Zahl Plätze, die Mitte sind zwei`).toBe(0)
      const jeAbstand = Array.from({ length: plaetze / 2 }, (_, i) => verzoegerung(reihe, i + 1))
      expect(jeAbstand.at(-1), `Reihe ${reihe}: die Mitte zuerst`).toBe(0)
      for (let i = 1; i < jeAbstand.length; i++) {
        expect(jeAbstand[i - 1] ?? 0, `Reihe ${reihe}: ${jeAbstand.join(' / ')} ms von außen`).toBeGreaterThan(jeAbstand[i] ?? 0)
      }
    }
  })

  it('der leere Platz steht, solange der volle fehlt, und geht, wenn der volle ihn deckt', () => {
    for (const { reihe } of REIHEN) {
      const { ab, bis } = wachsen(reihe)
      const platz = leer(reihe)
      expect(platz.sichtbarAb, `Reihe ${reihe}: da, wenn der volle blass ist`).toBeLessThanOrEqual(blass(reihe))
      expect(platz.sichtbarBis, `Reihe ${reihe}: noch da, wenn der volle zu wachsen beginnt`).toBeGreaterThan(ab)
      expect(platz.fortAb, `Reihe ${reihe}: fort, wenn der volle ganz da ist`).toBeLessThanOrEqual(bis)
      expect(platz.amEnde, `Reihe ${reihe}: fort bis zum nächsten Takt`).toBe('0')
    }
  })

  it('ruhig ist der leere Platz fort — das Logo steht wie in den Dateien', () => {
    expect(wert(deklarationen('bausteine/bausteine.css', '.logo-leer circle'), 'opacity')).toBe('0')
  })
})

describe('Ohne Bewegung', () => {
  it('hängt keine Animation am Logo — jede Regel des Füllens gilt nur mit Bewegung', () => {
    // Die Regel „Bewegung sparsam" kürzte die Abläufe zwar auf einen
    // Augenblick, doch schon das Anhängen glättete die Kanten der Kreise anders:
    // Das ruhige Bild hätte nach einer halben Sekunde einmal gezuckt.
    const regeln = cssRegeln(CSS).filter((r) => r.selektoren.some((s) => s.includes('.startbild-fuellen')))
    expect(regeln.length, 'Regeln des Füllens').toBeGreaterThan(0)
    for (const regel of regeln) {
      expect(regel.abfragen, `${regel.selektoren.join(', ')} (Zeile ${regel.zeile})`).toContain('(prefers-reduced-motion: no-preference)')
    }
  })
})

describe('„Lädt …" im Startbild', () => {
  it('holt keine Regel hervor — weder mit noch ohne Bewegung', () => {
    // Das Wort trägt nur `sr-only` (startbild-vorab.test.tsx). Zu sehen wäre es
    // nur durch eine Regel, die es im Startbild anspricht — bis zum 22.10.2026
    // tat das eine für „Bewegung reduzieren".
    const ansprechen = /\.startbild\b[^,]*\s(p|\.sr-only|\.startbild-text)\b/
    const treffer = cssDateien().flatMap(([datei, text]) =>
      cssRegeln(text).flatMap((r) => r.selektoren.filter((s) => ansprechen.test(s)).map((s) => `${datei}: ${s}`)),
    )
    expect(treffer).toEqual([])
  })
})

describe('Das Logo im Startbild', () => {
  it('steht genau zwischen den sicheren Rändern', () => {
    // Drei Zeilen, die äußeren gleich: Das Logo steht genau zwischen den
    // sicheren Rändern, wie Android es zwischen Status- und Bedienleiste mittelt.
    expect(wert(deklarationen(DATEI, '.startbild'), 'grid-template-rows')).toBe('minmax(0, 1fr) auto minmax(0, 1fr)')
    expect(wert(deklarationen(DATEI, '.startbild-logo'), 'grid-row')).toBe('2')
  })
})
