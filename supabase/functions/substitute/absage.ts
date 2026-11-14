// =============================================================================
// substitute, Aufruf 'absage': Absagen denen melden, die planen
// =============================================================================
//   { action: 'absage', taskKeys, nachricht?, heute? }
//
// Wer eine Zuteilung absagt, verlässt sich darauf, dass jemand davon erfährt:
// „Der Planer erfährt es sofort und gibt die Aufgabe jemand anderem", sagt das
// Blatt. Bis zum 13.11.2026 schrieb die Absage nur eine Zeile in die Glocke
// derer, die planen (`notify_planners`) — erfahren hat es, wer zufällig die App
// öffnete. Und wer einen Treffpunkt seiner Gruppe geplant hatte, ohne Admin
// oder Planer zu sein, bekam gar nichts.
//
// Hier entsteht beides: die Zeile in der Glocke und der Push.
//
//  - **Wer es erfährt:** Admin und Planer; bei einem Gruppentreffpunkt dazu
//    Aufseher und Gehilfe seiner Gruppe — sie teilen dort die Leiter zu.
//  - **Push** nur, wo jemand handeln muss: bei Programmpunkten, dem Ratgeber
//    und Treffpunkten. Bei einem Hilfsdienst sucht die App selbst Ersatz
//    (Aufruf 'seek'), und wer plant, bekommt „Ersatz gefunden"; seine Glocke
//    führt die Absage trotzdem. Der Absagende selbst bekommt keinen Push.
//  - **Wer melden darf:** nur, wer an dem Platz steht — geprüft an der Woche,
//    nicht an der Zusage: Die schreibt die App im selben Augenblick, sie kann
//    später ankommen als dieser Aufruf.
//  - **Mehrere Plätze in einem Aufruf:** Wer eine Abwesenheit einträgt, sagt
//    alles darin zugleich ab (T181). Die Glocke führt je Platz eine Zeile —
//    jede führt in ihre Woche, und dort teilt der Planer neu zu. Der Push aber
//    kommt je Empfänger **einmal**, mit allen seinen Plätzen (Betreiber,
//    14.11.2026: „ein push je planer"): Eine Abwesenheit von drei Wochen sind
//    leicht sechs Plätze, und sechs Anstöße für eine Nachricht sind fünf zu
//    viel.
//  - **Was nicht geht, fällt einzeln heraus** (`abgewiesen` in der Antwort):
//    Ein Platz, der inzwischen einem anderen gehört oder vorbei ist, hält die
//    übrigen nicht auf. Geht keiner, antwortet die Function mit dem Grund des
//    ersten — wie bei einem einzelnen.
//  - **Jede Absage einmal** (`schonGemeldet`): Ruft jemand die Function für
//    einen Platz noch einmal, den sie schon gemeldet hat, geht nichts mehr
//    hinaus — sonst bekämen alle, die planen, denselben Push beliebig oft.
//    Was gemeldet ist, steht an der Absage (`absagen.gemeldet_am`).
//
// Der Rumpf der Glocke bleibt, wie die App ihn bis dahin selbst baute:
// „<Aufgabe> — <Name> · <Nachricht>", kanonisch deutsch, der Name und die
// Nachricht als Freitext gekennzeichnet. Gebaut wird er hier aus der Woche in
// der Datenbank — die App nähme den Titel aus der Sprache des Absagenden.
// =============================================================================

import { absageNachricht } from '../_shared/absage-nachricht.ts'
import { json, type Rest, wert } from '../_shared/rest.ts'
import { type SchluesselTeile, schluesselTeile } from '../_shared/aufgaben-schluessel.ts'
import { alsFreitext } from '../_shared/i18n/freitext.ts'
import { abosJeKonto } from '../_shared/konten.ts'
import {
  istAusgefallenFuer,
  personDisplayName,
  terminDerWoche,
  terminTag,
  terminText,
  ZEITEN_SPALTEN,
  zeitenAus,
  type ZeitenRow,
} from '../_shared/planung.ts'
import {
  type FsInstance,
  pendingOfFsWeek,
  pendingOfMeeting,
  rumpfVon,
  type ServiceRow,
  type SubscriptionRow,
  type Week,
} from '../_shared/zuteilungen.ts'
import { substituteTexte, TITEL_ABGESAGT } from './texte.ts'

