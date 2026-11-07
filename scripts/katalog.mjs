/**
 * **Der Katalog einer Postgres, Abschnitt für Abschnitt** — und der Vergleich
 * zweier Kataloge.
 *
 * Zwei Stellen fragen danach: `supabase/migrationen.test.ts` hält `schema.sql`
 * und die Folge der Migrationen gleich (beide in PGlite), und
 * `ausrollen-pruefen.mjs` hält die Produktion gegen dieselbe Folge (T170). Die
 * Abfragen stehen deshalb einmal, hier: Eine zweite, von Hand gepflegte Liste
 * vergäße den nächsten Abschnitt, und er bliebe an einer der beiden Stellen
 * still ungeprüft.
 *
 * Gefragt wird `pg_catalog`, nicht `information_schema`, wo es genauer ist: Die
 * Rechte stehen dort als ACL am Objekt (`relacl`, `attacl`, `proacl`) und
 * nennen damit auch die **Spaltenrechte**, auf denen in diesem Projekt der
 * Schutz der Abwesenheitsgründe und der Link-Prüfsummen beruht.
 */

export const ABFRAGEN = {
  tabellen: `
    select c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity, c.relacl::text
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
    order by c.relname`,
  spalten: `
    select c.relname as tabelle, a.attnum, a.attname, format_type(a.atttypid, a.atttypmod) as typ,
           a.attnotnull, a.attidentity, a.attgenerated, pg_get_expr(d.adbin, d.adrelid) as vorgabe, a.attacl::text
    from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
      left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where n.nspname = 'public' and c.relkind in ('r', 'p') and a.attnum > 0 and not a.attisdropped
    order by c.relname, a.attnum`,
  bedingungen: `
    select conrelid::regclass::text as tabelle, conname, contype, pg_get_constraintdef(oid) as def
    from pg_constraint where connamespace = 'public'::regnamespace
    order by conrelid::regclass::text, conname`,
  indizes: `
    select tablename, indexname, indexdef from pg_indexes where schemaname = 'public'
    order by tablename, indexname`,
  funktionen: `
    select p.proname, pg_get_function_identity_arguments(p.oid) as parameter,
           pg_get_function_result(p.oid) as ergebnis, p.prosecdef, p.provolatile,
           p.proconfig::text, p.proacl::text, l.lanname, md5(p.prosrc) as rumpf
    from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      join pg_language l on l.oid = p.prolang
    where n.nspname = 'public'
    order by p.proname, pg_get_function_identity_arguments(p.oid)`,
  trigger: `
    select tgrelid::regclass::text as tabelle, tgname, pg_get_triggerdef(oid) as def
    from pg_trigger
    where not tgisinternal and tgrelid in (select oid from pg_class where relnamespace = 'public'::regnamespace)
    order by tgrelid::regclass::text, tgname`,
  richtlinien: `
    select tablename, policyname, cmd, permissive, roles::text, qual, with_check
    from pg_policies where schemaname = 'public'
    order by tablename, policyname`,
  sequenzen: `
    select c.relname, s.seqtypid::regtype::text as typ, s.seqstart, s.seqincrement
    from pg_sequence s join pg_class c on c.oid = s.seqrelid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' order by c.relname`,
  // Kommentare an Tabellen, Spalten und Funktionen: Auch sie kommen per
  // Migration, und ohne diesen Abschnitt fiele einer, der nur in `schema.sql`
  // oder nur in der Migration steht, niemandem auf.
  kommentare: `
    select coalesce(c.relname, p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')') as objekt,
           coalesce(a.attname, '') as spalte, d.description as kommentar
    from pg_description d
      left join pg_class c on d.classoid = 'pg_class'::regclass and c.oid = d.objoid
                          and c.relnamespace = 'public'::regnamespace
      left join pg_attribute a on a.attrelid = c.oid and a.attnum = d.objsubid and d.objsubid > 0
      left join pg_proc p on d.classoid = 'pg_proc'::regclass and p.oid = d.objoid
                         and p.pronamespace = 'public'::regnamespace
    where c.oid is not null or p.oid is not null
    order by 1, 2`,
}

/** Die Abschnitte — abgeleitet aus `ABFRAGEN`, damit kein neuer fehlt. */
export const ABSCHNITTE = Object.keys(ABFRAGEN)

/** Der Katalog einer Datenbank: jede Abfrage aus `ABFRAGEN`, der Reihe nach. */
export async function katalog(db) {
  const out = {}
  for (const abschnitt of ABSCHNITTE) out[abschnitt] = (await db.query(ABFRAGEN[abschnitt])).rows
  return out
}

