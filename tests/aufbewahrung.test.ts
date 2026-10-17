import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SONST_WOCHEN, VERTEILUNG_WOCHEN } from '../src/data/aufbewahrung'
import { schluesselTeile } from '../supabase/functions/_shared/aufgaben-schluessel'

/**
 * **Nur so lange aufbewahren, wie es gebraucht wird** (T125, 16.10.2026).
 *
 * Die Fristen stehen zweimal: in der App (`src/data/aufbewahrung.ts`, danach
 * lädt sie) und in der Datenbank (`alte_daten_loeschen` in `schema.sql`, danach
 * räumt der wöchentliche Lauf). Liefen sie auseinander, lüde die App, was die
 * Datenbank längst gelöscht hat — oder die Datenbank behielte, was niemand mehr
 * lädt.
 *
 * Und jede Tabelle braucht eine Regel. Eine neue Tabelle mit Zeitbezug, die das
 * Aufräumen nicht kennt, sammelte still weiter — genau das, was nicht sein
 * soll. Deshalb wird die Liste aus dem Schema gelesen, nicht von Hand gepflegt:
 * Was keine Regel hat, braucht unten einen Grund.
 *
 * Gelesen wird der Quelltext — die SQL-Dateien laufen in keinem Test.
 */

const lies = (pfad: string): string =>
  readFileSync(fileURLToPath(new URL(pfad, import.meta.url)), 'utf8').split('\r\n').join('\n')
const SCHEMA = lies('../supabase/schema.sql')
const CRON = lies('../supabase/cron-aufraeumen.sql')

/** Der Rumpf von `alte_daten_loeschen`. */
const RUMPF = /create or replace function public\.alte_daten_loeschen\([\s\S]*?\n\$\$;/.exec(SCHEMA)?.[0] ?? ''

/** Die Regeln: `('tabelle', 'bedingung', grenze)` — die Tabelle ohne Schema heißt `public`. */
const REGELN = [...RUMPF.matchAll(/^\s+\('([\w.]+)', '((?:[^']|'')*)', (.+?)\),?$/gm)].map((m) => ({
  tabelle: m[1]!,
  bedingung: m[2]!.replaceAll("''", "'"),
  grenze: m[3]!.trim(),
}))

/** Jede Tabelle im Schema mit ihren Spalten. */
const IM_SCHEMA = [...SCHEMA.matchAll(/create table if not exists public\.(\w+)\s*\(([\s\S]*?)\n\);/g)].map(
  (m): [string, Set<string>] => [
    m[1]!,
    new Set(
      m[2]!
        .split('\n')
        .map((z) => /^\s+([a-z_]+)\s/.exec(z.replace(/--.*$/, ''))?.[1])
        .filter((s): s is string => Boolean(s) && !['primary', 'unique', 'constraint', 'foreign', 'check', 'references'].includes(s!)),
    ),
  ],
)

/**
 * **Was Supabase selbst anlegt** und darum nicht im Schema steht — mit den
 * Spalten aus den Migrationen von Supabase Auth. Ob eine Regel dort trifft,
 * zeigt erst der Probelauf in der Datenbank.
 */
const VON_SUPABASE: [string, Set<string>][] = [
  ['auth.audit_log_entries', new Set(['instance_id', 'id', 'payload', 'created_at', 'ip_address'])],
]

const TABELLEN = new Map([...IM_SCHEMA, ...VON_SUPABASE])

/**
 * **Was keine Frist hat — mit Grund.** Stammdaten haben kein Alter: Sie gelten,
 * bis jemand sie ändert oder entfernt.
 */
const OHNE_FRIST: Record<string, string> = {
  congregations: 'die Versammlung selbst und ihre Einstellungen',
  households: 'Haushalte der Personen — ein leerer geht mit seiner letzten Person',
  persons: 'wer zur Versammlung gehört — wer geht, entfernt der Admin',
  services: 'die Hilfsdienste',
  groups: 'die Gruppen',
  members: 'die Konten — eines geht mit seiner Person oder durch den Admin',
  push_subscriptions: 'die Geräte für Push — eines geht beim Abmelden oder wenn der Dienst es nicht mehr kennt',
  fs_rules: 'der Grundplan der Treffpunkte',
  trolleys: 'die Trolleys selbst — ihre Termine haben eine Frist',
}

