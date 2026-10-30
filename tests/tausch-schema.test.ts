import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * **Die Tausch-Anfragen in der Datenbank** (T153): Lesen dürfen nur die beiden,
 * um die es geht; schreiben darf kein Mitglied — nur die Edge Function
 * `tauschen` mit der Dienstrolle. Und zwei Wochen ändert nur sie, ganz oder gar
 * nicht (`wochen_tauschen`).
 */
const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8')

const richtlinien = [...schema.matchAll(/create policy (\w+) on public\.tausch_anfragen\s+for (\w+)([\s\S]*?);\n/g)]

describe('tausch_anfragen', () => {
  it('RLS an, jedes Recht entzogen und nur das Lesen zurückgegeben', () => {
    expect(schema).toContain('alter table public.tausch_anfragen enable row level security;')
    const entzug = schema.indexOf('revoke all on public.tausch_anfragen from anon, authenticated;')
    const gabe = schema.indexOf('grant select on public.tausch_anfragen to authenticated;')
    expect(entzug).toBeGreaterThan(-1)
    expect(gabe).toBeGreaterThan(entzug)
    expect([...schema.matchAll(/grant [^;]*on public\.tausch_anfragen\b[^;]*;/g)]).toHaveLength(1)
  })

  it('eine einzige Richtlinie, zum Lesen — für den Fragenden und den Gefragten, in der eigenen Versammlung', () => {
    expect(richtlinien.map((r) => [r[1], r[2]])).toEqual([['tausch_anfragen_select', 'select']])
    const rumpf = richtlinien[0]?.[3] ?? ''
    expect(rumpf).toMatch(/congregation_id = public\.my_congregation_id\(\)/)
    expect(rumpf).toMatch(/von_user = auth\.uid\(\)/)
    expect(rumpf).toMatch(/von_person = public\.my_person_id\(\)/)
    expect(rumpf).toMatch(/an_person = public\.my_person_id\(\)/)
    expect(rumpf).not.toMatch(/darf_zuteilen|is_planner/)
  })

  it('je abgegebenem Platz eine Anfrage, und nie ein Platz gegen sich selbst', () => {
    const tabelle = /create table if not exists public\.tausch_anfragen \(([\s\S]*?)\n\);/.exec(schema)?.[1] ?? ''
    expect(tabelle).toMatch(/unique \(congregation_id, gibt_ab\)/)
    expect(tabelle).toMatch(/nimmt <> gibt_ab/)
  })

  it('was vorbei ist, räumt das Aufräumen ab', () => {
    expect(schema).toMatch(/\('tausch_anfragen', 'bis < \$1', montag::timestamptz\)/)
  })

  it('die Glocken-Zeile „Tausch angefragt" geht mit ihrer Anfrage — gleich, wer sie löscht (Review 30.10.2026)', () => {
    // Die Zeile trägt `tausch|<id>`, keinen Platz: Die App sieht ihr nicht an,
    // wann sie vorbei ist. Ohne den Trigger blieb sie nach dem Aufräumen am
    // Montag oder dem Löschen einer Person acht Wochen in der Glocke.
    expect(schema).toMatch(/create trigger tausch_anfragen_glocke\s+after delete on public\.tausch_anfragen\s+for each row execute function public\.tausch_glocke_loeschen\(\);/)
    const funktion = /create or replace function public\.tausch_glocke_loeschen\(\)[\s\S]*?end \$\$;/.exec(schema)?.[0] ?? ''
    // Die Dienstrolle des Eigentümers: Löscht der Admin eine Person, stünde die
    // Zeile des Gefragten sonst hinter der Richtlinie der Mitteilungen.
    expect(funktion).toContain('security definer')
    expect(funktion).toContain('set search_path = public')
    expect(funktion).toMatch(/delete from public\.notifications\s+where congregation_id = old\.congregation_id and task_key = 'tausch\|' \|\| old\.id;/)
    expect(schema).toContain('revoke all on function public.tausch_glocke_loeschen() from anon, authenticated;')
    // Dass die Function genau diese Kennung in die Glocke schreibt, prüft
    // `supabase/functions/_test/tauschen.test.ts` („… Jonas bekommt Glocke und Push").
  })
})

describe('wochen_tauschen', () => {
  const funktion = /create or replace function public\.wochen_tauschen\([\s\S]*?end \$\$;/.exec(schema)?.[0] ?? ''

  it('jede Woche nur auf ihrem gelesenen Stand — trifft eine nicht, bricht die ganze Anweisung ab', () => {
    expect(funktion.match(/and w\.updated_at = p_stand_[ab];/g)).toHaveLength(2)
    expect(funktion.match(/if n = 0 then raise exception/g)).toHaveLength(2)
    expect(funktion).toMatch(/if p_woche_a = p_woche_b then\s+raise exception/)
  })

  it('nur für die Dienstrolle: Kein Mitglied darf sie rufen', () => {
    const signatur = 'public.wochen_tauschen(uuid, date, timestamptz, jsonb, date, timestamptz, jsonb)'
    expect(schema).toContain(`revoke all on function ${signatur} from public;`)
    expect(schema).toContain(`revoke all on function ${signatur} from anon, authenticated;`)
    const gaben = [...schema.matchAll(/grant execute on function public\.wochen_tauschen\([^)]*\) to ([^;]+);/g)].map((m) => m[1])
    expect(gaben).toEqual(['service_role'])
  })
})
