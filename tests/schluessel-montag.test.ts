import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fromIso, montagVon } from '../src/data/meeting-dates'
import { wochenTage } from '../src/trolleys/trolley-anzeige'
import { deutschesDatum } from '../supabase/functions/_shared/planung.ts'
import { trolleyRumpf } from '../supabase/functions/_shared/trolley.ts'

/**
 * **Trolleys: zwei Laufzeiten, ein Tag** (T121; bis zum 14.10.2026 dieselbe
 * Probe für die Schlüssel von Stand und Schicht, T120).
 *
 * Den Tag eines Termins lesen zwei Seiten:
 *
 * - der **Client** in Ortszeit — die Woche, in der er ihn zeigt
 *   (`montagVon`, `wochenTage`),
 * - die **Functions** in UTC — der Tag im Rumpf der Mitteilung und der
 *   Erinnerung am Vortag (`trolleyRumpf`).
 *
 * Auseinanderlaufen können sie nur an den Rändern: am Sonntag (in JavaScript
 * Tag 0), am Jahreswechsel, an den Zeitumstellungen und am Schalttag — und in
 * Zeitzonen weit weg von UTC, wo ein Datum, als UTC-Mitternacht gelesen,
 * örtlich noch der Vortag ist.
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
 * weit westlich (UTC−11).
 */
const ZONEN: Array<[zone: string, versatzMinuten: number]> = [
  ['Europe/Berlin', -60],
  ['UTC', 0],
  ['America/New_York', 300],
  ['Australia/Sydney', -660],
  ['Pacific/Kiritimati', -840],
  ['Pacific/Pago_Pago', 660],
]

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

  it.each(RAENDER)('%s → Woche ab %s (%s)', (tag, montag) => {
    // Die Ansicht zeigt den Tag in der Woche seines Montags …
    expect(montagVon(tag)).toBe(montag)
    expect(wochenTage(montag)).toContain(tag)
    // … und die Mitteilung nennt denselben Tag wie die App.
    expect(trolleyRumpf({ trolley: 'T', datum: tag, von: '10:00', bis: '12:00' })).toContain(deutschesDatum(fromIso(tag)))
  })

  it('Neujahr steht als Freitag in der Mitteilung, nicht als Donnerstag', () => {
    // Gegenprobe für die Gleichheit oben: zwei gleich falsche Seiten wären auch gleich.
    expect(trolleyRumpf({ trolley: 'T', datum: '2027-01-01', von: '10:00', bis: '12:00' })).toContain('Freitag, 1. Januar')
  })
})
