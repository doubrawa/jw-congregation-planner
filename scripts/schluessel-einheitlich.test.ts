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

/**
 * Nur die Skripte, die wirklich mit der Datenbank reden.
 *
 * Erkannt an ihrer **Abhängigkeit**, nicht mehr an der Zeichenkette
 * `rest/v1`: Seit der Zugriff auf PostgREST in `gemeinsam.mjs` steht
 * (`restKlient`/`pruefKlient`), kommt die Adresse in den Skripten gar nicht
 * mehr vor — und die Probe, die sie danach suchte, sah plötzlich nur noch
 * vier von elf. Genau die Sorte Probe, die still aufhört zu messen.
 */
const REDET_MIT_DB =
  /rest\/v1|supabase\.co|\brestKlient\(|\bpruefKlient\(|\bzugangsdaten\(/
const MIT_DATENBANK = SKRIPTE.filter((f) => REDET_MIT_DB.test(readFileSync(join(dir, f), 'utf8')))

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
    // Elf Skripte reden mit der Datenbank; fällt die Zahl deutlich darunter,
    // misst die Erkennung nicht mehr, was sie soll.
    expect(MIT_DATENBANK.length).toBeGreaterThan(9)
  })

  it('keines baut den Zugriff auf PostgREST selbst', () => {
    /*
      Elf Skripte trugen dafür je eine eigene Closure — normalisiert vier
      verschiedene Fassungen, die also längst auseinandergelaufen waren: Nur
      eine erklärte den 401, zwei nannten im Fehlertext nicht einmal die
      Methode. Seit dem 19. September 2026 steht der Zugriff in `gemeinsam.mjs`.
    */
    const selbstgebaut = MIT_DATENBANK.filter((f) => {
      const quelle = readFileSync(join(dir, f), 'utf8')
      const code = quelle.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '')
      return /fetch\(`\$\{url\}\/rest\/v1\//.test(code)
    })
    expect(selbstgebaut, 'ruft PostgREST an restKlient/pruefKlient vorbei').toEqual([])
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

  it('wer eine Edge Function ruft, schickt funktionsKopf mit', () => {
    /*
      Die Probe darüber verbietet nur das **Selberbauen**. Durch sie kam
      `testversammlung-anlegen.mjs`, das bis zum 26.9.2026 den PostgREST-Kopf
      (`authKopf`) an `import-week` schickte — geschrieben, als der Schlüssel
      ein JWT war. Mit einem `sb_secret_…` fehlt darin `Authorization`, und
      genau daraus liest das Function-Gateway die Anmeldung. Zwei Ziele, zwei
      Regeln: Deshalb wird hier jede Aufrufstelle gefragt, was sie schickt.
    */
    const aufrufe: string[] = []
    for (const f of MIT_DATENBANK.filter((x) => !(x in AUSNAHMEN))) {
      const quelle = readFileSync(join(dir, f), 'utf8')
      const code = quelle.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '')
      // Je Aufruf die Adresse, dann das Init-Objekt bis zu seiner ersten `}`.
      const erkannt = [...code.matchAll(/\/functions\/v1\/[^`]*`\s*,\s*(\{[^}]*)/g)]
      for (const [, init] of erkannt) aufrufe.push(`${f}: ${/headers:\s*(\w+)/.exec(init ?? '')?.[1] ?? 'ohne headers'}`)
      // Eine Adresse, die das Muster nicht als Aufruf erkennt, fiele sonst still heraus.
      const stellen = code.match(/\/functions\/v1\//g)?.length ?? 0
      for (let i = erkannt.length; i < stellen; i++) aufrufe.push(`${f}: Aufruf nicht erkannt`)
    }
    // Ohne Treffer prüfte die Probe nichts — `import-week` rufen zwei Skripte.
    expect(aufrufe.length).toBeGreaterThanOrEqual(2)
    expect(aufrufe.filter((a) => !a.endsWith(': funktionsKopf')), 'Edge Function ohne funktionsKopf').toEqual([])
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

/**
 * **Und jedes fragt gleich, welche Versammlung gemeint ist.**
 *
 * Dieselbe Fehlerfamilie eine Etage tiefer: Sechs Skripte beantworteten
 * „`--cong` oder die erste Zeile?" je selbst, in fünf Fassungen — und drei
 * davon nahmen `--cong` auf Treu und Glauben, fragten die Datenbank also gar
 * nicht erst. Eine vertippte Id lief anstandslos durch: Jede folgende Abfrage
 * traf null Zeilen, jedes Schreiben ging ins Leere, und das Skript meldete am
 * Ende zufrieden, was es alles getan habe.
 *
 * Seit `versammlungHolen()` in `gemeinsam.mjs` steht, hält diese Probe die
 * Abschriften fern — sonst wüchse die nächste Fassung einfach nach.
 */
describe('Die Versammlung kommt aus versammlungHolen()', () => {
  /**
   * Wer die Tabelle selbst abfragt, mit Begründung.
   *
   * Die beiden RLS-Proben messen **Statuscodes** und dürfen deshalb nicht
   * werfen; `versammlungHolen` tut genau das. `neuaufbau-fahren` nimmt nur
   * Bestand auf und muss eine leere Datenbank aushalten, statt abzubrechen —
   * das ist der Normalfall vor Schritt 1.
   */
  const AUSNAHMEN: Record<string, string> = {
    'mandanten-nachweis.mjs': 'RLS-Probe: der Statuscode ist der Messwert, ein Wurf wäre der Abbruch',
    'mitgliedsrechte-probe.mjs': 'RLS-Probe: derselbe Grund',
    'neuaufbau-fahren.mjs': 'Bestandsaufnahme vor Schritt 1 — die leere Datenbank ist hier kein Fehler',
  }

  it('niemand baut die Abfrage selbst', () => {
    const selbst = SKRIPTE.filter((f) => {
      if (f in AUSNAHMEN) return false
      return /congregations\?select/.test(readFileSync(join(dir, f), 'utf8'))
    })
    expect(selbst, 'fragt congregations selbst ab statt über versammlungHolen()').toEqual([])
  })

  it('die Probe greift überhaupt — es gibt Aufrufer', () => {
    // Ohne diese Zeile wäre „niemand baut sie selbst" auch dann grün, wenn
    // kein Skript die Versammlung mehr ermittelte.
    const nutzer = SKRIPTE.filter((f) => /versammlungHolen\(/.test(readFileSync(join(dir, f), 'utf8')))
    expect(nutzer.length).toBeGreaterThanOrEqual(6)
  })

  it('jede Ausnahme steht mit Begründung da', () => {
    const da = new Set(SKRIPTE)
    expect(Object.keys(AUSNAHMEN).filter((f) => !da.has(f))).toEqual([])
    expect(Object.values(AUSNAHMEN).filter((g) => g.length < 20)).toEqual([])
  })
})
