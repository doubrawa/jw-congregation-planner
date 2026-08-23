#!/usr/bin/env node
/**
 * **T78 — der Mandanten-Nachweis.** Zwei Versammlungen, zwei echte Konten: Sieht
 * wirklich keines etwas vom anderen, Tabelle für Tabelle?
 *
 * Die Trennung ist seit dem ersten Schema angelegt (`RLS` über
 * `my_congregation_id()`), aber **nie gemessen** worden — es gab schlicht nichts
 * Fremdes, das man nicht sehen dürfte. Mit der Testversammlung aus
 * `testversammlung-anlegen.mjs` gibt es das.
 *
 * **Dieses Skript benutzt bewusst den ANON-Key, nicht den Service-Role-Key.**
 * Der Service-Key umgeht RLS; ein Nachweis damit wäre wertlos. Gemessen wird
 * genau das, was die App in der Hand hat: der öffentliche Schlüssel plus die
 * Anmeldung eines Nutzers. Der anon-Key steht ohnehin im Bundle jedes Besuchers.
 *
 * Drei Proben, in **beide** Richtungen (A→B und B→A):
 *
 *   1. **Lesen, Liste.** Jede Tabelle mit RLS wird abgefragt. Jede Zeile, die
 *      zurückkommt, muss die eigene Versammlung tragen.
 *   2. **Lesen, gezielt.** Bekannte Zeilen der *anderen* Seite werden über ihre
 *      Id geholt. Sie müssen leer zurückkommen. Das ist die schärfere Probe:
 *      Eine Liste könnte auch aus Zufall nichts Fremdes enthalten.
 *   3. **Schreiben.** Ein Einfügen in die fremde Versammlung muss abgewiesen
 *      werden, ein Ändern einer fremden Zeile null Zeilen treffen.
 *
 * **Zur Schreibprobe.** Sie fasst echte Daten an — deshalb so vorsichtig wie
 * möglich: Das Ändern schreibt den **vorhandenen** Wert zurück (`tel` auf sich
 * selbst), ist also auch bei kaputter Richtlinie folgenlos. Gelöscht wird
 * nichts: Ein erfolgreiches Löschen wäre nicht rückgängig zu machen, und
 * Einfügen und Ändern zeigen den Zugriff bereits. Rutscht das Einfügen doch
 * durch, räumt das Skript die Zeile sofort wieder weg und sagt es laut.
 *
 * ---------------------------------------------------------------- Aufruf ----
 *
 * Die Anmeldedaten kommen aus **Umgebungsvariablen**, nicht von der
 * Befehlszeile: Argumente landen in der Verlaufsdatei der Shell, das Kennwort
 * des echten Planers hat dort nichts verloren.
 *
 *   $env:SUPABASE_URL       = "https://<ref>.supabase.co"
 *   $env:SUPABASE_ANON_KEY  = "<anon-key aus .env.local>"
 *   $env:NACHWEIS_A_MAIL    = "<Konto der echten Versammlung>"
 *   $env:NACHWEIS_A_PASS    = "<dessen Kennwort>"
 *   $env:NACHWEIS_B_MAIL    = "planer@probe.invalid"
 *   $env:NACHWEIS_B_PASS    = "<vom Anlege-Skript ausgegeben>"
 *   node scripts/mandanten-nachweis.mjs [--ohne-schreibproben]
 *
 * Rückgabewert 0 = alle Proben bestanden, 1 = mindestens eine nicht.
 */

import { pathToFileURL } from 'node:url'

/* ===================== Was geprüft wird =================================== */

/**
 * Die Tabellen mit RLS. `spalte` ist die Spalte, an der die Zugehörigkeit
 * hängt; `keineZeilen` heißt: Hier darf **niemand** etwas sehen.
 *
 * Die Liste steht hier und wird von `mandanten-nachweis.test.ts` gegen
 * `schema.sql` gehalten — eine neue Tabelle mit RLS, die hier fehlt, fällt
 * dadurch auf, statt still ungeprüft zu bleiben.
 */
