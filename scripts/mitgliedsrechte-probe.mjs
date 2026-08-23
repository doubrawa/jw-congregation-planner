#!/usr/bin/env node
/**
 * **S2 und S3 praktisch messen** — was ein einfaches Mitglied in seiner eigenen
 * Versammlung schreiben darf, und was nicht.
 *
 * Beide Befunde stammen aus dem Lesen der Richtlinien, nicht aus dem Betrieb;
 * sie standen seit dem 7. August unter „Was bewusst offen bleibt", weil der
 * Nachweis **zwei Mitgliedskonten derselben Versammlung** braucht. Seit T78
 * gibt es die (Planer und Mitglied in der Probeversammlung).
 *
 * | Befund | Behauptung |
 * | --- | --- |
 * | **S2** | `confirmations_write` prüft nur `user_id = auth.uid()`, **nicht**, ob der `task_key` zu einem Slot gehört, der dieser Person zugeteilt ist. Ein Mitglied könnte damit eine fremde Aufgabe als „bestätigt" markieren — der Planer sähe ✓, und die eigentlich zuständige Person würde nicht mehr erinnert. Über einen fremden **Hilfsdienst** als „verhindert" ließe sich sogar ein Ersatzgesuch auslösen. |
 * | **S3** | `notifications_insert` erlaubt jedem Mitglied Zeilen vom Typ `verhindert` — mit frei wählbarem `title`, `body` und **Empfänger**. Ein Mitglied könnte im Namen der App beliebige Mitteilungen verschicken. |
 *
 * **Vier Versuche, zwei davon müssen scheitern.** Die Probe misst nicht nur, ob
 * etwas durchkommt, sondern auch, wo die Grenze *doch* greift — sonst bliebe
 * offen, ob die Richtlinie überhaupt etwas tut:
 *
 *   1. fremder `task_key`, eigene `user_id`  → laut S2 **durchgelassen**
 *   2. fremde `user_id`                      → muss **abgewiesen** werden
 *   3. Mitteilung `verhindert` an jemanden   → laut S3 **durchgelassen**
 *   4. Mitteilung `zuteilung` (nur Planer)   → muss **abgewiesen** werden
 *
 * **Jede durchgekommene Zeile wird sofort wieder gelöscht.** Die Mitteilung aus
 * (3) kann das Mitglied nicht selbst wegräumen — `notifications_delete` verlangt
 * `user_id = auth.uid()`, und Empfänger ist der Planer. Deshalb braucht die
 * Probe ohnehin beide Anmeldungen; der Planer räumt seine Zeile selbst weg.
 *
 * ---------------------------------------------------------------- Aufruf ----
 *
 * Gemessen wird mit dem **anon**-Key plus Anmeldung — wie in
 * `mandanten-nachweis.mjs` und aus demselben Grund: Der Service-Role-Key
 * umgeht RLS, ein Nachweis damit wäre wertlos.
 *
 *   $env:SUPABASE_URL          = "https://<ref>.supabase.co"
 *   $env:SUPABASE_ANON_KEY     = "<anon-key aus .env.local>"
 *   $env:PROBE_PLANER_MAIL     = "planer@probe.invalid"
 *   $env:PROBE_PLANER_PASS     = "…"
 *   $env:PROBE_MITGLIED_MAIL   = "mitglied@probe.invalid"
 *   $env:PROBE_MITGLIED_PASS   = "…"
 *   node scripts/mitgliedsrechte-probe.mjs --versammlung <congregation-id>
 *
 * `--versammlung` ist Pflicht und wird gegen beide Konten geprüft. Die Probe
 * **schreibt**, wenn auch nur kurz — sie soll das nicht in der echten
 * Versammlung tun, weil jemand versehentlich sein eigenes Konto einträgt.
 */

import { pathToFileURL } from 'node:url'

/* ===================== Schlüssel (Spiegel von planning.ts) ================ */

/**
 * Stabiler Schlüssel eines Programmpunkt-Slots — dieselbe Entscheidung wie
 * `slotTaskKey` in `src/data/planning.ts`: Kennung, wenn der Punkt eine hat,
 * sonst die Position. Node lädt die TypeScript-Datei nicht, deshalb steht die
 * Regel hier ein zweites Mal; `mitgliedsrechte-probe.test.ts` hält beide
 * Fassungen aneinander.
 *
 * Ein falsch gebauter Schlüssel wäre hier besonders tückisch: Die Probe schriebe
 * ihn anstandslos und meldete „durchgelassen" — nur bezöge er sich auf gar
 * keinen Slot, und der Befund wäre nicht belegt, sondern bloß behauptet.
 */
