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
 * **Seit migration-022 misst sie den geschlossenen Zustand** (23. August 2026).
 * Beide Befunde sind behoben; die Probe belegt es jetzt in beide Richtungen —
 * denn eine Richtlinie, die *alles* abweist, bestünde jede Fremd-Probe glänzend
 * und bräche dabei die App:
 *
 *   1. fremder `task_key`, eigene `user_id`   → muss **abgewiesen** werden (S2)
 *   2. fremde `user_id`                       → muss **abgewiesen** werden
 *   3. `verhindert` an einen Nicht-Planer      → muss **abgewiesen** werden (S3)
 *   4. Mitteilung `zuteilung` (nur Planer)     → muss **abgewiesen** werden
 *   5. **eigene** Aufgabe bestätigen           → muss **durchkommen**
 *   6. Absage an den Planer (legitimer Weg)    → muss **durchkommen**
 *
 * Kommt (1) oder (3) durch, steht der jeweilige Befund wieder offen. Scheitert
 * (5) oder (6), ist die Richtlinie zu streng — das wiegt schwerer, weil der
 * Client fire-and-forget schreibt und der Verlust fast lautlos wäre.
 *
 * **Seit dem 24. August 2026 misst sie zusätzlich S10, S11 und S13** — dieselbe
 * Anlage, andere Grenzen. (7)–(8) hängen wieder an RLS, (9)–(10) an der Edge
 * Function `substitute`, die mit Service-Role arbeitet und sich deshalb selbst
 * schützen muss:
 *
 *   7. Abwesenheit auf eine **fremde** Person  → muss **abgewiesen** werden (S11)
 *   8. **eigene** Abwesenheit                  → muss **durchkommen**
 *   9. fremden Platz übernehmen, ohne Absage   → muss **abgewiesen** werden (S13)
 *  10. Ersatzsuche mit gefälschter Versammlung → muss **abgewiesen** werden (S10)
 *
 * (10) ist die einzige, die nicht bloß eine Regel prüft, sondern einen **Weg**:
 * Der Rumpfwert trägt ein angehängtes `#`. Ging der ungekodiert in die
 * REST-Pfade, schnitt er dort alles Folgende ab — und die Prüfung, wer eine
 * Ersatzsuche auslösen darf, lief ins Leere. Kommt (10) durch, ist nicht eine
 * Richtlinie offen, sondern die ganze Kodierung.
 *
 * **Jede durchgekommene Zeile wird sofort wieder gelöscht.** Wer aufräumen darf,
 * hängt am Empfänger: `notifications_delete` verlangt `user_id = auth.uid()`,
 * also räumt bei (6) der Planer seine eigene Zeile weg. Deshalb braucht die
 * Probe beide Anmeldungen.
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
 * Der Dienst aus einem Hilfsdienst-Schlüssel — oder null, wenn es keiner ist.
 *
 * Gebraucht für (9): `take` weist zuerst ab, wer für den Dienst gar nicht
 * qualifiziert ist. Wäre das Mitglied es nicht, bekäme die Probe `not-qualified`
 * und hätte über S13 nichts gemessen, sähe aber genauso aus wie ein Erfolg.
 */
export function dienstAusSchluessel(key) {
  const p = String(key ?? '').split('|')
  return p.length === 5 && p[2] === 'helper' ? p[3] : null
}

