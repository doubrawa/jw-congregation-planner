#!/usr/bin/env node
/**
 * Abwesenheiten aus New World Scheduler → JW Congregation Planner.
 *
 * **Warum es dieses Skript gibt.** Die Abwesenheiten standen bisher nur in NWS.
 * In die App kam nie eine — es gab schlicht keinen Weg dorthin —, und der
 * Personen-Neuaufbau (`build-personen-sql.mjs`) löschte die von Hand erfassten
 * obendrein mit. Die Planung liest `absences` aber versammlungsweit
 * (migration-015): Wer verreist ist, soll gar nicht erst eingeteilt werden.
 * Ohne diesen Import plant die App also gegen einen leeren Kalender.
 *
 * **Quelle.** `AwayPeriods` — NWS' „Abwesend"-Zeiträume (Person, von, bis).
 * Daneben führt NWS `UnavailablePeriods` („nicht verfügbar"): fachlich etwas
 * anderes (jemand ist da, kann aber keine Aufgabe übernehmen), für die Planung
 * jedoch dieselbe Folge. Die App kennt nur einen Begriff, deshalb sind sie mit
 * `--auch-unverfuegbar` zusätzlich einzulesen — voreingestellt aus, weil in
 * diesem Bestand fast alle davon Vergangenheit sind.
 *
 * **Person statt Konto.** Eine Abwesenheit gehört der Person; das Konto
 * (`user_id`) bleibt **leer** — der Import hat keinen Ersteller, und die
 * meisten Verkündiger haben gar kein Konto. Das setzt `migration-021` voraus
 * (user_id NULL-bar + Schreibrecht über die eigene Person). Ohne sie weist die
 * Datenbank jede Zeile ab; das Skript sagt dann genau das.
 *
 * Trüge der Import ersatzweise das Konto des Planers ein, stünden dessen „Deine
 * Einträge" voll mit den Abwesenheiten der ganzen Versammlung.
 *
 * **Zuordnung.** Über die stabile Id, nicht über den Namen: Die App-Person
 * trägt `uuid5("person:<NWS-ID>")` (so vergibt sie `build-personen-sql.mjs`).
 * Damit trifft auch eine Namensdublette die richtige Person. Wer in der App
 * fehlt, wird gemeldet und übersprungen — nie geraten.
 *
 * **Zweimal laufen lassen schadet nicht.** Vorhandene Zeilen werden an
 * (Person, von, bis) erkannt und übersprungen; das gilt auch für Einträge, die
 * jemand selbst in der App erfasst hat.
 *
 * **Überlappendes wird zusammengefasst.** NWS behält beim Ändern die alte Zeile
 * (`10.–30.08.` neben `10.–31.08.`) und kennt Zeiträume, die ganz in einem
 * anderen liegen. Was sich überschneidet oder lückenlos anschließt, kommt als
 * **eine** Abwesenheit in die App — siehe `verschmelzeZeitraeume`.
 *
 * ---------------------------------------------------------------- Aufruf ----
 *
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
 *   node scripts/abwesenheiten-importieren.mjs \
 *     [--daten C:\DATA\Claude\nws-export\MyData-decrypted] \
 *     [--cong <congregation-id>] [--ab 2026-08-22] [--auch-unverfuegbar] [--trocken]
 *
 * `--ab`      früheste Bis-Datum, das noch importiert wird (Vorgabe: heute).
 *             Vergangenes bleibt draußen — es ändert an der Planung nichts und
 *             füllte nur die persönlichen Listen.
 * `--trocken` zeigt nur, was geschähe, und schreibt nichts.
 *
 * Der **Service-Role-Key** umgeht RLS und darf niemals in die App oder ins
 * Repository. Personenbezogene Daten — Ausgaben nicht einchecken.
 */

import { ladeTabellen } from './gemeinsam.mjs'
import { lebend, nameAufloeser, nurDatum, personIdAufloeser } from './nws-personen.mjs'
import { argumente } from './wochenplanung-importieren.mjs'

