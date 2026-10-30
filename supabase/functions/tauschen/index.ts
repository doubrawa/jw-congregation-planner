// =============================================================================
// Supabase Edge Function: tauschen — Hilfsdienste tauschen (T153, 29.10.2026)
// =============================================================================
// Sechs Aktionen (Aufruf mit Nutzer-JWT, supabase.functions.invoke):
//
//   { aktion: 'angebote', gibtAb, heute? }
//     Mit wem der Aufrufer seinen Platz `gibtAb` tauschen könnte: jeder Platz
//     desselben Dienstes an einem anderen Tag, für den die Regeln Ja sagen
//     (`regeln.ts`). Antwort `{ ok, angebote: [{ nimmt, personId, konto }] }`
//     — `konto`: Hat der Inhaber ein Konto, fragt die App ihn an; ohne Konto
//     sieht er keine Anfrage, dann tauscht der Fragende gleich (`direkt`).
//
//   { aktion: 'direkt', gibtAb, nimmt, heute? }
//     Tauscht sofort mit jemandem ohne Konto: Bescheid gibt der Fragende
//     mündlich (Betreiber, 30.10.2026). Dieselben Regeln wie beim Annehmen;
//     wer ein Konto hat, sagt selbst zu (`has-account`). Zugesagt ist nur der
//     neue Platz des Fragenden — der andere sagt nicht in der App zu. Die
//     Planer bekommen „Getauscht". Antwort wie bei `annehmen`.
//
//   { aktion: 'anfragen', gibtAb, nimmt, heute? }
//     Fragt den, der `nimmt` hat. Legt die Anfrage an; er bekommt „Tausch
//     angefragt" als Glocke und Push. Je abgegebenem Platz eine Anfrage.
//     Antwort `{ ok, anfrage }`.
//
//   { aktion: 'zurueckziehen', id }   — der Fragende
//   { aktion: 'ablehnen', id }        — der Gefragte; der Fragende bekommt
//                                       „Tausch abgelehnt"
//   { aktion: 'annehmen', id, heute? } — der Gefragte
//     Prüft alles noch einmal mit frisch gelesenen Daten und tauscht dann
//     beide Plätze auf einmal — eine Woche über `wocheSchreiben`, zwei über
//     `wochen_tauschen` (ganz oder gar nicht). Beide haben zugesagt, und das
//     Versand-Tagebuch führt beide als benachrichtigt: Sie wissen es ja.
//     Der Fragende und die Planer bekommen „Getauscht" (Betreiber: keine
//     Zustimmung des Planers, nur Bescheid). Offene Anfragen zu einem der
//     beiden Plätze verfallen, ebenso ein Ersatzgesuch dafür.
//     Antwort `{ ok, wochen: [{ woche, vorher, stand }] }` — die App übernimmt
//     die neuen Stände wie nach dem Einspringen.
//
// Bei einem Fehler `{ error }`, der Grund, den die App nennt: die
// `TauschFehler` aus `regeln.ts`, dazu
//   unauthorized / forbidden  nicht angemeldet; kein Mitglied oder ohne Person
//   no-account                der Gefragte hat kein Konto (anfragen)
//   has-account               der andere hat ein Konto — ihn fragen (direkt)
//   already-asked             für diesen Platz läuft schon eine Anfrage
//   gone                      die Anfrage gibt es nicht (mehr), oder sie gilt
//                             einem anderen
//   stand                     eine Woche hat sich zwischen Lesen und Schreiben
//                             geändert — die App lädt nach
//
// Sicherheit: Versammlung und eigene Person kommen aus der Mitgliedszeile, nie
// aus dem Rumpf; jeder Wert geht durch `wert()` in den Pfad. Die Anfragen
// schreibt nur diese Function (Dienstrolle) — Mitglieder lesen die eigenen.
//
// Secrets: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT (wie
//   substitute), APP_URL optional. SUPABASE_URL / SERVICE_ROLE_KEY automatisch.
//
// Deploy:  npx supabase functions deploy tauschen --project-ref <ref>
// (OHNE --no-verify-jwt — der Aufruf braucht ein gültiges Nutzer-Login.)
// =============================================================================

