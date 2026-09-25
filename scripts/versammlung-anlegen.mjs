#!/usr/bin/env node
/**
 * Eine Versammlung anlegen — **außerhalb der App**, vom Administrator.
 *
 * Bis zum 13. August 2026 tat das die App selbst: Wer sich in einer leeren
 * Versammlung anmeldete, bekam den Knopf „DEMO-DATEN LADEN" und damit 15
 * erfundene Personen, 3 Gruppen und **vier erfundene Wochenprogramme**, die
 * echt aussahen. Ein Planer konnte das für sein Programm halten; wegräumen
 * musste er es in jedem Fall.
 *
 * Angelegt wird deshalb nur, was ohne Erfindung feststeht:
 *
 *   * die Versammlung selbst (Name, Saal, Zusammenkunftszeiten),
 *   * **eine** Person — der Planer,
 *   * die Standard-Hilfsdienste (Ton, Mikrofone, Zoom-Ordner, …),
 *   * ein Einladungscode, mit dem der Planer sein Konto verknüpft.
 *
 * **Keine Woche.** Die erste holt der Planer in der App über „Nächste Woche
 * importieren" — mit dem echten Programm von jw.org. Bis dahin zeigen
 * Programm und Planen einen Hinweis genau darauf (siehe
 * `src/app/leere-versammlung.test.tsx`).
 *
 * ---------------------------------------------------------------- Aufruf ----
 *
 *   node scripts/versammlung-anlegen.mjs \
 *     --name "Musterstadt" \
 *     --saal "Hauptstraße 12" \
 *     --mid "2 19:00" --we "0 10:00" \
 *     --vorname "Anna" --nachname "Beispiel" [--sprache de] [--trocken]
 *
 * **Nichts vorher setzen.** Die Projekt-URL holt sich das Skript aus
 * `.env.local` (`VITE_SUPABASE_URL`), und nach dem Schlüssel fragt es, wenn
 * keiner in der Umgebung steht — verdeckt, mit dem Link aufs Dashboard daneben.
 * Wer `SUPABASE_SECRET_KEY` gesetzt hat, wird nicht gefragt.
 *
 * `--mid`/`--we` sind Wochentag und Uhrzeit der beiden Zusammenkünfte:
 * `"<wd> <hh:mm>"` mit 0 = Sonntag … 6 = Samstag. Ohne sie gelten die Vorgaben
 * der Datenbank (Dienstag 19:00, Sonntag 10:00). `--sprache` ist der
 * **jw.org-Sprachcode** (`de`, `en`, `cmn-hant`), nicht der Anzeigename.
 *
 * Der **Service-Role-Key** umgeht RLS und darf niemals in die App oder ins
 * Repository. Er steht in Supabase unter Project Settings → API.
 *
 * `--trocken` zeigt nur, was geschähe, und schreibt nichts.
 */
import { alsSkript, argumente, restKlient, zugangsdaten } from './gemeinsam.mjs'

/**
 * `"2 19:00"` → `{ mid_wd: 2, mid_time: '19:00' }` für die genannte
 * Zusammenkunft. Unbrauchbares bricht ab, statt eine Zeit zu erfinden: Eine
 * Versammlung, die am falschen Tag zusammenkommt, merkt es erst an der ersten
 * Erinnerung.
 */
export function zeitSpalten(tab, wert) {
  const erwartet = `--${tab} erwartet "<wd> <hh:mm>" (0 = Sonntag … 6 = Samstag)`
  const m = /^([0-6])\s+(\d{1,2}):(\d{2})$/.exec(String(wert).trim())
  if (!m) throw new Error(`${erwartet}, nicht "${wert}"`)
  // Die Ziffernform allein reicht nicht: `25:99` passte auf das Muster und ging
  // bis in den POST, wo PostgreSQL es abwies — der Betreiber bekam dann einen
  // rohen REST-Fehler, in dem der Schalter gar nicht vorkommt. Hier steht, was
  // der Kommentar oben verspricht.
  const [std, min] = [Number(m[2]), Number(m[3])]
  if (std > 23 || min > 59) throw new Error(`${erwartet} — "${m[2]}:${m[3]}" ist keine Uhrzeit`)
  return { [`${tab}_wd`]: Number(m[1]), [`${tab}_time`]: `${String(std).padStart(2, '0')}:${m[3]}` }
}

/**
 * Hilfsdienste, die jede Versammlung zunächst bekommt.
 *
 * **Muss gleich `STANDARD_DIENSTE` in `src/data/vorgaben.ts` sein.** Node kann
 * die TypeScript-Datei nicht laden, deshalb steht die Liste hier ein zweites
 * Mal — und `scripts/versammlung-anlegen.test.ts` vergleicht beide, damit sie
 * nicht auseinanderlaufen.
 */
export const STANDARD_DIENSTE = [
  { key: 'ton', name: 'Ton / Video', count: 1, groups: false },
  { key: 'mik', name: 'Mikrofone', count: 2, groups: false },
  { key: 'zoom', name: 'Zoom-Ordner', count: 1, groups: false },
  { key: 'eingang', name: 'Eingangsordner', count: 1, groups: false },
  { key: 'saal', name: 'Saalordner', count: 1, groups: false },
  { key: 'rund', name: 'Rundgangsordner', count: 1, groups: false },
  { key: 'rein', name: 'Reinigung', count: 1, groups: true },
]

