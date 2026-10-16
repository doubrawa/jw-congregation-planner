/**
 * **Wer was darf — Bildschirme, Themen, Zuteilen.**
 *
 * Eine einzige Antwort für mehrere Fragesteller: die Navigation (`AppShell`)
 * blendet danach ein, der Reducer (`navigate`) lässt danach durch, die
 * Planen-Ansichten zeigen danach ihre Knöpfe. Solange das zwei Fassungen waren
 * — eine Liste dort, eine Ausschlussbedingung hier —, konnten sie
 * auseinanderlaufen: Die Navigation zeigte dann einen Eintrag, den der Reducer
 * beim Antippen sofort wieder auf „Programm" umlenkte. Nichts schlug fehl, es
 * sah nur kaputt aus.
 *
 * **Drei Stufen und eine Gruppe** (4.10.2026; neu gefasst am 15.10.2026,
 * Betreiber: „ein planer plant ja schließlich die woche" — „Alles Planen"):
 *
 *  - **Admin** (`members.planner`): alles.
 *  - **Planer** (`members.zuteiler`): plant alles wie der Admin — Wochen holen
 *    und einrichten, zuteilen, senden, Treffpunkte samt Grundplan,
 *    Gruppenbesuche, Weitere Pläne. Personen und Einstellungen sieht er nicht.
 *    Bis zum 15.10.2026 teilte er nur zu und änderte den Plan selbst nicht.
 *  - **Verkündiger**: plant nichts.
 *
 * Quer dazu der **Gruppenaufseher** (Aufseher oder Gehilfe einer Gruppe, ohne
 * Admin-Recht): Er pflegt die Treffpunkte seiner Gruppe ganz — Zeit, Ort,
 * Grundplan, Leiter — und sendet sie.
 *
 * Durchgesetzt wird das in der Datenbank (`darf_zuteilen`, `is_planner`,
 * `eigene_gruppen`); hier steht, was die App anbietet.
 */

import { rechteDerAnsicht, type Ansicht } from './ansicht'
import { aufseherGruppe } from './helpers'
import type { Group, MeetingTab, Member, Person, Screen, Thema } from './types'

/** Die Rechte eines Kontos — woraus jede Antwort dieser Datei folgt. */
export interface Rechte {
  /** „Admin": darf alles — dazu Personen und Einstellungen. */
  admin: boolean
  /**
   * Darf planen: zuteilen, senden, die Pläne ändern — der Admin und der
   * Planer. Der Name stammt aus der Zeit, als der Planer nur zuteilte.
   */
  zuteilen: boolean
  /**
   * Die Gruppe, die jemand als Aufseher oder Gehilfe betreut — `null`, wenn
   * keine. Beim Admin immer `null`: Er plant ohnehin alles, und die
   * Einschränkung auf eine Gruppe wäre dann falsch (`aufseherGruppe`).
   *
   * Eine, keine Liste: Wer eine Gruppe leitet, gehört ihr an, und jeder gehört
   * genau einer an (`overseerGroup`). Die Datenbank fragt trotzdem eine Liste
   * (`eigene_gruppen()`) — dort kostet das nichts.
   */
  gruppe: string | null
}

/** Was `rechteVon` braucht: die echten Rechte des Kontos — und, befristet, die Ansicht. */
export interface RechteQuelle {
  planner: boolean
  zuteiler: boolean
  groups: readonly Group[]
  personId: string | null
  /** Befristet (T124): Ein Admin sieht die App mit den Rechten einer anderen Stufe. */
  ansicht?: Ansicht | null
}

/** Die Rechte aus dem Zustand. */
export function rechteVon(s: RechteQuelle): Rechte {
  // Nur ein echtes Admin-Konto (T124) — geprüft am echten Recht, nicht an der Ansicht.
  if (s.planner && s.ansicht) return rechteDerAnsicht(s.ansicht)
  return {
    admin: s.planner,
    zuteilen: s.planner || s.zuteiler,
    gruppe: aufseherGruppe(s.planner, s.groups, s.personId),
  }
}

