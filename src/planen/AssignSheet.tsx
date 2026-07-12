import { useEffect } from 'react'
import { useApp } from '../app/context'
import { displayName, initials, isQualified, roleLabel, workloadOf } from '../data/helpers'
import { slotValue } from '../data/planning'
import type { SlotSelection } from '../data/types'
import './planen.css'

interface Candidate {
  key: string
  initials: string
  name: string
  sub: string
  absent: boolean
  free: boolean // 0 Aufgaben → Chip "frei"
}

/**
 * Zuteilungs-Sheet: mobil Bottom-Sheet, Desktop zentriertes Modal.
 * Kandidaten = qualifizierte Personen (Abwesende ausgegraut ans Listenende,
 * Auswahl blockiert mit Toast); Reinigungs-Slots: Gruppe 1–3.
 * Auswahl teilt sofort zu und schließt das Sheet.
 */
export function AssignSheet({ sel }: { sel: SlotSelection }) {
  const { state, dispatch } = useApp()
  const close = () => dispatch({ type: 'closeSlot' })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dispatch({ type: 'closeSlot' })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dispatch])

  const current = slotValue(state.weeks, sel)

  const candidates: Candidate[] = sel.groups
    ? ['Gruppe 1', 'Gruppe 2', 'Gruppe 3'].map((group) => ({
        key: group,
        initials: group.replace('Gruppe ', 'G'),
        name: group,
        sub: 'Reinigungsgruppe',
        absent: false,
        free: false,
      }))
    : state.persons
        .filter((p) => !sel.priv || isQualified(p, sel.priv))
        .map((p) => {
          const name = displayName(p)
          const workload = workloadOf(state.weeks, name)
          return {
            key: p.id,
            initials: initials(p),
            name,
            sub: `${roleLabel(p)} · ${workload} ${workload === 1 ? 'Aufgabe' : 'Aufgaben'} in ${state.weeks.length} Wochen`,
            absent: p.absent.includes(sel.wi),
            free: workload === 0,
          }
        })
        // Abwesende ans Listenende (stabil)
        .sort((a, b) => Number(a.absent) - Number(b.absent))

  const pick = (cand: Candidate) => {
    if (cand.absent) {
      dispatch({ type: 'showToast', text: `${cand.name} ist in dieser Woche abwesend` })
      return
    }
    dispatch({ type: 'assign', name: cand.name })
  }

  return (
    <>
      <div className="sheet-backdrop" onClick={close} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={sel.label}>
        <div className="sheet-head">
          <div>
            <div className="sheet-title">{sel.label}</div>
            <div className="sheet-sub">
              {state.weeks[sel.wi].range} · {sel.tab === 'mid' ? 'Unter der Woche' : 'Wochenende'}
            </div>
          </div>
          <button type="button" className="sheet-close" aria-label="Schließen" onClick={close}>
            ✕
          </button>
        </div>

        {current && (
          <div className="sheet-current">
            <span>
              Aktuell: <strong>{current}</strong>
            </span>
            <button
              type="button"
              className="sheet-remove"
              onClick={() => dispatch({ type: 'assign', name: '' })}
            >
              Entfernen
            </button>
          </div>
        )}

        <div className="sheet-list">
          {candidates.map((cand) => (
            <button
              key={cand.key}
              type="button"
              className={cand.absent ? 'cand-row is-absent' : 'cand-row'}
              onClick={() => pick(cand)}
            >
              <span className="avatar avatar--tint avatar--36">{cand.initials}</span>
              <span>
                <span className="cand-name">{cand.name}</span>
                <span className="cand-sub">{cand.sub}</span>
              </span>
              {cand.absent ? (
                <span className="cand-chip cand-chip--absent">Abwesend</span>
              ) : cand.free ? (
                <span className="cand-chip cand-chip--frei">frei</span>
              ) : null}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
