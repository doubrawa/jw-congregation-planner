import { useState } from 'react'
import { kennungVon } from '../data/planning'
import { useApp, useAppDispatch } from '../app/context'
import { FS_TIME_OPTIONS, fsKennung, fsLeiterZuteilung, fsTag, fsWeekConflicts } from '../data/fs'
import { LOCALES } from '../i18n/langs'
import { useT } from '../i18n/useT'
import type { FsInstance } from '../data/types'
import { SlotChip } from './SlotChip'
import { machBetrifft } from './useKonflikte'
import { wochentagName } from './wochentage'


/**
 * Automatisch zuteilen / Leeren der Treffpunkt-Leiter (wie beim Meeting-Panel,
 * aber eine Zeile). „Leeren" ist mit Zwei-Tipp-Bestätigung abgesichert.
 * `onlyGroup` grenzt bei Gruppenaufsehern auf die eigene Gruppe ein.
 */
function FsAutoAssign({ onlyGroup }: { onlyGroup: string | null }) {
  const dispatch = useAppDispatch()
  const { t } = useT()
  const [armed, setArmed] = useState(false)
  return (
    <div className="plan-auto">
      <div className="plan-auto-row">
        <div className="plan-auto-label">{t.fsLeiterLbl}</div>
        <div className="plan-auto-actions">
          <button
            type="button"
            className="plan-auto-btn plan-auto-btn--primary"
            onClick={() => {
              setArmed(false)
              dispatch({ type: 'fsAutoAssign', onlyGroup })
            }}
          >
            {t.autoZuteilen}
          </button>
          <button
            type="button"
            className={`plan-auto-btn plan-auto-btn--clear${armed ? ' is-armed' : ''}`}
            onClick={() => {
              if (armed) {
                setArmed(false)
                dispatch({ type: 'fsClear', onlyGroup })
              } else {
                setArmed(true)
              }
            }}
            onBlur={() => setArmed(false)}
          >
            {armed ? t.leerenSicher : t.leeren}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Treffpunkte planen (Planen-Tab): je Tag eine Karte mit editierbaren Zeilen
 * (Zeit, Ort, Leiter zuteilen, entfernen) und einer Karte zum Hinzufügen eines
 * Treffpunkts nur für diese Woche (z. B. Pioniertage). Grundplan-Änderungen
 * laufen über die Einstellungen.
 */
export function FsPlan({ onlyGroup = null }: { onlyGroup?: string | null }) {
  const { state, dispatch } = useApp()
  const { t, tu } = useT()
  const wi = state.week
  // Gruppenaufseher sehen/planen nur die Treffpunkte ihrer eigenen Gruppe.
  const insts = (state.fsWeeks[wi] ?? []).filter((i) => !onlyGroup || i.grp === onlyGroup)

  // Wie bei den Zusammenkünften: wen das Banner darüber nennt, den hebt der
  // Plan hervor. Eigene Quelle, weil Treffpunkte eine eigene haben.
  const kennung = fsKennung(state.weeks[wi], state.fsBase, wi)
  const betrifft = machBetrifft(
    state.persons,
    fsWeekConflicts(state.fsWeeks, wi, state.persons, state.absences, kennung, onlyGroup),
  )

  const groupName = (grp: string): string => {
    const g = state.groups.find((x) => x.id === grp)
    return g ? tu(g.name) : grp
  }
  const title = (inst: FsInstance): string => (inst.grp === '' ? t.fsVers : groupName(inst.grp))
  const dayLabel = (wd: number): string => {
    const tag = fsTag(kennung, wd)
    // Ohne brauchbare Kennung (Vorlagen, Demo) bleibt der Wochentag stehen —
    // ein erfundenes Datum wäre schlimmer als ein fehlendes.
    return tag
      ? tag.toLocaleDateString(LOCALES[state.lang], { weekday: 'long', day: 'numeric', month: 'long' })
      : wochentagName((wd + 6) % 7, state.lang)
  }

  const openLeader = (inst: FsInstance) =>
    dispatch({
      type: 'openSlot',
      sel: { kind: 'fs', wi, instId: inst.id, label: title(inst), priv: 'treffpunkt', groups: false },
    })

  // Nach Wochentag gruppieren (fsWeeks ist bereits sortiert).
  const days: { wd: number; items: FsInstance[] }[] = []
  for (const inst of insts) {
    let day = days.find((d) => d.wd === inst.wd)
    if (!day) {
      day = { wd: inst.wd, items: [] }
      days.push(day)
    }
    day.items.push(inst)
  }

  // „Für diese Woche hinzufügen"-Formular (Gruppenaufseher: Ziel = eigene Gruppe).
  const [grp, setGrp] = useState(onlyGroup ?? '')
  const [wd, setWd] = useState(6)
  const [time, setTime] = useState('09:30')
  const [place, setPlace] = useState('')
  const addInst = () => {
    const inst: FsInstance = {
      // Eindeutig statt zeitgestempelt: `x${Date.now()}` gab zwei Treffpunkte
      // derselben Millisekunde dieselbe Id — und sie steckt im Aufgaben-
      // Schlüssel (`fs|<Montag>|<instId>`). Zwei Treffpunkte hätten sich eine
      // Bestätigung geteilt. Dieselbe Stelle gab es bei den Regeln.
      id: `x${crypto.randomUUID()}`,
      ruleId: null,
      manual: true,
      grp,
      wd,
      time,
      // Vorgabe ist der Saal **dieser** Versammlung, nicht das deutsche Wort:
      // „Königreichssaal" stand sonst auch in einer spanischen Versammlung da.
      place: place.trim() || state.congregation.hall,
      leader: '',
    }
    dispatch({ type: 'fsInstAdd', inst })
    setPlace('')
  }

  const wdOptions = [1, 2, 3, 4, 5, 6, 0]
  const wdName = (d: number): string => wochentagName((d + 6) % 7, state.lang)

  // Treffpunkte dieser Woche ohne zugeteilten Leiter → Warn-Banner (analog zu
  // den offenen Zuteilungen der Zusammenkünfte). Konflikte gibt es hier nicht.
  const openLeaders = insts.filter((inst) => !inst.leader)

  return (
    <>
      <p className="plan-hint">{t.fsNurWoche}</p>

      <FsAutoAssign onlyGroup={onlyGroup} />

      {openLeaders.length > 0 && (
        <div className="plan-banner-box plan-open">
          <div className="plan-banner-head">
            <span className="plan-banner-badge">?</span>
            <span className="plan-banner-title">{t.offeneTitle}</span>
            <span className="plan-banner-count">{openLeaders.length}</span>
          </div>
          {openLeaders.map((inst) => (
            <div key={inst.id} className="plan-open-row">
              <span className="plan-open-label" dir="auto">
                {dayLabel(inst.wd)} · {title(inst)}
              </span>
            </div>
          ))}
        </div>
      )}

      {days.map((day) => (
        <div key={day.wd} className="panel" data-farbe="gold">
          <h2 className="panel-label">{dayLabel(day.wd)}</h2>
          {day.items.map((inst) => (
            <div key={inst.id} className="fs-edit-row">
              <div className="fs-edit-head">
                <select
                  className="fs-select fs-select--time"
                  value={inst.time}
                  aria-label={title(inst)}
                  onChange={(e) => dispatch({ type: 'fsInstUpdate', wi, id: inst.id, patch: { time: e.target.value } })}
                >
                  {FS_TIME_OPTIONS.map((tm) => (
                    <option key={tm} value={tm}>
                      {tm}
                    </option>
                  ))}
                </select>
                <div className="fs-edit-title">{title(inst)}</div>
                <button
                  type="button"
                  className="fs-remove"
                  aria-label={t.a11yRemove}
                  onClick={() => dispatch({ type: 'fsInstRemove', wi, id: inst.id })}
                >
                  ✕
                </button>
              </div>
              <input
                className="fs-input"
                type="text"
                value={inst.place}
                placeholder={t.fsOrtPh}
                aria-label={t.fsOrtPh}
                onChange={(e) => dispatch({ type: 'fsInstUpdate', wi, id: inst.id, patch: { place: e.target.value } })}
              />
              <div className="fs-edit-slot">
                {/* Beim Freitext-Leiter bleibt das Bestätigungs-Zeichen ganz
                    weg: „✓" heißt *bestätigt*, und der Kreisaufseher hat die
                    App gar nicht — ein Haken behauptete dort etwas, das nie
                    passiert ist. `konflikt` fragt aus demselben Grund
                    `fsLeiterZuteilung`. */}
                <SlotChip
                  text={inst.leader ? `${tu('Leiter')}: ${inst.leader}` : t.zuteilenChip}
                  open={!inst.leader}
                  showStatus={Boolean(inst.leader) && !inst.lext}
                  pending={state.pendingIds.includes(kennungVon(inst.leader, inst.lpid))}
                  konflikt={betrifft(fsLeiterZuteilung(inst))}
                  onClick={() => openLeader(inst)}
                />
              </div>
            </div>
          ))}
        </div>
      ))}

      <div className="panel panel--pb16 fs-add" data-farbe="neutral2">
        <h2 className="panel-label">{t.fsAddWeekLbl}</h2>
        <div className="fs-add-grid">
          {!onlyGroup && (
            <select className="fs-select" value={grp} aria-label={t.fsVers} onChange={(e) => setGrp(e.target.value)}>
              <option value="">{t.fsVers}</option>
              {state.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {tu(g.name)}
                </option>
              ))}
            </select>
          )}
          <select className="fs-select" value={wd} aria-label={t.a11yWeekday} onChange={(e) => setWd(Number(e.target.value))}>
            {wdOptions.map((d) => (
              <option key={d} value={d}>
                {wdName(d)}
              </option>
            ))}
          </select>
          <select className="fs-select" value={time} aria-label={t.a11yTime} onChange={(e) => setTime(e.target.value)}>
            {FS_TIME_OPTIONS.map((tm) => (
              <option key={tm} value={tm}>
                {tm}
              </option>
            ))}
          </select>
          <input
            className="fs-input"
            type="text"
            value={place}
            placeholder={t.fsOrtPh}
            aria-label={t.fsOrtPh}
            onChange={(e) => setPlace(e.target.value)}
          />
        </div>
        <button type="button" className="fs-add-btn" onClick={addInst}>
          {t.fsAdd}
        </button>
      </div>
    </>
  )
}
