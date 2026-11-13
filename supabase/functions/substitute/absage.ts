// =============================================================================
// substitute, Aufruf 'absage': eine Absage denen melden, die planen
// =============================================================================
//   { action: 'absage', taskKey, nachricht?, heute? }
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
//
// Der Rumpf der Glocke bleibt, wie die App ihn bis dahin selbst baute:
// „<Aufgabe> — <Name> · <Nachricht>", kanonisch deutsch, der Name und die
// Nachricht als Freitext gekennzeichnet. Gebaut wird er hier aus der Woche in
// der Datenbank — die App nähme den Titel aus der Sprache des Absagenden.
// =============================================================================

import { json, type Rest, wert } from '../_shared/rest.ts'
import { schluesselTeile } from '../_shared/aufgaben-schluessel.ts'
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
  type ServiceRow,
  type SubscriptionRow,
  type Week,
} from '../_shared/zuteilungen.ts'
import { substituteTexte, TITEL_ABGESAGT } from './texte.ts'

/** So lang darf die Nachricht an den Planer sein — wie das Feld im Blatt (`AbsageBlatt`). */
export const NACHRICHT_MAX = 200

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

/** Wie `pushTo` in `index.ts` zustellt — hereingereicht, damit die Schlüssel dort bleiben. */
type Zustellen = (
  subs: SubscriptionRow[],
  titel: (lang: string | null) => string,
  body: string,
  url: string,
  tag?: string,
) => Promise<void>

/**
 * Die Nachricht als ein Atom: ohne „ · " darin, begrenzt, als Freitext
 * gekennzeichnet. Gekürzt wird nach Zeichen, nicht nach Code-Einheiten: Ein
 * halbes Zeichenpaar (ein Emoji an der Grenze) nimmt die Datenbank nicht an,
 * und die Meldung an alle, die planen, scheiterte an einem Zeichen.
 */
function nachrichtAtom(nachricht: string): string {
  const text = [...nachricht.trim().split(' · ').join(', ')].slice(0, NACHRICHT_MAX).join('')
  return text ? ` · ${alsFreitext(text)}` : ''
}

/*
 * Der Platz, wie ihn auch „Plan senden" und die Erinnerungen aufzählen
 * (`pendingOfMeeting`, `pendingOfFsWeek`) — ohne Zusagen gefragt: Die Absage
 * steht vielleicht schon in `confirmations`, vielleicht noch nicht.
 */
const OHNE_ZUSAGEN = new Map<string, string>()

/** Der Platz in einer Zusammenkunft — oder die Antwort, warum es ihn nicht gibt. */
function programmPlatz(
  taskKey: string,
  woche: string,
  tab: 'mid' | 'we',
  week: Week | undefined,
  services: ServiceRow[],
  zeitenRow: ZeitenRow | undefined,
): Platz | Response {
  const meeting = week?.[tab]
  if (!week || !meeting) return json({ error: 'slot-not-found' }, 404)
  // Eine ausgefallene Zusammenkunft hat keine Plätze — und nichts abzusagen.
  if (istAusgefallenFuer(week.dev, tab)) return json({ error: 'meeting-cancelled' }, 409)
  const gefunden = pendingOfMeeting(woche, tab, meeting, services, OHNE_ZUSAGEN).find((p) => p.key === taskKey)
  if (!gefunden) return json({ error: 'slot-not-found' }, 404)
  const { versatz, zeit } = terminDerWoche(zeitenAus(zeitenRow), tab, woche, week.dev)
  return {
    name: gefunden.name,
    pid: gefunden.pid,
    label: gefunden.label,
    datum: terminText(woche, versatz, meeting.date, zeit),
    tag: terminTag(woche, versatz),
  }
}