import { CORS, json, restKlient, wert } from '../_shared/rest.ts'
import { wocheSchreiben } from '../_shared/woche-schreiben.ts'
import { schluesselTeile, type Tab } from '../_shared/aufgaben-schluessel.ts'
import { abbestellerFuer, vapidSetzen, type Zustellung, zustellen } from '../_shared/push.ts'
import {
  heuteUtc,
  personDisplayName,
  terminText,
  versatzMitAbweichung,
  zeitMitAbweichung,
  zeitenAus,
  type ZeitenRow,
} from '../_shared/planung.ts'
import { kontoAufloeser } from '../_shared/konten.ts'
import { alsFreitext } from '../_shared/i18n/freitext.ts'
import { type ServiceRow, type SubscriptionRow, uebersetzerFuer, type Week } from '../_shared/zuteilungen.ts'
// Der Titel des Ersatzgesuchs: Ist einer der beiden Plätze abgesagt und gesucht,
// ist die Suche mit dem Tausch erledigt — wie beim Einspringen.
import { TITEL_GESUCHT } from '../substitute/texte.ts'
import {
  type Lage,
  type TauschPerson,
  type TauschPlatz,
  type TauschWoche,
  tauschAngebote,
  tauschAnwenden,
  tauschPruefen,
} from './regeln.ts'
import { type TauschTexte, tauschTexte, TITEL_ABGELEHNT, TITEL_ANGEFRAGT, TITEL_GETAUSCHT } from './texte.ts'

declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response> | Response) => void
  env: { get: (key: string) => string | undefined }
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:noreply@example.org'
const APP_URL = Deno.env.get('APP_URL') ?? 'https://versammlung.app/'

const rest = restKlient(SUPABASE_URL, SERVICE_KEY)

/** Ein Tipp auf die Nachricht führt zu den eigenen Aufgaben — dort steht die Anfrage. */
const ZIEL = `${APP_URL}#go=aufgaben`

/** Eine offene Anfrage, wie die App sie liest. */
interface Anfrage {
  id: string
  von_user: string
  von_person: string
  an_person: string
  gibt_ab: string
  nimmt: string
  bis: string
}
const ANFRAGE_SPALTEN = 'id,von_user,von_person,an_person,gibt_ab,nimmt,bis'

interface Mitglied {
  user_id: string
  person_id: string | null
  planner: boolean
  zuteiler?: boolean
}

/** Wer fragt — aus der Mitgliedszeile, nie aus dem Rumpf. */
interface Aufrufer {
  userId: string
  cong: string
  personId: string
  /** Der Kalendertag des Geräts, soweit glaubhaft (`heuteUtc`). */
  heute: string
}

/** Was eine Aktion gelesen hat. */
interface Gelesen {
  lage: Lage
  members: Mitglied[]
  /** Konto einer Person — `undefined` ohne Konto. */
  kontoVon: (personId: string) => string | undefined
}

const STATUS: Record<string, number> = {
  'bad-request': 400,
  forbidden: 403,
  'not-yours': 403,
  'no-partner': 403,
  'not-offered': 403,
  'not-qualified': 403,
  'slot-not-found': 404,
  gone: 404,
}
/** Ein Grund, den die App nennt; was keinen eigenen Status hat, ist ein Konflikt mit dem Stand. */
const fehler = (code: string): Response => json({ error: code }, STATUS[code] ?? 409)

/** Liste für einen `in.(…)`-Filter — jeder Wert für sich kodiert. */
const liste = (werte: readonly string[]): string => `(${werte.map(wert).join(',')})`

/** Die Wochen zweier Schlüssel — `null`, wenn einer kein Hilfsdienst ist. */
function wochenVon(gibtAb: string, nimmt: string): string[] | null {
  const a = schluesselTeile(gibtAb)
  const b = schluesselTeile(nimmt)
  if (a?.art !== 'helper' || b?.art !== 'helper') return null
  return [...new Set([a.woche, b.woche])]
}

/**
 * **Die Lage lesen** — die Wochen (genau diese, oder alle ab einem Tag), dazu
 * Dienste, Personen, Zeiten, Abwesenheiten ab heute, Mitglieder und je Woche,
 * ob ihr Plan hinausging (ein Eintrag im Versand-Tagebuch genügt, wie beim
 * Füllen eines freien Platzes).
 */
