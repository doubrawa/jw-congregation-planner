import { useState } from 'react'
import { useApp } from '../app/context'
import { Wahl } from '../bausteine/Wahl'
import { datumsFormat } from '../components/datum-anzeige'
import { Sheet } from '../components/Sheet'
import { useZweiTipp } from '../components/useZweiTipp'
import { mtab } from '../data/helpers'
import { meetingDate } from '../data/meeting-dates'
import { tabsImUmfang, zuteilbarePlaetze, type AssignScope, type Umfang } from '../data/planning'
import type { Meeting, MeetingKey, Service, Week } from '../data/types'
import { besetzungText, fill, useT } from '../i18n/useT'

/** Ein Bereich, den „Automatisch" füllt oder leert. */
type Bereich = Exclude<AssignScope, 'all'>
const BEREICHE: readonly Bereich[] = ['parts', 'helpers']

interface Stand {
  besetzt: number
  gesamt: number
}

/** Besetzte und alle Plätze eines Bereichs, über die Zusammenkünfte des Umfangs. */
function standVon(meetings: readonly Meeting[], services: readonly Service[], bereich: Bereich): Stand {
  const stand = { besetzt: 0, gesamt: 0 }
  for (const meeting of meetings) {
    const z = zuteilbarePlaetze(meeting, services, bereich)
    stand.besetzt += z.besetzt
    stand.gesamt += z.gesamt
  }
  return stand
}

/** Der Stand beider Bereiche im Umfang. */
function standImUmfang(
  week: Week,
  gezeigt: MeetingKey,
  umfang: Umfang,
  services: readonly Service[],
): Record<Bereich, Stand> {
  const meetings = tabsImUmfang(week, gezeigt, umfang).map((tab) => week[tab])
  return { parts: standVon(meetings, services, 'parts'), helpers: standVon(meetings, services, 'helpers') }
}

/** Beide Bereiche gewählt heißt „alles" — so nehmen es Auto-Zuteilung und Leeren. */
function scopeVon(gewaehlt: ReadonlySet<Bereich>): AssignScope | null {
  if (gewaehlt.size === BEREICHE.length) return 'all'
  return BEREICHE.find((b) => gewaehlt.has(b)) ?? null
}

/**
 * **Automatisch zuteilen** (T121, Entwurf `GAutomatisch`) — hinter dem Knopf
 * „Automatisch" der Aktionsleiste: welche Bereiche (Aufgaben im Programm,
 * Hilfsdienste), wie weit sie besetzt sind, und ob nur die gezeigte
 * Zusammenkunft oder die ganze Woche (Entscheid vom 13.10.2026). Gefüllt
 * werden nur offene Plätze; Leeren fragt nach (`useZweiTipp`).
 *
 * Vorgewählt sind die Bereiche, in denen am gezeigten Tag etwas offen ist.
 * Die Zahlen und die Knöpfe rechnen über dieselben Zusammenkünfte
 * (`tabsImUmfang`) wie der Reducer — eine ausgefallene zählt nicht mit.
 */
export function AutomatischBlatt({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const week = state.weeks[state.week]
  const tab = mtab(state.tab)
  const [umfang, setUmfang] = useState<Umfang>('tag')
  const [gewaehlt, setGewaehlt] = useState<ReadonlySet<Bereich>>(() => {
    if (!week) return new Set()
    const amTag = standImUmfang(week, tab, 'tag', state.services)
    return new Set(BEREICHE.filter((b) => amTag[b].besetzt < amTag[b].gesamt))
  })
  const scope = scopeVon(gewaehlt)
  const leeren = useZweiTipp(() => {
    if (!scope) return
    dispatch({ type: 'clearAssignments', scope, umfang })
    onClose()
  })
  if (!week) return null

  const stand = standImUmfang(week, tab, umfang, state.services)
  const auswahl = BEREICHE.filter((b) => gewaehlt.has(b))
  const offen = auswahl.some((b) => stand[b].besetzt < stand[b].gesamt)
  const besetzt = auswahl.some((b) => stand[b].besetzt > 0)
  const tagName = datumsFormat(state.lang, 'wochentag').format(meetingDate(week, tab, state.congregation.times))
  const bereichName = (b: Bereich): string => (b === 'parts' ? t.autoAufgaben : t.hilfsdienste)

  // Jede andere Wahl nimmt ein „Wirklich leeren?" zurück: Es galt der alten.
  const umschalten = (b: Bereich): void => {
    leeren.entschaerfen()
    setGewaehlt((alt) => {
      const neu = new Set(alt)
      if (neu.has(b)) neu.delete(b)
      else neu.add(b)
      return neu
    })
  }

  return (
    <Sheet label={t.autoTitel} title={t.autoTitel} onClose={onClose}>
      <div className="sheet-inhalt automatisch">
        <p className="klein-text">{t.autoHinweis}</p>
        <div className="auto-bereiche">
          {BEREICHE.map((b) => (
            <label key={b} className="auto-bereich">
              <span className="auto-bereich-text">
                <span className="auto-bereich-name">{bereichName(b)}</span>
                <span className="klein-text">{besetzungText(t, stand[b].besetzt, stand[b].gesamt)}</span>
              </span>
              <input type="checkbox" checked={gewaehlt.has(b)} onChange={() => umschalten(b)} />
            </label>
          ))}
        </div>
        <Wahl
          label={t.autoUmfang}
          optionen={[
            { wert: 'tag', text: fill(t.autoNurTag, { tag: tagName }) },
            { wert: 'woche', text: t.ganzeWoche },
          ]}
          wert={umfang}
          onWahl={(u: Umfang) => {
            leeren.entschaerfen()
            setUmfang(u)
          }}
        />
      </div>
      <AutomatikFuss
        zuteilen={
          scope && offen
            ? () => {
                dispatch({ type: 'autoAssign', scope, umfang })
                onClose()
              }
            : null
        }
        leeren={leeren}
        leerenMoeglich={scope !== null && besetzt}
        onClose={onClose}
      />
    </Sheet>
  )
}

/**
 * **Der Fuß beider Automatik-Blätter** (Zusammenkünfte, Treffpunkte):
 * „Zuteilen", darunter „Leeren" mit Rückfrage und „Abbrechen". Die Rückfrage
 * führt das Blatt selbst (`useZweiTipp`): Jede andere Wahl darin nimmt ein
 * „Wirklich leeren?" zurück.
 */
export function AutomatikFuss({
  zuteilen,
  leeren,
  leerenMoeglich,
  onClose,
}: {
  /** `null`: Es gibt nichts zuzuteilen — der Knopf ist gesperrt. */
  zuteilen: (() => void) | null
  leeren: ReturnType<typeof useZweiTipp>
  leerenMoeglich: boolean
  onClose: () => void
}) {
  const { t } = useT()
  return (
    <div className="auto-fuss">
      <button type="button" className="knopf-haupt" disabled={!zuteilen} onClick={() => zuteilen?.()}>
        {t.spurZuteilen}
      </button>
      <div className="knopf-reihe">
        <button
          type="button"
          className="auto-leeren"
          disabled={!leerenMoeglich}
          onClick={leeren.onClick}
          onBlur={leeren.onBlur}
        >
          {leeren.armed ? t.leerenSicher : t.leeren}
        </button>
        <button type="button" className="knopf-leise" onClick={onClose}>
          {t.abbrechen}
        </button>
      </div>
    </div>
  )
}
