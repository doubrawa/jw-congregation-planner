// =============================================================================
// Geteilt: die Zahl am App-Symbol (T184)
// =============================================================================
// Wie viele Zuteilungen eines Kontos noch auf eine Antwort warten — die Zahl
// am Symbol der installierten App (`navigator.setAppBadge`). Betreiber,
// 13.11.2026: „Zahl am App-Symbol für offene Bestätigungen", und sie soll auch
// stimmen, wenn die App zu ist („Ja, Zahl im Push").
//
// Ist die App offen, setzt sie die Zahl selbst (`useAppSymbolZahl`). Ist sie
// zu, kann es nur der Service Worker — und der weiß nur, was ein Push ihm
// bringt. Deshalb tragen die Pushes, nach denen sich die Zahl ändert, sie mit:
// „Plan senden" und der Entzug (`send-plan`), die Erinnerungen
// (`send-reminders`) und der Tausch (`tauschen`).
//
// **Dieselbe Menge wie in der App**: jeder künftige, besetzte Platz der
// Person ohne Zusage oder Absage — Zusammenkünfte und Treffpunkte, ohne
// Ausgefallenes, ohne Gastredner und Gruppen. Gezählt wird mit derselben
// Aufzählung, mit der „Plan senden" verschickt (`offeneDerWoche`), und die
// Probe `app-zahl-parity.test.ts` hält sie neben „Meine Aufgaben".
// =============================================================================

import { wochenPraefixe } from './aufgaben-schluessel.ts'
import { type MitgliedRow, type PersonRow } from './konten.ts'
import { type MeetingTimes, personDisplayName, versatzAbMontag, ZEITEN_SPALTEN, zeitenAus, type ZeitenRow } from './planung.ts'
import { type Rest, wert, zeilenJePraefix } from './rest.ts'
import { type FsInstance, offeneDerWoche, type ServiceRow, type Week } from './zuteilungen.ts'

/** Eine Zeile aus `weeks` oder `fs_weeks`: die Kennung und ihr Blob. */
export interface WochenZeile<T> {
  start: string
  data: T | null
}

/**
 * **Die offenen Zusagen je Person** — als Frage nach Id und Name, wie die
 * App zuordnet (`gehoertZuKennung`): Ein Platz mit Id gehört der Person mit
 * dieser Id, einer ohne Id der mit diesem Namen.
 *
 * `heuteUTC` ist der Kalendertag (`heuteUtc`): Was an ihm stattfindet, zählt
 * noch — wie unter „Meine Aufgaben".
 *
 * **Treffpunkte nur neben einer Programmwoche**: Die App führt sie parallel zu
 * den geladenen Wochen (`fsWeeks[wi]` zu `weeks[wi]`); eine Treffpunkt-Woche
 * ohne Programmwoche sieht sie nicht, also zählt sie hier auch nicht.
 */
export function offeneZusagen(
  wochen: readonly WochenZeile<Week>[],
  fsWochen: readonly WochenZeile<FsInstance[]>[],
  services: ServiceRow[],
  conf: Map<string, string>,
  zeiten: MeetingTimes,
  heuteUTC: number,
): (pid: string | undefined, name: string) => number {
  const jePid = new Map<string, number>()
  const jeName = new Map<string, number>()
  const treffpunkte = new Map(fsWochen.map((w) => [w.start, w.data ?? []]))
  for (const { start, data } of wochen) {
    for (const platz of offeneDerWoche(start, data ?? {}, treffpunkte.get(start) ?? [], services, conf, zeiten, heuteUTC)) {
      if (platz.pid) jePid.set(platz.pid, (jePid.get(platz.pid) ?? 0) + 1)
      else jeName.set(platz.name, (jeName.get(platz.name) ?? 0) + 1)
    }
  }
  return (pid, name) => (pid ? (jePid.get(pid) ?? 0) : 0) + (jeName.get(name) ?? 0)
}

