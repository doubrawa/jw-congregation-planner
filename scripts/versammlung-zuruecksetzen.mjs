#!/usr/bin/env node
/**
 * Versammlung zurücksetzen und Stammdaten frisch einspielen — vom Administrator,
 * **außerhalb der App**, in der Testphase (noch nicht in Produktion).
 *
 * Der Sinn: einen **sauberen, wiederholbaren Ausgangszustand** herstellen, ohne
 * die Anmeldung des Planers zu verlieren. Danach holt der Planer die
 * jw.org-Wochen in der App und spielt mit `wochenplanung-importieren.mjs` die
 * NWS-Zuteilungen ein. Weil die Personen aus **derselben** NWS-Quelle kommen wie
 * die Zuteilungen, treffen die Namen danach sauber — kein Abgleich-Problem
 * ([[wochenplanung-import]]).
 *
 * **Was erhalten bleibt:** die Versammlung, die Konten (`members`) samt
 * Planer-Recht, die Hilfsdienste (`services`), die Einladungscodes — und, das ist
 * der Kern, **die Verknüpfung deines Kontos mit deiner Person**. Der bisherige
 * Personen-Import stellte sie per E-Mail-Abgleich wieder her; das scheitert,
 * sobald die Anmelde-Adresse (doubrawa@eevolution.de) von der Personen-Mail
 * (juergen@doubrawa.com) abweicht. Dieses Skript merkt die Verknüpfung stattdessen
 * über den **Personennamen** und stellt sie danach wieder her — unabhängig von
 * der Adresse.
 *
 * **Was gelöscht wird:** alle Wochen, Bestätigungen, Mitteilungen, Abwesenheiten,
 * Push-Abos, materialisierten Treffpunkte (`fs_weeks`), Erinnerungs-Logs — und
 * die Personen und Gruppen, die anschließend aus dem Personen-Import-SQL mit
 * ihren festen IDs neu angelegt werden. Den SQL erzeugt
 * `nws-export/build-personen-sql.mjs` frisch aus den NWS-Daten (`--sql` unten).
 * Die Person deines Kontos wird dabei nicht dupliziert: sie bekommt dieselbe
 * feste ID wie im Import, und deine Konto-Verknüpfung zeigt danach darauf.
 *
 * ---------------------------------------------------------------- Aufruf ----
 *
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
 *   node scripts/versammlung-zuruecksetzen.mjs \
 *     --sql C:\DATA\Claude\nws-export\import-live-personen.sql \
 *     [--cong <congregation-id>] [--trocken]
 *
 * `--trocken` zeigt nur, was geschähe, und schreibt nichts. **Immer zuerst so
 * ausführen.** Der Service-Role-Key umgeht RLS und darf nie ins Repo.
 */

import fs from 'node:fs'
import { STANDARD_DIENSTE } from './versammlung-anlegen.mjs'

/* ===================== Kuratierte Daten aus dem SQL lesen ================= */

/**
 * Werte einer `values (…)`-Liste in Token zerlegen. Erkennt einfache
 * Anführungszeichen-Strings (mit `''`-Escape), `(select …)`-Ausdrücke,
 * `true`/`false`/`null` und Zahlen; ein `::jsonb`/`::text`-Cast nach einem String
 * gehört noch zum Wert. Reine Funktion.
 */
export function werteTokens(s) {
  const out = []
  let i = 0
  while (i < s.length) {
    while (i < s.length && (s[i] === ' ' || s[i] === ',')) i++
    if (i >= s.length) break
    if (s[i] === "'") {
      i++
      let str = ''
      while (i < s.length) {
        if (s[i] === "'" && s[i + 1] === "'") { str += "'"; i += 2; continue }
        if (s[i] === "'") { i++; break }
        str += s[i++]
      }
      if (s.slice(i, i + 2) === '::') while (i < s.length && s[i] !== ',') i++ // Cast überspringen
      out.push(str)
    } else if (s[i] === '(') {
      let depth = 0
      const start = i
      while (i < s.length) {
        if (s[i] === '(') depth++
        else if (s[i] === ')') { depth--; if (depth === 0) { i++; break } }
        i++
      }
      out.push({ expr: s.slice(start, i) }) // z. B. (select id from congregations …)
    } else {
      const start = i
      while (i < s.length && s[i] !== ',') i++
      const w = s.slice(start, i).trim()
      out.push(w === 'null' ? null : w === 'true' ? true : w === 'false' ? false : Number(w))
    }
  }
  return out
}

/** Eine `insert into public.<tabelle> (cols) values (vals);`-Zeile parsen. */
export function parseInsert(zeile) {
  const m = /^insert into public\.(\w+) \(([^)]+)\) values \((.+)\);\s*$/.exec(zeile.trim())
  if (!m) return null
  const cols = m[2].split(',').map((c) => c.trim())
  const vals = werteTokens(m[3])
  const obj = {}
  cols.forEach((c, i) => { obj[c] = vals[i] })
  return { tabelle: m[1], obj }
}

