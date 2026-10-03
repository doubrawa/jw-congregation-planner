import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { vaTaskKey, vaTerminText } from '../src/data/auswaerts'
import { fromIso, tagNach } from '../src/data/meeting-dates'
import { ozDatum, ozSchicht, ozTaskKey, ozTerminText } from '../src/data/zeugnis'
import type { OzTermin } from '../src/data/types'
import {
  offeneVortraegeAuswaerts,
  offeneZeugnisEintraege,
  ozWoche,
} from '../supabase/functions/_shared/zuteilungen.ts'

/**
 * **Zeugnis und Vortrag: drei Laufzeiten, ein Montag** (T120).
 *
 * `oz|<montag>|<id>` und `va|<montag>|<id>` nennen den Montag der Woche, in der
 * der Tag liegt. Den bildet jede Laufzeit selbst:
 *
 * - der **Client** über die Ortszeit (`montagVon`: örtlicher Mittag, `setDate`),
 * - die **Functions** über UTC (`montagUndVersatz` in `_shared/zuteilungen.ts`)
 *   — dieselbe Rechnung liefert im Browser die Zahl am Knopf „Plan senden",
 *   läuft also auch in der Zeitzone des Planers,
 * - die **Datenbank** über `isodow` (`task_gehoert_mir` in `schema.sql`).
 *
 * Bilden zwei davon verschiedene Montage, schreibt der Bruder seine Zusage unter
 * einem Schlüssel, den die Datenbank für fremd hält, und das Bestätigen
 * scheitert an der Richtlinie. Oder die Function sucht die Zusage unter einem
 * anderen Schlüssel und erinnert weiter.
 *
 * Auseinanderlaufen können sie nur an den Rändern: am Sonntag (in JavaScript
 * Tag 0, in `isodow` Tag 7, in `dow` wieder 0), am Jahreswechsel, an den
 * Zeitumstellungen und am Schalttag. Dazu kommen Zeitzonen weit weg von UTC: Dort
 * ist ein Datum, als UTC-Mitternacht gelesen, örtlich noch der Vortag. Heute
 * stimmt alles; die Probe hält es fest (3.10.2026).
 */

/** Tag → Montag seiner Woche, von Hand nachgerechnet. */
const RAENDER: Array<[tag: string, montag: string, was: string]> = [
  ['2026-12-31', '2026-12-28', 'Donnerstag vor Neujahr'],
  ['2027-01-01', '2026-12-28', 'Neujahr, ein Freitag: die Woche beginnt im alten Jahr'],
  ['2027-01-03', '2026-12-28', 'Sonntag nach Neujahr'],
  ['2027-01-04', '2027-01-04', 'Montag nach Neujahr'],
  ['2026-10-25', '2026-10-19', 'Ende der Sommerzeit in Europa (Sonntag)'],
  ['2026-10-26', '2026-10-26', 'Montag danach'],
  ['2027-03-28', '2027-03-22', 'Beginn der Sommerzeit in Europa (Sonntag)'],
  ['2026-11-01', '2026-10-26', 'Ende der Sommerzeit in Nordamerika (Sonntag)'],
  ['2027-03-14', '2027-03-08', 'Beginn der Sommerzeit in Nordamerika (Sonntag)'],
  ['2026-10-04', '2026-09-28', 'Beginn der Sommerzeit in Australien (Sonntag)'],
  ['2027-04-04', '2027-03-29', 'Ende der Sommerzeit in Australien (Sonntag)'],
  ['2028-02-29', '2028-02-28', 'Schalttag'],
  ['2028-03-05', '2028-02-28', 'Sonntag nach dem Schalttag'],
]

/**
 * Zeitzonen, in denen ein Browser stehen kann — mit dem Versatz, den sie am
 * 1.1.2027 mittags haben. Mit und ohne Sommerzeit, weit östlich (UTC+14) und
 * weit westlich (UTC−11): Dort ist UTC-Mitternacht örtlich schon Mittag bzw.
 * noch der Vortag.
 */
