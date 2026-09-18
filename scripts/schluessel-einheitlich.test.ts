import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * **Jedes Skript holt den Schlüssel gleich — und schickt ihn gleich.**
 *
 * `gemeinsam.mjs` beantwortet beides an einer Stelle:
 *
 *  - `secretKey()` liest `SUPABASE_SECRET_KEY` und fällt auf den alten Namen
 *    `SUPABASE_SERVICE_ROLE_KEY` zurück — beide gehen weiter.
 *  - `authKopf(key)` entscheidet nach Schlüsselart, welche Kopfzeilen mitgehen:
 *    ein Legacy-JWT (`eyJ…`) in `apikey` **und** `Authorization`, der neue
 *    `sb_secret_…` laut Supabase-Doku **nur** in `apikey` — sonst liest die
 *    Plattform ihn als JWT und antwortet „Invalid JWT".
 *
 * **Warum das eine Probe braucht.** Es ist eine Entscheidung mit acht
 * Abschriften, und eine wich ab: `wochenplanung-importieren.mjs` las
 * `process.env.SUPABASE_SERVICE_ROLE_KEY` direkt und baute die Kopfzeilen
 * selbst. Gefunden am 17. September 2026 mitten im Neuaufbau — sieben Skripte
 * liefen mit dem gesetzten `SUPABASE_SECRET_KEY`, das achte meldete „Fehlt:
 * SUPABASE_SERVICE_ROLE_KEY". Wäre die Variable unter dem alten Namen gesetzt
 * gewesen, hätte es stattdessen den Schlüssel falsch verschickt, und der Fehler
 * wäre ein „Invalid JWT" ohne erkennbaren Zusammenhang gewesen.
 *
 * Dieselbe Fehlerfamilie wie die Listen, in die sich jeder neue Fall selbst
 * eintragen muss (`alle-plaetze.test.ts`, `versammlung-zuruecksetzen.test.ts`):
 * Das Gegenmittel ist nicht Sorgfalt, sondern eine Probe, die den Quelltext
 * liest.
 */

const dir = import.meta.dirname
const SKRIPTE = readdirSync(dir).filter((f) => f.endsWith('.mjs') && f !== 'gemeinsam.mjs')

/** Nur die Skripte, die wirklich mit der Datenbank reden. */
const MIT_DATENBANK = SKRIPTE.filter((f) =>
  /rest\/v1|supabase\.co/.test(readFileSync(join(dir, f), 'utf8')),
)

/**
 * Skripte, die den Schlüssel **absichtlich** nicht über `secretKey()` holen —
 * mit Begründung, damit eine Ausnahme eine Entscheidung bleibt und nicht ein
 * Versehen wird.
 */
const AUSNAHMEN: Record<string, string> = {
  'mandanten-nachweis.mjs':
    'misst die Mandantentrennung mit dem **anon**-Schlüssel und vergleicht ihn ausdrücklich gegen den Service-Role-Schlüssel',
  'mitgliedsrechte-probe.mjs':
    'dasselbe: sie muss aus der Sicht eines Mitglieds messen, nicht aus der des Dienstkontos',
}

describe('Alle Skripte holen den Schlüssel über secretKey()', () => {
  it('die Probe greift überhaupt', () => {
    expect(MIT_DATENBANK.length).toBeGreaterThan(5)
  })

  it('keines liest SUPABASE_SERVICE_ROLE_KEY aus der Umgebung', () => {
    const roh = MIT_DATENBANK.filter((f) => {
      if (f in AUSNAHMEN) return false
      const quelle = readFileSync(join(dir, f), 'utf8')
      return /process\.env\.SUPABASE_SERVICE_ROLE_KEY/.test(quelle)
    })
    expect(roh, 'holt den Schlüssel an gemeinsam.mjs vorbei').toEqual([])
  })

  it('keines baut die Anmelde-Kopfzeilen selbst', () => {
    // `Authorization: Bearer <secret>` ist der Fehler, den `authKopf` verhindert.
    const selbstgebaut = MIT_DATENBANK.filter((f) => {
      if (f in AUSNAHMEN) return false
      const quelle = readFileSync(join(dir, f), 'utf8')
      const code = quelle.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '')
      return /Authorization:\s*`Bearer/.test(code)
    })
    expect(selbstgebaut, 'setzt den Authorization-Header ohne authKopf').toEqual([])
  })

  it('keines holt sich URL und Schlüssel selbst zusammen', () => {
    /*
      **Der teuerste Fund des Neuaufbaus vom 17. September 2026.** Jedes Skript
      las `process.env.SUPABASE_URL` und `secretKey()` selbst und brach ab, wenn
      etwas fehlte — also musste vor jedem Lauf `$env:…` im **selben** Fenster
      stehen. Genau daran starben fünf Läufe hintereinander mit „Invalid API
      key", und die Meldung nennt die Ursache nicht.

      `rollen-nachtragen.mjs` konnte es längst besser: URL aus `.env.local`,
      Schlüssel notfalls erfragt. Es konnte es nur als **einziges**. Seit dem
      18. September steht der Weg in `gemeinsam.mjs` (`zugangsdaten()`), und
      diese Probe hält fest, dass ihn alle gehen.
    */
    const daneben = MIT_DATENBANK.filter((f) => {
      if (f in AUSNAHMEN) return false
      const quelle = readFileSync(join(dir, f), 'utf8')
      const code = quelle.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '')
      return /process\.env\.SUPABASE_URL/.test(code) || /\bsecretKey\(\)/.test(code)
    })
    expect(daneben, 'holt Zugangsdaten an zugangsdaten() vorbei').toEqual([])
  })

  it('jedes fragt nach dem Schlüssel, wenn keiner dasteht', () => {
    // Die Gegenprobe zur Zeile darüber: Nicht nur „nicht selbst", sondern auch
    // „überhaupt". Ein Skript, das gar keine Zugangsdaten holt, käme sonst
    // durch — und stürbe erst beim ersten Aufruf.
    const ohne = MIT_DATENBANK.filter((f) => {
      if (f in AUSNAHMEN) return false
      return !/zugangsdaten\(\)/.test(readFileSync(join(dir, f), 'utf8'))
    })
    expect(ohne, 'ruft zugangsdaten() nirgends').toEqual([])
  })

  it('jede Ausnahme steht mit Begründung da', () => {
    const da = new Set(SKRIPTE)
    expect(Object.keys(AUSNAHMEN).filter((f) => !da.has(f))).toEqual([])
    expect(Object.values(AUSNAHMEN).filter((g) => g.length < 20)).toEqual([])
  })
})