/* ===================== NWS lesen ========================================== */

/**
 * Zeiträume aus einer NWS-Tabelle (AwayPeriods/UnavailablePeriods) einsammeln:
 * `a` = Person, `b` = von, `c` = bis. Gelöschte fallen weg — ihre Daten stehen
 * nur noch im `log`-Text, und was jemand gelöscht hat, will er nicht zurück.
 *
 * Verdrehte Zeiträume (bis vor von) kommen als `verdreht` heraus statt still
 * korrigiert zu werden: Sie bedeuten in NWS nichts Bestimmtes, und ein geratener
 * Zeitraum sperrt eine Person für Wochen. Reine Funktion.
 */
export function sammleZeitraeume(rows, herkunft) {
  const out = []
  const verdreht = []
  for (const r of lebend(rows ?? [])) {
    const von = nurDatum(r.b)
    const bis = nurDatum(r.c)
    if (!r.a || !von || !bis) continue
    if (bis < von) { verdreht.push({ ref: r.a, von, bis, herkunft }); continue }
    out.push({ ref: r.a, von, bis, herkunft })
  }
  return { zeitraeume: out, verdreht }
}

/* ===================== Abgleich mit der App =============================== */

/** Schlüssel einer Abwesenheit: dieselbe Person, dieselben zwei Daten. */
export function abwSchluessel(personId, von, bis) {
  return `${personId}|${von}|${bis}`
}