/**
 * So viele Plätze nimmt ein Aufruf höchstens. Eine Abwesenheit über ein ganzes
 * Jahr bringt weniger; ohne Grenze rechnete die Function für jeden noch so
 * langen Rumpf.
 */
export const PLAETZE_MAX = 200

/** Warum ein Platz nicht abzusagen ist — und der Status, wenn es keiner ist. */
const ABWEISUNG = {
  'bad-request': 400,
  'not-assigned': 403,
  'slot-not-found': 404,
  'meeting-cancelled': 409,
  past: 409,
} as const
type Abweisung = keyof typeof ABWEISUNG

interface Mitglied {
  user_id: string
  person_id: string | null
  admin: boolean
  zuteiler?: boolean
}

interface Gruppe {
  id: string
  overseer_id: string | null
  assistant_id: string | null
}

/** Der abgesagte Platz: wer dort steht, wie er heißt, wann er ist. */
interface Platz {
  name: string
  pid?: string
  label: string
  /** „Dienstag, 8. September · 19:00" — beim Treffpunkt samt Ort. */
  datum: string
  /** Der Kalendertag, „YYYY-MM-DD". */
  tag: string | null
  /** Die Gruppe eines Gruppentreffpunkts. */
  grp?: string
}

/** Ein Platz, dessen Absage gemeldet wird — und wer davon erfährt. */
interface Meldung {
  taskKey: string
  platz: Platz
  /** Geht als Push hinaus (`perPush`). */
  mitPush: boolean
  empfaenger: string[]
}

/**
 * Eine Push-Meldung an eine Menge von Abos. Titel und Rumpf je Gerätesprache:
 * `rumpf` bekommt den Übersetzer dieser Sprache (`tr`) und ihren Code.
 */
export interface Sendung {
  subs: SubscriptionRow[]
  titel: (lang: string | null) => string
  rumpf: (tr: (s: string) => string, lang: string) => string
  url: string
  tag?: string
}

/** Wie `pushen` in `index.ts` zustellt — hereingereicht, damit die Schlüssel dort bleiben. */
type Zustellen = (sendungen: readonly Sendung[]) => Promise<void>

/**
 * Geht die Absage dieses Platzes als Push hinaus? Bei einem Hilfsdienst nicht:
 * Dort sucht die App selbst Ersatz (Aufruf 'seek'), und wer plant, bekommt
 * „Ersatz gefunden" — seine Glocke führt die Absage trotzdem.
 */
function perPush(teile: SchluesselTeile): boolean {
  return teile.art !== 'helper'
}

/**
 * Die Plätze eines Aufrufs: `taskKeys` — oder `taskKey`, wie eine App ihn
 * schickt, die noch je Platz meldete. Eine installierte App kann eine ältere
 * Fassung im Cache haben; ihr Aufruf soll gehen, nicht an einem fehlenden Feld
 * scheitern.
 */
export function absageSchluessel(rumpf: { taskKeys?: unknown; taskKey?: unknown }): string[] {
  if (Array.isArray(rumpf.taskKeys)) return rumpf.taskKeys.filter((k): k is string => typeof k === 'string')
  return typeof rumpf.taskKey === 'string' ? [rumpf.taskKey] : []
}

/*
 * Der Platz, wie ihn auch „Plan senden" und die Erinnerungen aufzählen
 * (`pendingOfMeeting`, `pendingOfFsWeek`) — ohne Zusagen gefragt: Die Absage
 * steht vielleicht schon in `confirmations`, vielleicht noch nicht.
 */
const OHNE_ZUSAGEN = new Map<string, string>()

