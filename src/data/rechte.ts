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
 * **Drei Stufen und eine Gruppe** (4.10.2026, Wunsch des Betreibers: „Planer
 * sollen Zuteilungen machen dürfen, aber nur Admins dürfen auch die Pläne
 * ändern und alles andere"):
 *
 *  - **Admin** (`members.planner`): alles.
 *  - **Planer** (`members.zuteiler`): teilt in allen Plänen zu und sendet sie;
 *    dazu die Grenzfälle Vortragsthema, Lieder, Partner am Schülerteil,
 *    Besucher eines Gruppenbesuchs und die Gruppen der Weiteren Pläne. Den
 *    Plan selbst ändert er nicht, Personen und Einstellungen sieht er nicht.
 *  - **Verkündiger**: plant nichts.
 *
 * Quer dazu der **Gruppenaufseher** (Aufseher oder Gehilfe einer Gruppe, ohne
 * Admin-Recht): Er pflegt die Treffpunkte seiner Gruppe ganz — Zeit, Ort,
 * Grundplan, Leiter — und sendet sie.
 *
 * Durchgesetzt wird das in der Datenbank und in der Edge Function `zuteilen`;
 * hier steht, was die App anbietet.
 */

import { aufseherGruppe } from './helpers'
import type { Group, MeetingTab, Member, Person, Screen, Thema } from './types'

/** Die Rechte eines Kontos — woraus jede Antwort dieser Datei folgt. */
export interface Rechte {
  /** „Admin": darf alles. */
  admin: boolean
  /** Darf zuteilen und senden — der Admin und der Planer. */
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

/** Die Rechte aus dem Zustand. */
export function rechteVon(s: {
  planner: boolean
  zuteiler: boolean
  groups: readonly Group[]
  personId: string | null
}): Rechte {
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
  s: { groups: readonly Group[]; personId: string | null },
): RechteStufe {
  if (r.admin) return 'admin'
  if (r.zuteilen) return 'planer'
  if (r.gruppe === null) return 'verkuendiger'
  const gruppe = s.groups.find((g) => g.id === r.gruppe)
  return gruppe?.overseerId === s.personId ? 'gruppenaufseher' : 'gehilfe'
}

/**
 * **Planer, aber nicht Admin** — wer zuteilen, den Plan aber nicht ändern
 * darf. Daran blenden die Planen-Ansichten aus, was den Plan selbst ändert, und
 * daran schreibt `persist.ts` die Wochen über die Edge Function `zuteilen`.
 */
export function nurZuteilen(r: Rechte): boolean {
  return r.zuteilen && !r.admin
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

const ALLE: readonly Screen[] = [
  'start',
  'programm',
  'aufgaben',
  'mitteilungen',
  'planen',
  'personen',
  'einstellungen',
  'profil',
]

/** Bildschirme, die ein einfacher Verkündiger nicht sieht. */
const NUR_PLANER: readonly Screen[] = ['planen', 'personen', 'einstellungen']

/**
 * Die Bildschirme, die jemand sehen darf.
 *
 * Planer und Gruppenaufseher bekommen Planen dazu — der Planer zum Zuteilen,
 * der Gruppenaufseher für die Treffpunkte seiner Gruppe samt ihrem Grundplan.
 * Personen und Einstellungen bleiben beiden verschlossen: Sie gehören zu dem
 * „alles andere", das der Betreiber dem Admin vorbehalten hat.
 */
export function erlaubteScreens(r: Rechte): readonly Screen[] {
  if (r.admin) return ALLE
  if (r.zuteilen || r.gruppe !== null) return ALLE.filter((s) => s !== 'personen' && s !== 'einstellungen')
  return ALLE.filter((s) => !NUR_PLANER.includes(s))
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
 * Admin und Planer planen jedes Thema (der Planer nur zuteilend). Der
 * Gruppenaufseher plant nur den Predigtdienst, und dort nur seine Gruppe (die
 * Einschränkung trägt `PlanenScreen`); eine Zusammenkunft plant er nicht. Alle
 * anderen sehen keinen Schalter.
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
 */
export function darfAbwesenheitBearbeiten(
  s: { planner: boolean; personId: string | null },
  personId: string | null,
): boolean {
  return s.planner || personId === s.personId
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