const ZONEN: Array<[zone: string, versatzMinuten: number]> = [
  ['Europe/Berlin', -60],
  ['UTC', 0],
  ['America/New_York', 300],
  ['Australia/Sydney', -660],
  ['Pacific/Kiritimati', -840],
  ['Pacific/Pago_Pago', 660],
]

/** Ein Tag vor allen Rändern — nichts davon ist vorbei. */
const VORHER = Date.UTC(2026, 0, 1)

const termin = (wd: number): OzTermin => ({ id: 't1', wd, von: '10:00', bis: '12:00', ort: 'Marktplatz', plaetze: 2 })
const ozZeile = (datum: string) => ({ id: 'e1', termin_id: 't1', datum, person_id: 'p1', selbst: false })
const vaZeile = (datum: string) => ({ id: 'v1', datum, zeit: '10:00:00', versammlung: 'Beispielheim', person_id: 'p1' })
const NAMEN = new Map([['p1', 'Anna Beispiel']])

describe.each(ZONEN)('Zeitzone %s', (zone, versatzMinuten) => {
  const vorher = process.env.TZ
  beforeAll(() => {
    process.env.TZ = zone
  })
  afterAll(() => {
    if (vorher === undefined) delete process.env.TZ
    else process.env.TZ = vorher
  })

  it('die Zeitzone wirkt — sonst prüfte die Probe sechsmal dieselbe', () => {
    expect(new Date(2027, 0, 1, 12).getTimezoneOffset()).toBe(versatzMinuten)
  })

  it.each(RAENDER)('%s → %s (%s)', (tag, montag) => {
    // Client und Function nennen denselben Montag …
    expect(ozTaskKey({ id: 'e1', datum: tag })).toBe(`oz|${montag}|e1`)
    expect(vaTaskKey({ id: 'v1', datum: tag })).toBe(`va|${montag}|v1`)
    expect(ozWoche(tag)).toBe(montag)
    const [oz] = offeneZeugnisEintraege([ozZeile(tag)], [termin(fromIso(tag).getDay())], NAMEN, new Map(), VORHER)
    const [va] = offeneVortraegeAuswaerts([vaZeile(tag)], NAMEN, new Map(), VORHER)
    expect(oz?.key).toBe(`oz|${montag}|e1`)
    expect(va?.key).toBe(`va|${montag}|v1`)
    // … und denselben Termin: „Meine Aufgaben" und die Erinnerung lesen sich gleich.
    expect(oz?.eintrag.datum).toBe(ozTerminText(tag, termin(0)))
    expect(va?.eintrag.datum).toBe(vaTerminText({ datum: tag, zeit: '10:00', versammlung: 'Beispielheim' }))
  })

  it.each(RAENDER)('%s: eine Zusage aus dem Client kennt die Function', (tag) => {
    // Der Ablauf über die Grenze hinweg: Der Bruder bestätigt im Browser, der
    // Versand am nächsten Morgen sucht die Zusage — und erinnert nicht mehr.
    const zusagen = new Map([
      [ozTaskKey({ id: 'e1', datum: tag }), 'bestätigt'],
      [vaTaskKey({ id: 'v1', datum: tag }), 'bestätigt'],
    ])
    expect(offeneZeugnisEintraege([ozZeile(tag)], [termin(fromIso(tag).getDay())], NAMEN, zusagen, VORHER)).toEqual([])
    expect(offeneVortraegeAuswaerts([vaZeile(tag)], NAMEN, zusagen, VORHER)).toEqual([])
  })

  it('Neujahr steht als Freitag im Termin, nicht als Donnerstag', () => {
    // Gegenprobe für die Gleichheit oben: zwei gleich falsche Seiten wären auch gleich.
    expect(ozTerminText('2027-01-01', termin(5))).toBe('Freitag, 1. Januar · 10:00–12:00 · Marktplatz')
  })
})