/** Der Platz in einer Zusammenkunft — oder warum es ihn nicht gibt. */
function programmPlatz(
  taskKey: string,
  woche: string,
  tab: 'mid' | 'we',
  week: Week | undefined,
  services: ServiceRow[],
  zeitenRow: ZeitenRow | undefined,
): Platz | Abweisung {
  const meeting = week?.[tab]
  if (!week || !meeting) return 'slot-not-found'
  // Eine ausgefallene Zusammenkunft hat keine Plätze — und nichts abzusagen.
  if (istAusgefallenFuer(week.dev, tab)) return 'meeting-cancelled'
  const gefunden = pendingOfMeeting(woche, tab, meeting, services, OHNE_ZUSAGEN).find((p) => p.key === taskKey)
  if (!gefunden) return 'slot-not-found'
  const { versatz, zeit } = terminDerWoche(zeitenAus(zeitenRow), tab, woche, week.dev)
  return {
    name: gefunden.name,
    pid: gefunden.pid,
    label: gefunden.label,
    datum: terminText(woche, versatz, meeting.date, zeit),
    tag: terminTag(woche, versatz),
  }
}

/** Der Leiter-Platz eines Treffpunkts — oder warum es ihn nicht gibt. */
function treffpunktPlatz(taskKey: string, woche: string, instId: string, insts: FsInstance[]): Platz | Abweisung {
  const gefunden = pendingOfFsWeek(woche, insts, OHNE_ZUSAGEN).find((p) => p.key === taskKey)
  if (!gefunden) return 'slot-not-found'
  return {
    name: gefunden.name,
    pid: gefunden.pid,
    label: gefunden.label,
    datum: gefunden.datum,
    tag: terminTag(woche, gefunden.offset),
    grp: insts.find((i) => i.id === instId)?.grp ?? undefined,
  }
}

/**
 * Die Wochen, die die Plätze `teile` berühren, als Filter auf `start`: von der
 * ersten bis zur letzten. Eine Abwesenheit ist ein Zeitraum am Stück — was
 * dazwischen liegt, gehört ohnehin dazu.
 */
function wochenSpanne(teile: readonly SchluesselTeile[]): string {
  const wochen = teile.map((t) => t.woche).sort()
  return `start=gte.${wert(wochen[0] ?? '')}&start=lte.${wert(wochen.at(-1) ?? '')}`
}

/**
 * Der Rumpf eines Push — in der Sprache des Geräts (`tr`).
 *
 * Ein Platz: „<Aufgabe> · <Termin> · <Name>". Mehrere: vorn der Name, dahinter
 * je Platz „<Termin>: <Aufgabe>" wie in jeder Nachricht mit mehreren Aufgaben
 * (`rumpfVon`). Der Name steht vorn, weil `pushNutzlast` einen zu langen Rumpf
 * hinten kürzt — wer abgesagt hat, darf dabei nicht verlorengehen. Die
 * Nachricht steht in beiden Fällen am Ende.
 */
function pushRumpf(plaetze: readonly Platz[], name: string, nachricht: string): Sendung['rumpf'] {
  const wer = alsFreitext(name)
  const was = alsFreitext(nachricht)
  const [einziger] = plaetze
  if (einziger && plaetze.length === 1) {
    const text = [einziger.label, einziger.datum, wer, was].filter(Boolean).join(' · ')
    return (tr) => tr(text)
  }
  const eintraege = plaetze.map((p) => ({ datum: p.datum, label: p.label }))
  return (tr, lang) => [`${tr(wer)} — ${rumpfVon(eintraege, tr, lang)}`, tr(was)].filter(Boolean).join(' · ')
}

/**
 * Wie lange eine Meldung als die der jetzigen Absage gilt, wenn die Datenbank
 * deren Beginn nicht kennt (`schonGemeldet`).
 */
export const OHNE_VERMERK_MINUTEN = 10

/** Liste für einen `in.(…)`-Filter — jeder Wert in Anführungszeichen und für sich kodiert. */
const inListe = (werte: readonly string[]): string => `(${werte.map((w) => wert(`"${w}"`)).join(',')})`

