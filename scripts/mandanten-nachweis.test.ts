import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { bewerteListe, bewerteSchreiben, LANDMARKEN, RLS_TABELLEN } from './mandanten-nachweis.mjs'

/**
 * Der Nachweis selbst kann nur gegen eine echte Datenbank laufen — was hier
 * geprüft wird, ist das, woran er **still scheitern** könnte: eine Tabelle, die
 * er gar nicht ansieht, und eine Bewertung, die Durchgelassenes für bestanden
 * hält. Beides wäre schlimmer als ein roter Lauf, denn es sähe grün aus.
 */

describe('Vollständigkeitsprobe: keine Tabelle mit RLS bleibt ungeprüft', () => {
  /*
    Von den Daten her gedacht, nicht von der Liste: Gefragt wird `schema.sql`,
    nicht das Skript. Wer eine Tabelle mit RLS hinzufügt und hier nichts
    einträgt, bekommt einen roten Test statt eines Nachweises, der die neue
    Tabelle stillschweigend auslässt.
  */
  it('jede Tabelle aus schema.sql steht in RLS_TABELLEN', () => {
    const schema = fs.readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8')
    const imSchema = [...schema.matchAll(/alter table public\.(\w+)\s+enable row level security/g)].map((m) => m[1])
    expect(imSchema.length).toBeGreaterThan(10)
    const geprueft = new Set(RLS_TABELLEN.map((t) => t.name))
    for (const name of new Set(imSchema)) {
      expect(`${name}: ${geprueft.has(name)}`).toBe(`${name}: true`)
    }
  })

  it('und umgekehrt steht in RLS_TABELLEN nichts Erfundenes', () => {
    const schema = fs.readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8')
    for (const t of RLS_TABELLEN) {
      expect(`${t.name}: ${schema.includes(`public.${t.name}`)}`).toBe(`${t.name}: true`)
    }
  })

  it('die Landmarken sind alle geprüfte Tabellen', () => {
    const geprueft = new Set(RLS_TABELLEN.map((t) => t.name))
    for (const name of LANDMARKEN) expect(`${name}: ${geprueft.has(name)}`).toBe(`${name}: true`)
  })

  it('reminder_log ist als gesperrt geführt — dort darf niemand etwas sehen', () => {
    expect(RLS_TABELLEN.find((t) => t.name === 'reminder_log')?.keineZeilen).toBe(true)
  })
})

describe('Eine Liste bewerten', () => {
  it('nur eigene Zeilen — bestanden', () => {
    const zeilen = [{ congregation_id: 'a' }, { congregation_id: 'a' }]
    expect(bewerteListe(zeilen, 'congregation_id', 'a')).toMatchObject({ ok: true, eigene: 2, fremd: 0 })
  })

  it('eine fremde Zeile genügt zum Durchfallen', () => {
    const zeilen = [{ congregation_id: 'a' }, { congregation_id: 'b' }]
    expect(bewerteListe(zeilen, 'congregation_id', 'a')).toMatchObject({ ok: false, fremd: 1 })
  })

  it('leer ist bestanden — und wird als 0 eigene ausgewiesen, nicht als „geprüft"', () => {
    expect(bewerteListe([], 'congregation_id', 'a')).toMatchObject({ ok: true, eigene: 0, fremd: 0 })
  })

  it('gesperrte Tabellen dürfen gar nichts liefern — auch nichts Eigenes', () => {
    expect(bewerteListe([], 'congregation_id', 'a', true).ok).toBe(true)
    expect(bewerteListe([{ congregation_id: 'a' }], 'congregation_id', 'a', true).ok).toBe(false)
  })
})

describe('Eine Schreibprobe bewerten', () => {
  it('ein Urteil der Richtlinien heißt abgewiesen: 403 beim RLS-Verstoß, 401 ohne Anmeldung', () => {
    expect(bewerteSchreiben(403, { message: 'row-level security' }).ok).toBe(true)
    expect(bewerteSchreiben(401, null).ok).toBe(true)
  })

  /*
    Bis zum 26.9.2026 galt hier jeder Status ab 400 als „abgewiesen". Ein
    Einfügeversuch mit einer vertippten Spalte bekommt aber 400 (PGRST204) —
    er hat die Trennung nie berührt und bestand trotzdem. Ein 409 (verletzte
    Bedingung) oder ein 5xx sagt ebenso wenig über die Richtlinien.
  */
  it('ein 400 ist kein Urteil — die Probe ist kaputt, nicht bestanden', () => {
    const e = bewerteSchreiben(400, { code: 'PGRST204', message: "Could not find the 'rolle' column" })
    expect(e.ok).toBe(false)
    expect(e.wie).toMatch(/PROBE KAPUTT \(400\)/)
  })

  it('ebenso jeder andere Fehlerstatus außerhalb von 401 und 403', () => {
    for (const status of [404, 409, 500, 503]) {
      expect(`${status}: ${bewerteSchreiben(status, null).ok}`).toBe(`${status}: false`)
    }
  })

  it('null getroffene Zeilen heißen ebenfalls abgewiesen', () => {
    expect(bewerteSchreiben(200, []).ok).toBe(true)
  })

  it('aber eine geschriebene Zeile ist ein Durchfall — auch bei Status 201', () => {
    const e = bewerteSchreiben(201, [{ id: 'x' }])
    expect(e.ok).toBe(false)
    expect(e.wie).toMatch(/DURCHGELASSEN/)
  })

  it('und eine einzelne Zeile ohne Array zählt auch', () => {
    expect(bewerteSchreiben(200, { id: 'x' }).ok).toBe(false)
  })
})