async function lesen(k: Aufrufer, wochen: string[] | { ab: string }): Promise<Gelesen> {
  const c = wert(k.cong)
  const wochenFilter = Array.isArray(wochen) ? `start=in.${liste(wochen)}` : `start=gte.${wert(wochen.ab)}`
  const [weekRows, services, persons, congRows, absences, members] = await Promise.all([
    rest.get<TauschWoche[]>(`weeks?select=start,data,updated_at&congregation_id=eq.${c}&${wochenFilter}`),
    rest.get<ServiceRow[]>(`services?select=key,name,count,groups&congregation_id=eq.${c}`),
    rest.get<TauschPerson[]>(`persons?select=id,fn,ln,priv&congregation_id=eq.${c}`),
    rest.get<ZeitenRow[]>(`congregations?select=mid_wd,mid_time,we_wd,we_time&id=eq.${c}`),
    rest.get<{ person_id: string | null; from_date: string; to_date: string }[]>(
      `absences?select=person_id,from_date,to_date&congregation_id=eq.${c}&to_date=gte.${wert(k.heute)}`,
    ),
    rest.get<Mitglied[]>(`members?select=user_id,person_id,planner,zuteiler&congregation_id=eq.${c}`),
  ])
  const gesendet = new Set<string>()
  await Promise.all(
    weekRows.map(async (w) => {
      const log = await rest.get<{ task_key: string }[]>(
        `assignment_log?select=task_key&congregation_id=eq.${c}&task_key=like.${wert(`${w.start}|*`)}&limit=1`,
      )
      if (log.length > 0) gesendet.add(w.start)
    }),
  )
  const konto = kontoAufloeser(members, persons)
  return {
    lage: {
      wochen: new Map(weekRows.map((w) => [w.start, w])),
      services,
      personen: new Map(persons.map((p) => [p.id, p])),
      abwesend: (pid, tag) => absences.some((a) => a.person_id === pid && a.from_date <= tag && tag <= a.to_date),
      gesendet,
      zeiten: zeitenAus(congRows[0]),
      heute: k.heute,
    },
    members,
    kontoVon: (pid) => konto(pid, ''),
  }
}

/** Der Termin eines Platzes, wie ihn „Ersatz gesucht" nennt: Tag und Uhrzeit, eine Abweichung vor dem Rhythmus. */
function termin(lage: Lage, p: { woche: string; tab: Tab }): string {
  const woche = lage.wochen.get(p.woche)!
  const zeit = lage.zeiten[p.tab]
  const versatz = versatzMitAbweichung(woche.data.dev, p.tab, zeit.wd)
  return terminText(woche.start, versatz, woche.data[p.tab]?.date, zeitMitAbweichung(woche.data.dev, p.tab, zeit.time))
}

/** Der Name des Dienstes, wie die Versammlung ihn führt. */
const dienst = (lage: Lage, svc: string): string => lage.services.find((s) => s.key === svc)?.name ?? svc

const nameVon = (p: TauschPerson): string => alsFreitext(personDisplayName(p.fn, p.ln))

/**
 * Glocke und Push an eine Menge von Konten. Der Titel steht kanonisch deutsch
 * in der Glocke, der Push trägt ihn in der Sprache des Geräts; der Rumpf
 * besteht aus Atomen, die der Fragment-Übersetzer erledigt. Gebündelt wird je
 * Schlüssel (`tag`): Zwei Anfragen verdrängen sich nicht.
 */
async function benachrichtigen(
  cong: string,
  konten: readonly (string | undefined)[],
  titel: string,
  pushTitel: (t: TauschTexte) => string,
  body: string,
  taskKey: string,
): Promise<void> {
  const ids = [...new Set(konten.filter((u): u is string => Boolean(u)))]
  if (ids.length === 0) return
  await rest.send(
    'POST',
    'notifications',
    ids.map((user_id) => ({ congregation_id: cong, user_id, type: 'zuteilung', title: titel, body, task_key: taskKey })),
  )
  if (!vapidSetzen(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)) return
  const subs = await rest.get<SubscriptionRow[]>(
    `push_subscriptions?select=id,user_id,endpoint,p256dh,auth,lang&congregation_id=eq.${wert(cong)}&user_id=in.${liste(ids)}`,
  )
  const trFuer = uebersetzerFuer()
  const zustellungen: Zustellung[] = subs.map((s) => ({
    abo: s,
    titel: pushTitel(tauschTexte(s.lang)),
    body: trFuer(s.lang)(body),
    url: ZIEL,
    tag: taskKey,
  }))
  await zustellen(zustellungen, abbestellerFuer(rest))
}

