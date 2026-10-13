import { fsLeiterZuteilung } from '../data/fs'
import type { Conflict } from '../data/planning'
import { lageVon, type PlatzLage } from '../data/saal'
import type { FsInstance, SlotAssignment } from '../data/types'
import type { Dict } from '../i18n/ui'
import type { ZusageStand } from './useZusage'

/**
 * Die Klasse je Lage — für die Zeile und die Legende dieselbe. Ganze
 * Klassennamen, damit eine Textsuche sie findet (`tests/css-klassen.test.ts`).
 */
export const LAGE_KLASSE: Record<PlatzLage, string> = {
  voll: 'is-voll',
  wartet: 'is-wartet',
  problem: 'is-problem',
  offen: 'is-offen',
}

/** Was eine Platzzeile beim Planen zeigt (`PlatzZeile`). */
export interface PlatzAnzeige {
  lage: PlatzLage
  hinweis?: string
  status?: string
}

/**
 * **Was ein Platz beim Planen zeigt**: seine Lage (`lageVon` — dieselbe Regel
 * wie im Saal), rechts den Grund, wenn er ein Problem ist, und die Stufe der
 * Zusage als Wort.
 *
 * `stand` ist `null`, wo es nichts zu bestätigen gibt (Gastredner, Gruppe,
 * ausgefallene Zusammenkunft). Der Grund: abwesend (am Treffpunkt: an seinem
 * Tag), sonst eine Doppelbelegung („An diesem Tag schon"), sonst die Absage — oder, was nach
 * ihr geschieht: Für einen Hilfsdienst sucht die App selbst einen Ersatz
 * (`declineTask`), dort steht deshalb `absage` = „Ersatz gesucht".
 */
export function platzAnzeige(
  slot: SlotAssignment | undefined,
  stand: ZusageStand | null,
  konflikt: Conflict | undefined,
  t: Pick<Dict, 'abwesendChip' | 'sheetSchonHeute' | 'zusageAbgesagt'>,
  absage: string = t.zusageAbgesagt,
): PlatzAnzeige {
  const lage = lageVon(slot, stand?.stufe ?? null, konflikt !== undefined)
  const hinweis =
    lage !== 'problem'
      ? undefined
      : konflikt?.kind === 'absent' || konflikt?.kind === 'fsAbsent'
        ? t.abwesendChip
        : konflikt
          ? t.sheetSchonHeute
          : absage
  return { lage, hinweis, status: stand?.label }
}

/**
 * **Was der Leiter eines Treffpunkts beim Planen zeigt** — derselbe Weg wie ein
 * Platz der Zusammenkunft (`platzAnzeige`), für den Plan der Treffpunkte und
 * die Karte oben im Zuteilen-Blatt. `konflikt` ist der dieses Treffpunkts
 * (`fsKonfliktVon`).
 *
 * Ein Leiter als Freitext (meist der Kreisaufseher) hat nichts zu bestätigen:
 * Er ist nicht die Person gleichen Namens, er heißt nur so
 * (`fsLeiterZuteilung`). Zweimal am selben Tag steht aber auch er falsch.
 */
export function leiterAnzeige(
  inst: FsInstance,
  stand: (inst: FsInstance) => ZusageStand,
  konflikt: Conflict | undefined,
  t: Pick<Dict, 'abwesendChip' | 'sheetSchonHeute' | 'zusageAbgesagt'>,
): PlatzAnzeige {
  return platzAnzeige(
    inst.leader ? { name: inst.leader } : undefined,
    fsLeiterZuteilung(inst) ? stand(inst) : null,
    konflikt,
    t,
  )
}