export const RLS_TABELLEN = [
  { name: 'congregations', spalte: 'id' },
  { name: 'members', spalte: 'congregation_id' },
  { name: 'persons', spalte: 'congregation_id' },
  { name: 'groups', spalte: 'congregation_id' },
  { name: 'services', spalte: 'congregation_id' },
  { name: 'weeks', spalte: 'congregation_id' },
  { name: 'fs_rules', spalte: 'congregation_id' },
  { name: 'fs_weeks', spalte: 'congregation_id' },
  { name: 'absences', spalte: 'congregation_id' },
  { name: 'notifications', spalte: 'congregation_id' },
  { name: 'confirmations', spalte: 'congregation_id' },
  { name: 'invites', spalte: 'congregation_id' },
  { name: 'push_subscriptions', spalte: 'congregation_id' },
  // Versand-Tagebuch: RLS an, aber bewusst **ohne** Policy — das sperrt alles.
  // Nur die Edge Function kommt heran, und die arbeitet mit der Service-Role.
  { name: 'reminder_log', spalte: 'congregation_id', keineZeilen: true },
]

/** Tabellen, aus denen eine „Landmarke" der anderen Seite geholt wird. */
export const LANDMARKEN = ['persons', 'groups', 'services', 'weeks', 'invites']

/* ===================== Reine Bewertung (prüfbar) ========================== */

/**
 * Eine Liste bewerten: Trägt jede Zeile die eigene Versammlung?
 *
 * `null` als Ergebnis gibt es nicht — eine leere Liste ist bestanden. Wer aus
 * „nichts gefunden" auf „nicht geprüft" schließen will, sieht die Zahl daneben.
 */
export function bewerteListe(zeilen, spalte, eigeneId, keineZeilen = false) {
  if (keineZeilen) {
    return { ok: zeilen.length === 0, eigene: 0, fremd: zeilen.length, hinweis: 'gesperrt' }
  }
  const fremd = zeilen.filter((z) => z[spalte] !== eigeneId).length
  return { ok: fremd === 0, eigene: zeilen.length - fremd, fremd }
}

/**
 * Eine Schreibprobe bewerten. Abgewiesen ist alles, was **nicht** durchkommt:
 * PostgREST meldet einen RLS-Verstoß beim Einfügen als 403/42501, ein Ändern
 * ohne passende Zeile trifft schlicht nichts (leere Antwort).
 */
export function bewerteSchreiben(status, zeilen) {
  if (status >= 400) return { ok: true, wie: `abgewiesen (${status})` }
  const getroffen = Array.isArray(zeilen) ? zeilen.length : zeilen ? 1 : 0
  return getroffen === 0
    ? { ok: true, wie: 'null Zeilen getroffen' }
    : { ok: false, wie: `DURCHGELASSEN — ${getroffen} Zeile(n)` }
}

/* ===================== Zugang ============================================= */

function umgebung() {
  // A ist **optional**. Ohne das Konto der echten Versammlung läuft der Teil,
  // der auch ohne fremdes Kennwort messbar ist: Sieht B irgendwo etwas, das
  // nicht B gehört? Das ist die kleinere Hälfte des Nachweises — aber sie ist
  // jederzeit zu haben, und dafür muss niemand das Kennwort des echten Planers
  // in eine Umgebungsvariable schreiben.
  const noetig = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'NACHWEIS_B_MAIL', 'NACHWEIS_B_PASS']
  const fehlt = noetig.filter((n) => !process.env[n])
  if (fehlt.length) {
    console.error(`Fehlt: ${fehlt.join(', ')}\n\nAufruf siehe Kopf dieser Datei.`)
    process.exit(2)
  }
  if (process.env.SUPABASE_ANON_KEY === process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('SUPABASE_ANON_KEY ist der Service-Role-Key. Der umgeht RLS — der Nachweis wäre wertlos.')
    process.exit(2)
  }
  return { url: process.env.SUPABASE_URL, anon: process.env.SUPABASE_ANON_KEY }
}

