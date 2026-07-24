import { useState } from 'react'
import { useApp } from '../app/context'
import { FS_BASE } from '../data/demo'
import { FS_TIME_OPTIONS, fsDate } from '../data/fs'
import { LOCALES } from '../i18n/langs'
import { useT } from '../i18n/useT'
import type { FsInstance } from '../data/types'
import { SlotChip } from './SlotChip'

const TIME_OPTIONS = FS_TIME_OPTIONS

/**
 * Treffpunkte planen (Planen-Tab): je Tag eine Karte mit editierbaren Zeilen
 * (Zeit, Ort, Leiter zuteilen, entfernen) und einer Karte zum Hinzufügen eines
 * Treffpunkts nur für diese Woche (z. B. Pioniertage). Grundplan-Änderungen
 * laufen über die Einstellungen.
 */
export function FsPlan() {
  const { state, dispatch } = useApp()
  const { t, tu } = useT()
  const wi = state.week
  const insts = state.fsWeeks[wi] ?? []

  const groupName = (grp: string): string => {
    const g = state.groups.find((x) => x.id === grp)
    return g ? tu(g.name) : grp
  }
  const title = (inst: FsInstance): string => (inst.grp === '' ? t.fsVers : groupName(inst.grp))
  const dayLabel = (wd: number): string =>
    fsDate(FS_BASE, wi, wd).toLocaleDateString(LOCALES[state.lang], {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })

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

  // „Für diese Woche hinzufügen"-Formular.
  const [grp, setGrp] = useState('')
  const [wd, setWd] = useState(6)
  const [time, setTime] = useState('09:30')
  const [place, setPlace] = useState('')
  const addInst = () => {
    const inst: FsInstance = {
      id: `x${Date.now()}`,
      ruleId: null,
      manual: true,
      grp,
      wd,
      time,
      place: place.trim() || 'Königreichssaal',
      leader: '',
    }
    dispatch({ type: 'fsInstAdd', inst })
    setPlace('')
  }

  const wdOptions = [1, 2, 3, 4, 5, 6, 0]
  const wdName = (d: number): string =>
    fsDate(FS_BASE, 0, d).toLocaleDateString(LOCALES[state.lang], { weekday: 'long' })

  return (
    <>
      <p className="plan-hint">{t.fsNurWoche}</p>

      {days.map((day) => (
        <div key={day.wd} className="panel" data-farbe="gold">
          <div className="panel-label">{dayLabel(day.wd)}</div>
          {day.items.map((inst) => (
            <div key={inst.id} className="fs-edit-row">
              <div className="fs-edit-head">
                <select
                  className="fs-select fs-select--time"
                  value={inst.time}
                  aria-label={title(inst)}
                  onChange={(e) => dispatch({ type: 'fsInstUpdate', wi, id: inst.id, patch: { time: e.target.value } })}
                >
                  {TIME_OPTIONS.map((tm) => (
                    <option key={tm} value={tm}>
                      {tm}
                    </option>
                  ))}
                </select>
                <div className="fs-edit-title">{title(inst)}</div>
                <button
                  type="button"
                  className="fs-remove"
                  aria-label="✕"
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
                <SlotChip
                  text={inst.leader ? `${tu('Leiter')}: ${inst.leader}` : t.zuteilenChip}
                  open={!inst.leader}
                  showStatus={Boolean(inst.leader)}
                  pending={state.pendingNames.includes(inst.leader)}
                  onClick={() => openLeader(inst)}
                />
              </div>
            </div>
          ))}
        </div>
      ))}

      <div className="panel panel--pb16 fs-add" data-farbe="neutral2">
        <div className="panel-label">{t.fsAddWeekLbl}</div>
        <div className="fs-add-grid">
          <select className="fs-select" value={grp} aria-label={t.fsVers} onChange={(e) => setGrp(e.target.value)}>
            <option value="">{t.fsVers}</option>
            {state.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {tu(g.name)}
              </option>
            ))}
          </select>
          <select className="fs-select" value={wd} aria-label="Wochentag" onChange={(e) => setWd(Number(e.target.value))}>
            {wdOptions.map((d) => (
              <option key={d} value={d}>
                {wdName(d)}
              </option>
            ))}
          </select>
          <select className="fs-select" value={time} aria-label="Zeit" onChange={(e) => setTime(e.target.value)}>
            {TIME_OPTIONS.map((tm) => (
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
