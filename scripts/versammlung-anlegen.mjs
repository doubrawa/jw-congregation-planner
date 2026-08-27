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
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
 *   node scripts/versammlung-anlegen.mjs \
 *     --name "Musterstadt" \
 *     --saal "Hauptstraße 12" \
 *     --zeiten "Di 19:00 · So 10:00" \
 *     --vorname "Anna" --nachname "Beispiel" [--sprache Deutsch] [--trocken]
 *
 * Der **Service-Role-Key** umgeht RLS und darf niemals in die App oder ins
 * Repository. Er steht in Supabase unter Project Settings → API.
 *
 * `--trocken` zeigt nur, was geschähe, und schreibt nichts.
 */
import { argumente } from './gemeinsam.mjs'
export { argumente }

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
  { key: 'ord', name: 'Eingangsordner', count: 1, groups: false },
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
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const fehlt = []
  if (!url) fehlt.push('SUPABASE_URL')
  if (!key) fehlt.push('SUPABASE_SERVICE_ROLE_KEY')
  if (!arg.name) fehlt.push('--name')
  if (!arg.vorname) fehlt.push('--vorname')
  if (!arg.nachname) fehlt.push('--nachname')
  if (fehlt.length) {
    console.error(`Fehlt: ${fehlt.join(', ')}\n\nAufruf siehe Kopf dieser Datei.`)
    process.exit(2)
  }

  const versammlung = {
    name: arg.name,
    hall: arg.saal ?? '',
    meeting_times: arg.zeiten ?? '',
    settings: arg.sprache ? { congLang: arg.sprache } : {},
  }
  const code = einladungscode()

  console.log(`Versammlung:  ${versammlung.name}`)
  console.log(`Saal:         ${versammlung.hall || '—'}`)
  console.log(`Zeiten:       ${versammlung.meeting_times || '—'}`)
  console.log(`Planer:       ${arg.vorname} ${arg.nachname}`)
  console.log(`Dienste:      ${STANDARD_DIENSTE.map((d) => d.name).join(', ')}`)
  console.log(`Wochen:       keine — die erste holt der Planer über den Import`)
  console.log(`Einladung:    ${code}`)

  if (arg.trocken) {
    console.log('\n--trocken: nichts geschrieben.')
    return
  }

  const rest = async (pfad, koerper) => {
    const res = await fetch(`${url}/rest/v1/${pfad}`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(koerper),
    })
    if (!res.ok) throw new Error(`POST ${pfad} ${res.status}: ${await res.text()}`)
    return res.json()
  }

  // Reihenfolge zählt: Person und Dienste hängen per Fremdschlüssel an der
  // Versammlung, der Einladungscode zusätzlich an der Person.
  const [cong] = await rest('congregations', versammlung)
  const [planer] = await rest('persons', {
    congregation_id: cong.id,
    fn: arg.vorname,
    ln: arg.nachname,
    role: 'aeltester',
    planner: true,
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

// Nur ausführen, wenn direkt aufgerufen — beim Import aus dem Test nicht.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  main().catch((err) => {
    console.error(String(err instanceof Error ? err.message : err))
    process.exit(1)
  })
}