export function slotSchluessel(item, woche, tab, si, ii, ni, aux = false) {
  const art = aux ? 'aux' : 'part'
  return item.iid ? `${woche}|${tab}|${art}|${item.iid}|${ni}` : `${woche}|${tab}|${art}|${si}|${ii}|${ni}`
}

/** Stabiler Schlüssel eines Hilfsdienst-Slots (Spiegel von `helperTaskKey`). */
export function helferSchluessel(woche, tab, svc, pos) {
  return `${woche}|${tab}|helper|${svc}|${pos}`
}

/**
 * Alle besetzten Slots einer Woche, die **nicht** der angegebenen Person
 * gehören — samt fertigem Schlüssel. Externe Redner (ohne `pid`) bleiben außen
 * vor: Sie haben keinen Bestätigungs-Flow, und eine Bestätigung darauf bewiese
 * nichts über fremde Aufgaben.
 */
export function fremdeSlots(week, eigenePid) {
  const out = []
  for (const tab of ['mid', 'we']) {
    const meeting = week[tab]
    if (!meeting) continue
    ;(meeting.sections ?? []).forEach((sec, si) => {
      ;(sec.items ?? []).forEach((item, ii) => {
        if (!Array.isArray(item.names)) return
        item.names.forEach((slot, ni) => {
          if (!slot.pid || slot.pid === eigenePid) return
          out.push({ art: 'Programm', wer: slot.name, key: slotSchluessel(item, week.start, tab, si, ii, ni) })
        })
      })
    })
    for (const [svc, plaetze] of Object.entries(meeting.helpers ?? {})) {
      plaetze.forEach((slot, pos) => {
        if (!slot.pid || slot.pid === eigenePid) return
        out.push({ art: `Hilfsdienst ${svc}`, wer: slot.name, key: helferSchluessel(week.start, tab, svc, pos) })
      })
    }
  }
  return out
}

/* ===================== Bewertung ========================================== */

/**
 * Einen Schreibversuch bewerten. `erwartetDurch` sagt, was der **Befund**
 * behauptet: Kommt die Zeile an, ist er bestätigt — das ist dann kein
 * „bestanden", sondern eine Lücke. Deshalb hat diese Probe zwei Achsen, und
 * die Ausgabe nennt beide.
 *
 * **Das Urteil hängt am `angekommen`, nicht am Status** — und das ist teuer
 * gelernt: Die erste Fassung schrieb mit `Prefer: return=representation` und
 * bekam auf die Mitteilung ein **403**, obwohl die Zeile erlaubt war. PostgreSQL
 * wendet SELECT-Richtlinien auf die `RETURNING`-Klausel an, und der Absender
 * darf eine Mitteilung an jemand anderen nicht zurücklesen. Um ein Haar wäre S3
 * als „greift nicht mehr" abgehakt worden, obwohl der Befund steht.
 *
 * Die App macht es richtig: `data.ts:1336` fügt ohne `.select()` ein, also ohne
 * `RETURNING`. Genau das ahmt die Probe seither nach — geschrieben wird mit
 * `return=minimal`, und ob etwas ankam, wird **am Ziel** nachgesehen, mit einem
 * Konto, das dort lesen darf.
 */
export function bewerteVersuch(status, angekommen, erwartetDurch) {
  return {
    durch: angekommen,
    wieErwartet: angekommen === erwartetDurch,
    text: `${angekommen ? 'ANGEKOMMEN' : 'nicht angekommen'} (HTTP ${status})`,
  }
}

/* ===================== Zugang ============================================= */

function umgebung() {
  const noetig = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'PROBE_PLANER_MAIL', 'PROBE_PLANER_PASS', 'PROBE_MITGLIED_MAIL', 'PROBE_MITGLIED_PASS']
  const fehlt = noetig.filter((n) => !process.env[n])
  if (fehlt.length) {
    console.error(`Fehlt: ${fehlt.join(', ')}\n\nAufruf siehe Kopf dieser Datei.`)
    process.exit(2)
  }
  if (process.env.SUPABASE_ANON_KEY === process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('SUPABASE_ANON_KEY ist der Service-Role-Key. Der umgeht RLS — die Probe wäre wertlos.')
    process.exit(2)
  }
  return { url: process.env.SUPABASE_URL, anon: process.env.SUPABASE_ANON_KEY }
}

async function anmelden(url, anon, mail, pass) {
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: mail, password: pass }),
  })
  if (!res.ok) throw new Error(`Anmeldung ${mail} fehlgeschlagen (${res.status}): ${await res.text()}`)
  const { access_token: token, user } = await res.json()

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

  const { daten: mitglied } = await rest('members?select=congregation_id,person_id,planner')
  if (!mitglied?.[0]) throw new Error(`${mail} ist in keiner Versammlung.`)
  return { mail, rest, uid: user.id, cong: mitglied[0].congregation_id, pid: mitglied[0].person_id, planer: Boolean(mitglied[0].planner) }
}

