import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { argumente, secretKey, verdecktLesen, wertAusEnvDatei, wertAusEnvText, zeileGesetzt } from './gemeinsam.mjs'
import {
  KOMMENTAR,
  pruefen,
  SCHLUESSEL,
  schluesselAusArgument,
  schluesselAusText,
  zwischenablage,
} from './schluessel-setzen.mjs'

/**
 * **Der Schlüssel liegt ab jetzt in einer Datei — und darf dabei nichts
 * mitreißen.**
 *
 * `.env.local` trägt die Projekt-URL und den Publishable-Key; die App liest sie
 * beim Start. Ein Hinterlegen, das diese Datei umschreibt statt sie zu
 * ergänzen, nähme der App die Anbindung — und zwar lautlos, denn im Demo-Modus
 * läuft sie weiter. Geprüft wird deshalb nicht nur, dass die Zeile hinterher
 * dasteht, sondern vor allem, dass **daneben alles unverändert bleibt**.
 *
 * Die zweite Hälfte gilt der Prüfung am Projekt: Sie ist der Grund, warum der
 * häufigste Fehlgriff (der Publishable-Key aus derselben Datei) nicht mehr erst
 * beim ersten Schreibversuch auffliegt.
 */

const BEISPIEL = [
  '# Supabase-Anbindung',
  'VITE_SUPABASE_URL=https://abc123.supabase.co',
  'VITE_SUPABASE_ANON_KEY=sb_publishable_abcdefghijklmnop',
  '',
].join('\n')

const KEY = `sb_secret_${'AbCdEf0123456789'.repeat(2)}`

