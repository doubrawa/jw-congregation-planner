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
 * Die **Abwesenheiten** sind hier bewusst dabei (ein Zurücksetzen setzt zurück),
 * lassen sich danach aber wiederholen: `abwesenheiten-importieren.mjs` holt sie
 * aus denselben NWS-Daten zurück. Der reine Personen-Neuaufbau
 * (`build-personen-sql.mjs`) löscht sie dagegen **nicht** mehr.
 *
 * **Was gelöscht wird:** alle Wochen, Bestätigungen, Mitteilungen, Abwesenheiten,
 * Push-Abos, materialisierten Treffpunkte (`fs_weeks`), Erinnerungs-Logs, das
 * Versand-Tagebuch (`assignment_log`) — und
 * die Personen und Gruppen, die anschließend aus dem Personen-Import-SQL mit
 * ihren festen IDs neu angelegt werden. Den SQL erzeugt
 * `nws-export/build-personen-sql.mjs` frisch aus den NWS-Daten (`--sql` unten).
 * Die Person deines Kontos wird dabei nicht dupliziert: sie bekommt dieselbe
 * feste ID wie im Import, und deine Konto-Verknüpfung zeigt danach darauf.
 *
 * ---------------------------------------------------------------- Aufruf ----
 *
 *   node scripts/versammlung-zuruecksetzen.mjs \
 *     --sql C:\DATA\Claude\nws-export\import-live-personen.sql \
 *     [--cong <congregation-id>] [--trocken]
 *
 * **Nichts vorher setzen.** Die Projekt-URL holt sich das Skript aus
 * `.env.local` (`VITE_SUPABASE_URL`), und nach dem Schlüssel fragt es, wenn
 * keiner in der Umgebung steht — verdeckt, mit dem Link aufs Dashboard daneben.
 * Wer `SUPABASE_SECRET_KEY` gesetzt hat, wird nicht gefragt.
 *
 * `--trocken` zeigt nur, was geschähe, und schreibt nichts. **Immer zuerst so
 * ausführen.** Der Service-Role-Key umgeht RLS und darf nie ins Repo.
 */

import fs from 'node:fs'
import { STANDARD_DIENSTE } from './versammlung-anlegen.mjs'
import { argumente, gleichnamige, personDisplayName, restKlient, zugangsdaten } from './gemeinsam.mjs'
export { argumente, gleichnamige }
export { personDisplayName as displayName }

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
        id: o.id, fn: o.fn, ln: o.ln, role: o.role, female: o.female,
        tel: o.tel, mail: o.mail, priv: JSON.parse(o.priv), grp: o.grp ?? null, fam: o.fam ?? null,
      })
    } else {
      const ov = /update public\.groups set overseer_id = '([^']+)', assistant_id = '([^']+)' where id = '([^']+)'/.exec(zeile.trim())
      if (ov) ovas.push({ groupId: ov[3], overseer_id: ov[1], assistant_id: ov[2] })
    }
  }
  return { groups, persons, ovas }
}

/* ===================== Argumente ========================================= */

/* ===================== Ausführung ======================================== */

/**
 * Was ein Zurücksetzen mit welcher Tabelle macht — **drei** Listen, die
 * zusammen jede Tabelle mit `congregation_id` aus `supabase/schema.sql`
 * abdecken müssen. `versammlung-zuruecksetzen.test.ts` hält das nach.
 *
 * Ohne diese Probe muss sich jede neue Tabelle hier von selbst eintragen, und
 * `assignment_log` hat das nicht getan: Das Versand-Tagebuch überlebte jedes
 * Zurücksetzen mit Schlüsseln auf Wochen, die es nicht mehr gab.
 *
 * Die dritte Liste ist kein Formalismus. `persons` und `groups` standen erst
 * bei den behaltenen, obwohl sie gelöscht werden — damit hätte die Probe genau
 * die Lücke nicht mehr gesehen, gegen die sie geschrieben ist: Fiele ihr
 * eigener Löschschritt heraus, wäre sie weiter grün.
 */

/** Tabellen, die dieses Skript vollständig leert (Reihenfolge egal). */
export const LEEREN = [
  'confirmations', 'notifications', 'absences', 'weeks',
  'push_subscriptions', 'fs_weeks', 'reminder_log', 'assignment_log',
]

/** Gelöscht **und** im selben Lauf aus dem SQL neu angelegt (feste IDs). */
export const NEU_ANGELEGT = ['persons', 'groups', 'households']

/** Was stehen bleibt — je Tabelle mit Begründung. */
export const BEHALTEN = {
  members: 'die Konten samt Planer-Recht — der Sinn des Skripts',
  invites: 'offene Einladungscodes bleiben gültig',
  services: 'die Hilfsdienste der Versammlung (werden nur angelegt, wenn keine da sind)',
  fs_rules: 'der Treffpunkt-Grundplan — er beschreibt die Versammlung, nicht eine Woche',
}