/** Die Glocken-Zeile „Tausch angefragt" einer Anfrage — sie trägt deren Kennung. */
const anfrageSchluessel = (id: string): string => `tausch|${id}`

async function anfrageLesen(k: Aufrufer, id: string): Promise<Anfrage | undefined> {
  if (!id) return undefined
  const zeilen = await rest.get<Anfrage[]>(
    `tausch_anfragen?select=${ANFRAGE_SPALTEN}&congregation_id=eq.${wert(k.cong)}&id=eq.${wert(id)}`,
  )
  return zeilen[0]
}

/**
 * Anfragen löschen. Ihre Glocken-Zeilen beim Gefragten nimmt die Datenbank mit
 * (`tausch_glocke_loeschen`) — wie bei jeder anderen Löschung auch, etwa durch
 * das Aufräumen am Montag.
 */
async function anfragenLoeschen(k: Aufrufer, filter: string): Promise<void> {
  await rest.send('DELETE', `tausch_anfragen?congregation_id=eq.${wert(k.cong)}&${filter}`)
}

/* ---- Die Aktionen -------------------------------------------------------- */

async function angebote(k: Aufrufer, gibtAb: string): Promise<Response> {
  if (schluesselTeile(gibtAb)?.art !== 'helper') return fehler('bad-request')
  // Ab dem Montag vor sechs Tagen: Das Wochenende einer Woche, die schon
  // begonnen hat, kann noch kommen. Was vorbei ist, sortiert `tauschPruefen` aus.
  const ab = new Date(Date.parse(k.heute) - 6 * 864e5).toISOString().slice(0, 10)
  const { lage, kontoVon } = await lesen(k, { ab })
  // Auch wer kein Konto hat: Mit ihm tauscht der Fragende gleich, nachdem sie
  // es mündlich abgesprochen haben (Betreiber, 30.10.2026).
  const angebote = tauschAngebote(lage, gibtAb, k.personId)
  return json({
    ok: true,
    angebote: angebote.map((b) => ({ nimmt: b.key, personId: b.person.id, konto: kontoVon(b.person.id) !== undefined })),
  })
}

async function anfragen(k: Aufrufer, gibtAb: string, nimmt: string): Promise<Response> {
  const wochen = wochenVon(gibtAb, nimmt)
  if (!wochen) return fehler('bad-request')
  const { lage, kontoVon } = await lesen(k, wochen)
  const urteil = tauschPruefen(lage, gibtAb, nimmt, k.personId)
  if (!urteil.ok) return fehler(urteil.fehler)
  const partnerKonto = kontoVon(urteil.b.person.id)
  if (!partnerKonto) return fehler('no-account')

  // Was zu diesem Platz noch dasteht, aber nicht mehr gilt, sperrte sonst eine
  // neue Anfrage (eine je Platz): eine verfallene — die räumt erst das
  // Aufräumen am Montag weg — und eine des vorigen Inhabers, wenn der Planer
  // den Platz inzwischen umgeteilt hat.
  await anfragenLoeschen(k, `gibt_ab=eq.${wert(gibtAb)}&bis=lt.${wert(k.heute)}`)
  await anfragenLoeschen(k, `gibt_ab=eq.${wert(gibtAb)}&von_person=neq.${wert(k.personId)}`)
  const offen = await rest.get<{ id: string }[]>(
    `tausch_anfragen?select=id&congregation_id=eq.${wert(k.cong)}&gibt_ab=eq.${wert(gibtAb)}`,
  )
  if (offen.length > 0) return fehler('already-asked')
  const angelegt = await rest.zeilenSchreiben<Anfrage>('POST', `tausch_anfragen?select=${ANFRAGE_SPALTEN}`, [
    {
      congregation_id: k.cong,
      von_user: k.userId,
      von_person: k.personId,
      an_person: urteil.b.person.id,
      gibt_ab: gibtAb,
      nimmt,
      bis: urteil.bis,
    },
  ])
  // Scheitert das Anlegen, war fast sicher eine zweite Anfrage zu diesem Platz
  // schneller (eine je Platz, `unique`).
  const anfrage = angelegt?.[0]
  if (!anfrage) return fehler('already-asked')

  // „Simon fragt, ob du Mikrofone am 20. September übernimmst" — den eigenen
  // Tag kennt der Gefragte; die Karte in der App nennt beide.
  await benachrichtigen(
    k.cong,
    [partnerKonto],
    TITEL_ANGEFRAGT,
    (t) => t.angefragt,
    `${dienst(lage, urteil.a.svc)} · ${termin(lage, urteil.a)} · ${nameVon(urteil.a.person)}`,
    anfrageSchluessel(anfrage.id),
  )
  return json({ ok: true, anfrage })
}