/** Der Montag der Woche eines Kalendertags (UTC), als ISO-Datum. */
function montagDerWoche(heuteUTC: number): string {
  const tag = new Date(heuteUTC).getUTCDay()
  return new Date(heuteUTC - versatzAbMontag(tag) * 864e5).toISOString().slice(0, 10)
}

/**
 * **Die Zahl je Konto** für die Empfänger eines Versands — aus der Datenbank,
 * nach dem Schreiben der Function: Was sie eben geändert hat, zählt schon.
 *
 * Gelesen werden nur die Wochen ab dem Montag dieser Woche, die Zusagen je
 * Woche für sich (`zeilenJePraefix`): Die Tabelle wächst, und über der
 * Zeilengrenze von PostgREST fehlte sonst still, was dahinter steht. Konten
 * und Personen dagegen ganz, in einem Zug mit den Wochen — eine Liste der
 * Empfänger im Filter wüchse mit jedem von ihnen in die Adresse, beim
 * täglichen Lauf auf hundert und mehr. Ein Konto ohne Person hat nichts zu
 * bestätigen — 0, und das Symbol ist leer.
 *
 * **Wirft nie.** Die Zahl ist eine Beigabe zum Push; scheitert ihr Lesen, geht
 * die Nachricht ohne sie hinaus, und das Symbol bleibt, wie es war. Andersherum
 * kostete ein kurzer Aussetzer der Datenbank die Nachricht selbst — oder beim
 * täglichen Lauf die Erinnerungen einer ganzen Versammlung.
 */
export async function appZahlenLaden(
  rest: Rest,
  cong: string,
  userIds: readonly string[],
  heuteUTC: number,
): Promise<Map<string, number>> {
  const konten = [...new Set(userIds)]
  if (konten.length === 0) return new Map()
  try {
    return await zahlenLesen(rest, cong, konten, heuteUTC)
  } catch (err) {
    console.error(`App-Zahl (Versammlung ${cong}) nicht lesbar: ${(err as Error).message}`)
    return new Map()
  }
}

async function zahlenLesen(rest: Rest, cong: string, konten: readonly string[], heuteUTC: number): Promise<Map<string, number>> {
  const c = wert(cong)
  const ab = wert(montagDerWoche(heuteUTC))
  const [members, persons, wochen, fsWochen, services, congRows] = await Promise.all([
    rest.get<MitgliedRow[]>(`members?select=user_id,person_id&congregation_id=eq.${c}`),
    rest.get<PersonRow[]>(`persons?select=id,fn,ln&congregation_id=eq.${c}`),
    rest.get<WochenZeile<Week>[]>(`weeks?select=start,data&congregation_id=eq.${c}&start=gte.${ab}`),
    rest.get<WochenZeile<FsInstance[]>[]>(`fs_weeks?select=start,data&congregation_id=eq.${c}&start=gte.${ab}`),
    rest.get<ServiceRow[]>(`services?select=key,name,count,groups&congregation_id=eq.${c}`),
    rest.get<ZeitenRow[]>(`congregations?select=${ZEITEN_SPALTEN}&id=eq.${c}`),
  ])
  const confs = await zeilenJePraefix<{ task_key: string }>(rest, cong, 'confirmations', 'task_key', [
    ...wochen.map((w) => wochenPraefixe(w.start)[0]),
    ...fsWochen.map((w) => wochenPraefixe(w.start)[1]),
  ])
  const zahl = offeneZusagen(
    wochen,
    fsWochen,
    services,
    new Map(confs.map((z) => [z.task_key, ''])),
    zeitenAus(congRows[0]),
    heuteUTC,
  )
  const personVon = new Map(persons.map((p) => [p.id, p]))
  const personDesKontos = new Map(members.map((m) => [m.user_id, m.person_id ? personVon.get(m.person_id) : undefined]))
  return new Map(
    konten.map((uid) => {
      const p = personDesKontos.get(uid)
      return [uid, p ? zahl(p.id, personDisplayName(p.fn, p.ln)) : 0]
    }),
  )
}
