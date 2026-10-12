import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * **Eine Liste mit Klasse setzt den Einzug des Browsers zurück.**
 *
 * `<ul>` und `<ol>` bringen vom Browser 40 px Einzug am Anfang und eine Zeile
 * Abstand darüber und darunter mit. In der App ist eine Liste aber fast nie
 * eine Aufzählung, sondern eine Folge von Zeilen in einer Karte: die Spur, die
 * Legende der Besetzung, „Zu klären". Fehlt der Rücksetzer, rücken die Zeilen
 * um 40 px nach innen — gefunden am 13.10.2026 an „Zu klären" (T121), wo der
 * rote Punkt der Konflikte nicht mehr unter dem Rand der Karte stand.
 *
 * jsdom rechnet kein Layout, deshalb die Probe am Text: Jede Klasse, die als
 * erste an einem `<ul>`/`<ol>` steht, braucht eine Regel, die den Einzug
 * (`padding` oder `padding-inline-start`) und `list-style` setzt — dieselbe
 * Regel, damit beides zusammen geschieht.
 *
 * Steht außerhalb von `src/`, weil sie die Dateien als Text liest (wie
 * `css-klassen.test.ts`).
 */

const SRC = fileURLToPath(new URL('../src/', import.meta.url))

function dateien(dir: string, endung: RegExp): string[] {
  return readdirSync(dir).flatMap((name) => {
    const pfad = join(dir, name)
    if (statSync(pfad).isDirectory()) return dateien(pfad, endung)
    return endung.test(name) && !/\.test\./.test(name) ? [pfad] : []
  })
}

/** Quelltext ohne Kommentare — die dürfen Listen erwähnen. */
const ohneKommentare = (quelle: string): string => quelle.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

const listen = dateien(SRC, /\.tsx$/).flatMap((pfad) =>
  [...ohneKommentare(readFileSync(pfad, 'utf8')).matchAll(/<(ul|ol)\b[^>]*\bclassName="([^"\s]+)/g)].map((m) => ({
    datei: relative(SRC, pfad),
    klasse: m[2]!,
  })),
)

/** Alle Regeln als (Selektoren, Rumpf) — ohne Verschachtelung bis auf `@media`. */
const regeln = dateien(SRC, /\.css$/).flatMap((pfad) =>
  [...ohneKommentare(readFileSync(pfad, 'utf8')).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selektoren: m[1]!.split(',').map((s) => s.trim()),
    rumpf: m[2]!,
  })),
)

describe('Listen mit Klasse setzen den Einzug des Browsers zurück', () => {
  it('es gibt solche Listen — sonst prüfte die Probe nichts', () => {
    expect(listen.length).toBeGreaterThanOrEqual(4)
  })

  it.each(listen.map((l) => [`${l.datei}: .${l.klasse}`, l.klasse] as const))('%s', (_name, klasse) => {
    const eigene = regeln.filter((r) => r.selektoren.includes(`.${klasse}`))
    // Den Einzug bestimmt die Regel selbst — ganz weg oder bewusst gesetzt
    // (die Zeitleiste rückt für ihre Linie 20 px ein).
    const setztBeides = eigene.some(
      (r) => /(^|;|\s)padding(-inline-start|-left)?\s*:/.test(r.rumpf) && /list-style\s*:/.test(r.rumpf),
    )
    expect(setztBeides, `.${klasse} braucht eine Regel mit padding und list-style`).toBe(true)
  })
})