async function zurueckziehen(k: Aufrufer, id: string): Promise<Response> {
  const anfrage = await anfrageLesen(k, id)
  if (!anfrage || (anfrage.von_user !== k.userId && anfrage.von_person !== k.personId)) return fehler('gone')
  await anfragenLoeschen(k, `id=eq.${wert(anfrage.id)}`)
  return json({ ok: true })
}

async function ablehnen(k: Aufrufer, id: string): Promise<Response> {
  const anfrage = await anfrageLesen(k, id)
  if (!anfrage || anfrage.an_person !== k.personId) return fehler('gone')
  await anfragenLoeschen(k, `id=eq.${wert(anfrage.id)}`)
  // Dem Fragenden Bescheid, über den Platz, den er wollte — soweit es ihn noch gibt.
  const wochen = wochenVon(anfrage.gibt_ab, anfrage.nimmt)
  if (wochen) {
    const { lage } = await lesen(k, wochen)
    const ich = lage.personen.get(k.personId)
    const teile = schluesselTeile(anfrage.nimmt)
    if (ich && teile?.art === 'helper' && lage.wochen.has(teile.woche)) {
      await benachrichtigen(
        k.cong,
        [anfrage.von_user],
        TITEL_ABGELEHNT,
        (t) => t.abgelehnt,
        `${dienst(lage, teile.svc)} · ${termin(lage, teile)} · ${nameVon(ich)}`,
        anfrage.gibt_ab,
      )
    }
  }
  return json({ ok: true })
}

/** Je geschriebener Woche der alte und der neue Stand — die App übernimmt sie (`tauschStaendeUebernehmen`). */
type Staende = { woche: string; vorher: string; stand: string }[]

/**
 * Die geänderten Wochen schreiben — eine über `wocheSchreiben`, zwei über
 * `wochen_tauschen`, ganz oder gar nicht. Zurück kommen je Woche der alte und
 * der neue Stand; `null`, wenn eine sich inzwischen geändert hat.
 */
async function schreiben(k: Aufrufer, lage: Lage, neu: Map<string, Week>): Promise<Staende | null> {
  const eintraege = [...neu.entries()].map(([woche, data]) => ({ woche, data, vorher: lage.wochen.get(woche)!.updated_at }))
  const [a, b] = eintraege
  if (!a) return null
  if (!b) {
    const stand = await wocheSchreiben(rest, k.cong, a.woche, a.vorher, a.data)
    return stand ? [{ woche: a.woche, vorher: a.vorher, stand }] : null
  }
  const zeilen = await rest.zeilenSchreiben<{ woche: string; stand: string }>('POST', 'rpc/wochen_tauschen', {
    p_congregation: k.cong,
    p_woche_a: a.woche,
    p_stand_a: a.vorher,
    p_data_a: a.data,
    p_woche_b: b.woche,
    p_stand_b: b.vorher,
    p_data_b: b.data,
  })
  if (!zeilen || zeilen.length !== 2) return null
  return eintraege.map((e) => ({ woche: e.woche, vorher: e.vorher, stand: zeilen.find((z) => z.woche === e.woche)?.stand ?? '' }))
}

/**
 * **Den Tausch vollziehen**, nachdem die Regeln Ja gesagt haben: beide Plätze
 * schreiben (ganz oder gar nicht), die Zusagen der neuen Inhaber, das
 * Versand-Tagebuch, und was zu den beiden Plätzen offen war, ist erledigt.
 * `null`, wenn eine Woche sich inzwischen geändert hat — dann ist nichts
 * geschrieben. `konten`: wer jetzt `b` hat (der Fragende) und wer `a` hat —
 * ohne Konto (`direkt`) sagt er nicht in der App zu.
 */
