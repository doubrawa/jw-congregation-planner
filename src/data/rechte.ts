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
import type { Group, MeetingTab, Screen, Thema } from './types'

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
 * **Planer, aber nicht Admin** — wer zuteilen, den Plan aber nicht ändern
 * darf. Daran blenden die Planen-Ansichten aus, was den Plan selbst ändert, und
 * daran schreibt `persist.ts` die Wochen über die Edge Function `zuteilen`.
 */
export function nurZuteilen(r: Rechte): boolean {
  return r.zuteilen && !r.admin
}

const ALLE: readonly Screen[] = [
  'start',
  'programm',
  'aufgaben',
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