/** Ist die Person für diesen Dienst freigeschaltet? (Spiegel von `isQualified`.) */
export function qualifiziertFuer(person, svc) {
  return Boolean(person?.priv?.[`svc:${svc}`])
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

/**
 * Das Gegenstück: die Slots, die der Person **gehören**. Ohne einen davon misst
 * die Probe nur die halbe Wahrheit — dass die Richtlinie Fremdes abweist,
 * bewiese nichts, wenn sie alles abwiese. Genau das ist die Gefahr an
 * migration-022: Eine zu strenge Prüfung bräche das Bestätigen, und der Client
 * schreibt fire-and-forget.
 */
export function eigeneSlots(week, eigenePid) {
  if (!eigenePid) return []
  const out = []
  for (const tab of ['mid', 'we']) {
    const meeting = week[tab]
    if (!meeting) continue
    ;(meeting.sections ?? []).forEach((sec, si) => {
      ;(sec.items ?? []).forEach((item, ii) => {
        if (!Array.isArray(item.names)) return
        item.names.forEach((slot, ni) => {
          if (slot.pid !== eigenePid) return
          out.push({ art: 'Programm', wer: slot.name, key: slotSchluessel(item, week.start, tab, si, ii, ni) })
        })
      })
    })
    for (const [svc, plaetze] of Object.entries(meeting.helpers ?? {})) {
      plaetze.forEach((slot, pos) => {
        if (slot.pid !== eigenePid) return
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

  /**
   * Eine Edge Function aufrufen — mit dem **Nutzer-Token**, wie die App es tut.
   * Die Function arbeitet intern mit Service-Role; ihre Rechteprüfung hängt
   * also allein daran, wen dieses Token ausweist. Genau das ist die Grenze,
   * die (9) und (10) messen.
   */
  const funktion = async (name, rumpf) => {
    const antwort = await fetch(`${url}/functions/v1/${name}`, {
      method: 'POST',
      headers: { apikey: anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(rumpf),
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
  return { mail, rest, funktion, uid: user.id, cong: mitglied[0].congregation_id, pid: mitglied[0].person_id, planer: Boolean(mitglied[0].planner) }
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
  const { daten: wochen } = await planer.rest('weeks?select=start,data&order=start&limit=12')
  const week = wochen?.[0]?.data
  if (!week) {
    console.error('Keine Woche in dieser Versammlung — ohne Zuteilungen ist S2 nicht zu messen.')
    process.exit(1)
  }
  // Die Kennung der Woche steht in der **Spalte**; im JSONB kann sie bei
  // Altbestand fehlen (migration-017). Ohne sie hiesse der Schlüssel
  // "undefined|mid|…" und träfe nichts.
  const mitKennung = (z) => ({ ...z.data, start: z.start })
  const fremde = fremdeSlots(mitKennung(wochen[0]), mitglied.pid)
  const programm = fremde.find((s) => s.art === 'Programm')
  const dienst = fremde.find((s) => s.art.startsWith('Hilfsdienst'))
  // Eine EIGENE Aufgabe — über alle geladenen Wochen gesucht: In einer
  // einzelnen ist nicht jeder eingeteilt, und ohne sie fehlt der Probe der
  // Beweis, dass die Richtlinie nicht zu streng ist (Fall 5).
  const eigen = (wochen ?? []).flatMap((z) => eigeneSlots(mitKennung(z), mitglied.pid))[0]
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
  const e1 = bewerteVersuch(s2.status, Boolean(sicht?.length), false)
  ergebnis(1, `Bestätigung auf eine fremde Aufgabe (${ziel.art}: ${ziel.wer})`, e1, e1.durch ? 'S2 STEHT NOCH OFFEN' : 'abgewiesen — migration-022 greift')
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

  // ---- 3) S3: freier Text an einen Empfaenger, der KEIN Planer ist ---------
  // Empfänger ist hier das Mitglied selbst — nicht aus Bequemlichkeit, sondern
  // weil es die Frage stellt, auf die es ankommt: Der legitime Weg adressiert
  // die **Planer**, alles andere ist der Missbrauch aus S3. Und nachsehen kann
  // in dieser Glocke nur der Empfänger (`notifications_select`).
  const s3 = await mitglied.rest(
    'notifications',
    'POST',
    {
      congregation_id: versammlung,
      user_id: mitglied.uid,
      type: 'verhindert',
      title: `${marke} — frei erfundener Titel`,
      body: 'Diese Mitteilung hat ein einfaches Mitglied geschrieben, nicht die App.',
    },
    'return=minimal',
  )
  const angekommen3 = await mitglied.rest(`notifications?select=id,type,title&title=like.${marke}*`)
  const e3 = bewerteVersuch(s3.status, Boolean(angekommen3.daten?.length), false)
  ergebnis(3, 'Mitteilung mit freiem Text an einen Nicht-Planer', e3, e3.durch ? 'S3 STEHT NOCH OFFEN' : 'abgewiesen — migration-022 greift')
  for (const z of angekommen3.daten ?? []) {
    console.log(`      In der Glocke gelandet: „${z.title}" (${z.type})`)
    const weg = await mitglied.rest(`notifications?id=eq.${z.id}`, 'DELETE', undefined, 'return=minimal')
    console.log(weg.status < 400 ? '      (wieder gelöscht)' : `      !! Mitteilung ${z.id} blieb stehen (${weg.status}) !!`)
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

  // ---- 5) Der Beweis, dass die Richtlinie nicht zu streng ist --------------
  // Ohne diesen Fall bewiese die Probe nichts: Eine Richtlinie, die ALLES
  // abweist, bestünde (1) bis (4) glänzend und bräche die App. Fehlt dem
  // Mitglied in den geladenen Wochen jede eigene Aufgabe, wird das gesagt statt
  // stillschweigend übersprungen.
  if (!eigen) {
    console.log('  ? (5) eigene Aufgabe bestätigen — KEINE gefunden, nicht gemessen')
    console.log('      Ohne eigene Zuteilung bleibt offen, ob die Richtlinie zu streng ist.')
  } else {
    const eigenKey = encodeURIComponent(eigen.key)
    const s5 = await mitglied.rest(
      'confirmations',
      'POST',
      { congregation_id: versammlung, user_id: mitglied.uid, task_key: eigen.key, status: 'bestätigt' },
      'return=minimal',
    )
    const { daten: sicht5 } = await mitglied.rest(`confirmations?select=status&task_key=eq.${eigenKey}&user_id=eq.${mitglied.uid}`)
    const e5 = bewerteVersuch(s5.status, Boolean(sicht5?.length), true)
    ergebnis(5, `eigene Aufgabe bestätigen (${eigen.art}: ${eigen.wer})`, e5, e5.durch ? 'der Weg steht offen' : 'ZU STRENG — die App kann nicht mehr bestätigen')
    if (e5.durch) {
      await mitglied.rest(`confirmations?task_key=eq.${eigenKey}&user_id=eq.${mitglied.uid}`, 'DELETE', undefined, 'return=minimal')
    }
  }

  // ---- 6) und dass der legitime Meldeweg offen bleibt ----------------------
  const s6 = await mitglied.rest(
    'notifications',
    'POST',
    { congregation_id: versammlung, user_id: planer.uid, type: 'verhindert', title: `${marke} — Absage an den Planer`, body: '' },
    'return=minimal',
  )
  const angekommen6 = await planer.rest(`notifications?select=id&title=like.${marke}*`)
  const e6 = bewerteVersuch(s6.status, Boolean(angekommen6.daten?.length), true)
  ergebnis(6, 'Absage-Mitteilung an den Planer (der legitime Weg)', e6, e6.durch ? 'kommt an' : 'ZU STRENG — Absagen erreichen den Planer nicht mehr')
  for (const z of angekommen6.daten ?? []) {
    await planer.rest(`notifications?id=eq.${z.id}`, 'DELETE', undefined, 'return=minimal')
  }

  // ---- 7) S11: Abwesenheit auf eine FREMDE Person -------------------------
  // Der Zweig „die Zeile gehört mir" (`user_id = auth.uid()`) sagte nichts über
  // `person_id` — und die entscheidet, um wen es geht. Kommt das durch, fällt
  // der Betroffene aus jeder Zuteilung, unter seinem Namen, ohne sein Zutun.
  const fremdePid = planer.pid
  if (!fremdePid || fremdePid === mitglied.pid) {
    console.log('  ? (7) Abwesenheit auf eine fremde Person — keine zweite Person verknüpft, nicht gemessen')
  } else {
    const absId = crypto.randomUUID()
    const s7 = await mitglied.rest(
      'absences',
      'POST',
      { id: absId, congregation_id: versammlung, user_id: mitglied.uid, person_id: fremdePid, from_date: '2099-01-01', to_date: '2099-01-02', reason: marke },
      'return=minimal',
    )
    // Nachgesehen wird beim Planer: Er ist der, dem die erfundene Abwesenheit
    // den Betroffenen aus der Zuteilung nimmt.
    const { daten: sicht7 } = await planer.rest(`absences?select=id,person_id&id=eq.${absId}`)
    const e7 = bewerteVersuch(s7.status, Boolean(sicht7?.length), false)
    ergebnis(7, 'Abwesenheit auf eine fremde Person eintragen', e7, e7.durch ? 'S11 STEHT NOCH OFFEN' : 'abgewiesen — migration-023 greift')
    if (e7.durch) {
      const weg = await planer.rest(`absences?id=eq.${absId}`, 'DELETE', undefined, 'return=minimal')
      console.log(weg.status < 400 ? '      (Zeile wieder gelöscht)' : `      !! Zeile blieb stehen (${weg.status}) !!`)
    }
  }

  // ---- 8) Gegenprobe: die eigene Abwesenheit -----------------------------
  // Ohne sie bewiese (7) nichts. Ein Konto ohne verknüpfte Person schreibt mit
  // `person_id: null` — genau der Fall, für den der erste Zweig noch offen ist.
  const eigeneAbsId = crypto.randomUUID()
  const s8 = await mitglied.rest(
    'absences',
    'POST',
    { id: eigeneAbsId, congregation_id: versammlung, user_id: mitglied.uid, person_id: mitglied.pid, from_date: '2099-01-01', to_date: '2099-01-02', reason: marke },
    'return=minimal',
  )
  const { daten: sicht8 } = await mitglied.rest(`absences?select=id&id=eq.${eigeneAbsId}`)
  const e8 = bewerteVersuch(s8.status, Boolean(sicht8?.length), true)
  ergebnis(8, `eigene Abwesenheit eintragen (Person ${mitglied.pid ?? 'keine'})`, e8, e8.durch ? 'der Weg steht offen' : 'ZU STRENG — niemand kann sich mehr abmelden')
  if (e8.durch) await mitglied.rest(`absences?id=eq.${eigeneAbsId}`, 'DELETE', undefined, 'return=minimal')

  // ---- 9) S13: einen fremden Platz übernehmen, ohne dass Ersatz gesucht ist
  // `take` verlangte Mitgliedschaft und Qualifikation — nicht, dass jemand
  // abgesagt hat. Wer den Dienst kann, konnte damit jeden Platz an sich ziehen.
  const svc = dienst ? dienstAusSchluessel(dienst.key) : null
  const { daten: meinePerson } = mitglied.pid
    ? await mitglied.rest(`persons?select=priv&id=eq.${mitglied.pid}`)
    : { daten: null }
  if (!dienst) {
    console.log('  ? (9) fremden Platz übernehmen — kein fremder Hilfsdienst-Platz in der Woche, nicht gemessen')
  } else if (!qualifiziertFuer(meinePerson?.[0], svc)) {
    console.log(`  ? (9) fremden Platz übernehmen — Mitglied ist für „${svc}" nicht qualifiziert, nicht gemessen`)
    console.log('      Die Function wiese schon vorher mit „not-qualified" ab; über S13 sagt das nichts.')
  } else {
    const vorher = dienst.wer
    const a9 = await mitglied.funktion('substitute', { action: 'take', taskKey: dienst.key })
    // Nachgesehen wird an der Woche selbst: Der Statuscode allein genügt nicht,
    // denn geschrieben wird mit Service-Role — ein Fehlschlag danach sähe wie
    // eine Ablehnung aus, während der Platz längst umgeschrieben wäre.
    const { daten: w9 } = await planer.rest(`weeks?select=data&start=eq.${wochen[0].start}`)
    const jetzt = fremdeSlots({ ...w9?.[0]?.data, start: wochen[0].start }, mitglied.pid).find((s) => s.key === dienst.key)
    const e9 = bewerteVersuch(a9.status, jetzt?.wer !== vorher, false)
    ergebnis(9, `fremden Platz übernehmen, ohne dass Ersatz gesucht ist (${dienst.wer})`, e9, e9.durch ? 'S13 STEHT NOCH OFFEN' : `abgewiesen (${a9.daten?.error ?? '—'})`)
    if (e9.durch) console.log(`      Auf dem Platz steht jetzt: ${jetzt?.wer ?? '(leer)'} statt ${vorher}`)
  }

  // ---- 10) S10: Ersatzsuche mit gefälschter Versammlungskennung ------------
  // Doppelt verboten: Das Mitglied steht in diesem Platz nicht und hat für ihn
  // nicht abgesagt. Das angehängte `#` war der Weg, die Prüfung dahin
  // laufen zu lassen — es schnitt die nachfolgenden Filter aus dem REST-Pfad.
  const a10 = await mitglied.funktion('substitute', {
    action: 'seek',
    congregationId: `${versammlung}#`,
    taskKey: ziel.key,
  })
  const nachher10 = await mitglied.rest(`notifications?select=id&title=eq.${encodeURIComponent('Ersatz gesucht')}&user_id=eq.${mitglied.uid}`)
  const e10 = bewerteVersuch(a10.status, a10.status < 400, false)
  ergebnis(10, 'Ersatzsuche für einen fremden Platz, Versammlung mit „#" gefälscht', e10, e10.durch ? 'S10 STEHT NOCH OFFEN' : `abgewiesen (${a10.daten?.error ?? '—'})`)
  if (e10.durch) {
    console.log(`      Die Function hat gearbeitet: ${JSON.stringify(a10.daten)}`)
    for (const z of nachher10.daten ?? []) {
      await mitglied.rest(`notifications?id=eq.${z.id}`, 'DELETE', undefined, 'return=minimal')
    }
  }

  const verboten = befunde.filter((b) => b.nr !== 5 && b.nr !== 6 && b.nr !== 8)
  const durch = verboten.filter((b) => b.durch).length
  const ueberraschungen = befunde.filter((b) => !b.wieErwartet)
  console.log(`\n${durch} von ${verboten.length} verbotenen Schreibversuchen kamen durch.`)
  if (ueberraschungen.length === 0) {
    console.log('Genau die erwarteten: S2, S3, S10, S11 und S13 sind damit nicht mehr gelesen,')
    console.log('sondern gemessen — und die drei Gegenproben zeigen, dass die Regeln nicht zu')
    console.log('streng geraten sind: Bestätigen, Abmelden und Absagen gehen weiter.')
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