async function vollziehen(
  k: Aufrufer,
  lage: Lage,
  a: TauschPlatz,
  b: TauschPlatz,
  konten: { fragender: string; partner: string | undefined },
): Promise<Staende | null> {
  const staende = await schreiben(k, lage, tauschAnwenden(lage, a, b))
  if (!staende) return null

  const c = wert(k.cong)
  const beide = liste([a.key, b.key])
  // Zugesagt haben der Fragende für `b` und der andere für `a`, wenn er ein
  // Konto hat. Was zu den beiden Plätzen vorher dastand (Zusagen, Absagen),
  // gehörte den alten Inhabern.
  await rest.send('DELETE', `confirmations?congregation_id=eq.${c}&task_key=in.${beide}`)
  await rest.insert('confirmations', [
    { congregation_id: k.cong, user_id: konten.fragender, task_key: b.key, status: 'bestätigt' },
    ...(konten.partner ? [{ congregation_id: k.cong, user_id: konten.partner, task_key: a.key, status: 'bestätigt' }] : []),
  ])
  // Beide wissen Bescheid — „Plan senden" soll sie nicht noch einmal melden.
  // Ohne Konto hat der andere es mündlich abgesprochen: In den Zusagen der
  // Woche ist er gleich als „weiß Bescheid" abgehakt (`persoenlich_at`, wie
  // nach dem Haken des Planers) — sonst stünde sein Platz als ungeklärt da.
  // Beide Zeilen tragen dieselben Spalten: Bei einem Stapel weist PostgREST
  // verschiedene Schlüssel ab (PGRST102).
  const jetzt = new Date().toISOString()
  await rest.insert(
    'assignment_log',
    [
      {
        congregation_id: k.cong,
        task_key: a.key,
        name: personDisplayName(b.person.fn, b.person.ln),
        person_id: b.person.id,
        user_id: konten.partner ?? null,
        persoenlich_at: konten.partner ? null : jetzt,
      },
      {
        congregation_id: k.cong,
        task_key: b.key,
        name: personDisplayName(a.person.fn, a.person.ln),
        person_id: a.person.id,
        user_id: konten.fragender,
        persoenlich_at: null,
      },
    ],
    { ignoreDuplicates: true },
  )
  // Was zu einem der beiden Plätze noch offen war, ist erledigt: jede Anfrage,
  // und ein Ersatzgesuch samt seinen Glocken-Zeilen.
  await anfragenLoeschen(k, `gibt_ab=in.${beide}`)
  await anfragenLoeschen(k, `nimmt=in.${beide}`)
  await rest.send('DELETE', `notifications?congregation_id=eq.${c}&task_key=in.${beide}&title=eq.${wert(TITEL_GESUCHT)}`)
  return staende
}

/** „Getauscht" an die Planer, mit beiden Plätzen — außer an die, die getauscht haben: Sie wissen es. */
async function planerBenachrichtigen(
  k: Aufrufer,
  lage: Lage,
  members: readonly Mitglied[],
  a: TauschPlatz,
  b: TauschPlatz,
  beteiligt: readonly string[],
): Promise<void> {
  const planer = members.filter((m) => (m.planner || m.zuteiler) && !beteiligt.includes(m.user_id)).map((m) => m.user_id)
  await benachrichtigen(
    k.cong,
    planer,
    TITEL_GETAUSCHT,
    (t) => t.getauscht,
    `${dienst(lage, a.svc)} · ${termin(lage, a)} · ${nameVon(b.person)} · ${termin(lage, b)} · ${nameVon(a.person)}`,
    a.key,
  )
}