/**
 * Der ganze Katalog als **eine** Anweisung, die je Abschnitt eine JSON-Liste
 * liefert (eine Zeile, Spalte `katalog`, als Text). So geht er in einem Aufruf
 * von `supabase db query --read-only` durch.
 */
export function katalogAbfrage() {
  const teile = ABSCHNITTE.map((a) => `  '${a}', (select coalesce(json_agg(x), '[]'::json) from (${ABFRAGEN[a].trim()}) x)`)
  return `select json_build_object(\n${teile.join(',\n')}\n)::text as katalog;\n`
}

/** Woran eine Zeile je Abschnitt zu erkennen ist — ihr Name, nicht ihre Stelle. */
const SCHLUESSEL = {
  tabellen: (z) => z.relname,
  spalten: (z) => `${z.tabelle}.${z.attname}`,
  bedingungen: (z) => `${z.tabelle}.${z.conname}`,
  indizes: (z) => `${z.tablename}.${z.indexname}`,
  funktionen: (z) => `${z.proname}(${z.parameter})`,
  trigger: (z) => `${z.tabelle}.${z.tgname}`,
  richtlinien: (z) => `${z.tablename}.${z.policyname}`,
  sequenzen: (z) => z.relname,
  kommentare: (z) => (z.spalte ? `${z.objekt}.${z.spalte}` : z.objekt),
}

/**
 * Eine ACL als sortierte Liste. Die Reihenfolge der Einträge sagt nur, in
 * welcher Folge vergeben wurde. Bei Tabellen fällt das Recht `m` weg: MAINTAIN
 * gibt es erst ab Postgres 17 — die Produktion trägt es mit jedem Tabellenrecht,
 * PGlite (Postgres 16) kennt es nicht.
 */
export function aclAngeglichen(text, ohneMaintain = false) {
  if (text === null || text === undefined) return null
  const eintraege = String(text).replace(/^\{|\}$/g, '').split(',').filter(Boolean)
  return eintraege
    .map((e) => {
      if (!ohneMaintain) return e
      const [vor, geber = ''] = e.split('/')
      const [wer = '', rechte = ''] = vor.split('=')
      return `${wer}=${rechte.replace('m', '')}/${geber}`
    })
    .sort()
    .join(',')
}

/**
 * Was zwischen der Produktion und PGlite verschieden aussieht, ohne verschieden
 * zu sein: die Reihenfolge der Rechte, MAINTAIN, und die Stelle einer Spalte
 * (`attnum`) — Postgres hängt eine später angefügte Spalte hinten an, eine
 * frische Datenbank hat sie, wo `create table` sie nennt.
 */
function angeglichen(abschnitt, zeile) {
  const z = { ...zeile }
  if (abschnitt === 'tabellen') z.relacl = aclAngeglichen(z.relacl, true)
  if (abschnitt === 'spalten') {
    z.attacl = aclAngeglichen(z.attacl)
    delete z.attnum
  }
  if (abschnitt === 'funktionen') z.proacl = aclAngeglichen(z.proacl)
  return z
}

/**
 * Zwei Kataloge vergleichen, Abschnitt für Abschnitt: was nur auf einer Seite
 * steht, und welche Felder sich bei gleichem Namen unterscheiden. Leer heißt
 * gleich.
 *
 * @returns {{ abschnitt: string, nurLinks: string[], nurRechts: string[], anders: { name: string, feld: string, links: unknown, rechts: unknown }[] }[]}
 */
export function katalogVergleich(links, rechts) {
  const out = []
  for (const abschnitt of ABSCHNITTE) {
    const schluessel = SCHLUESSEL[abschnitt]
    const L = new Map((links[abschnitt] ?? []).map((z) => [schluessel(z), angeglichen(abschnitt, z)]))
    const R = new Map((rechts[abschnitt] ?? []).map((z) => [schluessel(z), angeglichen(abschnitt, z)]))
    const nurLinks = [...L.keys()].filter((k) => !R.has(k)).sort()
    const nurRechts = [...R.keys()].filter((k) => !L.has(k)).sort()
    const anders = []
    for (const [name, l] of L) {
      const r = R.get(name)
      if (!r) continue
      for (const feld of Object.keys({ ...l, ...r })) {
        if (JSON.stringify(l[feld]) !== JSON.stringify(r[feld])) anders.push({ name, feld, links: l[feld], rechts: r[feld] })
      }
    }
    if (nurLinks.length || nurRechts.length || anders.length) out.push({ abschnitt, nurLinks, nurRechts, anders })
  }
  return out
}