async function main() {
  const arg = argumente(process.argv.slice(2))
  const { url, key } = await zugangsdaten()
  const sqlPfad = arg.sql || 'C:/DATA/Claude/nws-export/import-live-personen.sql'
  const kuratiert = parseKuratiert(fs.readFileSync(sqlPfad, 'utf8'))
  if (kuratiert.persons.length === 0) {
    console.error(`Keine Personen im SQL gefunden (${sqlPfad}). Falscher Pfad?`)
    process.exit(1)
  }

  /*
   * **Gleichnamige abweisen, bevor irgendetwas gelöscht ist** (T110).
   *
   * Vor- und Nachname sind je Versammlung eindeutig (`persons_name_eindeutig`).
   * Ein SQL mit zwei „Josef Mayer" darin ließe sich also gar nicht einspielen
   * — nur merkt man das erst beim Sammel-`insert`, und da sind die alten
   * Personen schon gelöscht. Was dann dasteht, ist eine leere Versammlung und
   * eine Fehlermeldung von PostgreSQL, in der die Namen nicht vorkommen.
   *
   * Deshalb hier, vor dem ersten Schreibzugriff, und mit den Namen. Behoben
   * wird es in der Quelle: NWS-Vornamen ergänzen („Josef sen."), dann
   * `build-personen-sql.mjs` neu laufen lassen.
   */
  const doppelt = gleichnamige(kuratiert.persons)
  if (doppelt.length > 0) {
    console.error(`\n${doppelt.length}× derselbe Name im SQL (${sqlPfad}):\n`)
    for (const liste of doppelt) {
      const namen = liste[0] ? personDisplayName(liste[0].fn, liste[0].ln) : ''
      console.error(`  ${namen} — ${liste.length} Personen: ${liste.map((p) => p.id).join(', ')}`)
    }
    console.error(
      '\nVor- und Nachname müssen je Versammlung eindeutig sein. In NWS den Vornamen\n' +
        'ergänzen (z. B. „Josef sen.") und build-personen-sql.mjs neu laufen lassen.\n' +
        'Es wurde nichts gelöscht und nichts geschrieben.\n',
    )
    process.exit(1)
  }

  const rest = restKlient(url, key)

  const cong = arg.cong || (await rest('congregations?select=id&limit=1'))[0]?.id
  if (!cong) { console.error('Keine Versammlung gefunden.'); process.exit(1) }

  // Konto→Person-Verknüpfung über den Personennamen sichern (vor dem Löschen).
  // Robust gegen Teilabbrüche: die Zuordnung (E-Mail → Personenname) wird in einer
  // Sidecar-Datei gehalten. Läuft das Skript nach einem Abbruch erneut (persons
  // bereits gelöscht, also aus der DB nicht mehr ableitbar), kommt sie von dort —
  // sonst ginge die Anmeldung des Planers verloren.
  const dbPersonen = await rest(`persons?select=id,fn,ln&congregation_id=eq.${cong}`)
  const nameNachId = new Map(dbPersonen.map((p) => [p.id, personDisplayName(p.fn, p.ln)]))
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
  // Dasselbe für offene Einladungen: Das Löschen der Personen nullt
  // `invites.person_id` (Fremdschlüssel). Der Code bliebe gültig, führte aber
  // zu einem Konto **ohne** Person — „Meine Aufgaben" bliebe leer, und niemand
  // sähe die Ursache. Beim Neuaufbau am 18. September 2026 genau so passiert.
  const einladungen = (await rest(`invites?select=code,person_id&congregation_id=eq.${cong}&redeemed_by=is.null`))
    .filter((i) => i.person_id && nameNachId.has(i.person_id))
    .map((i) => ({ code: i.code, personName: nameNachId.get(i.person_id) }))

  const services = await rest(`services?select=key&congregation_id=eq.${cong}`)

  console.log(`Versammlung:  ${cong}`)
  console.log(`Löschen:      ${LEEREN.join(', ')}, groups, persons`)
  console.log(`Anlegen:      ${kuratiert.persons.length} Personen, ${kuratiert.groups.length} Gruppen`)
  console.log(`Konten:       ${members.length} (${verknuepfungen.length} Verknüpfung(en) über den Namen erhalten)`)
  for (const v of verknuepfungen) console.log(`              ${v.email} → ${v.personName}`)
  if (einladungen.length) console.log(`Einladungen:  ${einladungen.length} offene, werden wieder verknüpft`)
  console.log(`Dienste:      ${services.length ? `${services.length} vorhanden, bleiben` : 'keine → Standard anlegen'}`)

  if (arg.trocken) {
    // Prüfen, ob jede erhaltene Verknüpfung im kuratierten Bestand landet.
    const namen = new Set(kuratiert.persons.map((p) => personDisplayName(p.fn, p.ln)))
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
  // 2) Personen (nullt per FK groups.overseer/assistant und invites.person_id),
  //    dann Gruppen und Haushalte — die Haushalte zuletzt, denn bis hierher
  //    zeigt `persons.fam` noch auf sie.
  await rest(`persons?congregation_id=eq.${cong}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
  await rest(`groups?congregation_id=eq.${cong}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
  await rest(`households?congregation_id=eq.${cong}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })

  // 3) Gruppen, Haushalte und Personen frisch anlegen (feste IDs aus dem SQL)
  await rest('groups', {
    method: 'POST', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(kuratiert.groups.map((g) => ({
      id: g.id, congregation_id: cong, name: g.name, position: g.position,
    }))),
  })
  // Die Haushalte stehen im Personen-SQL nicht als eigene Zeilen — dort ist ein
  // Haushalt nur die gemeinsame Id in `fam`. Seit er eine eigene Tabelle hat
  // (T105, mit Fremdschlüssel), muss er **vor** den Personen dastehen; sonst
  // weist die Datenbank jede Person mit Familie ab. Abgeleitet wird er aus
  // genau den Ids, die das SQL vergibt — erfunden wird nichts.
  const haushalte = [...new Set(kuratiert.persons.map((p) => p.fam).filter(Boolean))]
  if (haushalte.length) {
    await rest('households', {
      method: 'POST', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(haushalte.map((id) => ({ id, congregation_id: cong }))),
    })
  }
  await rest('persons', {
    method: 'POST', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(kuratiert.persons.map((p) => ({
      id: p.id, congregation_id: cong, fn: p.fn, ln: p.ln, role: p.role,
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
  const idNachName = new Map(kuratiert.persons.map((p) => [personDisplayName(p.fn, p.ln), p.id]))
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

  // Offene Einladungen zeigen wieder auf ihre Person (siehe oben).
  let einladungenVerknuepft = 0
  for (const e of einladungen) {
    const pid = idNachName.get(e.personName)
    if (!pid) continue
    await rest(`invites?code=eq.${encodeURIComponent(e.code)}&congregation_id=eq.${cong}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ person_id: pid }),
    })
    einladungenVerknuepft++
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

  console.log(
    `\nFertig. ${kuratiert.persons.length} Personen, ${kuratiert.groups.length} Gruppen angelegt; ` +
      `${verknuepft} Konto-Verknüpfung(en) erhalten` +
      `${einladungenVerknuepft ? `, ${einladungenVerknuepft} Einladung(en) wieder verknüpft` : ''}.`,
  )
  if (unverknuepft.length) console.log(`Unverknüpft (Name nicht im SQL): ${unverknuepft.join(', ')}`)
  /*
   * **Die Übergabeliste — vollständig.**
   *
   * Hier standen zwei der vier Schritte. Was dieses Skript leert, holt niemand
   * von selbst zurück: Die Abwesenheiten (`absences`) und die Treffpunkt-Wochen
   * (`fs_weeks`) stehen in `LEEREN`, ihre Importe aber in keiner Anleitung —
   * und so lief der Neuaufbau vom 17. September 2026 ohne sie durch. Gemerkt
   * hat es niemand: Die App plant dann gegen einen leeren Kalender und teilt
   * Verreiste ein.
   */
  console.log('\nNächste Schritte — alle vier, sonst fehlt etwas:')
  console.log('  1. jw.org-Wochen in der App importieren („Nächste Woche importieren")')
  console.log('  2. node scripts/wochenplanung-importieren.mjs   (Zuteilungen, Hilfsdienste, Reinigung)')
  console.log('  3. node scripts/abwesenheiten-importieren.mjs   (gelöscht, kommt aus denselben NWS-Daten)')
  console.log('  4. node scripts/treffpunkte-importieren.mjs     (die Leiter der Treffpunkte, ebenso)')
  console.log('Jeder zuerst mit --trocken.')
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  main().catch((err) => {
    console.error(String(err instanceof Error ? err.message : err))
    // `exitCode` statt `exit()`: Nach einem gescheiterten `fetch` hält undici
    // seinen Verbindungspool noch kurz offen. `process.exit()` reißt ihn mitten
    // im Schließen weg — dann steht eine libuv-Assertion über der Meldung, die
    // sie erklären sollte. So läuft Node aus und liefert den Code trotzdem.
    process.exitCode = 1
  })
}
