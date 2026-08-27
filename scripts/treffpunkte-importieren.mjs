#!/usr/bin/env node
/**
 * Treffpunkte aus New World Scheduler → JW Congregation Planner.
 *
 * **Was dieses Skript tut — und was nicht.** Der **Grundplan** (welche
 * Treffpunkte es regelmäßig gibt: Wochentag, Zeit, Ort, Gruppe) bleibt Sache
 * des Planers; er steht in den Einstellungen und wird hier **nicht angefasst**.
 * Dieses Skript bringt das, was NWS zusätzlich führt und was sich Woche für
 * Woche ändert: **wer leitet**. Dazu Termine, die im Grundplan gar nicht
 * vorkommen (Pioniertag, „Großer Treffpunkt", ein einzelner Nachmittag) — die
 * legt es als Treffpunkt **nur für diese Woche** an, genau wie „Für diese Woche
 * hinzufügen" im Planen-Tab.
 *
 * Am Ende gibt es einen Vorschlag aus, welche Grundplan-Regeln zu den
 * NWS-Terminen passen würden. Nur zum Vergleich — eingetragen wird er nicht.
 *
 * **Zuordnung.** Über den Montag der Woche (wie beim Wochenplanungs-Import) und
 * darin über **Wochentag + Uhrzeit**. Trifft ein NWS-Termin einen Treffpunkt
 * des Grundplans, bekommt der seinen Leiter; trifft er keinen, entsteht ein
 * eigener. Wochen ohne jw.org-Import bleiben unberührt und werden gemeldet:
 * Die App hängt ihre Treffpunkt-Wochen an die Programmwochen, eine Zeile ohne
 * Woche läse niemand.
 *
 * **Gruppen kennt NWS nicht.** Ein NWS-Termin trägt Ort und Leiter, aber keine
 * Predigtdienstgruppe. Alles Importierte ist deshalb ein
 * **Versammlungstreffpunkt** (`grp ''`). Gruppentreffpunkte legt die Gruppe
 * selbst an — ihr Aufseher darf das in der App —, und der Import lässt sie in
 * Ruhe: Er schreibt nur in Plätze, deren Wochentag und Uhrzeit er trifft, und
 * bevorzugt dabei immer den Versammlungstreffpunkt.
 *
 * **Der Leiter** wird über die stabile Id an die App-Person gebunden
 * (`uuid5("person:<NWS-ID>")`), nicht über den Namen — siehe `nws-personen.mjs`.
 * Ein NWS-Termin **ohne** Leiter löscht nie einen bereits zugeteilten: Ein
 * fehlender Wert ist keine Aussage, und die Zuteilung wäre weg, ohne dass es
 * jemandem auffiele.
 *
 * **Zweimal laufen lassen schadet nicht.** Ein selbst angelegter Treffpunkt
 * trägt eine aus der NWS-Kennung abgeleitete Id; beim zweiten Lauf wird
 * derselbe Termin wiedergefunden statt ein zweites Mal angelegt.
 *
 * ---------------------------------------------------------------- Aufruf ----
 *
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
 *   node scripts/treffpunkte-importieren.mjs \
 *     [--daten C:\DATA\Claude\nws-export\MyData-decrypted] \
 *     [--cong <congregation-id>] [--nur-leere] [--trocken]
 *
 * `--nur-leere` füllt nur unbesetzte Treffpunkte; ohne die Flagge gewinnt NWS
 *               auch über einen bereits eingetragenen Leiter.
 * `--trocken`   zeigt nur, was geschähe, und schreibt nichts.
 *
 * Der **Service-Role-Key** umgeht RLS und darf niemals in die App oder ins
 * Repository. Personenbezogene Daten — Ausgaben nicht einchecken.
 */

import { ladeTabellen } from './gemeinsam.mjs'
import { lebend, nameAufloeser, nurDatum, personIdAufloeser } from './nws-personen.mjs'
import { argumente, mondayOf, personDisplayName, uuid5 } from './wochenplanung-importieren.mjs'

/* ===================== NWS lesen ========================================== */

