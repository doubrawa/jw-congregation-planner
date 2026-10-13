import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ERINNERUNG_STUNDE_UTC } from '../supabase/functions/_shared/erinnerung.ts'

/**
 * **Die Stunde des täglichen Laufs steht zweimal** (T121, Phase 5g): als
 * Zeitplan in `supabase/cron-reminders.sql` — dort startet `send-reminders` —
 * und als `ERINNERUNG_STUNDE_UTC`, mit der die App in den Zusagen der Woche
 * sagt, wann die nächste Erinnerung von selbst hinausgeht. Wer den Zeitplan
 * verschiebt, ohne die Konstante mitzunehmen, lässt die App einen falschen Tag
 * nennen: „heute" für einen Lauf, der schon vorbei ist.
 *
 * Gelesen wird der Quelltext — die SQL-Datei läuft in keinem Test.
 */

const SQL = readFileSync(fileURLToPath(new URL('../supabase/cron-reminders.sql', import.meta.url)), 'utf8')

describe('Der tägliche Lauf und die App meinen dieselbe Stunde', () => {
  it('der Zeitplan ist täglich zur vollen Stunde, und es ist die der App', () => {
    const plan = /cron\.schedule\(\s*'[^']+',\s*'([^']+)'/.exec(SQL)?.[1]
    expect(plan, 'kein cron.schedule in cron-reminders.sql').toBeDefined()
    const [minute, stunde, tag, monat, wochentag] = (plan ?? '').split(/\s+/)
    expect([minute, tag, monat, wochentag]).toEqual(['0', '*', '*', '*'])
    expect(Number(stunde)).toBe(ERINNERUNG_STUNDE_UTC)
  })
})
