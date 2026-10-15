import { useState } from 'react'
import { useApp } from '../app/context'
import { datumsFormat } from '../components/datum-anzeige'
import { Switch } from '../components/Switch'
import { meetingDate } from '../data/meeting-dates'
import { alleS89DerWoche } from '../data/planning'
import { S89Druck } from '../druck/S89Druck'
import { useDruckBogen } from '../druck/useDruckBogen'
import { useT } from '../i18n/useT'

/**
 * **Die S-89-Zettel einer Woche drucken** (T71; T121, Phase 9): die Leiste im
 * Planen mit dem Schalter für die Partner-Zettel und dem Knopf. Der Bogen
 * selbst (`S89Druck`) entsteht erst beim Klick, direkt unter `body`
 * (`useDruckBogen`) — bis Phase 9 stand er unsichtbar mitten im Planen, und
 * ein eigenes Regelwerk musste Bildschirm, Leisten und Blätter um ihn herum
 * einzeln ausblenden.
 *
 * **Gedruckt wird die Woche, die gerade offen ist** — dieselbe Regel wie beim
 * Programm-Ausdruck. Schulungsaufgaben gibt es nur unter der Woche; der Bogen
 * hängt deshalb nicht am Reiter.
 */
export function S89Bogen() {
  const { state } = useApp()
  const { t } = useT()
  const { drucken, bogen } = useDruckBogen()
  /*
   * Der Zettel eines Gesprächs geht an beide — Schüler und Partner —, also
   * kommt er zweimal aufs Papier. Abschaltbar, weil manche Versammlungen ihn
   * nur dem Schüler geben; eingeschaltet, weil das der übliche Fall ist.
   */
  const [mitPartner, setMitPartner] = useState(true)
  const zettel = alleS89DerWoche(state.weeks, state.week, state.congregation.times, mitPartner)
  const week = state.weeks[state.week]

  if (zettel.length === 0 || !week) return null

  const datum = datumsFormat(state.lang, 'tag').format(meetingDate(week, 'mid', state.congregation.times))

  return (
    <>
      {/*
        Die Überschrift sagt, worum es geht — zusammengesetzt aus dem
        Formularnamen und `drucken`, also ohne neuen Wörterbuch-Schlüssel.
        Darunter steht nur noch die **Zahl**: „S-89" ein zweites Mal wäre
        dieselbe Auskunft zweimal.
      */}
      <div className="panel panel--pb14 s89-druck" data-farbe="neutral2">
        <h2 className="panel-label">S-89 {t.drucken}</h2>
        <div className="s89-druck-row">
          <span className="s89-druck-count">{t.s89Partner}</span>
          <Switch on={mitPartner} label={t.s89Partner} onToggle={() => setMitPartner((v) => !v)} />
          <button type="button" className="s89-druck-btn" onClick={() => drucken(<S89Druck zettel={zettel} datum={datum} />)}>
            {t.drucken}
          </button>
        </div>
      </div>
      {bogen}
    </>
  )
}
