/**
 * **Schüler- und Partner-Beschriftung in bereits importierten Wochen nachtragen.**
 *
 * Seit „Der Schüler stand ohne Beschriftung neben seinem Gesprächspartner"
 * setzt der Import beide Rollen: der Zugeteilte eines Gesprächsteils trägt
 * `Schüler`, sein Gegenüber `Partner` (vorher `Gesprächspartner`). Der
 * **Bestand** kennt beides nicht — die Rolle entsteht beim Import, und den gibt
 * es je Woche nur einmal: `importNextWeek` holt immer die Woche **nach** der
 * letzten geladenen. Eine schon importierte Woche lässt sich über die App also
 * gar nicht auffrischen, nur löschen — und das nähme alle Zuteilungen mit.
 *
 * Deshalb dieses Skript: Es fasst ausschließlich die Beschriftung an. Namen,
 * Kennungen (`pid`), Bestätigungen und alles andere bleiben unberührt.
 *
 * Zwei Dinge werden je Gesprächsteil gesetzt:
 *   1. der Slot mit `bereichsKey: 'schulungPartner'` bekommt `rolle: 'Partner'`
 *      (der alte deutsche Schlüssel `Gesprächspartner` steht sonst in FRAG
 *      nicht mehr und fiele in jeder Fremdsprache auf Deutsch zurück),
 *   2. der Slot mit `bereichsKey: 'schulung'` **desselben Punktes** bekommt
 *      `rolle: 'Schüler'` — aber nur, wenn ihm ein Partner gegenübersteht.
 *      Eine Ansprache bleibt unbeschriftet, wie in `togglePartner`.
 *
 * Die Zusätzliche Klasse (`item.aux`) fährt mit; die Sprachvarianten
 * (`week.alt`) nicht — sie tragen keine Zuteilungen.
 *
 * Aufruf — ohne Vorbereitung, das Skript fragt nach dem Schlüssel:
 *
 *   node scripts/rollen-nachtragen.mjs --trocken
 *
 * Die Projekt-URL holt es sich aus `.env.local` (`VITE_SUPABASE_URL`).
 *
 * **Welcher Schlüssel:** der `sb_secret_…` aus dem Dashboard unter Project
 * Settings → API Keys → Secret keys. Die Legacy-JWT-Schlüssel (`anon`,
 * `service_role`) sind in diesem Projekt seit 14.8.2026 deaktiviert. Steht er
 * als `SUPABASE_SECRET_KEY` in der Umgebung (oder unter dem alten Namen
 * `SUPABASE_SERVICE_ROLE_KEY`, siehe `secretKey`), fragt das Skript nicht.
 *
 * Er darf **nicht** in `.env.local` landen: was dort als `VITE_*` liegt, geht
 * ins Bündel, und dieser Schlüssel umgeht jede Zeilen-Sicherheit. Dorthin
 * gehört der `sb_publishable_…`.
 *
 * `--trocken`   zeigt nur, was geschähe, und schreibt nichts.
 * `--cong <id>` beschränkt auf eine Versammlung (sonst: alle).
 */

import { argumente, istPlatzhalter, refAusUrl, restKlient, urlAusEnvText, zugangsdaten } from './gemeinsam.mjs'
export { istPlatzhalter, refAusUrl, urlAusEnvText }

// Damit der Test die Helfer über dieses Skript erreicht, wie es die anderen
// Wartungsskripte für ihre eigenen auch tun.
export { authKopf } from './gemeinsam.mjs'

export const SCHUELER = 'Schüler'
export const PARTNER = 'Partner'

/**
 * Beschriftung einer Slot-Reihe nachtragen. Gibt zurück, wie viele Slots sich
 * geändert haben — 0 heißt: hier war schon alles richtig.
 *
 * Arbeitet auf der Reihe **an Ort und Stelle**; der Aufrufer entscheidet, ob er
 * das Ergebnis schreibt.
 */