/**
 * **Wie sich jemand in der App nennt** — die Zeile unter dem Namen in der
 * Seitenleiste und im Menü des Handys. Die höchste Stufe gewinnt: Admin, dann
 * Planer; wer sonst eine Gruppe betreut, ist ihr Gruppenaufseher oder ihr
 * Gehilfe (5.10.2026 — bis dahin stand dort „Verkündiger", obwohl er ihre
 * Treffpunkte ändern und senden darf), alle übrigen Verkündiger.
 */
export type RechteStufe = 'admin' | 'planer' | 'gruppenaufseher' | 'gehilfe' | 'verkuendiger'

export function rechteStufe(
  r: Rechte,
  s: { groups: readonly Group[]; personId: string | null; planner?: boolean; ansicht?: Ansicht | null },
): RechteStufe {
  // Die Ansicht nennt ihre Stufe selbst (T124): Der Admin ist nicht Aufseher der
  // Gruppe, die er spielt — gefragt nach `overseerId`, hieße er „Gehilfe".
  if (s.planner && s.ansicht) return s.ansicht.stufe
  if (r.admin) return 'admin'
  if (r.zuteilen) return 'planer'
  if (r.gruppe === null) return 'verkuendiger'
  const gruppe = s.groups.find((g) => g.id === r.gruppe)
  return gruppe?.overseerId === s.personId ? 'gruppenaufseher' : 'gehilfe'
}

/**
 * **Wessen Treffpunkte jemand plant** — `null` heißt die aller Gruppen. So
 * plant, wer zuteilt; der Gruppenaufseher, der nicht zuteilt, plant nur die
 * seiner Gruppe. Plan, Automatik, Zuteilen und Senden fragen hier, damit sie
 * dieselben Treffpunkte meinen.
 */
export function treffpunktGruppe(r: Rechte): string | null {
  return r.zuteilen ? null : r.gruppe
}

/** Wer einen Bildschirm sieht — von allen bis zum Admin. */
type Zugang = 'alle' | 'gruppe' | 'planer' | 'admin'

/**
 * **Jeder Bildschirm außer der Anmeldung, mit seinem Zugang** — aus dem Typ
 * abgeleitet (`satisfies` verlangt jeden). Ein neuer Bildschirm muss hier
 * sagen, wer ihn sieht. Bis zum 16.10.2026 sah der Verkündiger „alle außer
 * einer Liste": Fehlte ein neuer Planer-Bildschirm dort, stand er allen offen.
 *
 * Planer und Gruppenaufseher bekommen Planen — der Planer für alles, der
 * Gruppenaufseher für die Treffpunkte seiner Gruppe samt ihrem Grundplan.
 * Personen und Einstellungen hat der Betreiber dem Admin vorbehalten. Die
 * Seite aller Wochen (`planung`) gilt den Zusammenkünften — sie bleibt bei
 * dem, der zuteilt. Ebenso die Auswertung der Zuteilungen (T126, Betreiber
 * 16.10.2026: „admin und planer").
 */
const ZUGANG = {
  start: 'alle',
  programm: 'alle',
  aufgaben: 'alle',
  mitteilungen: 'alle',
  planen: 'gruppe',
  planung: 'planer',
  auswertung: 'planer',
  personen: 'admin',
  einstellungen: 'admin',
  profil: 'alle',
} as const satisfies Record<Exclude<Screen, 'login'>, Zugang>

/** Die Listen von `erlaubteScreens`, je Kombination der Rechte einmal gebaut. */
const SCREENS_JE_RECHTEN = new Map<string, readonly Screen[]>()

/**
 * Die Bildschirme, die jemand sehen darf — in der Reihenfolge von `ZUGANG`.
 *
 * **Für dieselben Rechte dieselbe Liste**: Das Ergebnis hängt nur an drei
 * Wahrheitswerten. Bis zum 16.10.2026 war es bei jedem Aufruf neu, und der
 * Deep-Link-Effekt in `AppShell`, der daran hängt, lief bei jedem Render
 * (Review, App #9).
 */
export function erlaubteScreens(r: Rechte): readonly Screen[] {
  const schluessel = `${r.admin}|${r.zuteilen}|${r.gruppe !== null}`
  const gemerkt = SCREENS_JE_RECHTEN.get(schluessel)
  if (gemerkt) return gemerkt
  const darf = (z: Zugang): boolean =>
    z === 'alle' ||
    r.admin ||
    (z === 'planer' && r.zuteilen) ||
    (z === 'gruppe' && (r.zuteilen || r.gruppe !== null))
  const screens = (Object.keys(ZUGANG) as (keyof typeof ZUGANG)[]).filter((s) => darf(ZUGANG[s]))
  SCREENS_JE_RECHTEN.set(schluessel, screens)
  return screens
}