/** Ein Zeitpunkt aus der Datenbank in Millisekunden — `null`, wenn er sich nicht lesen lässt. */
function zeitpunkt(text: string): number | null {
  const ms = Date.parse(text)
  return Number.isNaN(ms) ? null : ms
}

/** Der Filter auf die Absagen einer Person zu diesen Plätzen (`absagen`). */
const absagenFilter = (cong: string, personId: string, keys: readonly string[]): string =>
  `congregation_id=eq.${wert(cong)}&person_id=eq.${wert(personId)}&task_key=in.${inListe(keys)}`

/**
 * **Welche dieser Absagen schon gemeldet sind.** Ohne diese Frage meldete jeder
 * Aufruf aufs Neue: Ein Mitglied konnte allen, die planen, für seinen Platz
 * denselben Push beliebig oft schicken.
 *
 * **Zuerst der Vermerk an der Absage** (`absagen.gemeldet_am`, gesetzt von
 * `alsGemeldetVermerken` unten): Er steht, solange die Absage steht — anders
 * als die Zeilen in den Glocken, die jeder Planer löschen kann und die nach
 * acht Wochen die Aufbewahrung räumt. Eine neue Absage beginnt ohne ihn
 * (Trigger `absage_vermerken`); eine zurückgenommene und neu gegebene ist also
 * wieder zu melden.
 *
 * **Ohne Vermerk die Glocken:** eine Zeile „Verhinderung gemeldet" seit Beginn
 * der jetzigen Absage (`absagen.created_at`). Das trifft, was vor dem Vermerk
 * gemeldet wurde, und eine Meldung, deren Vermerk scheiterte. Fehlt auch die
 * Absage selbst — die Zusage der App ist noch unterwegs, oder niemand schreibt
 * sie —, zählt eine Meldung der letzten `OHNE_VERMERK_MINUTEN`: Die eine App,
 * deren Zusage den Aufruf überholt, meldet trotzdem, und wer die Function ohne
 * Zusage ruft, wird gebremst.
 *
 * **Dort nur Meldungen, die diese Person nennen** (`wer`, der Name als
 * Freitext im Rumpf; Namen sind eindeutig): Überholt der Aufruf die Zusage,
 * fehlt der Beginn, und sonst zählte auch die Absage des Vorgängers, der den
 * Platz eben noch hatte — die eigene ginge gar nicht hinaus.
 *
 * Lässt sich etwas nicht lesen, wird gemeldet, was nicht feststeht: Eine
 * Meldung zu viel schadet weniger als eine, die fehlt.
 */
async function schonGemeldet(
  rest: Rest,
  cong: string,
  wer: { personId: string; name: string },
  keys: readonly string[],
  jetzt: number,
): Promise<ReadonlySet<string>> {
  const schon = new Set<string>()
  if (keys.length === 0) return schon
  try {
    const vermerkt = await rest.get<{ task_key: string; created_at: string; gemeldet_am: string | null }[]>(
      `absagen?select=task_key,created_at,gemeldet_am&${absagenFilter(cong, wer.personId, keys)}`,
    )
    const seit = new Map<string, number>()
    for (const a of vermerkt) {
      if (a.gemeldet_am) schon.add(a.task_key)
      const ms = zeitpunkt(a.created_at)
      if (ms !== null) seit.set(a.task_key, ms)
    }
    const offen = keys.filter((k) => !schon.has(k))
    if (offen.length === 0) return schon

    const ohneVermerk = jetzt - OHNE_VERMERK_MINUTEN * 60e3
    const ab = (key: string): number => seit.get(key) ?? ohneVermerk
    const frueheste = new Date(Math.min(...offen.map(ab))).toISOString()
    const gemeldet = await rest.get<{ task_key: string; created_at: string; body: string }[]>(
      `notifications?select=task_key,created_at,body&congregation_id=eq.${wert(cong)}&type=eq.verhindert` +
        `&task_key=in.${inListe(offen)}&created_at=gte.${wert(frueheste)}`,
    )
    // Wie der Rumpf sie nennt (`absageMelden` unten): „<Aufgabe> — <Name> · …".
    const genannt = ` — ${alsFreitext(wer.name)}`
    for (const z of gemeldet) {
      if (z.body.includes(genannt) && (zeitpunkt(z.created_at) ?? -Infinity) >= ab(z.task_key)) schon.add(z.task_key)
    }
  } catch (err) {
    console.error('substitute/absage: schon gemeldet?', err instanceof Error ? err.message : String(err))
  }
  return schon
}