export function reiheNachtragen(slots) {
  if (!Array.isArray(slots)) return 0
  const partner = slots.filter((s) => s?.bereichsKey === 'schulungPartner')
  if (!partner.length) return 0
  let geaendert = 0
  for (const s of partner) {
    if (s.rolle === PARTNER) continue
    s.rolle = PARTNER
    geaendert++
  }
  // Der Schüler wird nur benannt, weil ihm jemand gegenübersteht.
  for (const s of slots) {
    if (s?.bereichsKey !== 'schulung') continue
    if (s.rolle === SCHUELER) continue
    s.rolle = SCHUELER
    geaendert++
  }
  return geaendert
}

/** Eine ganze Woche nachtragen (mid + we, Haupt- und Klassenplätze). */
export function wocheNachtragen(data) {
  let geaendert = 0
  for (const tab of ['mid', 'we']) {
    for (const sektion of data?.[tab]?.sections ?? []) {
      for (const item of sektion?.items ?? []) {
        geaendert += reiheNachtragen(item?.names)
        geaendert += reiheNachtragen(item?.aux)
      }
    }
  }
  return geaendert
}

/*
 * Hier standen `urlAusEnvText`, `urlAusEnvDatei`, `istPlatzhalter`, `refAusUrl`
 * und `schluesselErfragen` — der ganze Weg von „nichts gesetzt" zu „kann
 * schreiben". Er stand **nur hier**, und genau das ist am 17. September 2026
 * teuer geworden: Beim Neuaufbau meldeten fünf andere Skripte nacheinander
 * „Invalid API key", weil sie ihn nicht hatten. Seit dem 18. September steht er
 * in `gemeinsam.mjs` als `zugangsdaten()` und gilt für alle.
 */

async function main() {
  const arg = argumente(process.argv.slice(2))
  // URL aus `.env.local`, Schlüssel notfalls erfragt — beides steht seit dem
  // 18. September 2026 in `gemeinsam.mjs`, damit es **jedes** Skript kann.
  // Dieses hier konnte es als einziges; dass die anderen es nicht konnten, hat
  // einen ganzen Neuaufbau gekostet.
  const { url, key } = await zugangsdaten()

  const rest = restKlient(url, key)

  const filter = arg.cong ? `&congregation_id=eq.${arg.cong}` : ''
  const rows = await rest(`weeks?select=congregation_id,start,data&order=start.asc${filter}`)
  if (!rows?.length) { console.error('Keine Wochen gefunden.'); process.exit(1) }

  const zuSchreiben = []
  for (const row of rows) {
    const geaendert = wocheNachtragen(row.data)
    if (geaendert) zuSchreiben.push({ ...row, geaendert })
  }

  console.log(`${rows.length} Wochen gelesen, ${zuSchreiben.length} zu ändern:`)
  for (const w of zuSchreiben) console.log(`  ${w.start}  ${w.geaendert} Plätze`)
  if (!zuSchreiben.length) { console.log('Nichts zu tun — die Beschriftung sitzt schon.'); return }

  if (arg.trocken) {
    console.log(`\n--trocken: nichts geschrieben (${zuSchreiben.length} Wochen wären betroffen).`)
    return
  }

  for (const w of zuSchreiben) {
    await rest(`weeks?congregation_id=eq.${w.congregation_id}&start=eq.${w.start}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ data: w.data }),
    })
  }
  console.log(`\n${zuSchreiben.length} Wochen geschrieben.`)
}

// Nur beim direkten Aufruf laufen — der Test importiert die Helfer.
if (process.argv[1]?.endsWith('rollen-nachtragen.mjs')) {
  // `main().catch(…)` wie in den übrigen Wartungsskripten: ein unbehandelter
  // Fehlschlag riss Node mit einem `Assertion failed` aus libuv hinaus, und
  // daneben war die eigentliche Meldung nicht mehr zu finden.
  //
  // `exitCode` statt `exit()`: Nach einem gescheiterten `fetch` hält undici
  // seinen Verbindungspool noch kurz offen. `process.exit()` reißt ihn mitten
  // im Schließen weg — dann kam dieselbe libuv-Assertion zurück und stand
  // wieder über der Meldung, die sie erklären sollte. So läuft Node aus und
  // liefert den Code trotzdem.
  main().catch((err) => {
    console.error(`\nAbgebrochen: ${err instanceof Error ? err.message : err}`)
    process.exitCode = 1
  })
}