/**
 * NWS-Wochentag eines ISO-Datums in der Zählung der App (0 = So … 6 = Sa,
 * `FsInstance.wd`). Über UTC-Mittag gerechnet, damit keine Zeitzone einen Tag
 * verschiebt — derselbe Kniff wie in `mondayOf`.
 */
export function wochentag(iso) {
  return new Date(`${iso}T12:00:00Z`).getUTCDay()
}

/**
 * Die Treffpunkte aus `FieldServiceMeetings` — je Zeile ein Termin.
 *
 * Feldbelegung (an diesem Datenbestand abgelesen):
 *   `a` Datum + Uhrzeit · `g` Ort (→ `FieldServiceLocations.a`) ·
 *   `h` Leiter (Personen-Referenz; **-2 = offen**) · `i` freier Zusatz
 *   („Pioniertag", „Großer Treffpunkt") · `t` Gebiete, `o` ungenutzt.
 *
 * Ein Ort, den NWS nicht gesetzt hat (`g` fehlt oder -1), kommt als leerer
 * String heraus — der Aufrufer entscheidet, was dann dasteht. Reine Funktion.
 */
export function sammleTreffpunkte(meetings, locations) {
  const ortVon = new Map(lebend(locations).map((l) => [l.ID, (l.a ?? '').trim()]))
  const out = []
  for (const m of lebend(meetings)) {
    const datum = nurDatum(m.a)
    const zeit = typeof m.a === 'string' ? m.a.slice(11, 16) : ''
    if (!datum || !/^\d{2}:\d{2}$/.test(zeit)) continue
    out.push({
      nwsId: m.ID,
      datum,
      zeit,
      montag: mondayOf(datum),
      wd: wochentag(datum),
      ort: ortVon.get(m.g) ?? '',
      etikett: typeof m.i === 'string' ? m.i.trim() : '',
      // -2 steht in NWS für „niemand zugeteilt"; -1 kommt bei Orten vor. Alles
      // Negative ist keine Person.
      leiterRef: typeof m.h === 'number' && m.h >= 0 ? m.h : null,
    })
  }
  return out.sort((a, b) => `${a.datum}${a.zeit}`.localeCompare(`${b.datum}${b.zeit}`))
}

/** Termine je Programmwoche (Montag → Termine, nach Datum/Zeit sortiert). */
export function nachWoche(treffpunkte) {
  const m = new Map()
  for (const tp of treffpunkte) {
    if (!m.has(tp.montag)) m.set(tp.montag, [])
    m.get(tp.montag).push(tp)
  }
  return m
}

/* ===================== Auf die App-Woche verteilen ======================== */

/**
 * Kennung eines selbst angelegten Treffpunkts — **aus der NWS-Kennung**
 * abgeleitet statt zufällig.
 *
 * Die App vergibt hier `x${crypto.randomUUID()}` (FsPlan). Für einen Import
 * wäre das falsch: Beim zweiten Lauf stünde derselbe Termin ein zweites Mal da.
 * Das `x` vorn ist Absicht — daran erkennt `fsMigrateInstIds` beim Laden einen
 * von Hand angelegten Treffpunkt und lässt die Kennung in Ruhe.
 */
export function manuelleKennung(nwsId) {
  return `x${uuid5(`fs-meeting:${nwsId}`)}`
}

/**
 * Der Platz, in den ein NWS-Termin gehört — oder `null` (keiner) bzw.
 * `'mehrdeutig'`.
 *
 * Gesucht wird in dieser Reihenfolge:
 *   1. **derselbe Termin aus einem früheren Lauf** (Kennung aus der NWS-Id),
 *   2. der Versammlungstreffpunkt aus dem Grundplan an diesem Wochentag und
 *      dieser Uhrzeit,
 *   3. ein sonstiger Versammlungstreffpunkt (z. B. ein früher importierter),
 *   4. der einzige Treffpunkt, der überhaupt passt.
 *
 * Bleiben mehrere Gruppentreffpunkte übrig und kein einziger für die
 * Versammlung, ist die Zuordnung offen: NWS trägt keine Gruppe, jede Wahl wäre
 * geraten. Dann lieber melden. Reine Funktion.
 */
