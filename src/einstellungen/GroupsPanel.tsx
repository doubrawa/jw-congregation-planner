import { useApp } from '../app/context'
import { displayName, personCompare } from '../data/helpers'
import { fill, useT } from '../i18n/useT'
import type { Person } from '../data/types'

/** Predigtdienstgruppen: Aufseher/Gehilfe je Gruppe, Mitgliederzahl, hinzufügen/löschen. */
export function GroupsPanel() {
  const { state, dispatch } = useApp()
  const { t, tu } = useT()

  const sortedPersons = [...state.persons].sort(personCompare)

  // Aufseher nur aus Ältesten/Dienstamtgehilfen, Gehilfe aus allen außer
  // Schwestern (Predigtdienstgruppen).
  const groupPersonOptions = (allowed: (p: Person) => boolean) => (
    <>
      <option value="">—</option>
      {sortedPersons.filter(allowed).map((p) => (
        <option key={p.id} value={p.id}>
          {displayName(p)}
        </option>
      ))}
    </>
  )
  const ovOptions = groupPersonOptions((p) => p.role === 'aeltester' || p.role === 'dienstamtgehilfe')
  const asOptions = groupPersonOptions((p) => !p.female)

  const groupMemberLabel = (id: string): string => {
    const n = state.persons.filter((p) => p.grp === id).length
    return n === 1 ? t.mitglied1 : fill(t.mitgliederN, { n })
  }

  const addGroup = () => {
    const maxN = state.groups.reduce(
      (m, g) => Math.max(m, Number.parseInt(g.name.replace(/\D/g, ''), 10) || 0),
      0,
    )
    dispatch({
      type: 'addGroup',
      group: { id: crypto.randomUUID(), name: `Gruppe ${maxN + 1}`, ov: null, as: null },
    })
  }

  return (
    <div className="panel panel--pb16" data-farbe="neutral2">
      <div className="panel-label">{t.gruppenCard}</div>
      <p className="panel-hint">{t.gruppenDesc}</p>
      {state.groups.map((group) => (
        <div key={group.id} className="grp-block">
          <div className="grp-head">
            <div className="grp-name">{tu(group.name)}</div>
            <div className="grp-count">{groupMemberLabel(group.id)}</div>
            <button
              type="button"
              className="svc-remove"
              aria-label="✕"
              onClick={() => dispatch({ type: 'removeGroup', id: group.id })}
            >
              ✕
            </button>
          </div>
          <div className="grp-selects">
            <label className="grp-field">
              <span className="field-label">{t.aufseherLbl}</span>
              <select
                className="mem-select"
                value={group.ov ?? ''}
                onChange={(e) =>
                  dispatch({ type: 'updateGroup', id: group.id, patch: { ov: e.target.value || null } })
                }
              >
                {ovOptions}
              </select>
            </label>
            <label className="grp-field">
              <span className="field-label">{t.gehilfeLbl}</span>
              <select
                className="mem-select"
                value={group.as ?? ''}
                onChange={(e) =>
                  dispatch({ type: 'updateGroup', id: group.id, patch: { as: e.target.value || null } })
                }
              >
                {asOptions}
              </select>
            </label>
          </div>
        </div>
      ))}
      <button type="button" className="btn-outline grp-add" onClick={addGroup}>
        {t.gruppeHinzu}
      </button>
    </div>
  )
}