/**
 * Gruppen, Personen und Aufseher/Gehilfe-Zuordnung aus dem kuratierten SQL.
 * `congregation_id` (dort ein `(select …)`) wird nicht übernommen — die echte Id
 * setzt der Aufrufer. `priv` wird zu einem Objekt geparst. Reine Funktion.
 */
export function parseKuratiert(sql) {
  const groups = []
  const persons = []
  const ovas = []
  for (const zeile of sql.split('\n')) {
    const ins = parseInsert(zeile)
    if (ins?.tabelle === 'groups') {
      groups.push({ id: ins.obj.id, name: ins.obj.name, position: ins.obj.position })
    } else if (ins?.tabelle === 'persons') {
      const o = ins.obj
      persons.push({
        id: o.id, fn: o.fn, ln: o.ln, dn: o.dn, role: o.role, female: o.female,
        tel: o.tel, mail: o.mail, priv: JSON.parse(o.priv), grp: o.grp ?? null, fam: o.fam ?? null,
      })
    } else {
      const ov = /update public\.groups set overseer_id = '([^']+)', assistant_id = '([^']+)' where id = '([^']+)'/.exec(zeile.trim())
      if (ov) ovas.push({ groupId: ov[3], overseer_id: ov[1], assistant_id: ov[2] })
    }
  }
  return { groups, persons, ovas }
}

/** Anzeigename wie in der App: eigener Kurzname, sonst voller Name. */
export function displayName(fn, ln, dn) {
  return (dn && dn.trim()) || `${fn ?? ''} ${ln ?? ''}`.trim()
}

/* ===================== Argumente ========================================= */

export function argumente(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) out[a.slice(2)] = true
    else { out[a.slice(2)] = next; i++ }
  }
  return out
}

/* ===================== Ausführung ======================================== */

/** Tabellen mit `congregation_id`, die vollständig geleert werden (Reihenfolge egal). */
const LEEREN = [
  'confirmations', 'notifications', 'absences', 'weeks',
  'push_subscriptions', 'fs_weeks', 'reminder_log',
]

