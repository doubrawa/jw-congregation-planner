import { useId, useState } from 'react'
import { useApp } from '../app/context'
import { Spur, type SpurSchritt } from '../bausteine/Spur'
import { Sheet } from '../components/Sheet'
import { Switch } from '../components/Switch'
import { datumsFormat } from '../components/datum-anzeige'
import { fromIso } from '../data/meeting-dates'
import type { Absence, MyTask } from '../data/types'
import type { Dict } from '../i18n/ui'
import { aufgabenLabel, aufgabenTermin, useT } from '../i18n/useT'
import { absageArt, aufgabeTag, type AbsageArt } from './aufgabe-anzeige'
import './aufgaben.css'

/** Längste Nachricht an den Planer — sie steht in seiner Mitteilung und im Push. */
const NACHRICHT_MAX = 200

/** Was nach der Absage geschieht, als Spur. */
function spurDanach(art: AbsageArt, t: Dict): SpurSchritt[] {
  const weiter =
    art === 'hilfsdienst' ? [t.spurErsatzGesucht, t.spurUebernommen] : [t.spurPlanerErfaehrt, t.spurNeuZugeteilt]
  return [
    { name: t.spurDuSagstAb, lage: 'jetzt' },
    ...weiter.map((name): SpurSchritt => ({ name, lage: 'leer' })),
  ]
}

/**
 * Der Tag, der sich beim Absagen als abwesend eintragen lässt — oder `null`:
 * ohne Kalendertag, ohne eigene Person (die Planung wüsste nicht, wer fehlt)
 * und wenn der Tag schon eingetragen ist.
 */
function eintragbarerTag(task: MyTask, personId: string | null, absences: readonly Absence[]): string | null {
  const tag = aufgabeTag(task)
  if (tag === null || personId === null) return null
  return absences.some((a) => a.personId === personId && a.from <= tag && tag <= a.to) ? null : tag
}

/**
 * **Absagen** (T121): „Du kannst nicht?" — und was danach geschieht. Statt
 * einer stummen Meldung sieht man den Weg: Beim Hilfsdienst sucht die App
 * selbst einen Ersatz, sonst erfährt es der Planer und teilt neu zu.
 *
 * Zwei Dinge lassen sich mitgeben, beide freiwillig: eine **Nachricht an den
 * Planer** (sie steht in seiner Mitteilung) und den **Tag als abwesend** — dann
 * wird man an diesem Tag gar nicht erst wieder eingeteilt. Der Schalter steht
 * aus: Wer an einem Abend nicht kann, ist nicht gleich den ganzen Tag weg.
 * Ist der Tag schon als abwesend eingetragen, fehlt er.
 */
export function AbsageBlatt({ task }: { task: MyTask }) {
  const { state, dispatch } = useApp()
  const i18n = useT()
  const { t } = i18n
  const [nachricht, setNachricht] = useState('')
  const [abwesend, setAbwesend] = useState(false)
  const feldId = useId()

  const art = absageArt(task.id)
  const spur = spurDanach(art, t)
  const tag = eintragbarerTag(task, state.personId, state.absences)

  /*
   * **Beantwortet ist gelesen** (16.10.2026): Wer hier absagt oder doch
   * bestätigt, hat die Mitteilungen zu dieser Aufgabe beantwortet. „Ich kann
   * nicht" in der Glocke öffnet nur dieses Blatt — die Mitteilung blieb danach
   * „Neu", ohne dass es darunter noch etwas zu tun gab. Wer abbricht, hat
   * nichts beantwortet; offline wird nichts gespeichert (wie in `Mitteilung`).
   */
  const mitteilungenGelesen = () => {
    if (state.staleAt) return
    for (const n of state.notifs) {
      if (n.taskId === task.id && !n.read) dispatch({ type: 'mitteilungGelesen', id: n.id })
    }
  }

  const absagen = () => {
    if (abwesend && tag) {
      // Ohne Grund: Die Nachricht gilt dem Planer, eine Abwesenheit aber kann
      // jedes Mitglied der Versammlung lesen (`absences_select`).
      dispatch({
        type: 'addAbsence',
        absence: { id: crypto.randomUUID(), personId: state.personId, userId: state.userId, from: tag, to: tag, reason: '' },
      })
    }
    mitteilungenGelesen()
    dispatch({ type: 'declineTask', id: task.id, nachricht })
  }
  const dochBestaetigen = () => {
    mitteilungenGelesen()
    dispatch({ type: 'confirmTask', id: task.id })
  }

  return (
    <Sheet
      variante="oben"
      label={t.absageFrage}
      eyebrow={<div className="sheet-marke">{`${aufgabenLabel(task, i18n)} · ${aufgabenTermin(task, i18n)}`}</div>}
      title={t.absageFrage}
      onClose={() => dispatch({ type: 'closeAbsage' })}
    >
      <div className="sheet-inhalt absage">
        <p className="absage-intro">{t.absageIntro}</p>
        <Spur schritte={spur} label={t.absageIntro} />
        <p className="klein-text absage-erklaerung">{art === 'hilfsdienst' ? t.ersatzHint : t.absageErklaerung}</p>
        <div className="absage-nachricht">
          <label className="feld-marke" htmlFor={feldId}>
            {t.absageNachricht}
          </label>
          <input
            id={feldId}
            className="feld"
            type="text"
            dir="auto"
            maxLength={NACHRICHT_MAX}
            placeholder={t.absageNachrichtBeispiel}
            value={nachricht}
            onChange={(e) => setNachricht(e.target.value)}
          />
        </div>
        {tag && (
          <div className="schalter-zeile">
            <span className="schalter-text">
              <span>{t.absageAbwesend}</span>
              <span className="klein-text">{datumsFormat(state.lang, 'tag').format(fromIso(tag))}</span>
            </span>
            <Switch on={abwesend} label={t.absageAbwesend} onToggle={() => setAbwesend((a) => !a)} />
          </div>
        )}
      </div>
      <div className="absage-fuss">
        <button type="button" className="knopf-dunkel" onClick={absagen}>
          {t.absagen}
        </button>
        <div className="knopf-reihe">
          {task.status === 'offen' && (
            <button type="button" className="knopf-leise is-akzent" onClick={dochBestaetigen}>
              {t.dochBestaetigen}
            </button>
          )}
          <button type="button" className="knopf-leise" onClick={() => dispatch({ type: 'closeAbsage' })}>
            {t.abbrechen}
          </button>
        </div>
      </div>
    </Sheet>
  )
}