describe('zeileGesetzt', () => {
  it('hängt die Zeile an und lässt jede andere unverändert', () => {
    const neu = zeileGesetzt(BEISPIEL, SCHLUESSEL, KEY)

    expect(wertAusEnvText(neu, SCHLUESSEL)).toBe(KEY)
    // Die Zeilen der Vorlage stehen weiter da — Zeichen für Zeichen.
    for (const zeile of BEISPIEL.split('\n').filter(Boolean)) {
      expect(neu).toContain(zeile)
    }
    expect(wertAusEnvText(neu, 'VITE_SUPABASE_URL')).toBe('https://abc123.supabase.co')
  })

  it('ersetzt eine vorhandene Zeile, statt eine zweite anzuhängen', () => {
    /*
      Die Sabotageprobe dieser Datei. Hinge die neue Zeile unten an, läse
      `wertAusEnvText` weiter die **erste** — der rotierte Schlüssel wäre
      geschrieben und trotzdem wirkungslos, und der Fehler sähe aus wie ein
      abgelehnter Schlüssel im Dashboard.
    */
    const einmal = zeileGesetzt(BEISPIEL, SCHLUESSEL, 'sb_secret_alt_alt_alt_alt_alt')
    const zweimal = zeileGesetzt(einmal, SCHLUESSEL, KEY)

    expect(zweimal.split('\n').filter((z) => z.startsWith(`${SCHLUESSEL}=`))).toHaveLength(1)
    expect(wertAusEnvText(zweimal, SCHLUESSEL)).toBe(KEY)
    expect(zweimal).not.toContain('alt_alt')
  })

  it('schreibt den Kommentar nur beim Anlegen, nicht beim Ersetzen', () => {
    const einmal = zeileGesetzt('', SCHLUESSEL, KEY, KOMMENTAR)
    expect(einmal).toContain('# Secret-Schlüssel der Wartungsskripte')

    // Beim Ersetzen übergibt das Skript keinen Kommentar — sonst sammelte die
    // Datei bei jedem Rotieren eine weitere Abschrift desselben Hinweises.
    const zweimal = zeileGesetzt(einmal, SCHLUESSEL, `${KEY}x`)
    expect(zweimal.match(/# Secret-Schlüssel/g) ?? []).toHaveLength(1)
  })

  it('behält die Zeilenenden der Datei und schließt mit genau einem', () => {
    const windows = BEISPIEL.replace(/\n/g, '\r\n')
    const neu = zeileGesetzt(windows, SCHLUESSEL, KEY)

    expect(neu.endsWith('\r\n')).toBe(true)
    expect(neu.endsWith('\r\n\r\n')).toBe(false)
    expect(neu.split('\n').every((z, i, alle) => i === alle.length - 1 || z.endsWith('\r'))).toBe(true)
    // Und der Leser kommt mit dem CR zurecht, das dabei an jeder Zeile hängt.
    expect(wertAusEnvText(neu, SCHLUESSEL)).toBe(KEY)
  })

  it('verdoppelt eine Leerzeile am Ende nicht', () => {
    const neu = zeileGesetzt(`${BEISPIEL}\n\n\n`, SCHLUESSEL, KEY)
    expect(neu.endsWith(`${SCHLUESSEL}=${KEY}\n`)).toBe(true)
    expect(neu).not.toContain('\n\n\n')
  })
})

describe('wertAusEnvText', () => {
  it('liest über BOM, CR und Anführungszeichen hinweg', () => {
    // Genau das, was ein Editor unter Windows hinterlässt.
    const roh = `﻿# Kommentar\r\n${SCHLUESSEL}="${KEY}"\r\n`
    expect(wertAusEnvText(roh, SCHLUESSEL)).toBe(KEY)
  })

  it('verwechselt keine zwei Namen und meldet Fehlen als leer', () => {
    const roh = `${SCHLUESSEL}_ALT=falsch\nANDERER=${KEY}\n`
    expect(wertAusEnvText(roh, SCHLUESSEL)).toBe('')
    expect(wertAusEnvText(`# ${SCHLUESSEL}=auskommentiert\n`, SCHLUESSEL)).toBe('')
  })
})

describe('secretKey: Umgebung und Datei', () => {
  let verzeichnis = ''
  let datei = ''
  const vorher = { ...process.env }

  beforeEach(() => {
    verzeichnis = fs.mkdtempSync(path.join(os.tmpdir(), 'schluessel-'))
    datei = path.join(verzeichnis, '.env.local')
    delete process.env.SUPABASE_SECRET_KEY
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
  })

  afterEach(() => {
    fs.rmSync(verzeichnis, { recursive: true, force: true })
    process.env.SUPABASE_SECRET_KEY = vorher.SUPABASE_SECRET_KEY
    process.env.SUPABASE_SERVICE_ROLE_KEY = vorher.SUPABASE_SERVICE_ROLE_KEY
    if (!vorher.SUPABASE_SECRET_KEY) delete process.env.SUPABASE_SECRET_KEY
    if (!vorher.SUPABASE_SERVICE_ROLE_KEY) delete process.env.SUPABASE_SERVICE_ROLE_KEY
  })

  it('findet den Schlüssel in der Datei, wenn die Umgebung leer ist', () => {
    /*
      Der eigentliche Zweck des Umbaus vom 18.9.2026: Ein Aufruf ohne Terminal
      (Cron, zweites Werkzeug, eine Sitzung mit je frischer Shell) kann nicht
      fragen und erbt nichts. Fällt dieser Rückfall weg, bricht er wieder mit
      „kein Terminal zum Fragen" ab.
    */
    fs.writeFileSync(datei, zeileGesetzt('', SCHLUESSEL, KEY))
    expect(secretKey([datei])).toBe(KEY)
    expect(wertAusEnvDatei(SCHLUESSEL, [datei])).toBe(KEY)
  })

  it('lässt die Umgebung gewinnen', () => {
    // Wer für einen Lauf ein anderes Projekt bedient, darf nicht von der
    // hinterlegten Datei überstimmt werden.
    fs.writeFileSync(datei, zeileGesetzt('', SCHLUESSEL, KEY))
    process.env.SUPABASE_SECRET_KEY = 'sb_secret_aus_der_umgebung_1234'
    expect(secretKey([datei])).toBe('sb_secret_aus_der_umgebung_1234')
  })

  it('nimmt in der Datei auch den alten Namen', () => {
    fs.writeFileSync(datei, zeileGesetzt('', 'SUPABASE_SERVICE_ROLE_KEY', KEY))
    expect(secretKey([datei])).toBe(KEY)
  })

  it('bleibt leer, wenn weder Umgebung noch Datei etwas hergeben', () => {
    expect(secretKey([datei])).toBe('')
  })
})

describe('schluesselAusText (Zwischenablage)', () => {
  /*
    Der Weg für Konsolen, in die sich weder tippen noch die Befehlszeile
    bearbeiten lässt: kopieren, klicken. Was dabei ankommt, ist selten der
    nackte Wert — deshalb diese Proben.
  */
  it('nimmt den Wert samt Zeilenumbruch, wie er beim Kopieren mitkommt', () => {
    expect(schluesselAusText(`${KEY}\r\n`)).toBe(KEY)
  })

  it('streift Leerraum und Anführungszeichen ab', () => {
    expect(schluesselAusText(`  "${KEY}"  `)).toBe(KEY)
  })

  it('nimmt auch eine kopierte .env-Zeile', () => {
    expect(schluesselAusText(`${SCHLUESSEL}=${KEY}`)).toBe(KEY)
  })

  it('lässt ein = im Schlüssel selbst stehen', () => {
    // Nur was wie ein Variablenname aussieht, gilt als Name vor dem Wert.
    expect(schluesselAusText('sb_secret_ab=cd')).toBe('sb_secret_ab=cd')
  })

  it('bleibt leer, wenn nichts Brauchbares dasteht', () => {
    expect(schluesselAusText('   \n\n')).toBe('')
    expect(schluesselAusText(undefined)).toBe('')
  })
})

describe('zwischenablage', () => {
  it('gibt zurück, was der Systembefehl liefert', () => {
    expect(zwischenablage(() => ({ status: 0, stdout: `${KEY}\r\n` }))).toBe(`${KEY}\r\n`)
  })

  it('bleibt leer, wenn der Befehl scheitert oder fehlt', () => {
    // Kein Absturz: Der Aufrufer sagt dann, was stattdessen zu tun ist.
    expect(zwischenablage(() => ({ status: 1, stdout: '' }))).toBe('')
    expect(
      zwischenablage(() => {
        throw new Error('nicht gefunden')
      }),
    ).toBe('')
  })
})

describe('schluesselAusArgument', () => {
  /*
    `--key` ist der Weg für Konsolen, die einem **laufenden** Programm gar keine
    Eingabe durchreichen (Terminal-Panel der Desktop-App, 18.9.2026: die
    Aufforderung stand da, die Shell war gleichzeitig zurück an ihrem Prompt).
    Dort ist die Befehlszeile die einzige Stelle, an der sich etwas einfügen
    lässt.
  */
  it('nimmt den Wert von --key', () => {
    expect(schluesselAusArgument(argumente(['--key', KEY]))).toBe(KEY)
  })

  it('trimmt Leerraum, wie er beim Einfügen mitkommt', () => {
    expect(schluesselAusArgument(argumente(['--key', ` ${KEY} `]))).toBe(KEY)
  })

  it('wertet --key ohne Wert als nicht angegeben', () => {
    // `argumente()` macht aus einer Flagge `true`. Das ist ein Vertipper —
    // landete es als Wert in der Datei, stünde dort „SUPABASE_SECRET_KEY=true".
    expect(schluesselAusArgument(argumente(['--key']))).toBe('')
    expect(schluesselAusArgument(argumente(['--key', '--trocken']))).toBe('')
  })

  it('gibt ohne --key nichts zurück', () => {
    expect(schluesselAusArgument(argumente(['--trocken']))).toBe('')
  })
})

describe('verdecktLesen', () => {
  /*
    **Die Regression vom 18.9.2026.** Die Abfrage las eine Zeit lang einzelne
    Tasten im Rohmodus. Das eingebettete Terminal der Desktop-App reicht die
    nicht durch: Die Aufforderung stand da, ein eingefügter Schlüssel kam nie
    an, der Lauf hing. Über `readline` — wie vorher — ist ein Paste schlicht
    eine Zeile. Genau das messen diese beiden Proben, ohne ein Terminal zu
    brauchen.
  */
  const zeilenEnde = ['\n', '\r\n'] as const

  it.each(zeilenEnde)('nimmt eine eingefügte Zeile an (Ende %j)', async (ende) => {
    const ein = new PassThrough()
    const aus = new PassThrough()

    const gelesen = verdecktLesen({ ein, aus })
    ein.write(`${KEY}${ende}`)

    expect(await gelesen).toBe(KEY)
  })

  it('schreibt die Eingabe nicht zurück', async () => {
    // Eine Konsole, die Einzeltasten durchreicht (isTTY) — dort soll vom
    // Schlüssel nichts stehen bleiben.
    const ein = Object.assign(new PassThrough(), { isTTY: true, setRawMode: () => {} })
    const aus = new PassThrough()
    let geschrieben = ''
    aus.on('data', (stueck) => {
      geschrieben += String(stueck)
    })

    const gelesen = verdecktLesen({ ein, aus })
    ein.write(`${KEY}\r`)

    expect(await gelesen).toBe(KEY)
    expect(geschrieben).not.toContain(KEY)
    expect(geschrieben).not.toContain('sb_secret_')
  })
})

describe('pruefen', () => {
  const antwort = (status: number, text = '') => ({ status, text: () => Promise.resolve(text) })

  it('nimmt den Schlüssel an, wenn die REST-Wurzel antwortet', async () => {
    const gesehen: { url?: string; kopf?: Record<string, string> } = {}
    const holen = (url: string, init: { headers: Record<string, string> }) => {
      gesehen.url = url
      gesehen.kopf = init.headers
      return Promise.resolve(antwort(200, '{"openapi":"3.0"}'))
    }

    const ergebnis = await pruefen('https://abc123.supabase.co', KEY, holen)

    expect(ergebnis.ok).toBe(true)
    expect(gesehen.url).toBe('https://abc123.supabase.co/rest/v1/')
    // Der `sb_secret_…` gehört **nur** in `apikey` (siehe authKopf) — ein
    // Authorization-Header machte daraus ein „Invalid JWT".
    expect(gesehen.kopf).toEqual({ apikey: KEY })
  })

  it('erkennt den Publishable-Key an der Antwort der Plattform', async () => {
    const holen = () =>
      Promise.resolve(
        antwort(401, '{"message":"Secret API key required","hint":"Only secret API keys can be used for this endpoint."}'),
      )

    const ergebnis = await pruefen('https://abc123.supabase.co', 'sb_publishable_abcdefghijklmnop', holen)

    expect(ergebnis.ok).toBe(false)
    expect(ergebnis.meldung).toMatch(/Publishable/)
    expect(ergebnis.meldung).toMatch(/sb_secret_/)
  })

  it('meldet einen abgewiesenen Schlüssel mit den Worten des Servers', async () => {
    const holen = () => Promise.resolve(antwort(401, '{"message":"Invalid API key"}'))
    const ergebnis = await pruefen('https://abc123.supabase.co', 'sb_secret_falsch_falsch_falsch', holen)

    expect(ergebnis.ok).toBe(false)
    expect(ergebnis.meldung).toMatch(/Invalid API key/)
  })

  it('stirbt nicht an einem Netzfehler, sondern nennt ihn', async () => {
    const holen = () => Promise.reject(new Error('getaddrinfo ENOTFOUND'))
    const ergebnis = await pruefen('https://abc123.supabase.co', KEY, holen)

    expect(ergebnis.ok).toBe(false)
    expect(ergebnis.meldung).toMatch(/nicht erreichbar/)
    expect(ergebnis.meldung).toMatch(/ENOTFOUND/)
  })
})
