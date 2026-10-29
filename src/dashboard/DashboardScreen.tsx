import { useMemo, type ReactNode } from 'react'
import { useApp } from '../app/context'
import { eigenePerson } from '../app/eigene-person'
import { useKalendertag } from '../app/useKalendertag'
import { Zeichen } from '../bausteine/Zeichen'
import { aufgabeTag } from '../aufgaben/aufgabe-anzeige'
import { AufgabeKarte } from '../aufgaben/AufgabeKarte'
import { zusammenkunftName } from '../components/anlass-name'
import { datumsFormat } from '../components/datum-anzeige'
import { treffpunktTitel } from '../components/treffpunkt-beschriftung'
import { eigeneGruppen } from '../data/fs'
import { fromIso } from '../data/meeting-dates'
import { rechteVon } from '../data/rechte'
import { eigeneTermine } from '../data/trolleys'
import type { MyTask, TrolleyTermin } from '../data/types'
import { AnwesenheitKarte } from '../anwesenheit/AnwesenheitKarte'
import { ErsteSchritteKarte } from '../erste-schritte/ErsteSchritteKarte'
import { aufgabenHaelften, aufgabenTitelSprache, useT } from '../i18n/useT'
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
 *  1. **Der Gruß** — mit Vornamen. Darunter, bis man ihn gesehen oder
 *     weggeklickt hat, der Film **Erste Schritte** (22.10.2026).
 *  2. **Die nächste eigene Aufgabe, groß**, mit Bestätigen und Absagen gleich
 *     darunter. Liegt sie in einer Zusammenkunft, steht der Saal darüber: wie
 *     weit der Abend besetzt ist, und wo man selbst sitzt.
 *  3. **Die nächsten danach**, je eine Zeile; ein Tipp öffnet die Aufgabe.
 *     Dazwischen, nach dem Tag, die eigenen Trolley-Termine.
 *  4. **Diese Woche in der Versammlung** — die Zusammenkünfte und Treffpunkte,
 *     die noch kommen.
 *  5. Für Planer: **die Planung** der kommenden Wochen (T95), ab dem Tablet
 *     in einer zweiten Spalte daneben. Die Woche der Versammlung steht dann
 *     dort unter der Planung (29.10.2026): Links war die Spalte lang, rechts
 *     blieb sie halb leer. Am Handy hat der Planer die Woche gar nicht — dort
 *     steht die Planung an ihrer Stelle.
 *
 * Keine Zeile schneidet ihren Text ab: Wo er nicht passt, bricht er um. Bis
 * zum 29.10.2026 endete er mit „…" — beim Planer am Tablet „Zusammenkunft
 * unter …", „Gruppe 1 · Bei Familie Al…".
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
          {/* Während der eigenen Zusammenkunft als Saalordner oder Zoom-Ordner
              zuoberst: die Anwesenden eintragen (T152). */}
          <AnwesenheitKarte />
          <ErsteSchritteKarte />
          {naechste ? (
            <AufgabeKarte task={naechste} saal />
          ) : (
            <p className="karte karte--held start-leer">{t.dashKeineAufgabe}</p>
          )}
          {(danach.length > 0 || trolley.length > 0) && <WeitereAufgaben aufgaben={danach} trolley={trolley} />}
          {!zuteilen && termine.length > 0 && <DieseWoche termine={termine} />}
        </div>
        {/* Wer zuteilt — Admin oder Planer —, sieht seine Arbeit gleich daneben
            (T95), darunter die Woche der Versammlung. Wer nicht plant, dürfte
            den Bildschirm dahinter gar nicht betreten. */}
        {zuteilen && (
          <div className="start-spalte">
            <PlanungsKarte />
            {termine.length > 0 && <DieseWoche termine={termine} />}
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
  text: ReactNode
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
      text: <AufgabeText task={task} />,
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
          <span className="start-zeile-inhalt">
            <span className="start-zeile-tag">{zeile.tag ? kurz.format(fromIso(zeile.tag)) : ''}</span>
            <span className="start-zeile-text">{zeile.text}</span>
          </span>
          <Zeichen name="weiter" />
        </button>
      ))}
    </div>
  )
}

/**
 * Programmpunkt und Rolle einer Aufgabe in einer Zeile, jede Hälfte in ihrer
 * Sprache: Der Punkt trennt nach den Regeln des Programms wie der Titel der
 * großen Karte, die Rolle nach denen des Lesers. Ein `lang` für beide trennte
 * bei englischer App und deutscher Versammlung „Student" nach deutschen Regeln.
 */
function AufgabeText({ task }: { task: MyTask }) {
  const { state } = useApp()
  const i18n = useT()
  const { punkt, rolle } = aufgabenHaelften(task, i18n)
  return (
    <>
      {punkt && <span lang={aufgabenTitelSprache(task, state.lang, state.congLang)}>{punkt}</span>}
      {punkt && rolle && ' · '}
      {rolle}
    </>
  )
}

/** Was diese Woche in der Versammlung noch ansteht. */
function DieseWoche({ termine }: { termine: readonly Termin[] }) {
  const { state } = useApp()
  const i18n = useT()
  const { t } = i18n
  const kurz = datumsFormat(state.lang, 'wochentagZahl')
  const was = (termin: Termin): string => {
    if (termin.art === 'zusammenkunft') return zusammenkunftName(termin.tab, t)
    const titel = treffpunktTitel(termin.inst, state.groups, i18n)
    // Der Ort durch `tu` wie im Programm: Der Vorgabewert („Königreichssaal")
    // steht im Wörterbuch und blieb hier als einziges Wort deutsch.
    return termin.inst.place ? `${titel} · ${i18n.tu(termin.inst.place)}` : titel
  }
  return (
    <section className="start-woche">
      <h2 className="abschnitt-titel">{t.dieseWocheVersammlung}</h2>
      <div className="karte start-liste">
        {termine.map((termin) => (
          <div key={termin.key} className="start-zeile start-termin">
            <span className="start-zeile-inhalt">
              <span className="start-zeile-tag">{kurz.format(termin.tag)}</span>
              <span className="start-zeile-tag start-zeile-zeit">{termin.zeit}</span>
              <span className="start-zeile-text">{was(termin)}</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}