export function passenderPlatz(insts, tp, belegt = new Set()) {
  const kennung = manuelleKennung(tp.nwsId)
  const wieder = insts.find((i) => i.id === kennung)
  if (wieder) return wieder
  const passend = insts.filter(
    (i) => i.wd === tp.wd && i.time === tp.zeit && !belegt.has(i.id) && i.id !== kennung,
  )
  const vers = passend.filter((i) => i.grp === '')
  const ausRegel = vers.find((i) => i.ruleId)
  if (ausRegel) return ausRegel
  if (vers[0]) return vers[0]
  if (passend.length === 1) return passend[0]
  return passend.length > 1 ? 'mehrdeutig' : null
}

/**
 * Eine Treffpunkt-Woche mit den NWS-Terminen füllen; liefert die neue Liste und
 * einen Bericht. Reine Funktion — `insts` bleibt unangetastet.
 *
 * `bind(ref)` löst eine Personen-Referenz zu `{ name, pid? }` auf (leerer Name =
 * offen). `standardOrt` steht in einem selbst angelegten Treffpunkt, wenn NWS
 * keinen Ort führt — wie in der App der Saal der Versammlung.
 */
export function verteileFsWoche(insts, treffpunkte, bind, opt = {}) {
  const { nurLeere = false, standardOrt = '' } = opt
  const next = insts.map((i) => ({ ...i }))
  const z = { gesetzt: 0, angelegt: 0, offen: 0, geschuetzt: 0, mehrdeutig: 0, ohnePid: 0 }
  const belegt = new Set()

  for (const tp of treffpunkte) {
    const { name, pid } = bind(tp.leiterRef)
    const platz = passenderPlatz(next, tp, belegt)
    if (platz === 'mehrdeutig') { z.mehrdeutig++; continue }

    if (!platz) {
      // Ein Termin, den der Grundplan nicht kennt: nur für diese Woche. Der
      // Zusatz aus NWS („Pioniertag") steht mit im Ort — die App hat kein
      // eigenes Feld dafür, und ohne ihn sähe der Termin aus wie jeder andere.
      const ort = [tp.ort, tp.etikett].filter(Boolean).join(' · ') || standardOrt
      const neu = {
        id: manuelleKennung(tp.nwsId),
        ruleId: null,
        grp: '',
        wd: tp.wd,
        time: tp.zeit,
        place: ort,
        leader: name,
        manual: true,
      }
      if (pid) neu.lpid = pid
      else if (name) z.ohnePid++
      next.push(neu)
      belegt.add(neu.id)
      z.angelegt++
      if (!name) z.offen++
      continue
    }

    belegt.add(platz.id)
    // Einen Treffpunkt, den dieser Import selbst angelegt hat, führt er auch
    // nach: Verschiebt NWS ihn auf einen anderen Tag oder eine andere Zeit,
    // stünde sonst beim nächsten Lauf der alte Termin daneben. Was aus dem
    // Grundplan kommt, bleibt unberührt — dort entscheidet der Planer.
    if (platz.manual && platz.id === manuelleKennung(tp.nwsId)) {
      platz.wd = tp.wd
      platz.time = tp.zeit
      platz.place = [tp.ort, tp.etikett].filter(Boolean).join(' · ') || standardOrt
    }
    // Ein leerer NWS-Leiter ist keine Aussage — er löscht nichts.
    if (!name) { z.offen++; continue }
    if (nurLeere && platz.leader) { z.geschuetzt++; continue }
    if (platz.leader === name && platz.lpid === pid) continue
    platz.leader = name
    if (pid) platz.lpid = pid
    else { delete platz.lpid; z.ohnePid++ }
    // Der importierte Leiter ist eine Person der Versammlung, kein Freitext
    // (T63). Bliebe die Marke stehen, zählte die Leitung in keiner Auslastung
    // und in keiner Aufgabenliste mit.
    delete platz.lext
    z.gesetzt++
  }

  next.sort(fsSort)
  return { insts: next, ...z }
}

