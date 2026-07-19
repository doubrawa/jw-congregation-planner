import { useEffect } from 'react'
import { useApp } from '../app/context'
import { displayName, initials, isQualified, personCompare, roleLabel, workloadOf } from '../data/helpers'
import { assignmentsInMeeting, buildS89ForSlot, slotValue } from '../data/planning'
import { fill, useT } from '../i18n/useT'
import type { MeetingAssignment } from '../data/planning'
import type { SlotSelection } from '../data/types'
import '../components/overlays.css'
import './planen.css'

interface Candidate {
  key: string
  initials: string
  name: string // Anzeigename (Gruppen: übersetzt)
  assignName: string // in die Woche geschriebener kanonischer Name (Gruppen: "Gruppe N")
  sub: string
  today: MeetingAssignment[] // schon an diesem Tag zugeteilt (Doppelbelegungs-Hinweis)
  absent: boolean
  free: boolean
}

/**
 * Zuteilungs-Sheet: mobil Bottom-Sheet, Desktop zentriertes Modal.
 * Kandidaten = qualifizierte Personen (Abwesende ausgegraut ans Listenende,
 * Auswahl blockiert mit Toast); Reinigungs-Slots: Gruppe 1–3.
 */
export function AssignSheet({ sel }: { sel: SlotSelection }) {
  const { state, dispatch } = useApp()
  const { t, tu, tp } = useT()
  const close = () => dispatch({ type: 'closeSlot' })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dispatch({ type: 'closeSlot' })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dispatch])

  const current = slotValue(state.weeks, sel)
  const s89 = buildS89ForSlot(state.weeks, sel)
  const title = sel.kind === 'helper' ? tu(sel.label) : tp(sel.label)
  const sub = `${tp(state.weeks[sel.wi].range)} · ${sel.tab === 'mid' ? t.tabMid : t.tabWe}`

  const groupSub = (id: string, ov: string | null): string => {
    const overseer = state.persons.find((p) => p.id === ov)
    const n = state.persons.filter((p) => p.grp === id).length
    const memberLabel = n === 1 ? t.mitglied1 : fill(t.mitgliederN, { n })
    return overseer ? `${displayName(overseer)} · ${memberLabel}` : memberLabel
  }

  const meeting = state.weeks[sel.wi][sel.tab]
  const candidates: Candidate[] = sel.groups
    ? state.groups.map((group) => {
        const num = group.name.replace(/\D/g, '')
        return {
          key: group.id,
          initials: num ? `G${num}` : 'G',
          name: tu(group.name),
          assignName: group.name,
          sub: groupSub(group.id, group.ov),
          today: [],
          absent: false,
          free: false,
        }
      })
    : [...state.persons]
        .sort(personCompare) // alphabetisch; Abwesende wandern stabil ans Ende
        .filter((p) => !sel.priv || isQualified(p, sel.priv))
        .map((p) => {
          const name = displayName(p)
          const workload = workloadOf(state.weeks, name)
          const workloadLabel =
            workload === 1 ? t.aufgabeIn4 : fill(t.aufgabenIn4, { n: workload })
          return {
            key: p.id,
            initials: initials(p),
            name,
            assignName: name,
            sub: `${tu(roleLabel(p))} · ${workloadLabel}`,
            today: assignmentsInMeeting(meeting, name, state.services, sel),
            absent: p.absent.includes(sel.wi),
            free: workload === 0,
          }
        })
        .sort((a, b) => Number(a.absent) - Number(b.absent))

  const pick = (cand: Candidate) => {
    if (cand.absent) {
      dispatch({ type: 'showToast', text: fill(t.toastAbsentP, { name: cand.name }) })
      return
    }
    dispatch({ type: 'assign', name: cand.assignName })
  }

  return (
    <>
      <div className="sheet-backdrop" onClick={close} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-head">
          <div>
            <div className="sheet-title">{title}</div>
            <div className="sheet-sub">{sub}</div>
          </div>
          <button type="button" className="sheet-close" aria-label="✕" onClick={close}>
            ✕
          </button>
        </div>

        {current && (
          <div className="sheet-current">
            <span>
              {t.aktuellLbl} <strong>{tu(current)}</strong>
            </span>
            <div className="sheet-current-actions">
              {s89 && (
                <button
                  type="button"
                  className="sheet-s89-link"
                  onClick={() => dispatch({ type: 'openS89', payload: s89 })}
                >
                  {t.s89Open}
                </button>
              )}
              <button
                type="button"
                className="sheet-remove"
                onClick={() => dispatch({ type: 'assign', name: '' })}
              >
                {t.entfernen}
              </button>
            </div>
          </div>
        )}

        <div className="sheet-list">
          {candidates.map((cand) => (
            <button
              key={cand.key}
              type="button"
              className={[
                'cand-row',
                cand.absent ? 'is-absent' : '',
                cand.today.length > 0 ? 'is-busy' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => pick(cand)}
            >
              <span className="avatar avatar--tint avatar--36">{cand.initials}</span>
              <span>
                <span className="cand-name">{cand.name}</span>
                <span className="cand-sub">{cand.sub}</span>
                {cand.today.length > 0 && (
                  <span className="cand-today">
                    {t.sheetSchonHeute}:{' '}
                    {cand.today.map((a) => (a.lang === 'u' ? tu(a.text) : tp(a.text))).join(', ')}
                  </span>
                )}
              </span>
              {cand.absent ? (
                <span className="cand-chip cand-chip--absent">{t.abwesendChip}</span>
              ) : cand.free ? (
                <span className="cand-chip cand-chip--frei">{t.freiChip}</span>
              ) : null}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
