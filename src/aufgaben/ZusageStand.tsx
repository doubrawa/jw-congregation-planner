import { Zeichen } from '../bausteine/Zeichen'
import type { TaskStatus } from '../data/types'
import { useT } from '../i18n/useT'
import './aufgaben.css'

/** Ganze Klassennamen, damit eine Textsuche sie findet (`tests/css-klassen.test.ts`). */
const STAND_KLASSE: Record<TaskStatus, string> = {
  offen: 'zusage-stand is-offen',
  bestätigt: 'zusage-stand is-bestaetigt',
  verhindert: 'zusage-stand is-problem',
}

/**
 * **Der Stand einer eigenen Aufgabe als Wort** — an den Zeilen unter „Meine
 * Aufgaben" und auf dem Start. Der Punkt davor sagt ihn nur dem, der seine
 * Farben kennt; und ein Haken an einer offenen Aufgabe läse sich wie
 * „erledigt". Der Haken steht deshalb allein beim Wort „Bestätigt".
 */
export function ZusageStand({ status }: { status: TaskStatus }) {
  const { t } = useT()
  const wort: Record<TaskStatus, string> = { offen: t.dashZuBest, bestätigt: t.bestaetigt, verhindert: t.verhindertChip }
  return (
    <span className={STAND_KLASSE[status]}>
      {status === 'bestätigt' && <Zeichen name="haken" />}
      {wort[status]}
    </span>
  )
}
