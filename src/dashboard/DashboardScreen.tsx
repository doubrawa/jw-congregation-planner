import { useMemo } from 'react'
import { useApp } from '../app/context'
import { eigenePerson } from '../app/eigene-person'
import { useKalendertag } from '../app/useKalendertag'
import { Zeichen } from '../bausteine/Zeichen'
import { aufgabeTag } from '../aufgaben/aufgabe-anzeige'
import { AufgabeKarte } from '../aufgaben/AufgabeKarte'
import { datumsFormat } from '../components/datum-anzeige'
import { treffpunktTitel } from '../components/treffpunkt-beschriftung'
import { eigeneGruppen } from '../data/fs'
import { fromIso } from '../data/meeting-dates'
import { rechteVon } from '../data/rechte'
import { eigeneTermine } from '../data/trolleys'
import type { MyTask, TrolleyTermin } from '../data/types'
import { aufgabenLabel, useT } from '../i18n/useT'
import { zeitSpanne, zuDenTrolleys } from '../trolleys/trolley-anzeige'
import { termineDieserWoche, type Termin } from './diese-woche'
import { PlanungsKarte } from './PlanungsKarte'
import './dashboard.css'

/** So viele Aufgaben stehen unter der großen Karte — die ganze Liste hat „Meine Aufgaben". */
const WEITERE_AUFGABEN = 3

/**
 * **Start** (T121): was einen selbst angeht, in der Reihenfolge, in der man
 * fragt.
 *
 *  1. **Der Gruß** — mit Vornamen.
 *  2. **Die nächste eigene Aufgabe, groß**, mit Bestätigen und Absagen gleich
 *     darunter. Liegt sie in einer Zusammenkunft, steht der Saal darüber: wie
 *     weit der Abend besetzt ist, und wo man selbst sitzt.
 *  3. **Die nächsten danach**, je eine Zeile; ein Tipp öffnet die Aufgabe.
 *     Dazwischen, nach dem Tag, die eigenen Trolley-Termine.
 *  4. **Diese Woche in der Versammlung** — die Zusammenkünfte und Treffpunkte,
 *     die noch kommen.
 *  5. Für Planer: **die Planung** der kommenden Wochen (T95), ab dem Tablet
 *     in einer zweiten Spalte daneben.
 *
 * Die Abwesenheiten standen hier bis zum Umbau in einer Zeitleiste mit den
 * Aufgaben; sie gehören jetzt ins Profil, wo man sie auch einträgt.
 */
export function DashboardScreen() {
  const { state } = useApp()
  const { t } = useT()
  const me = eigenePerson(state)
  // Ein neuer Render, sobald der Tag wechselt — sonst stünde nach einer Nacht im
  // Hintergrund noch der gestrige Gruß über den gestrigen Terminen.
  const tag = useKalendertag()
  const hour = new Date().getHours()
  const gruss = hour < 11 ? t.grussMorgen : hour < 18 ? t.grussTag : t.grussAbend
  const { zuteilen } = rechteVon(state)

  const [naechste, ...danach] = state.myTasks
  const { weeks, fsWeeks, persons, groups, personId } = state
  const termine = useMemo(
    () =>
      termineDieserWoche(weeks, fsWeeks, state.congregation.times, eigeneGruppen(persons, groups, personId), fromIso(tag)),
    [weeks, fsWeeks, state.congregation.times, persons, groups, personId, tag],
  )
  const trolley = eigeneTermine(state.trolleyTermine, me?.id, fromIso(tag))

  return (
    <section className="screen start">
      <h1 className="seitentitel seitentitel--gross">{me?.fn ? `${gruss}, ${me.fn}` : gruss}</h1>

      <div className={zuteilen ? 'start-spalten is-planer' : 'start-spalten'}>
        <div className="start-spalte">
          {naechste ? (
            <AufgabeKarte task={naechste} saal />
          ) : (
            <p className="karte karte--held start-leer">{t.dashKeineAufgabe}</p>
          )}
          {(danach.length > 0 || trolley.length > 0) && <WeitereAufgaben aufgaben={danach} trolley={trolley} />}
          {termine.length > 0 && <DieseWoche termine={termine} />}
        </div>
        {/* Wer zuteilt — Admin oder Planer —, sieht seine Arbeit gleich daneben
            (T95). Wer nicht plant, dürfte den Bildschirm dahinter gar nicht
            betreten. */}
        {zuteilen && (
          <div className="start-spalte">
            <PlanungsKarte />
          </div>
        )}
      </div>
    </section>
  )
}

/** Eine Zeile unter der großen Karte: Tag, was — und wohin ein Tipp führt. */
interface StartZeile {
  key: string
  tag: string | null
  text: string
  onTipp: () => void
}

/**
 * Was nach der nächsten Aufgabe kommt, nach dem Tag: die Aufgaben — ein Tipp
 * öffnet sie — und die eigenen Trolley-Termine, ein Tipp führt zu den Trolleys
 * (Entwurf `GStart`). Am selben Tag steht die Aufgabe vorn; ohne Tag steht sie
 * am Ende (Vorlagen).
 */
function WeitereAufgaben({ aufgaben, trolley }: { aufgaben: readonly MyTask[]; trolley: readonly TrolleyTermin[] }) {
  const { state, dispatch } = useApp()
  const i18n = useT()
  const kurz = datumsFormat(state.lang, 'wochentagZahl')
  const zeilen: StartZeile[] = [
    ...aufgaben.map((task) => ({
      key: task.id,
      tag: aufgabeTag(task),
      text: aufgabenLabel(task, i18n),
      onTipp: () => dispatch({ type: 'openMyTask', id: task.id }),
    })),
    ...trolley.map((termin) => ({
      key: termin.id,
      tag: termin.datum,
      text: `${i18n.t.privZeugnis} · ${zeitSpanne(termin)}`,
      onTipp: () => zuDenTrolleys(dispatch),
    })),
  ]
  const ohneTag = '9999-12-31'
  zeilen.sort((a, b) => (a.tag ?? ohneTag).localeCompare(b.tag ?? ohneTag))
  return (
    <div className="karte start-liste">
      {zeilen.slice(0, WEITERE_AUFGABEN).map((zeile) => (
        <button key={zeile.key} type="button" className="start-zeile" onClick={zeile.onTipp}>
          <span className="start-zeile-tag">{zeile.tag ? kurz.format(fromIso(zeile.tag)) : ''}</span>
          <span className="start-zeile-text">{zeile.text}</span>
          <Zeichen name="weiter" />
        </button>
      ))}
    </div>
  )
}

/** Was diese Woche in der Versammlung noch ansteht. */
function DieseWoche({ termine }: { termine: readonly Termin[] }) {
  const { state } = useApp()
  const i18n = useT()
  const { t } = i18n
  const kurz = datumsFormat(state.lang, 'wochentagZahl')
  const was = (termin: Termin): string => {
    if (termin.art === 'zusammenkunft') return termin.tab === 'mid' ? t.tabMid : t.tabWe
    const titel = treffpunktTitel(termin.inst, state.groups, i18n)
    return termin.inst.place ? `${titel} · ${termin.inst.place}` : titel
  }
  return (
    <section className="start-woche">
      <h2 className="abschnitt-titel">{t.dieseWocheVersammlung}</h2>
      <div className="karte start-liste">
        {termine.map((termin) => (
          <div key={termin.key} className="start-zeile start-termin">
            <span className="start-zeile-tag">{kurz.format(termin.tag)}</span>
            <span className="start-zeile-tag">{termin.zeit}</span>
            <span className="start-zeile-text">{was(termin)}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
