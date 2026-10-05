/**
 * Typen zu `wochen-angleichen.mjs` — die Datei selbst bleibt einfaches
 * JavaScript wie alle Wartungsskripte; `tests/wochen-angleichen-gleichstand.test.ts`
 * misst sie am Ladeweg der App und braucht dafür ihre Form.
 */
import type { FsInstance, Week } from '../src/data/types'
import type { FsRuleRow, PersonRow } from '../src/lib/zeilen'

export declare const FENSTER: number
export declare const GRUND_KLASSE: string
export declare const GRUND_TREFFPUNKTE_FEHLEN: string
export declare const GRUND_GRUNDPLAN: string
export declare const GRUND_NAMEN: string
export declare const GRUND_LEITER: string

export declare function hindernis(gruende: readonly string[]): string

/** Die Funktionen der App, mit denen gerechnet wird. */
export interface AppFunktionen {
  syncAuxSlots: (weeks: Week[], an: boolean) => Week[]
  pidsNachtragen: (weeks: Week[], persons: unknown[]) => Week[]
  normalizeChairKeys: (weeks: Week[]) => Week[]
  regenFsWeeks: (kennungen: readonly string[], fsWeeks: FsInstance[][], rules: unknown[]) => FsInstance[][]
  fsLeiterBinden: (fsWeeks: FsInstance[][], persons: unknown[]) => FsInstance[][]
  personFromRow: (r: PersonRow) => unknown
  fsRuleFromRow: (r: FsRuleRow) => unknown
  gleich: (a: unknown, b: unknown) => boolean
}

export declare function appFunktionen(): Promise<AppFunktionen>

export interface Angleichung {
  start: string
  stand: string
  /** Die Woche und ihre Treffpunkte, wie die App sie nach dem Laden zeigt. */
  nachher: Week
  fsNachher: FsInstance[]
  /** Was zu schreiben ist — `null`, wenn der Bestand schon so dasteht. */
  woche: Week | null
  treffpunkte: FsInstance[] | null
  neueTreffpunktZeile: boolean
  gruende: string[]
}

export declare function angleichen(
  bestand: {
    wochen: readonly { start: string; data: unknown; updated_at: string }[]
    fsWochen: readonly { start: string; data: FsInstance[] }[]
    regeln: readonly FsRuleRow[]
    personen: readonly PersonRow[]
    auxClass: boolean
  },
  app: AppFunktionen,
): Angleichung[]

export declare function main(argv?: string[]): Promise<void>