/** Der Tag nach `iso` (ISO). Für „schließt lückenlos an". */
function tagDanach(iso) {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/**
 * Zeiträume **einer Person** zusammenfassen: Was sich überschneidet oder
 * lückenlos aneinander anschließt, ist eine Abwesenheit.
 *
 * **Warum das sein muss.** NWS behält beim Ändern die alte Zeile. Im Livebestand
 * stand eine ganze Familie mit `10.08.→30.08.` (Zeitstempel Januar) **und**
 * `10.08.→31.08.` (ein Tag drangehängt, Zeitstempel Ende Januar), beide lebend.
 * Dazu kommen Zeiträume, die ganz in einem anderen liegen (`01.–28.12.` und
 * `11.–21.12.`, sogar mit demselben Zeitstempel). Ohne Zusammenfassen stünden
 * zwei fast gleiche Einträge in der App — beim Betroffenen unter „Deine
 * Einträge", und niemand wüsste, welcher gilt.
 *
 * **Warum die Vereinigung und nicht „die neuere gewinnt".** Abwesend ist ein
 * Ja/Nein je Tag; zwei überlappende Zeiträume können nichts Verschiedenes
 * behaupten. Die Vereinigung ist die einzige Lesart, die keinen Tag verliert —
 * am Zeitstempel zu entscheiden hieße raten, welche Zeile die gepflegte ist
 * (bei den enthaltenen Zeiträumen ist er sogar identisch).
 *
 * Deterministisch: dieselbe Quelle ergibt denselben Zeitraum, ein zweiter Lauf
 * findet ihn also als „schon vorhanden" wieder. Reine Funktion.
 */
export function verschmelzeZeitraeume(liste) {
  const sortiert = [...liste].sort((a, b) => a.von.localeCompare(b.von) || a.bis.localeCompare(b.bis))
  const out = []
  for (const z of sortiert) {
    const letzter = out[out.length - 1]
    if (letzter && z.von <= tagDanach(letzter.bis)) {
      if (z.bis > letzter.bis) letzter.bis = z.bis
      letzter.verschmolzen = (letzter.verschmolzen ?? 0) + 1
      continue
    }
    out.push({ ...z })
  }
  return out
}

/**
 * Was tatsächlich einzufügen ist.
 *
 * `vorhanden` sind die Schlüssel der schon gespeicherten Abwesenheiten (auch
 * die von Hand erfassten), `appIds` die Personen, die es in der App gibt.
 *
 * Der Reihe nach — und diese Reihenfolge ist Absicht:
 *
 *   1. `ohnePerson` — NWS-Person ohne App-Person (Zuzug, noch nicht importiert).
 *   2. **zusammenfassen** je Person (siehe `verschmelzeZeitraeume`). Vor dem
 *      Datumsfilter, denn ein vergangener Zeitraum kann einen laufenden
 *      verlängern (`01.–05.08.` + `06.–30.08.` = eine Abwesenheit bis Ende).
 *   3. `vergangen` — endet vor `ab`; ändert an der Planung nichts mehr.
 *   4. `doppelt` — steht schon da (aus einem früheren Lauf oder von Hand).
 */
export function planeImport(zeitraeume, vorhanden, appIds, personIdOf, ab) {
  const zaehler = { vergangen: 0, ohnePerson: 0, doppelt: 0, verschmolzen: 0 }
  const fehlende = new Set()

  const jePerson = new Map()
  for (const z of zeitraeume) {
    const personId = personIdOf(z.ref)
    if (!personId || !appIds.has(personId)) {
      zaehler.ohnePerson++
      fehlende.add(z.ref)
      continue
    }
    // Nach der **App-Person** gruppieren, nicht nach der NWS-Referenz: Dieselbe
    // Person kommt je nach Quelltabelle als volle ID oder als „<cid>-<mid>"
    // daher — nach der rohen Referenz stünden ihre Zeiträume in zwei Töpfen und
    // überlappten sich fröhlich weiter.
    if (!jePerson.has(personId)) jePerson.set(personId, [])
    jePerson.get(personId).push({ ...z, personId })
  }

  const neu = []
  const gesehen = new Set(vorhanden)
  for (const liste of jePerson.values()) {
    for (const z of verschmelzeZeitraeume(liste)) {
      zaehler.verschmolzen += z.verschmolzen ?? 0
      if (z.bis < ab) { zaehler.vergangen++; continue }
      const key = abwSchluessel(z.personId, z.von, z.bis)
      if (gesehen.has(key)) { zaehler.doppelt++; continue }
      gesehen.add(key)
      neu.push({ ref: z.ref, personId: z.personId, von: z.von, bis: z.bis, herkunft: z.herkunft })
    }
  }
  neu.sort((a, b) => a.von.localeCompare(b.von))
  return { neu, ...zaehler, fehlende: [...fehlende] }
}

/* ============================= Ausführung ================================= */

const TABELLEN = {
  persons: 'Persons_7.5.json',
  awayPeriods: 'AwayPeriods_7.5.json',
  unavailablePeriods: 'UnavailablePeriods_7.5.json',
}

/** Heute als ISO-Datum (lokal, nicht UTC — „ab wann" ist eine Kalenderfrage). */
export function heuteISO(jetzt = new Date()) {
  const j = jetzt.getFullYear()
  const m = String(jetzt.getMonth() + 1).padStart(2, '0')
  const t = String(jetzt.getDate()).padStart(2, '0')
  return `${j}-${m}-${t}`
}

async function main() {
  const arg = argumente(process.argv.slice(2))
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const datenDir = arg.daten || 'C:/DATA/Claude/nws-export/MyData-decrypted'
  const ab = typeof arg.ab === 'string' ? arg.ab : heuteISO()
  const fehlt = []
  if (!url) fehlt.push('SUPABASE_URL')
  if (!key) fehlt.push('SUPABASE_SERVICE_ROLE_KEY')
  if (fehlt.length) {
    console.error(`Fehlt: ${fehlt.join(', ')}\n\nAufruf siehe Kopf dieser Datei.`)
    process.exit(2)
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
    const text = await res.text()
    return text ? JSON.parse(text) : null
  }

  const tabellen = ladeTabellen(datenDir, TABELLEN)
  const cong = arg.cong || (await rest('congregations?select=id&limit=1'))[0]?.id
  if (!cong) { console.error('Keine Versammlung gefunden.'); process.exit(1) }

  const personen = await rest(`persons?select=id&congregation_id=eq.${cong}`)
  const appIds = new Set(personen.map((p) => p.id))
  const vorhandenRows = await rest(
    `absences?select=person_id,from_date,to_date&congregation_id=eq.${cong}`,
  )
  const vorhanden = new Set(
    vorhandenRows
      .filter((r) => r.person_id)
      .map((r) => abwSchluessel(r.person_id, r.from_date, r.to_date)),
  )

  const quellen = [sammleZeitraeume(tabellen.awayPeriods, 'abwesend')]
  if (arg['auch-unverfuegbar']) {
    quellen.push(sammleZeitraeume(tabellen.unavailablePeriods, 'nicht verfügbar'))
  }
  const zeitraeume = quellen.flatMap((q) => q.zeitraeume)
  const verdreht = quellen.flatMap((q) => q.verdreht)

  const personIdOf = personIdAufloeser(tabellen.persons)
  const nameOf = nameAufloeser(tabellen.persons)
  const plan = planeImport(zeitraeume, vorhanden, appIds, personIdOf, ab)

  console.log(`NWS: ${zeitraeume.length} Zeiträume (Quellen: ${quellen.length}).`)
  console.log(`App: ${personen.length} Personen, ${vorhanden.size} Abwesenheiten bereits gespeichert.`)
  console.log(
    `\nEinzufügen: ${plan.neu.length}` +
    ` · zusammengefasst: ${plan.verschmolzen}` +
    ` · vergangen (endet vor ${ab}): ${plan.vergangen}` +
    ` · schon vorhanden: ${plan.doppelt}` +
    ` · ohne App-Person: ${plan.ohnePerson}`,
  )
  if (verdreht.length) {
    console.log(`! ${verdreht.length} Zeiträume mit „bis" vor „von" — übersprungen:`)
    for (const v of verdreht.slice(0, 5)) console.log(`    ${nameOf(v.ref) ?? v.ref}: ${v.von} → ${v.bis}`)
  }
  if (plan.fehlende.length) {
    console.log('\nNWS-Personen ohne App-Person (Personen neu importieren?):')
    console.log(`  ${plan.fehlende.map((r) => nameOf(r) ?? `#${r}`).sort().join(', ')}`)
  }

  for (const e of plan.neu.slice(0, 10)) {
    console.log(`  + ${nameOf(e.ref) ?? e.personId}: ${e.von} → ${e.bis} (${e.herkunft})`)
  }
  if (plan.neu.length > 10) console.log(`  … und ${plan.neu.length - 10} weitere`)

  if (arg.trocken) {
    console.log('\n--trocken: nichts geschrieben.')
    return
  }
  if (plan.neu.length === 0) {
    console.log('\nNichts einzufügen.')
    return
  }

  // In einem Rutsch — PostgREST nimmt ein Array. `user_id` bleibt leer: siehe
  // Kopf dieser Datei (migration-021 muss gelaufen sein).
  try {
    await rest('absences', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(
        plan.neu.map((e) => ({
          congregation_id: cong,
          user_id: null,
          person_id: e.personId,
          from_date: e.von,
          to_date: e.bis,
          reason: '',
        })),
      ),
    })
  } catch (err) {
    const text = String(err instanceof Error ? err.message : err)
    if (/user_id/.test(text) && /null/i.test(text)) {
      console.error(
        '\nDie Datenbank verlangt noch einen Ersteller (user_id).\n' +
        'Bitte zuerst supabase/migration-021-abwesenheit-import.sql ausführen.',
      )
      process.exit(1)
    }
    throw err
  }
  console.log(`\nGeschrieben: ${plan.neu.length} Abwesenheiten eingefügt.`)
}

// Nur ausführen, wenn direkt aufgerufen — beim Import aus dem Test nicht.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  main().catch((err) => {
    console.error(String(err instanceof Error ? err.message : err))
    process.exit(1)
  })
}
