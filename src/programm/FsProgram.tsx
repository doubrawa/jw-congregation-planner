import { useApp } from '../app/context'
import { CURRENT_PERSON_ID } from '../data/demo'
import { fsDate } from '../data/fs'
import { displayName } from '../data/helpers'
import { LOCALES } from '../i18n/langs'
import { useT } from '../i18n/useT'
import type { FsInstance } from '../data/types'

/**
 * Treffpunkte-Anzeige (Programm-Tab „Zusammenkünfte für den Predigtdienst"):
 * pro Tag eine gold getönte Karte mit Zeit · Versammlungs-/Gruppentreffpunkt ·
 * Ort und dem zugeteilten Leiter (DU-Chip beim angemeldeten Nutzer).
 */
export function FsProgram() {
  const { state } = useApp()
  const { t, tu } = useT()
  const me = state.persons.find((p) => p.id === (state.personId ?? CURRENT_PERSON_ID))
  const myName = me ? displayName(me) : null
  const insts = state.fsWeeks[state.week] ?? []

  if (insts.length === 0) {
    return (
      <div className="panel panel--lead panel--pb16" data-farbe="gold">
        <p className="prog-meta">{t.fsKeine}</p>
      </div>
    )
  }

  // Nach Wochentag gruppieren (fsWeeks ist bereits sortiert: Mo→So, Zeit, Gruppe).
  const days: { wd: number; label: string; items: FsInstance[] }[] = []
  for (const inst of insts) {
    let day = days.find((d) => d.wd === inst.wd)
    if (!day) {
      const label = fsDate(state.fsBase, state.week, inst.wd).toLocaleDateString(LOCALES[state.lang], {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      })
      day = { wd: inst.wd, label, items: [] }
      days.push(day)
    }
    day.items.push(inst)
  }

  const groupName = (grp: string): string => {
    const g = state.groups.find((x) => x.id === grp)
    return g ? tu(g.name) : grp
  }

  return (
    <>
      {days.map((day) => (
        <div key={day.wd} className="panel" data-farbe="gold">
          <div className="panel-label">{day.label}</div>
          {day.items.map((inst) => (
            <div key={inst.id} className="fs-row">
              <div className="fs-row-main">
                <span className="fs-time">{inst.time}</span>
                <div>
                  <div className="fs-title">{inst.grp === '' ? t.fsVers : groupName(inst.grp)}</div>
                  <div className="fs-place">{inst.place}</div>
                </div>
              </div>
              <div className="fs-leader">
                <div className="fs-leader-name">
                  {myName !== null && inst.leader === myName && <span className="chip-du">DU</span>}
                  <span className={inst.leader ? '' : 'fs-leader-open'}>
                    {inst.leader || t.offenDash}
                  </span>
                </div>
                <div className="fs-leader-role">{tu('Leiter')}</div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </>
  )
}