async function annehmen(k: Aufrufer, id: string): Promise<Response> {
  const anfrage = await anfrageLesen(k, id)
  if (!anfrage || anfrage.an_person !== k.personId) return fehler('gone')
  const wochen = wochenVon(anfrage.gibt_ab, anfrage.nimmt)
  if (!wochen) return fehler('bad-request')
  const { lage, members } = await lesen(k, wochen)
  // Aus der Sicht des Fragenden, mit frisch gelesener Lage — und der Platz, den
  // er will, muss noch dem gehören, der annimmt. Was nicht mehr geht, ist
  // erledigt: Die Anfrage geht, statt beim Gefragten als Karte stehen zu
  // bleiben, die nur noch scheitert. Fragen kann der Fragende danach neu.
  const urteil = tauschPruefen(lage, anfrage.gibt_ab, anfrage.nimmt, anfrage.von_person)
  if (!urteil.ok || urteil.b.person.id !== k.personId) {
    await anfragenLoeschen(k, `id=eq.${wert(anfrage.id)}`)
    return fehler(urteil.ok ? 'gone' : urteil.fehler)
  }
  const { a, b } = urteil

  const staende = await vollziehen(k, lage, a, b, { fragender: anfrage.von_user, partner: k.userId })
  if (!staende) return fehler('stand')

  // Dem Fragenden: sein alter Platz und wer ihn jetzt hat (wie „Ersatz
  // gefunden"); den neuen sieht er unter seinen Aufgaben. Den Planern beide.
  await benachrichtigen(k.cong, [anfrage.von_user], TITEL_GETAUSCHT, (t) => t.getauscht, `${dienst(lage, a.svc)} · ${termin(lage, a)} · ${nameVon(b.person)}`, b.key)
  await planerBenachrichtigen(k, lage, members, a, b, [k.userId, anfrage.von_user])
  return json({ ok: true, wochen: staende })
}

/**
 * **Gleich tauschen, mit jemandem ohne Konto** (30.10.2026): Er sieht keine
 * Anfrage und kann nicht zusagen — die beiden sprechen sich mündlich ab, dann
 * tauscht der Fragende. Wer ein Konto hat, sagt selbst zu: ihn fragt die App
 * an, statt über ihn zu entscheiden.
 */
async function direkt(k: Aufrufer, gibtAb: string, nimmt: string): Promise<Response> {
  const wochen = wochenVon(gibtAb, nimmt)
  if (!wochen) return fehler('bad-request')
  const { lage, members, kontoVon } = await lesen(k, wochen)
  const urteil = tauschPruefen(lage, gibtAb, nimmt, k.personId)
  if (!urteil.ok) return fehler(urteil.fehler)
  if (kontoVon(urteil.b.person.id) !== undefined) return fehler('has-account')
  const staende = await vollziehen(k, lage, urteil.a, urteil.b, { fragender: k.userId, partner: undefined })
  if (!staende) return fehler('stand')
  await planerBenachrichtigen(k, lage, members, urteil.a, urteil.b, [k.userId])
  return json({ ok: true, wochen: staende })
}

/* ---- Einstieg ------------------------------------------------------------ */

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const userId = await rest.userId(req)
    if (!userId) return json({ error: 'unauthorized' }, 401)
    const rumpf = (await req.json().catch(() => null)) as {
      aktion?: string
      gibtAb?: string
      nimmt?: string
      id?: string
      /** Der Kalendertag des Geräts („JJJJ-MM-TT"), siehe `heuteUtc`. */
      heute?: string
    } | null

    const eigene = await rest.get<{ person_id: string | null; congregation_id: string }[]>(
      `members?select=person_id,congregation_id&user_id=eq.${wert(userId)}`,
    )
    const mitglied = eigene[0]
    // Tauschen kann nur, wer selbst eingeteilt sein kann: mit eigener Person.
    if (!mitglied?.person_id) return fehler('forbidden')
    const k: Aufrufer = {
      userId,
      cong: mitglied.congregation_id,
      personId: mitglied.person_id,
      heute: new Date(heuteUtc(rumpf?.heute)).toISOString().slice(0, 10),
    }
    switch (rumpf?.aktion) {
      case 'angebote':
        return await angebote(k, String(rumpf.gibtAb ?? ''))
      case 'anfragen':
        return await anfragen(k, String(rumpf.gibtAb ?? ''), String(rumpf.nimmt ?? ''))
      case 'zurueckziehen':
        return await zurueckziehen(k, String(rumpf.id ?? ''))
      case 'ablehnen':
        return await ablehnen(k, String(rumpf.id ?? ''))
      case 'annehmen':
        return await annehmen(k, String(rumpf.id ?? ''))
      case 'direkt':
        return await direkt(k, String(rumpf.gibtAb ?? ''), String(rumpf.nimmt ?? ''))
      default:
        return fehler('bad-request')
    }
  } catch (err) {
    // Nur in die Logs, nicht in die Antwort — wie bei `substitute`: Der Pfad
    // und der rohe Rumpf von PostgREST verrieten Tabellen und Bedingungen.
    console.error('tauschen:', err instanceof Error ? err.message : String(err))
    return json({ error: 'server-error' }, 500)
  }
})