/* ===================== Ausführung ========================================= */

async function main() {
  const arg = process.argv.slice(2)
  const versammlung = arg[arg.indexOf('--versammlung') + 1]
  if (!arg.includes('--versammlung') || !versammlung || versammlung.startsWith('--')) {
    console.error('--versammlung <congregation-id> ist Pflicht. Aufruf siehe Kopf dieser Datei.')
    process.exit(2)
  }
  const { url, anon } = umgebung()

  const planer = await anmelden(url, anon, process.env.PROBE_PLANER_MAIL, process.env.PROBE_PLANER_PASS)
  const mitglied = await anmelden(url, anon, process.env.PROBE_MITGLIED_MAIL, process.env.PROBE_MITGLIED_PASS)

  for (const k of [planer, mitglied]) {
    if (k.cong !== versammlung) {
      console.error(`${k.mail} gehört zu ${k.cong}, nicht zu ${versammlung}. Abbruch, es wird nichts geschrieben.`)
      process.exit(2)
    }
  }
  if (!planer.planer) {
    console.error(`${planer.mail} ist kein Planer — dann misst (4) nicht die Grenze, sondern nichts.`)
    process.exit(2)
  }
  if (mitglied.planer) {
    console.error(`${mitglied.mail} ist Planer. Gefragt ist, was ein **einfaches** Mitglied darf.`)
    process.exit(2)
  }

  const { daten: cong } = await planer.rest(`congregations?select=name&id=eq.${versammlung}`)
  console.log(`Versammlung: „${cong?.[0]?.name ?? '?'}" ${versammlung}`)
  console.log(`Planer:      ${planer.mail}`)
  console.log(`Mitglied:    ${mitglied.mail} (Person ${mitglied.pid ?? '—'})\n`)

  // Eine fremde Aufgabe suchen — aus der Sicht des Planers, der alle Wochen sieht.
  const { daten: wochen } = await planer.rest('weeks?select=start,data&order=start&limit=1')
  const week = wochen?.[0]?.data
  if (!week) {
    console.error('Keine Woche in dieser Versammlung — ohne Zuteilungen ist S2 nicht zu messen.')
    process.exit(1)
  }
  const fremde = fremdeSlots(week, mitglied.pid)
  const programm = fremde.find((s) => s.art === 'Programm')
  const dienst = fremde.find((s) => s.art.startsWith('Hilfsdienst'))
  if (!programm) {
    console.error('Kein fremder Programmplatz gefunden.')
    process.exit(1)
  }

  const befunde = []
  const ergebnis = (nr, was, e, folge) => {
    befunde.push({ nr, durch: e.durch, wieErwartet: e.wieErwartet })
    console.log(`  ${e.wieErwartet ? '·' : '!'} (${nr}) ${was}`)
    console.log(`      ${e.text}${folge ? ` — ${folge}` : ''}`)
  }

  // Ein Kennzeichen je Lauf: Damit findet der Empfänger genau die Zeilen dieser
  // Probe wieder — auch die, die gar nicht ankommen sollten.
  const marke = `PROBE-${Date.now()}`
  console.log(`Was das Mitglied schreiben kann (Kennzeichen ${marke}):`)

  // ---- 1) S2: fremder task_key, eigene user_id ----------------------------
  const ziel = dienst ?? programm
  const schluessel = encodeURIComponent(ziel.key)
  const s2 = await mitglied.rest(
    'confirmations',
    'POST',
    { congregation_id: versammlung, user_id: mitglied.uid, task_key: ziel.key, status: dienst ? 'verhindert' : 'bestätigt' },
    'return=minimal',
  )
  // Nachgesehen wird beim **Planer**: Er ist der, dem die falsche Bestätigung
  // etwas vorspiegeln würde.
  const { daten: sicht } = await planer.rest(`confirmations?select=status,user_id&task_key=eq.${schluessel}`)
  const e1 = bewerteVersuch(s2.status, Boolean(sicht?.length), true)
  ergebnis(1, `Bestätigung auf eine fremde Aufgabe (${ziel.art}: ${ziel.wer})`, e1, e1.durch ? 'S2 bestätigt' : 'S2 greift nicht mehr')
  if (e1.durch) {
    console.log(`      Der Planer sieht auf ${ziel.wer}s Platz: ${sicht.map((z) => z.status).join(', ')}`)
    console.log(`      — geschrieben hat sie ${sicht.some((z) => z.user_id === mitglied.uid) ? 'das Mitglied' : 'jemand anderes'}`)
    const weg = await mitglied.rest(`confirmations?task_key=eq.${schluessel}&user_id=eq.${mitglied.uid}`, 'DELETE', undefined, 'return=minimal')
    console.log(weg.status < 400 ? '      (Zeile wieder gelöscht)' : `      !! Zeile blieb stehen (${weg.status}) !!`)
  }

  // ---- 2) Gegenprobe: fremde user_id --------------------------------------
  const s2b = await mitglied.rest(
    'confirmations',
    'POST',
    { congregation_id: versammlung, user_id: planer.uid, task_key: programm.key, status: 'bestätigt' },
    'return=minimal',
  )
  const { daten: sicht2 } = await planer.rest(`confirmations?select=user_id&task_key=eq.${encodeURIComponent(programm.key)}&user_id=eq.${planer.uid}`)
  const e2 = bewerteVersuch(s2b.status, Boolean(sicht2?.length), false)
  ergebnis(2, 'dieselbe Zeile im Namen des Planers (fremde user_id)', e2, e2.durch ? 'AUCH DAS!' : 'die Grenze greift hier')
  if (e2.durch) {
    await planer.rest(`confirmations?task_key=eq.${encodeURIComponent(programm.key)}&user_id=eq.${planer.uid}`, 'DELETE', undefined, 'return=minimal')
  }

  // ---- 3) S3: Mitteilung mit freiem Text an einen anderen ------------------
  const s3 = await mitglied.rest(
    'notifications',
    'POST',
    {
      congregation_id: versammlung,
      user_id: planer.uid,
      type: 'verhindert',
      title: `${marke} — frei erfundener Titel`,
      body: 'Diese Mitteilung hat ein einfaches Mitglied geschrieben, nicht die App.',
    },
    'return=minimal',
  )
  // Nur der Empfänger kann nachsehen — `notifications_select` verlangt
  // `user_id = auth.uid()`. Dass der Absender seine eigene Mitteilung nicht
  // wiederfindet, gehört zum Befund.
  const angekommen3 = await planer.rest(`notifications?select=id,type,title&title=like.${marke}*`)
  const e3 = bewerteVersuch(s3.status, Boolean(angekommen3.daten?.length), true)
  ergebnis(3, 'Mitteilung mit freiem Text an den Planer', e3, e3.durch ? 'S3 bestätigt' : 'S3 greift nicht mehr')
  for (const z of angekommen3.daten ?? []) {
    console.log(`      Beim Planer in der Glocke: „${z.title}" (${z.type})`)
    const weg = await planer.rest(`notifications?id=eq.${z.id}`, 'DELETE', undefined, 'return=minimal')
    console.log(weg.status < 400 ? '      (vom Planer wieder gelöscht)' : `      !! Mitteilung ${z.id} blieb stehen (${weg.status}) !!`)
  }

  // ---- 4) Gegenprobe: Mitteilungstyp, den nur Planer setzen dürfen ---------
  const s3b = await mitglied.rest(
    'notifications',
    'POST',
    { congregation_id: versammlung, user_id: planer.uid, type: 'zuteilung', title: `${marke} — als Zuteilung ausgegeben`, body: '' },
    'return=minimal',
  )
  const angekommen4 = await planer.rest(`notifications?select=id&title=like.${marke}*`)
  const e4 = bewerteVersuch(s3b.status, Boolean(angekommen4.daten?.length), false)
  ergebnis(4, 'dieselbe Mitteilung als Typ „zuteilung" (nur Planer)', e4, e4.durch ? 'AUCH DAS!' : 'die Grenze greift hier')
  for (const z of angekommen4.daten ?? []) {
    await planer.rest(`notifications?id=eq.${z.id}`, 'DELETE', undefined, 'return=minimal')
  }

  const durch = befunde.filter((b) => b.durch).length
  const ueberraschungen = befunde.filter((b) => !b.wieErwartet)
  console.log(`\n${durch} von 4 Schreibversuchen kamen durch.`)
  if (ueberraschungen.length === 0) {
    console.log('Genau die erwarteten: S2 und S3 sind damit nicht mehr gelesen, sondern gemessen —')
    console.log('und die beiden Gegenproben zeigen, dass die Richtlinie im Übrigen greift.')
    return
  }
  console.log(`Abweichend von der Erwartung: ${ueberraschungen.map((b) => `(${b.nr})`).join(', ')} — das ist der Blick wert.`)
  process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(String(err instanceof Error ? err.message : err))
    process.exit(1)
  })
}