async function main() {
  const arg = argumente(process.argv.slice(2))
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const sqlPfad = arg.sql || 'C:/DATA/Claude/nws-export/import-live-personen.sql'
  const fehlt = []
  if (!url) fehlt.push('SUPABASE_URL')
  if (!key) fehlt.push('SUPABASE_SERVICE_ROLE_KEY')
  if (fehlt.length) {
    console.error(`Fehlt: ${fehlt.join(', ')}\n\nAufruf siehe Kopf dieser Datei.`)
    process.exit(2)
  }

  const kuratiert = parseKuratiert(fs.readFileSync(sqlPfad, 'utf8'))
  if (kuratiert.persons.length === 0) {
    console.error(`Keine Personen im SQL gefunden (${sqlPfad}). Falscher Pfad?`)
    process.exit(1)
  }

  const rest = async (pfad, init = {}) => {
    const res = await fetch(`${url}/rest/v1/${pfad}`, {
      ...init,
      headers: {
        apikey: key, Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json', ...(init.headers || {}),
      },
    })
    if (!res.ok) throw new Error(`${init.method || 'GET'} ${pfad} ${res.status}: ${await res.text()}`)
    // Leerer Body bei jedem Erfolgsstatus (nicht nur 204): `Prefer: return=minimal`
    // liefert auch bei POST ein 201 **ohne** Inhalt — `res.json()` darauf wirft
    // „Unexpected end of JSON input".
    const text = await res.text()
    return text ? JSON.parse(text) : null
  }

  const cong = arg.cong || (await rest('congregations?select=id&limit=1'))[0]?.id
  if (!cong) { console.error('Keine Versammlung gefunden.'); process.exit(1) }

  // Konto→Person-Verknüpfung über den Personennamen sichern (vor dem Löschen).
  // Robust gegen Teilabbrüche: die Zuordnung (E-Mail → Personenname) wird in einer
  // Sidecar-Datei gehalten. Läuft das Skript nach einem Abbruch erneut (persons
  // bereits gelöscht, also aus der DB nicht mehr ableitbar), kommt sie von dort —
  // sonst ginge die Anmeldung des Planers verloren.
  const dbPersonen = await rest(`persons?select=id,fn,ln,dn&congregation_id=eq.${cong}`)
  const nameNachId = new Map(dbPersonen.map((p) => [p.id, displayName(p.fn, p.ln, p.dn)]))
  const members = await rest(`members?select=email,person_id&congregation_id=eq.${cong}`)
  const sidecar = `${sqlPfad}.members.json`
  let verknuepfungen = members
    .filter((m) => m.person_id && nameNachId.has(m.person_id))
    .map((m) => ({ email: m.email, personName: nameNachId.get(m.person_id) }))
  if (verknuepfungen.length) {
    fs.writeFileSync(sidecar, JSON.stringify(verknuepfungen, null, 2)) // vor dem Löschen sichern
  } else if (fs.existsSync(sidecar)) {
    verknuepfungen = JSON.parse(fs.readFileSync(sidecar, 'utf8'))
    console.log(`(${verknuepfungen.length} Konto-Verknüpfung(en) aus vorherigem Lauf übernommen — DB war schon geleert.)`)
  }
  const services = await rest(`services?select=key&congregation_id=eq.${cong}`)

  console.log(`Versammlung:  ${cong}`)
  console.log(`Löschen:      ${LEEREN.join(', ')}, groups, persons`)
  console.log(`Anlegen:      ${kuratiert.persons.length} Personen, ${kuratiert.groups.length} Gruppen`)
  console.log(`Konten:       ${members.length} (${verknuepfungen.length} Verknüpfung(en) über den Namen erhalten)`)
  for (const v of verknuepfungen) console.log(`              ${v.email} → ${v.personName}`)
  console.log(`Dienste:      ${services.length ? `${services.length} vorhanden, bleiben` : 'keine → Standard anlegen'}`)

  if (arg.trocken) {
    // Prüfen, ob jede erhaltene Verknüpfung im kuratierten Bestand landet.
    const namen = new Set(kuratiert.persons.map((p) => displayName(p.fn, p.ln, p.dn)))
    for (const v of verknuepfungen) {
      if (!namen.has(v.personName)) console.log(`  ! ${v.personName} fehlt im SQL — Konto bliebe unverknüpft.`)
    }
    console.log('\n--trocken: nichts geschrieben.')
    return
  }

  // 1) Transaktionale Daten leeren
  for (const t of LEEREN) {
    await rest(`${t}?congregation_id=eq.${cong}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
  }
  // 2) Personen (nullt per FK groups.overseer/assistant und invites.person_id), dann Gruppen
  await rest(`persons?congregation_id=eq.${cong}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
  await rest(`groups?congregation_id=eq.${cong}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })

  // 3) Gruppen und Personen frisch anlegen (feste IDs aus dem SQL)
  await rest('groups', {
    method: 'POST', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(kuratiert.groups.map((g) => ({
      id: g.id, congregation_id: cong, name: g.name, position: g.position,
    }))),
  })
  await rest('persons', {
    method: 'POST', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(kuratiert.persons.map((p) => ({
      id: p.id, congregation_id: cong, fn: p.fn, ln: p.ln, dn: p.dn, role: p.role,
      female: p.female, tel: p.tel, mail: p.mail, priv: p.priv, grp: p.grp, fam: p.fam,
    }))),
  })
  // 4) Aufseher/Gehilfe setzen
  for (const o of kuratiert.ovas) {
    await rest(`groups?id=eq.${o.groupId}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ overseer_id: o.overseer_id, assistant_id: o.assistant_id }),
    })
  }

  // 5) Konto→Person-Verknüpfung über den Namen wiederherstellen (per E-Mail des Kontos)
  const idNachName = new Map(kuratiert.persons.map((p) => [displayName(p.fn, p.ln, p.dn), p.id]))
  let verknuepft = 0
  const unverknuepft = []
  for (const v of verknuepfungen) {
    const pid = idNachName.get(v.personName)
    if (!pid) { unverknuepft.push(v.personName); continue }
    await rest(`members?email=eq.${encodeURIComponent(v.email)}&congregation_id=eq.${cong}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ person_id: pid }),
    })
    verknuepft++
  }

  // 6) Hilfsdienste sicherstellen (nur, wenn gar keine da sind)
  if (services.length === 0) {
    await rest('services', {
      method: 'POST', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(STANDARD_DIENSTE.map((d, i) => ({
        congregation_id: cong, key: d.key, name: d.name, count: d.count, groups: d.groups, position: i,
      }))),
    })
  }

  console.log(`\nFertig. ${kuratiert.persons.length} Personen, ${kuratiert.groups.length} Gruppen angelegt; ${verknuepft} Konto-Verknüpfung(en) erhalten.`)
  if (unverknuepft.length) console.log(`Unverknüpft (Name nicht im SQL): ${unverknuepft.join(', ')}`)
  console.log('Nächste Schritte: jw.org-Wochen in der App importieren, dann wochenplanung-importieren.mjs.')
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  main().catch((err) => {
    console.error(String(err instanceof Error ? err.message : err))
    process.exit(1)
  })
}