/*
 * **Die Datenbank rechnet in SQL** — dort läuft kein Test. Gelesen wird deshalb
 * der Ausdruck selbst aus `schema.sql` und hier nachgerechnet, mit der einen
 * Eigenheit, auf die es ankommt: `dow` zählt den Sonntag als 0, `isodow` als 7.
 * Mit `dow` gehörte jeder Sonntag zur **folgenden** Woche — ein Bruder mit einer
 * Sonntagsschicht könnte sie nie bestätigen.
 */
const SCHEMA = readFileSync(join(process.cwd(), 'supabase/schema.sql'), 'utf8')

/**
 * Der Zweig von `task_gehoert_mir` für eine Schlüsselform — bis zu seinem
 * eigenen `end if;` am Zeilenanfang, nicht bis zum ersten (`if meine is null
 * then return false; end if;` steht gleich in der zweiten Zeile).
 */
function zweig(form: 'oz' | 'va'): string {
  const ab = SCHEMA.indexOf(`  if n = 3 and teile[1] = '${form}' then`)
  if (ab < 0) throw new Error(`Zweig für ${form}| in task_gehoert_mir nicht gefunden — Probe nachziehen`)
  return SCHEMA.slice(ab, SCHEMA.indexOf('\n  end if;', ab))
}

/** Eine Postgres-Wochentagszahl: `dow` 0 (So) … 6, `isodow` 1 (Mo) … 7 (So). */
function sqlWochentag(einheit: string, tag: string): number {
  const js = new Date(`${tag}T00:00:00Z`).getUTCDay()
  if (einheit === 'isodow') return js === 0 ? 7 : js
  if (einheit === 'dow') return js
  throw new Error(`unbekannte Einheit ${einheit}`)
}

/** `to_char(x.datum - (extract(<einheit> from x.datum)::int - <n>), 'YYYY-MM-DD') = teile[2]`, nachgerechnet. */
function sqlMontag(form: 'oz' | 'va', tag: string): string {
  const m = /to_char\((\w+)\.datum - \(extract\((\w+) from \1\.datum\)::int - (\d+)\), 'YYYY-MM-DD'\) = teile\[2\]/.exec(zweig(form))
  if (!m) throw new Error(`Montagsrechnung im Zweig ${form}| hat eine neue Form — Probe nachziehen`)
  return tagNach(tag, -(sqlWochentag(m[2]!, tag) - Number(m[3])))
}

describe('Datenbank: task_gehoert_mir bildet denselben Montag', () => {
  it.each(RAENDER)('%s → %s (%s)', (tag, montag) => {
    expect(sqlMontag('oz', tag)).toBe(montag)
    expect(sqlMontag('va', tag)).toBe(montag)
  })
})

/*
 * Derselbe Rand eine Stelle früher: Der Auslöser `oz_platz_pruefen` weist einen
 * Eintrag ab, dessen Tag nicht der Wochentag des Termins ist. Der Termin trägt
 * den Wochentag des Clients (0 = Sonntag). Rechnete die Datenbank hier mit
 * `isodow`, wiese sie jeden Eintrag an einem Sonntagstermin ab.
 */
describe('Datenbank: der Wochentag eines Eintrags zählt wie im Client', () => {
  const pruefung = /extract\((\w+) from new\.datum\)::int <> termin\.wd/.exec(SCHEMA)

  it('die Prüfung steht noch in dieser Form da', () => {
    expect(pruefung, 'oz_platz_pruefen hat eine neue Form — Probe nachziehen').not.toBeNull()
  })

  it.each(RAENDER)('%s (%s)', (tag, montag) => {
    const wd = fromIso(tag).getDay()
    // Der Client legt den Termin genau auf diesen Tag und nimmt ihn an …
    expect(ozDatum(montag, wd)).toBe(tag)
    expect(ozSchicht([termin(wd)], [], 't1', tag)).not.toBeNull()
    // … und die Datenbank auch.
    expect(sqlWochentag(pruefung![1]!, tag)).toBe(wd)
  })
})