/**
 * **Die gemeldeten Absagen vermerken** (`absagen.gemeldet_am`) — gleich nach
 * den Zeilen in den Glocken, denn ab da sind sie gemeldet. Scheitert es, sagt
 * es nur das Protokoll — gemeldet ist gemeldet, und der nächste Aufruf findet
 * die Meldung in den Glocken.
 *
 * Steht die Absage noch nicht, weil der Aufruf die Zusage der App überholt
 * hat, trifft es keine Zeile, und der Vermerk fehlt auf Dauer: Die Zeile, die
 * der Trigger danach anlegt, beginnt nach der Meldung, also zählen auch die
 * Glocken sie nicht. Ein weiterer Aufruf meldete dieselbe Absage noch einmal.
 * Das ist hingenommen: Die App schickt die Zusage vor dem Aufruf ab, und sie
 * ist ein einziger Schreibvorgang. Der Aufruf fragt bis hierher dreimal
 * nacheinander die Datenbank.
 */
async function alsGemeldetVermerken(
  rest: Rest,
  cong: string,
  personId: string,
  keys: readonly string[],
  jetzt: number,
): Promise<void> {
  if (keys.length === 0) return
  try {
    await rest.send('PATCH', `absagen?${absagenFilter(cong, personId, keys)}`, {
      gemeldet_am: new Date(jetzt).toISOString(),
    })
  } catch (err) {
    console.error('substitute/absage: als gemeldet vermerken', err instanceof Error ? err.message : String(err))
  }
}

/**
 * Je Empfänger ein Push mit allen seinen Plätzen. Wer dieselben erfährt — die
 * Planer untereinander —, bekommt dieselbe Sendung. Der Absagende selbst
 * keine, und wer kein Gerät angemeldet hat, auch nicht.
 */
function sendungen(
  meldungen: readonly Meldung[],
  ich: string,
  abos: ReadonlyMap<string, SubscriptionRow[]>,
  inhalt: { name: string; nachricht: string; url: string },
): Sendung[] {
  const jeListe = new Map<string, { plaetze: Meldung[]; konten: string[] }>()
  for (const konto of new Set(meldungen.flatMap((m) => m.empfaenger))) {
    if (konto === ich) continue
    const seine = meldungen.filter((m) => m.mitPush && m.empfaenger.includes(konto))
    if (seine.length === 0) continue
    const kennung = seine.map((m) => m.taskKey).join('\n')
    const liste = jeListe.get(kennung) ?? { plaetze: seine, konten: [] }
    liste.konten.push(konto)
    jeListe.set(kennung, liste)
  }
  return [...jeListe.values()]
    .map(({ plaetze, konten }) => ({
      subs: konten.flatMap((k) => abos.get(k) ?? []),
      titel: (lang: string | null) => substituteTexte(lang).abgesagt,
      rumpf: pushRumpf(plaetze.map((m) => m.platz), inhalt.name, inhalt.nachricht),
      // In die Mitteilungen: Von dort führt ein Tipp in die Woche der Absage.
      url: inhalt.url,
      // Je Absage eine eigene Meldung — zwei ersetzen einander nicht auf dem
      // Sperrbildschirm (`Zustellung.tag`).
      tag: plaetze[0]?.taskKey,
    }))
    .filter((s) => s.subs.length > 0)
}

/**
 * Die Absagen des Aufrufers für `taskKeys` melden.
 *
 * `heute` ist der Kalendertag, an dem gefragt wird („YYYY-MM-DD", `heuteUtc`
 * in `index.ts`); `appUrl` die Adresse der App für den Push; `jetzt` der
 * Zeitpunkt des Aufrufs (`schonGemeldet`, ohne Angabe die Uhr der Function).
 */