/** Sortierung wie in der App (`fsSort` in src/data/fs.ts): Wochentag, Zeit, Gruppe. */
export function fsSort(a, b) {
  return ((a.wd + 6) % 7) - ((b.wd + 6) % 7) || a.time.localeCompare(b.time) || a.grp.localeCompare(b.grp)
}

/* ===================== Grundplan-Vorschlag ================================ */

const WD_NAME = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']

/**
 * Aus den NWS-Terminen ablesen, welche **Regeln** dahinterstecken könnten:
 * gleicher Wochentag + gleiche Uhrzeit + gleicher Ort. Kommt ein Muster in
 * (fast) jeder Woche vor, sieht es nach einer wöchentlichen Regel aus; liegt es
 * immer im selben Abschnitt des Monats, nach „N-ter Wochentag im Monat".
 *
 * Ausdrücklich nur ein **Vorschlag zum Vergleich** — der Grundplan bleibt beim
 * Planer. Reine Funktion.
 */
export function grundplanVorschlag(treffpunkte) {
  const muster = new Map()
  for (const tp of treffpunkte) {
    const key = `${tp.wd}|${tp.zeit}|${tp.ort}`
    if (!muster.has(key)) muster.set(key, { wd: tp.wd, zeit: tp.zeit, ort: tp.ort, tage: [] })
    muster.get(key).tage.push(tp.datum)
  }
  const wochen = new Set(treffpunkte.map((tp) => tp.montag)).size
  return [...muster.values()]
    .map((m) => {
      const nte = new Set(m.tage.map((d) => Math.ceil(Number(d.slice(8, 10)) / 7)))
      const monatlich = m.tage.length >= 2 && nte.size === 1 ? [...nte][0] : 0
      return {
        ...m,
        anzahl: m.tage.length,
        monatlich,
        woechentlich: wochen > 0 && m.tage.length >= wochen * 0.75,
        text:
          `${WD_NAME[m.wd]} ${m.zeit}` +
          (m.ort ? ` · ${m.ort}` : '') +
          ` — ${m.tage.length}×` +
          (monatlich ? ` (immer ${monatlich}. ${WD_NAME[m.wd]} im Monat)` : ''),
      }
    })
    .sort((a, b) => b.anzahl - a.anzahl)
}

/* ============================= Ausführung ================================= */

const TABELLEN = {
  persons: 'Persons_7.5.json',
  meetings: 'FieldServiceMeetings_7.5.json',
  locations: 'FieldServiceLocations_7.5.json',
}