/**
 * Das Thema, zu dem ein Reiter gehört: die Treffpunkte zum Predigtdienst, die
 * Weiteren Pläne zu sich selbst (T120, Phase 5), alles andere zu den
 * Zusammenkünften.
 */
export function themaVon(tab: MeetingTab): Thema {
  if (tab === 'fs') return 'predigtdienst'
  return tab === 'wp' ? 'weitere' : 'zusammenkuenfte'
}

/**
 * Darf jemand dieses Thema **planen** — sieht er also den Schalter
 * Ansehen/Planen?
 *
 * Admin und Planer planen jedes Thema. Der Gruppenaufseher plant nur den
 * Predigtdienst, und dort nur seine Gruppe (die Einschränkung trägt
 * `PlanenScreen`); eine Zusammenkunft plant er nicht. Alle anderen sehen
 * keinen Schalter.
 */
export function darfPlanen(r: Rechte, thema: Thema): boolean {
  return r.zuteilen || (r.gruppe !== null && thema === 'predigtdienst')
}

/**
 * Welchen Bereich das Planen zeigt. Der Gruppenaufseher, der nicht zuteilt,
 * plant allein die Treffpunkte seiner Gruppe — auch mit einem Reiter von
 * früher; alle anderen planen, was der Reiter sagt. Eine Antwort für den
 * Bildschirm (`PlanenScreen`) und für den Kopf des Planens darüber.
 */
export function geplantesThema(r: Rechte, tab: MeetingTab): Thema {
  if (treffpunktGruppe(r) !== null) return 'predigtdienst'
  return themaVon(tab)
}

/**
 * Darf das angemeldete Konto für diese Person Abwesenheiten eintragen und
 * entfernen? Für die eigene Person jeder, für alle anderen der Admin —
 * dieselbe Grenze zieht die Datenbank (`absences_write`). Stünde der Knopf auch
 * anderen offen, schriebe er ins Leere, und die Zeile verschwände beim
 * nächsten Laden wieder. `personId` ist die **betroffene** Person.
 *
 * Über `rechteVon`, nicht über `planner` selbst: Sonst böte die Ansicht als
 * Verkündiger (T124) die Abwesenheiten anderer weiter zum Bearbeiten an.
 */
export function darfAbwesenheitBearbeiten(s: RechteQuelle, personId: string | null): boolean {
  return rechteVon(s).admin || personId === s.personId
}

/**
 * **Die Rechte, die bei einer Person stehen** — „Admin" und das eigene
 * Planer-Recht, ohne das, was im Admin schon steckt.
 *
 * Das Recht steht an **zwei** Stellen, und nur eine entscheidet: Sobald ein
 * Konto verknüpft ist, zählt das Konto (`members.planner`, `members.zuteiler`
 * — daran hängt `is_planner()` in der Datenbank). Die Vormerkung an der Person
 * trägt nur, wo es keines gibt; bei der ersten Anmeldung übernimmt sie die
 * Function `anmelden` ins Konto.
 * Angezeigt wurde bis August 2026 die Vormerkung — der Personen-Neuaufbau aus
 * New World Scheduler schreibt sie aber gar nicht mit, und der Betreiber sah
 * bei sich selbst „Admin: aus".
 *
 * Eine Antwort für die Schalter im Detail und die Marke in der Liste.
 */
export function rechteDerPerson(
  members: readonly Member[],
  person: Pick<Person, 'id' | 'plannerVorgemerkt' | 'zuteilerVorgemerkt'>,
): { admin: boolean; planer: boolean } {
  const konten = members.filter((m) => m.personId === person.id)
  if (konten.length === 0) {
    return { admin: Boolean(person.plannerVorgemerkt), planer: Boolean(person.zuteilerVorgemerkt) }
  }
  return { admin: konten.some((m) => m.planner), planer: konten.some((m) => m.zuteiler) }
}