/**
 * Einladungscode: sechs Zeichen, **ohne** die Paare, die sich auf Papier und am
 * Telefon verwechseln lassen (0/O, 1/I/L, 5/S, 8/B). Der Code wird vorgelesen
 * und abgetippt; ein Zeichen, das man zweimal erklären muss, ist ein Fehler im
 * Alphabet, nicht beim Nutzer.
 */
export const CODE_ALPHABET = 'ACDEFGHJKMNPQRTUVWXY234679'

export function einladungscode(zufall = () => Math.random()) {
  let s = ''
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[Math.floor(zufall() * CODE_ALPHABET.length)]
  return s
}

/** Bereichsprofil eines Planers: er ist Ältester und darf alles Feste. */
export function planerBereiche() {
  return {
    vorsitzMid: true,
    vorsitzWe: true,
    gebet: true,
    vortrag: true,
    studium: true,
    leser: true,
    bibellesung: true,
    schulung: true,
    schulungPartner: true,
    // Hilfsdienste: je Dienst ein eigener Bereich (`svc:<key>`).
    ...Object.fromEntries(STANDARD_DIENSTE.map((d) => [`svc:${d.key}`, true])),
  }
}

/* ---- Ab hier nur noch Ausführung ---------------------------------------- */

async function main() {
  const arg = argumente(process.argv.slice(2))
  const { url, key } = await zugangsdaten()
  const fehlt = []
  if (!arg.name) fehlt.push('--name')
  if (!arg.vorname) fehlt.push('--vorname')
  if (!arg.nachname) fehlt.push('--nachname')
  if (fehlt.length) {
    console.error(`Fehlt: ${fehlt.join(', ')}\n\nAufruf siehe Kopf dieser Datei.`)
    process.exit(2)
  }

  /*
   * Die Regeltermine stehen seit T105 als **Werte** in vier Spalten (Wochentag
   * 0 = Sonntag … 6 = Samstag, Uhrzeit als `time`); hier stand vorher ein
   * Anzeigetext („Di 19:00 · So 10:00") in einer Spalte `meeting_times`, und
   * die Sprache als deutscher Name in einem `settings`-Beutel. Beides gibt es
   * nicht mehr — das Skript lief danach in ein 400 und legte gar nichts an.
   *
   * Ohne `--mid`/`--we` gelten die Vorgaben der Datenbank (Di 19:00, So 10:00);
   * die Spalten bleiben dann einfach ungenannt.
   */
  const versammlung = {
    name: arg.name,
    hall: arg.saal ?? '',
    ...(arg.mid ? zeitSpalten('mid', arg.mid) : {}),
    ...(arg.we ? zeitSpalten('we', arg.we) : {}),
    ...(arg.sprache ? { cong_lang: arg.sprache } : {}),
  }
  const code = einladungscode()

  console.log(`Versammlung:  ${versammlung.name}`)
  console.log(`Saal:         ${versammlung.hall || '—'}`)
  console.log(`Zeiten:       ${arg.mid ?? 'Vorgabe (Di 19:00)'} · ${arg.we ?? 'Vorgabe (So 10:00)'}`)
  console.log(`Planer:       ${arg.vorname} ${arg.nachname}`)
  console.log(`Dienste:      ${STANDARD_DIENSTE.map((d) => d.name).join(', ')}`)
  console.log(`Wochen:       keine — die erste holt der Planer über den Import`)
  console.log(`Einladung:    ${code}`)

  if (arg.trocken) {
    console.log('\n--trocken: nichts geschrieben.')
    return
  }

  // Dieses Skript legt nur an — deshalb eine POST-Hülle über dem gemeinsamen
  // Klienten statt einer eigenen Closure.
  const roh = restKlient(url, key)
  const rest = (pfad, koerper) =>
    roh(pfad, {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(koerper),
    })

  // Reihenfolge zählt: Person und Dienste hängen per Fremdschlüssel an der
  // Versammlung, der Einladungscode zusätzlich an der Person.
  const [cong] = await rest('congregations', versammlung)
  const [planer] = await rest('persons', {
    congregation_id: cong.id,
    fn: arg.vorname,
    ln: arg.nachname,
    role: 'aeltester',
    planner_vorgemerkt: true,
    priv: planerBereiche(),
  })
  await rest(
    'services',
    STANDARD_DIENSTE.map((d, i) => ({
      congregation_id: cong.id,
      key: d.key,
      name: d.name,
      count: d.count,
      groups: d.groups,
      position: i,
    })),
  )
  await rest('invites', {
    congregation_id: cong.id,
    code,
    person_id: planer.id,
    planner: true,
  })

  console.log(`\nAngelegt. Versammlung ${cong.id}`)
  console.log(`Der Planer meldet sich an und gibt den Code ${code} ein.`)
}

alsSkript(import.meta.url, main)