export async function absageMelden(
  rest: Rest,
  userId: string,
  anfrage: { taskKeys: readonly string[]; nachricht: string; heute: string; appUrl: string; jetzt?: number },
  zustellen: Zustellen,
): Promise<Response> {
  const { heute } = anfrage
  const zerlegt = [...new Set(anfrage.taskKeys)].map((taskKey) => ({ taskKey, teile: schluesselTeile(taskKey) }))
  const teileAller = zerlegt.flatMap(({ teile }) => (teile ? [teile] : []))
  if (teileAller.length === 0 || zerlegt.length > PLAETZE_MAX) return json({ error: 'bad-request' }, 400)

  // Die Versammlung aus der eigenen Mitgliedszeile, nie aus dem Rumpf.
  const eigene = await rest.get<{ person_id: string | null; congregation_id: string }[]>(
    `members?select=person_id,congregation_id&user_id=eq.${wert(userId)}`,
  )
  const caller = eigene[0]
  if (!caller) return json({ error: 'forbidden' }, 403)
  if (!caller.person_id) return json({ error: 'not-assigned' }, 403)
  const cong = caller.congregation_id
  const congEnc = wert(cong)
  const programm = teileAller.filter((t) => t.art !== 'fs')
  const treffpunkte = teileAller.filter((t) => t.art === 'fs')
  // Sind es nur Hilfsdienste, bleibt es bei der Glocke, und die Abos braucht niemand.
  const abosNoetig = teileAller.some(perPush)

  const [weekRows, fsRows, services, persons, congRows, members, gruppen, subs] = await Promise.all([
    programm.length > 0
      ? rest.get<{ start: string; data: Week }[]>(`weeks?select=start,data&congregation_id=eq.${congEnc}&${wochenSpanne(programm)}`)
      : Promise.resolve([] as { start: string; data: Week }[]),
    treffpunkte.length > 0
      ? rest.get<{ start: string; data: FsInstance[] }[]>(
          `fs_weeks?select=start,data&congregation_id=eq.${congEnc}&${wochenSpanne(treffpunkte)}`,
        )
      : Promise.resolve([] as { start: string; data: FsInstance[] }[]),
    rest.get<ServiceRow[]>(`services?select=key,name,count,groups&congregation_id=eq.${congEnc}`),
    rest.get<{ id: string; fn: string; ln: string }[]>(
      `persons?select=id,fn,ln&congregation_id=eq.${congEnc}&id=eq.${wert(caller.person_id)}`,
    ),
    rest.get<ZeitenRow[]>(`congregations?select=${ZEITEN_SPALTEN}&id=eq.${congEnc}`),
    rest.get<Mitglied[]>(`members?select=user_id,person_id,admin,zuteiler&congregation_id=eq.${congEnc}`),
    treffpunkte.length > 0
      ? rest.get<Gruppe[]>(`groups?select=id,overseer_id,assistant_id&congregation_id=eq.${congEnc}`)
      : Promise.resolve([] as Gruppe[]),
    abosNoetig
      ? rest.get<SubscriptionRow[]>(
          `push_subscriptions?select=id,user_id,endpoint,p256dh,auth,lang&congregation_id=eq.${congEnc}`,
        )
      : Promise.resolve([] as SubscriptionRow[]),
  ])

  const person = persons[0]
  if (!person) return json({ error: 'not-assigned' }, 403)
  const name = personDisplayName(person.fn, person.ln)
  const wochen = new Map(weekRows.map((r) => [r.start, r.data]))
  const fsWochen = new Map(fsRows.map((r) => [r.start, r.data]))

  const planer = members.filter((m) => m.admin || m.zuteiler).map((m) => m.user_id)
  /** Wer von einem Platz erfährt: wer plant — beim Gruppentreffpunkt auch, wer die Gruppe leitet. */
  const empfaengerVon = (platz: Platz): string[] => {
    const leitung = new Set(
      gruppen
        .filter((g) => g.id === platz.grp)
        .flatMap((g) => [g.overseer_id, g.assistant_id])
        .filter((id): id is string => Boolean(id)),
    )
    const gruppenLeitung = members.filter((m) => m.person_id !== null && leitung.has(m.person_id)).map((m) => m.user_id)
    return [...new Set([...planer, ...gruppenLeitung])]
  }

  /** Die Meldung zu `taskKey`, wenn der Platz abzusagen ist — sonst warum nicht. */
  const meldungZu = (taskKey: string, teile: SchluesselTeile | null): Meldung | Abweisung => {
    if (!teile) return 'bad-request'
    const platz =
      teile.art === 'fs'
        ? treffpunktPlatz(taskKey, teile.woche, teile.instId, fsWochen.get(teile.woche) ?? [])
        : programmPlatz(taskKey, teile.woche, teile.tab, wochen.get(teile.woche), services, congRows[0])
    if (typeof platz === 'string') return platz
    // Nur der eigene Platz: nach der Person-Id, ohne sie nach dem Namen — wie
    // überall (`gehoertZuKennung` in der App). Sonst ließe sich im Namen eines
    // anderen absagen, und alle, die planen, bekämen die Meldung.
    const meiner = platz.pid ? platz.pid === person.id : platz.name === name
    if (!meiner) return 'not-assigned'
    if (platz.tag !== null && platz.tag < heute) return 'past'
    return { taskKey, platz, mitPush: perPush(teile), empfaenger: empfaengerVon(platz) }
  }

  const meldungen: Meldung[] = []
  const abgewiesen: { taskKey: string; error: Abweisung }[] = []
  for (const { taskKey, teile } of zerlegt) {
    const meldung = meldungZu(taskKey, teile)
    if (typeof meldung === 'string') abgewiesen.push({ taskKey, error: meldung })
    else meldungen.push(meldung)
  }
  const [ersteAbweisung] = abgewiesen
  if (meldungen.length === 0 && ersteAbweisung) {
    return json({ error: ersteAbweisung.error }, ABWEISUNG[ersteAbweisung.error])
  }

  const jetzt = anfrage.jetzt ?? Date.now()
  const schon = await schonGemeldet(rest, cong, { personId: person.id, name }, meldungen.map((m) => m.taskKey), jetzt)
  const neue = meldungen.filter((m) => !schon.has(m.taskKey))

  const nachricht = absageNachricht(anfrage.nachricht)
  const zusatz = nachricht ? ` · ${alsFreitext(nachricht)}` : ''
  const zeilen = neue.flatMap(({ taskKey, platz, empfaenger }) =>
    empfaenger.map((user_id) => ({
      congregation_id: cong,
      user_id,
      type: 'verhindert',
      title: TITEL_ABGESAGT,
      body: `${platz.label} — ${alsFreitext(name)}${zusatz}`,
      task_key: taskKey,
    })),
  )
  const ergebnis = {
    ok: true,
    gemeldet: new Set(zeilen.map((z) => z.user_id)).size,
    ...(abgewiesen.length > 0 ? { abgewiesen } : {}),
    // Kein Fehler — die App braucht dafür weder nachzuladen noch etwas zu sagen.
    ...(schon.size > 0 ? { schonGemeldet: [...schon] } : {}),
  }
  if (zeilen.length === 0) return json(ergebnis)

  const geschrieben = await rest.zeilenSchreiben<{ id: string }>('POST', 'notifications?select=id', zeilen)
  if (geschrieben === null) return json({ error: 'server-error' }, 500)

  const pushes = sendungen(neue, userId, abosJeKonto(subs), {
    name,
    nachricht,
    url: `${anfrage.appUrl}#go=mitteilungen`,
  })
  await Promise.all([
    alsGemeldetVermerken(rest, cong, person.id, neue.map((m) => m.taskKey), jetzt),
    pushes.length > 0 ? zustellen(pushes) : undefined,
  ])
  return json(ergebnis)
}
