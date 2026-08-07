import { useEffect, useRef, useState } from 'react'
import { useApp } from '../app/context'
import { useAbwesend } from '../app/useAbwesend'
import { istAbwesend, istAbwesendAm } from '../data/absence'
import { useBackDismiss } from '../components/useBackDismiss'
import { useDialogFocus } from '../components/useDialogFocus'
import { useSwipeDown } from '../components/useSwipeDown'
import { displayName, initials, isQualified, isSong, LOAD_RADIUS, LOAD_WEEKS, loadWindow, partnerGenderOk, personCompare, roleLabel, workloadOf, type WeekLoad } from '../data/helpers'
import { fsDate, fsLeaderValue } from '../data/fs'
import { assignmentsInMeeting, buildS89ForSlot, slotValue } from '../data/planning'
import type { Dict } from '../i18n/ui'
import { fill, useT } from '../i18n/useT'
import { relativeWeekLabel } from '../i18n/relative-time'
import type { MeetingAssignment } from '../data/planning'
import type { Lang, SlotSelection } from '../data/types'
import '../components/overlays.css'
import './planen.css'

/**
 * Tooltip der Mini-Quadrate: Farbe (frei / Aufgabe / Hilfsdienst) plus die Woche
 * relativ zur geplanten — z. B. „Aufgabe nächste Woche", „Hilfsdienst vor 2
 * Wochen", „frei diese Woche". `offset` ist der Wochenversatz (−2 … +2).
 */
function loadTitle(t: Dict, l: WeekLoad, offset: number, lang: Lang): string {
  const kind = l === 'task' ? t.loadAufgabe : l === 'helper' ? t.loadHilfsdienst : l === 'none' ? t.loadFrei : ''
  if (!kind) return ''
  const when = relativeWeekLabel(offset, lang)
  return when ? `${kind} ${when}` : kind
}

interface Candidate {
  key: string
  initials: string
  name: string // Anzeigename (Gruppen: übersetzt)
  assignName: string // in die Woche geschriebener kanonischer Name (Gruppen: "Gruppe N")
  sub: string
  today: MeetingAssignment[] // schon an diesem Tag zugeteilt (Doppelbelegungs-Hinweis)
  absent: boolean
  free: boolean
  load?: WeekLoad[] // Belegung der 5 Wochen (aktuelle ±2) für die Mini-Quadrate
}

/**
 * Zuteilungs-Sheet: mobil Bottom-Sheet, Desktop zentriertes Modal.
 * Kandidaten = qualifizierte Personen (Abwesende ausgegraut ans Listenende,
 * Auswahl blockiert mit Toast); Reinigungs-Slots: Gruppe 1–3.
 */