async function main() {
  const arg = argumente(process.argv.slice(2))
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const datenDir = arg.daten || 'C:/DATA/Claude/nws-export/MyData-decrypted'
  const nurLeere = Boolean(arg['nur-leere'])
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
  const congRow = arg.cong
    ? (await rest(`congregations?select=id,hall&id=eq.${arg.cong}`))[0]
    : (await rest('congregations?select=id,hall&limit=1'))[0]
  if (!congRow?.id) { console.error('Keine Versammlung gefunden.'); process.exit(1) }
  const cong = congRow.id
  // Ort eines selbst angelegten Treffpunkts, wenn NWS keinen führt — wie in der
  // App die Vorgabe „Saal dieser Versammlung", nicht das deutsche Wort.
  const standardOrt = congRow.hall ?? ''

  // Personen: Anzeigename wie in der App, gefunden über die stabile Id.
  const personen = await rest(`persons?select=id,fn,ln,dn&congregation_id=eq.${cong}`)
  const appById = new Map(personen.map((p) => [p.id, personDisplayName(p.fn, p.ln, p.dn)]))
  const personIdOf = personIdAufloeser(tabellen.persons)
  const nwsNameOf = nameAufloeser(tabellen.persons)
  const fehlendePersonen = new Set()
  const bind = (ref) => {
    if (ref == null) return { name: '' }
    const id = personIdOf(ref)
    const name = id ? appById.get(id) : undefined
    if (name) return { name, pid: id }
    // Kein App-Treffer: Der Leiter steht in NWS, aber (noch) nicht in der App.
    // Dann nur der Name — die App bindet ihn beim Laden an eine eindeutig
    // passende Person (`fsMigrateLeaderPids`), sobald es sie gibt.
    const roh = nwsNameOf(ref)
    if (roh) fehlendePersonen.add(roh)
    return { name: roh ?? '' }
  }

  const treffpunkte = sammleTreffpunkte(tabellen.meetings, tabellen.locations)
  const jeWoche = nachWoche(treffpunkte)
  console.log(`NWS: ${treffpunkte.length} Treffpunkte in ${jeWoche.size} Wochen.`)

  const wochen = await rest(`weeks?select=start&congregation_id=eq.${cong}`)
  const bekannteWochen = new Set(wochen.map((w) => w.start))
  const fsRows = await rest(`fs_weeks?select=start,data&congregation_id=eq.${cong}`)
  const fsNachStart = new Map(fsRows.map((r) => [r.start, r.data ?? []]))
  console.log(`App: ${personen.length} Personen, ${wochen.length} Programmwochen, ${fsRows.length} Treffpunkt-Wochen.`)

  const summe = { gesetzt: 0, angelegt: 0, offen: 0, geschuetzt: 0, mehrdeutig: 0, ohnePid: 0 }
  const geschrieben = []
  let ohneWoche = 0
  for (const [montag, tps] of [...jeWoche].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (!bekannteWochen.has(montag)) { ohneWoche++; continue }
    const vorher = fsNachStart.get(montag) ?? []
    const z = verteileFsWoche(vorher, tps, bind, { nurLeere, standardOrt })
    for (const k of Object.keys(summe)) summe[k] += z[k]
    if (z.gesetzt + z.angelegt > 0) {
      geschrieben.push({ montag, insts: z.insts, neu: !fsNachStart.has(montag), z })
    }
  }

  console.log(
    `\nLeiter gesetzt: ${summe.gesetzt}` +
    ` · Treffpunkte angelegt: ${summe.angelegt}` +
    ` · in NWS offen: ${summe.offen}`,
  )
  if (summe.geschuetzt) console.log(`--nur-leere hat ${summe.geschuetzt} besetzte Treffpunkte geschützt.`)
  if (summe.mehrdeutig) console.log(`! ${summe.mehrdeutig} Termine passten auf mehrere Gruppentreffpunkte — nicht zugeordnet.`)
  if (summe.ohnePid) console.log(`Leiter ohne App-Person (nur Name gesetzt): ${summe.ohnePid}`)
  if (ohneWoche) console.log(`Wochen ohne jw.org-Import übersprungen: ${ohneWoche}`)
  if (fehlendePersonen.size) {
    console.log('\nNWS-Leiter ohne App-Person (Personen neu importieren?):')
    console.log(`  ${[...fehlendePersonen].sort().join(', ')}`)
  }

  console.log('\nGrundplan-Vorschlag (nur zum Vergleich, wird NICHT eingetragen):')
  for (const v of grundplanVorschlag(treffpunkte)) {
    console.log(`  ${v.woechentlich ? 'wöchentlich ' : '            '}${v.text}`)
  }

  if (arg.trocken) {
    console.log(`\n--trocken: nichts geschrieben (${geschrieben.length} Wochen wären betroffen).`)
    for (const g of geschrieben.slice(0, 5)) {
      console.log(`  ${g.montag}: ${g.z.gesetzt} Leiter, ${g.z.angelegt} angelegt`)
    }
    return
  }

  for (const g of geschrieben) {
    if (g.neu) {
      await rest('fs_weeks', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ congregation_id: cong, start: g.montag, data: g.insts }),
      })
    } else {
      await rest(`fs_weeks?congregation_id=eq.${cong}&start=eq.${g.montag}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ data: g.insts }),
      })
    }
  }
  console.log(`\nGeschrieben: ${geschrieben.length} Treffpunkt-Wochen aktualisiert.`)
}

// Nur ausführen, wenn direkt aufgerufen — beim Import aus dem Test nicht.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  main().catch((err) => {
    console.error(String(err instanceof Error ? err.message : err))
    process.exit(1)
  })
}