describe('Aufräumen in der Datenbank', () => {
  it('die Regeln sind gelesen', () => {
    expect(RUMPF, 'alte_daten_loeschen nicht gefunden').not.toBe('')
    expect(REGELN.length).toBeGreaterThan(10)
  })

  it('die Fristen sind die der App: ein Jahr und acht Wochen ab dem Montag der laufenden Woche', () => {
    expect(RUMPF).toContain("montag constant date := date_trunc('week', current_date)::date;")
    expect(RUMPF).toContain(`ein_jahr constant timestamptz := (montag - 7 * ${VERTEILUNG_WOCHEN})::timestamptz;`)
    expect(RUMPF).toContain(`acht_wochen constant timestamptz := (montag - 7 * ${SONST_WOCHEN})::timestamptz;`)
  })

  it('ältere Abwesenheiten anderer lesen nur Admin und Planer — mit denselben acht Wochen (Review 17.10.2026)', () => {
    // Das Jahr braucht nur die Auswertung. Ein Verkündiger sieht wie vor dem
    // 17.10.2026 acht Wochen zurück, die eigenen Abwesenheiten ganz.
    const regel = /create policy absences_select on public\.absences[\s\S]*?\n {2}\);\n/.exec(SCHEMA)?.[0] ?? ''
    expect(regel, 'absences_select nicht gefunden').not.toBe('')
    expect(regel).toContain(`to_date >= date_trunc('week', current_date)::date - 7 * ${SONST_WOCHEN}`)
    expect(regel).toContain('or public.darf_zuteilen()')
    expect(regel).toContain('or user_id = auth.uid()')
    expect(regel).toContain('or (person_id is not null and person_id = public.my_person_id())')
  })

  it('jede Tabelle hat eine Regel oder einen Grund — und nicht beides', () => {
    const geregelt = new Set(REGELN.map((r) => r.tabelle))
    const offen = [...TABELLEN.keys()].filter((t) => !geregelt.has(t) && !(t in OHNE_FRIST))
    expect(offen, `ohne Regel und ohne Grund: ${offen.join(', ')}`).toEqual([])
    const doppelt = [...geregelt].filter((t) => t in OHNE_FRIST)
    expect(doppelt, `Regel und Grund zugleich: ${doppelt.join(', ')}`).toEqual([])
    const tot = [...geregelt, ...Object.keys(OHNE_FRIST)].filter((t) => !TABELLEN.has(t))
    expect(tot, `nicht im Schema: ${tot.join(', ')}`).toEqual([])
  })

  it('jede Regel fragt Spalten, die ihre Tabelle hat', () => {
    const falsch: string[] = []
    for (const { tabelle, bedingung } of REGELN) {
      const spalten = TABELLEN.get(tabelle) ?? new Set<string>()
      const gefragt = [...bedingung.matchAll(/\b([a-z_]+)\s*<\s*\$1|to_char\(([a-z_]+),|woche_im_schluessel\(([a-z_]+)\)/g)]
        .map((m) => m[1] ?? m[2] ?? m[3])
        .filter((s): s is string => Boolean(s))
      if (gefragt.length === 0) falsch.push(`${tabelle}: keine Spalte erkannt`)
      for (const s of gefragt) if (!spalten.has(s)) falsch.push(`${tabelle}.${s}`)
    }
    expect(falsch).toEqual([])
  })

  it('die Wochen und was zu ihnen gehört, Absagen und Abwesenheiten: ein Jahr — Mitteilungen und Termine: acht Wochen', () => {
    const frist = Object.fromEntries(REGELN.map((r) => [r.tabelle, r.grenze]))
    for (const t of ['weeks', 'fs_weeks', 'confirmations', 'assignment_log', 'gruppenbesuche', 'vortraege', 'plaene', 'plan_eintraege', 'absagen', 'absences']) {
      expect(frist[t], t).toBe('ein_jahr')
    }
    for (const t of ['notifications', 'reminder_log', 'trolley_termine', 'anmelde_links']) {
      expect(frist[t], t).toBe('acht_wochen')
    }
    expect(frist.anmelde_fehlversuche).toBe("now() - interval '1 day'")
  })

  it('der Grund einer Abwesenheit geht nach acht Wochen — der Zeitraum bleibt ein Jahr (17.10.2026)', () => {
    // Die Auswertung braucht, wer wann fehlte, über das Jahr; warum, braucht
    // niemand so lange.
    expect(RUMPF).toContain("update public.absences set reason = '' where to_date < acht_wochen and reason <> '';")
    expect(RUMPF).toContain("select count(*) into n from public.absences where to_date < acht_wochen and reason <> '';")
    expect(RUMPF).toContain("tabelle := 'absences.reason';")
  })

  it('auch das Anmelde-Protokoll von Supabase geht nach acht Wochen — der Lauf nimmt den Namen samt Schema', () => {
    // Je Anmeldung E-Mail und IP-Adresse (Betreiber 16.10.2026). Setzte der
    // Lauf `public.` vor jeden Namen, bräche er an dieser Tabelle ab — und mit
    // ihm jede andere Regel der Nacht.
    expect(REGELN.find((r) => r.tabelle === 'auth.audit_log_entries')?.grenze).toBe('acht_wochen')
    expect(RUMPF).toContain("execute format('delete from %s where %s', regel.name::regclass, regel.bedingung)")
    expect(RUMPF).not.toContain('public.%I')
  })

  it('aufräumen darf nur der Zeitplan — nicht anon, nicht ein angemeldetes Konto', () => {
    expect(RUMPF).toContain('language plpgsql security definer')
    expect(RUMPF).toContain('set search_path = public')
    expect(SCHEMA).toContain('revoke all on function public.alte_daten_loeschen(boolean) from public;')
    expect(SCHEMA).toContain('revoke all on function public.alte_daten_loeschen(boolean) from anon, authenticated;')
    expect(SCHEMA).not.toMatch(/grant execute on function public\.alte_daten_loeschen/)
  })

  it('der Zeitplan räumt einmal die Woche, montags, mit Löschen', () => {
    const plan = /cron\.schedule\(\s*'([^']+)',\s*'([^']+)',\s*\$\$(.*?)\$\$/s.exec(CRON)
    expect(plan?.[1]).toBe('jw-alte-daten-loeschen')
    const [, stunde, tag, monat, wochentag] = (plan?.[2] ?? '').split(/\s+/)
    // Montags rücken die Grenzen weiter — an jedem anderen Tag käme eine Woche
    // erst Tage später weg.
    expect([tag, monat, wochentag]).toEqual(['*', '*', '1'])
    expect(Number(stunde)).toBeGreaterThanOrEqual(0)
    // Ohne `true`: Der Probelauf zählt nur.
    expect(plan?.[3]?.trim()).toBe('select public.alte_daten_loeschen()')
  })
})

/**
 * **Die Woche im Schlüssel liest die Datenbank wie die App** — sonst räumte sie
 * die Zusagen einer Woche zu früh oder nie. Geprüft wird der reguläre Ausdruck
 * aus dem Schema gegen `schluesselTeile`, an jeder Form.
 */
describe('woche_im_schluessel', () => {
  const muster = /substring\(task_key from '([^']+)'\)/.exec(SCHEMA)?.[1] ?? ''
  const woche = (key: string): string | null => new RegExp(muster).exec(key)?.[1] ?? null

  it('das Muster ist gelesen', () => {
    expect(muster).not.toBe('')
  })

  it.each([
    '2026-09-07|mid|part|k3f9x|0',
    '2026-09-07|we|aux|k3f9x|1',
    '2026-09-07|mid|ratgeber',
    '2026-09-07|we|helper|mik|2',
    'fs|2026-09-07|inst-1',
  ])('%s', (key) => {
    expect(woche(key)).toBe(schluesselTeile(key)?.woche)
  })

  it('eine unbekannte Form hat keine Woche — dann zählt das Datum ihrer Zeile', () => {
    expect(woche('va|2026-09-07|v1')).toBeNull()
    expect(woche('kaputt')).toBeNull()
  })
})