export function AssignSheet({ sel }: { sel: SlotSelection }) {
  const { state, dispatch } = useApp()
  const abwesend = useAbwesend()
  const { t, tu, tp } = useT()
  const close = () => dispatch({ type: 'closeSlot' })
  const dlg = useRef<HTMLDivElement>(null)
  useDialogFocus(dlg)
  useBackDismiss(true, close)
  useSwipeDown(dlg, close)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dispatch({ type: 'closeSlot' })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dispatch])

  // Treffpunkt-Leiter (fs) hat eine eigene Datenquelle und keine Meeting-Slots.
  const fsInst = sel.kind === 'fs' ? state.fsWeeks[sel.wi]?.find((i) => i.id === sel.instId) : undefined
  const current = sel.kind === 'fs' ? fsLeaderValue(state.fsWeeks, sel.wi, sel.instId) : slotValue(state.weeks, sel)
  const s89 = sel.kind === 'fs' ? null : buildS89ForSlot(state.weeks, sel, state.congregation.meetings)
  const title = sel.kind === 'part' ? tp(sel.label) : tu(sel.label)
  const sub =
    sel.kind === 'fs'
      ? fsInst
        ? `${fsInst.time} · ${tu(fsInst.place)}`
        : ''
      : `${tp(state.weeks[sel.wi].range)} · ${sel.tab === 'mid' ? t.tabMid : t.tabWe}`

  // Externer Redner (Gastredner/Kreisaufseher): Freitext für Name +
  // Herkunfts-Versammlung; die Versammlung steckt in der Rolle
  // ("Gastredner · Vers. Nordheim"), erstes Atom = Basis-Rolle.
  const guest = sel.kind === 'part' && Boolean(sel.guest)
  const slotRolle = (): string => {
    if (sel.kind !== 'part') return ''
    const item = state.weeks[sel.wi][sel.tab].sections[sel.si]?.items[sel.ii]
    return !item || isSong(item) ? '' : (item.names[sel.ni]?.rolle ?? '')
  }
  const rolleAtoms = slotRolle().split(' · ')
  const guestBase = rolleAtoms[0] || 'Gastredner'
  const [guestName, setGuestName] = useState(guest ? current : '')
  const [guestCong, setGuestCong] = useState(guest ? rolleAtoms.slice(1).join(' · ') : '')

  const applyGuest = () => {
    const name = guestName.trim()
    if (!name) {
      dispatch({ type: 'showToast', text: t.toastNameEingeben })
      return
    }
    const cong = guestCong.trim()
    dispatch({ type: 'assign', name, rolle: cong ? `${guestBase} · ${cong}` : guestBase })
  }

  const groupSub = (id: string, ov: string | null): string => {
    const overseer = state.persons.find((p) => p.id === ov)
    const n = state.persons.filter((p) => p.grp === id).length
    const memberLabel = n === 1 ? t.mitglied1 : fill(t.mitgliederN, { n })
    return overseer ? `${displayName(overseer)} · ${memberLabel}` : memberLabel
  }

  // Treffpunkt-Leiter: Kandidaten sind treffpunkt-qualifiziert; „schon heute" =
  // ein anderer Treffpunkt am selben Wochentag, den die Person schon leitet.
  const fsTodayFor = (name: string): MeetingAssignment[] => {
    if (sel.kind !== 'fs' || !fsInst) return []
    const out: MeetingAssignment[] = []
    for (const o of state.fsWeeks[sel.wi] ?? []) {
      if (o.id === sel.instId || o.wd !== fsInst.wd || o.leader !== name) continue
      const ttl = o.grp === '' ? t.fsVers : (state.groups.find((g) => g.id === o.grp)?.name ?? o.grp)
      out.push({ text: `${o.time} · ${tu(ttl)}`, lang: 'u' })
    }
    return out
  }

  // Geschlechtsregeln der Schülerteile: der aktuelle Slot kann männlich-only
  // sein (Vortrag), und ein Gesprächspartner muss zum Führer passen (vorerst
  // gleiches Geschlecht — Familien-Ausnahme später, gekapselt in partnerGenderOk).
  const partSel = sel.kind === 'part' ? sel : null
  const partItem = partSel
    ? state.weeks[partSel.wi][partSel.tab].sections[partSel.si].items[partSel.ii]
    : null
  const curSlot = partItem && partSel && !isSong(partItem) ? partItem.names[partSel.ni] : undefined
  const leadName =
    partItem && partSel && !isSong(partItem) && partSel.priv === 'schulungPartner'
      ? (partItem.names.find((n, i) => i !== partSel.ni && n.bereichsKey === 'schulung')?.name ?? '')
      : ''
  const lead = leadName ? state.persons.find((p) => displayName(p) === leadName) : undefined
  const genderOk = (p: (typeof state.persons)[number]): boolean => {
    if (curSlot?.male && p.female) return false
    if (partSel?.priv === 'schulungPartner' && !partnerGenderOk(lead, p)) return false
    return true
  }

  const candidates: Candidate[] =
    sel.kind === 'fs'
      ? [...state.persons]
          .sort(personCompare)
          .filter((p) => isQualified(p, 'treffpunkt'))
          .map((p) => {
            const name = displayName(p)
            return {
              key: p.id,
              initials: initials(p),
              name,
              assignName: name,
              sub: tu(roleLabel(p)),
              today: fsTodayFor(name),
              // Am Tag DIESES Treffpunkts, nicht in der ganzen Woche.
              absent: fsInst
                ? istAbwesendAm(state.absences, p.id, fsDate(state.fsBase, sel.wi, fsInst.wd))
                : false,
              free: workloadOf(state.weeks, name) === 0,
            }
          })
          .sort((a, b) => Number(a.absent) - Number(b.absent))
      : sel.groups
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
        .filter((p) => (!sel.priv || isQualified(p, sel.priv)) && genderOk(p))
        .map((p) => {
          const name = displayName(p)
          // Auslastung über dasselbe Fenster wie die Mini-Quadrate daneben.
          const winWeeks = state.weeks.slice(Math.max(0, sel.wi - LOAD_RADIUS), sel.wi + LOAD_RADIUS + 1)
          const workload = workloadOf(winWeeks, name)
          const workloadLabel =
            workload === 1
              ? fill(t.aufgabeInW, { w: LOAD_WEEKS })
              : fill(t.aufgabenInW, { n: workload, w: LOAD_WEEKS })
          return {
            key: p.id,
            initials: initials(p),
            name,
            assignName: name,
            sub: `${tu(roleLabel(p))} · ${workloadLabel}`,
            today: assignmentsInMeeting(state.weeks[sel.wi][sel.tab], name, state.services, sel),
            absent: istAbwesend(abwesend, p.id, sel.wi, sel.tab),
            free: workload === 0,
            load: loadWindow(state.weeks, name, sel.wi),
          }
        })
        .sort((a, b) => Number(a.absent) - Number(b.absent))

  const pick = (cand: Candidate) => {
    if (cand.absent) {
      dispatch({ type: 'showToast', text: fill(t.toastAbsentP, { name: cand.name }) })
      return
    }
    // Gastredner-Slot: Wahl aus der eigenen Versammlung räumt die fremde
    // Herkunfts-Versammlung aus der Rolle
    // pid nur für echte Personen (nicht Gastredner/Gruppen) — stabile Identität.
    dispatch(
      guest
        ? { type: 'assign', name: cand.assignName, rolle: guestBase }
        : { type: 'assign', name: cand.assignName, pid: sel.groups ? undefined : cand.key },
    )
  }

  return (
    <>
      <div className="sheet-backdrop" onClick={close} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} ref={dlg}>
        <span className="sheet-grip" aria-hidden="true" />
        <div className="sheet-head">
          <div>
            <div className="sheet-title">{title}</div>
            <div className="sheet-sub">{sub}</div>
          </div>
          <button type="button" className="sheet-close" aria-label={t.a11yClose} onClick={close}>
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
                onClick={() =>
                  dispatch(guest ? { type: 'assign', name: '', rolle: guestBase } : { type: 'assign', name: '' })
                }
              >
                {t.entfernen}
              </button>
            </div>
          </div>
        )}

        {guest && (
          <div className="sheet-guest">
            <input
              type="text"
              className="lac-add-input"
              placeholder={t.rednerNamePh}
              aria-label={t.rednerNamePh}
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
            />
            <input
              type="text"
              className="lac-add-input"
              placeholder={t.rednerVersPh}
              aria-label={t.rednerVersPh}
              value={guestCong}
              onChange={(e) => setGuestCong(e.target.value)}
            />
            <button type="button" className="lac-add-btn" onClick={applyGuest}>
              {t.uebernehmenBtn}
            </button>
            <div className="sheet-guest-hint">{t.oderPersonWaehlen}</div>
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
              {/* Status-Chip und Quadrate in einer Zelle: die Quadrate stehen
                  darin ganz rechts und fluchten so über alle Zeilen — egal ob
                  ein Chip davor steht und wie breit er ist. */}
              <span className="cand-meta">
                {cand.absent ? (
                  <span className="cand-chip cand-chip--absent">{t.abwesendChip}</span>
                ) : cand.free ? (
                  <span className="cand-chip cand-chip--frei">{t.freiChip}</span>
                ) : null}
                <span className="cand-load">
                  {(cand.load ?? []).map((l, i) => (
                    <span
                      key={i}
                      className="cand-load-cell"
                      data-load={l}
                      // Die geplante Woche selbst wird umrandet. Als Attribut,
                      // nicht per :nth-child — sonst zeigt die Umrandung auf das
                      // falsche Quadrat, sobald sich LOAD_RADIUS ändert.
                      data-jetzt={i === LOAD_RADIUS ? '' : undefined}
                      title={loadTitle(t, l, i - LOAD_RADIUS, state.lang)}
                    />
                  ))}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