/** Der Leiter-Platz eines Treffpunkts — oder die Antwort, warum es ihn nicht gibt. */
function treffpunktPlatz(taskKey: string, woche: string, instId: string, insts: FsInstance[]): Platz | Response {
  const gefunden = pendingOfFsWeek(woche, insts, OHNE_ZUSAGEN).find((p) => p.key === taskKey)
  if (!gefunden) return json({ error: 'slot-not-found' }, 404)
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
 * Die Absage des Aufrufers für `taskKey` melden.
 *
 * `heute` ist der Kalendertag, an dem gefragt wird („YYYY-MM-DD", `heuteUtc`
 * in `index.ts`); `appUrl` die Adresse der App für den Push.
 */
export async function absageMelden(
  rest: Rest,
  userId: string,
  anfrage: { taskKey: string; nachricht: string; heute: string; appUrl: string },
  zustellen: Zustellen,
): Promise<Response> {
  const { taskKey, heute } = anfrage
  const teile = schluesselTeile(taskKey)
  if (!teile) return json({ error: 'bad-request' }, 400)

  // Die Versammlung aus der eigenen Mitgliedszeile, nie aus dem Rumpf.
  const eigene = await rest.get<{ person_id: string | null; congregation_id: string }[]>(
    `members?select=person_id,congregation_id&user_id=eq.${wert(userId)}`,
  )
  const caller = eigene[0]
  if (!caller) return json({ error: 'forbidden' }, 403)
  if (!caller.person_id) return json({ error: 'not-assigned' }, 403)
  const cong = caller.congregation_id
  const congEnc = wert(cong)
  const wocheEnc = wert(teile.woche)
  // Bei einem Hilfsdienst sucht die App selbst Ersatz: Dort bleibt es bei der
  // Glocke, und die Abos braucht niemand.
  const mitPush = teile.art !== 'helper'

  const [weekRows, fsRows, services, persons, congRows, members, gruppen, subs] = await Promise.all([
    teile.art === 'fs'
      ? Promise.resolve([] as { data: Week }[])
      : rest.get<{ data: Week }[]>(`weeks?select=data&congregation_id=eq.${congEnc}&start=eq.${wocheEnc}`),
    teile.art === 'fs'
      ? rest.get<{ data: FsInstance[] }[]>(`fs_weeks?select=data&congregation_id=eq.${congEnc}&start=eq.${wocheEnc}`)
      : Promise.resolve([] as { data: FsInstance[] }[]),
    rest.get<ServiceRow[]>(`services?select=key,name,count,groups&congregation_id=eq.${congEnc}`),
    rest.get<{ id: string; fn: string; ln: string }[]>(
      `persons?select=id,fn,ln&congregation_id=eq.${congEnc}&id=eq.${wert(caller.person_id)}`,
    ),
    rest.get<ZeitenRow[]>(`congregations?select=${ZEITEN_SPALTEN}&id=eq.${congEnc}`),
    rest.get<Mitglied[]>(`members?select=user_id,person_id,admin,zuteiler&congregation_id=eq.${congEnc}`),
    teile.art === 'fs'
      ? rest.get<Gruppe[]>(`groups?select=id,overseer_id,assistant_id&congregation_id=eq.${congEnc}`)
      : Promise.resolve([] as Gruppe[]),
    mitPush
      ? rest.get<SubscriptionRow[]>(
          `push_subscriptions?select=id,user_id,endpoint,p256dh,auth,lang&congregation_id=eq.${congEnc}`,
        )
      : Promise.resolve([] as SubscriptionRow[]),
  ])

  const person = persons[0]
  if (!person) return json({ error: 'not-assigned' }, 403)
  const name = personDisplayName(person.fn, person.ln)

  const platz =
    teile.art === 'fs'
      ? treffpunktPlatz(taskKey, teile.woche, teile.instId, fsRows[0]?.data ?? [])
      : programmPlatz(taskKey, teile.woche, teile.tab, weekRows[0]?.data, services, congRows[0])
  if (platz instanceof Response) return platz

  // Nur der eigene Platz: nach der Person-Id, ohne sie nach dem Namen — wie
  // überall (`gehoertZuKennung` in der App). Sonst ließe sich im Namen eines
  // anderen absagen, und alle, die planen, bekämen die Meldung.
  const meiner = platz.pid ? platz.pid === person.id : platz.name === name
  if (!meiner) return json({ error: 'not-assigned' }, 403)
  if (platz.tag !== null && platz.tag < heute) return json({ error: 'past' }, 409)

  const planer = members.filter((m) => m.admin || m.zuteiler).map((m) => m.user_id)
  const leitung = new Set(
    gruppen.filter((g) => g.id === platz.grp).flatMap((g) => [g.overseer_id, g.assistant_id]).filter((id): id is string => Boolean(id)),
  )
  const gruppenLeitung = members.filter((m) => m.person_id !== null && leitung.has(m.person_id)).map((m) => m.user_id)
  const empfaenger = [...new Set([...planer, ...gruppenLeitung])]
  if (empfaenger.length === 0) return json({ ok: true, gemeldet: 0 })

  const zusatz = nachrichtAtom(anfrage.nachricht)
  const geschrieben = await rest.zeilenSchreiben<{ id: string }>(
    'POST',
    'notifications?select=id',
    empfaenger.map((user_id) => ({
      congregation_id: cong,
      user_id,
      type: 'verhindert',
      title: TITEL_ABGESAGT,
      body: `${platz.label} — ${alsFreitext(name)}${zusatz}`,
      task_key: taskKey,
    })),
  )
  if (geschrieben === null) return json({ error: 'server-error' }, 500)

  if (mitPush) {
    const abos = abosJeKonto(subs)
    await zustellen(
      empfaenger.filter((u) => u !== userId).flatMap((u) => abos.get(u) ?? []),
      (lang) => substituteTexte(lang).abgesagt,
      // Mit dem Termin: Der Push steht für sich, die Glocke führt in die Woche.
      `${[platz.label, platz.datum, alsFreitext(name)].filter(Boolean).join(' · ')}${zusatz}`,
      `${anfrage.appUrl}#go=mitteilungen`,
      taskKey, // je Platz eine eigene Meldung — zwei Absagen ersetzen einander nicht
    )
  }
  return json({ ok: true, gemeldet: empfaenger.length })
}