/** Anmelden wie die App: Kennwort gegen `/auth/v1/token`, dann mit dem Token. */
async function anmelden(url, anon, mail, pass) {
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: mail, password: pass }),
  })
  if (!res.ok) throw new Error(`Anmeldung ${mail} fehlgeschlagen (${res.status}): ${await res.text()}`)
  const { access_token: token } = await res.json()

  /** PostgREST **als dieser Nutzer** — RLS greift. */
  const rest = async (pfad, method = 'GET', body, prefer = 'return=representation') => {
    const antwort = await fetch(`${url}/rest/v1/${pfad}`, {
      method,
      headers: { apikey: anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: prefer },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await antwort.text()
    let daten = null
    try {
      daten = text ? JSON.parse(text) : null
    } catch {
      daten = text
    }
    return { status: antwort.status, daten }
  }

  const { daten: mitglied } = await rest('members?select=congregation_id,planner')
  const eigene = mitglied?.[0]?.congregation_id
  if (!eigene) throw new Error(`${mail} ist in keiner Versammlung (members leer).`)
  const { daten: cong } = await rest(`congregations?select=name&id=eq.${eigene}`)
  return { mail, rest, eigene, planer: Boolean(mitglied[0].planner), name: cong?.[0]?.name ?? '?' }
}

/* ===================== Ausführung ========================================= */

const HAKEN = (ok) => (ok ? '✓' : '✗')

async function main() {
  const arg = process.argv.slice(2)
  const schreibproben = !arg.includes('--ohne-schreibproben')
  const { url, anon } = umgebung()

  const b = await anmelden(url, anon, process.env.NACHWEIS_B_MAIL, process.env.NACHWEIS_B_PASS)
  const beidseitig = Boolean(process.env.NACHWEIS_A_MAIL && process.env.NACHWEIS_A_PASS)
  const a = beidseitig ? await anmelden(url, anon, process.env.NACHWEIS_A_MAIL, process.env.NACHWEIS_A_PASS) : null

  if (a) console.log(`A: ${a.mail}\n   „${a.name}" ${a.eigene}${a.planer ? ' · Planer' : ' · kein Planer'}`)
  console.log(`B: ${b.mail}\n   „${b.name}" ${b.eigene}${b.planer ? ' · Planer' : ' · kein Planer'}\n`)

  if (!a) {
    console.log('Einseitig: NACHWEIS_A_MAIL/_PASS fehlen. Geprüft wird nur, ob B irgendwo')
    console.log('Fremdes sieht — die gezielten Proben und die Schreibproben brauchen beide Konten.\n')
  }
  if (a && a.eigene === b.eigene) {
    console.error('Beide Konten gehören derselben Versammlung — so ist nichts zu messen.')
    process.exit(2)
  }
  if (a && (!a.planer || !b.planer)) {
    console.log('Hinweis: Die Schreibprobe ist nur aussagekräftig, wenn beide Konten Planer sind —')
    console.log('sonst scheitert das Schreiben schon am fehlenden Recht, nicht an der Trennung.\n')
  }

  let fehler = 0
  const zeile = (ok, text) => {
    if (!ok) fehler++
    console.log(`  ${HAKEN(ok)} ${text}`)
  }

  // ---- 0) Kontrollprobe: gar nicht angemeldet -----------------------------
  // Ohne diese Probe bliebe die Frage offen, ob die Zahlen unten überhaupt
  // etwas messen: Eine Abfrage, die jedem nichts liefert, sähe genauso aus wie
  // eine, die richtig filtert. Hier muss **überall** null herauskommen — mit
  // demselben öffentlichen Schlüssel, den jeder Besucher im Bundle findet.
  console.log('Was der anon-Key ohne Anmeldung sieht (muss überall null sein):')
  let anonZeilen = 0
  for (const t of RLS_TABELLEN) {
    const res = await fetch(`${url}/rest/v1/${t.name}?select=${t.spalte}&limit=1000`, {
      headers: { apikey: anon, Authorization: `Bearer ${anon}` },
    })
    const daten = res.status < 400 ? await res.json() : []
    anonZeilen += Array.isArray(daten) ? daten.length : 0
  }
  zeile(anonZeilen === 0, `${String(RLS_TABELLEN.length).padStart(2)} Tabellen → ${anonZeilen} Zeilen`)
  console.log()

  // ---- 1) Lesen, Liste ----------------------------------------------------
  for (const seite of a ? [a, b] : [b]) {
    console.log(`Was „${seite.name}" beim Abfragen aller Tabellen sieht:`)
    for (const t of RLS_TABELLEN) {
      const { status, daten } = await seite.rest(`${t.name}?select=${t.spalte}&limit=1000`)
      if (status >= 400) {
        zeile(false, `${t.name.padEnd(19)} Abfrage scheiterte (${status})`)
        continue
      }
      const e = bewerteListe(daten ?? [], t.spalte, seite.eigene, t.keineZeilen)
      zeile(e.ok, `${t.name.padEnd(19)} ${e.eigene} eigene · ${e.fremd} fremde${e.hinweis ? ` (${e.hinweis})` : ''}`)
    }
    console.log()
  }

  // ---- 2) Lesen, gezielt --------------------------------------------------
  // Die Landmarken holt sich jede Seite aus ihrem eigenen Bestand; gesucht wird
  // dann über Kreuz. Ohne diesen Schritt bewiese eine leere Liste wenig.
  const landmarken = async (seite) => {
    const out = []
    for (const name of LANDMARKEN) {
      const { daten } = await seite.rest(`${name}?select=id&limit=1`)
      if (daten?.[0]?.id) out.push({ name, id: daten[0].id })
    }
    return out
  }
  const marken = { a: a ? await landmarken(a) : [], b: await landmarken(b) }

  const kreuzproben = a
    ? [
        [a, marken.b, b.name],
        [b, marken.a, a.name],
      ]
    : []
  for (const [seite, fremde, wessen] of kreuzproben) {
    console.log(`Kann „${seite.name}" bekannte Zeilen von „${wessen}" gezielt holen?`)
    for (const m of fremde) {
      const { status, daten } = await seite.rest(`${m.name}?select=id&id=eq.${m.id}`)
      const leer = status < 400 && Array.isArray(daten) && daten.length === 0
      zeile(leer, `${m.name.padEnd(19)} ${m.id} → ${leer ? 'nichts' : `${status}: ${JSON.stringify(daten)}`}`)
    }
    console.log()
  }

  // ---- 3) Schreiben -------------------------------------------------------
  if (a && schreibproben) {
    for (const [seite, ziel] of [
      [a, b],
      [b, a],
    ]) {
      console.log(`Kann „${seite.name}" in „${ziel.name}" schreiben?`)

      // a) Einfügen. Der Name ist absichtlich unübersehbar — falls doch eine
      //    Zeile entsteht und das Aufräumen scheitert, sieht man sofort, was
      //    sie ist und woher sie kommt.
      const probe = { congregation_id: ziel.eigene, fn: 'NACHWEIS', ln: 'BITTE-LOESCHEN', role: 'verkuendiger' }
      const ein = await seite.rest('persons', 'POST', probe)
      const e1 = bewerteSchreiben(ein.status, ein.daten)
      zeile(e1.ok, `persons einfügen      → ${e1.wie}`)
      if (!e1.ok) {
        const id = ein.daten?.[0]?.id
        const weg = await seite.rest(`persons?id=eq.${id}`, 'DELETE', undefined, 'return=minimal')
        console.log(
          weg.status < 400
            ? `    (die eingefügte Zeile ${id} wurde sofort wieder gelöscht)`
            : `    !! Zeile ${id} steht noch in „${ziel.name}" — bitte mit dem Service-Key löschen !!`,
        )
      }

      // b) Ändern — und zwar auf den **vorhandenen** Wert. Selbst wenn die
      //    Richtlinie nachgibt, ändert sich dadurch nichts an echten Daten.
      const marke = (ziel === b ? marken.b : marken.a).find((m) => m.name === 'persons')
      if (marke) {
        const { daten: istWert } = await ziel.rest(`persons?select=tel&id=eq.${marke.id}`)
        const tel = istWert?.[0]?.tel ?? ''
        const aend = await seite.rest(`persons?id=eq.${marke.id}`, 'PATCH', { tel })
        const e2 = bewerteSchreiben(aend.status, aend.daten)
        zeile(e2.ok, `persons ändern        → ${e2.wie}`)
      }
      console.log()
    }
  } else if (a) {
    console.log('Schreibproben übersprungen (--ohne-schreibproben).\n')
  }

  if (fehler === 0) {
    console.log(
      a
        ? 'Alle Proben bestanden: Die beiden Versammlungen sehen einander nicht.'
        : `Alle einseitigen Proben bestanden: „${b.name}" sieht in keiner Tabelle etwas Fremdes.\n` +
            'Für den vollen Nachweis fehlen NACHWEIS_A_MAIL/_PASS — damit kommen die\n' +
            'gezielten Proben und die Schreibproben in beide Richtungen dazu.',
    )
    return
  }
  console.log(`${fehler} Probe(n) NICHT bestanden — siehe die Zeilen mit ✗.`)
  process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(String(err instanceof Error ? err.message : err))
    process.exit(1)
  })
}
