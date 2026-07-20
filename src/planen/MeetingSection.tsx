import { useState } from 'react'
import { useApp } from '../app/context'
import { LABEL_EROEFFNUNG, LABEL_LAC, LABEL_VORTRAG } from '../data/constants'
import { isSong } from '../data/helpers'
import { itemMinutes, openingSongNr, TALK_PLACEHOLDER } from '../data/meeting-edit'
import { isGuestRole } from '../data/planning'
import { useT } from '../i18n/useT'
import type { PartItem, Section, SlotAssignment } from '../data/types'
import { SlotChip } from './SlotChip'

/** Indizes der verschiebbaren (Nicht-Lied-)Items einer Sektion. */
function movableIndices(section: Section): number[] {
  return section.items.map((x, i) => (isSong(x) ? -1 : i)).filter((i) => i >= 0)
}

/**
 * Ein Programm-Abschnitt (Panel) beim Planen: Programmpunkte als Slot-Chips,
 * bei „Unser Leben als Christ" mit Minuten-/Verschieben-/Löschen-Steuerung und
 * Punkt-hinzufügen, am Wochenende Vortragsthema (Freitext) und Anfangslied.
 *
 * `section` ist die Anzeige-Fassung (Programmsprache), `rawSection` die
 * kanonische (deutsche Labels/Minuten) — die Logik läuft immer auf `rawSection`.
 */
export function MeetingSection({
  si,
  section,
  rawSection,
  tpw,
}: {
  si: number
  section: Section
  rawSection: Section
  tpw: (s: string) => string
}) {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const [lacTitle, setLacTitle] = useState('')

  const isLac = rawSection.label === LABEL_LAC
  // Wochenende: Vortragsthema als Freitext, Anfangslied als Nummernfeld
  const isTalk = state.tab === 'we' && rawSection.label === LABEL_VORTRAG
  const isOpening = state.tab === 'we' && rawSection.label === LABEL_EROEFFNUNG
  const movables = movableIndices(rawSection)

  const isPending = (name: string) => state.pendingNames.includes(name)

  const partChipText = (slot: SlotAssignment): string => {
    if (!slot.name) return t.zuteilenChip
    return slot.rolle && !slot.rolle.startsWith('mit') ? `${tpw(slot.rolle)}: ${slot.name}` : slot.name
  }

  const openPartSlot = (ii: number, ni: number, item: PartItem, slot: SlotAssignment) => {
    const suffix = slot.rolle && !slot.rolle.startsWith('mit') ? ` · ${slot.rolle}` : ''
    dispatch({
      type: 'openSlot',
      sel: {
        kind: 'part',
        wi: state.week,
        tab: state.tab,
        si,
        ii,
        ni,
        label: item.title + suffix,
        priv: slot.bereichsKey ?? null,
        groups: false,
        guest: isGuestRole(slot.rolle),
      },
    })
  }

  const addLac = () => {
    if (!lacTitle.trim()) {
      dispatch({ type: 'showToast', text: t.toastNameEingeben })
      return
    }
    dispatch({ type: 'lacAdd', si, title: lacTitle })
    setLacTitle('')
  }

  return (
    <div className="panel" data-farbe={section.farbe}>
      <div className="panel-label">{tpw(section.label)}</div>
      {section.items.map((item, ii) => {
        if (isSong(item)) {
          return (
            <div key={ii} className="panel-song">
              {tpw(item.song)}
            </div>
          )
        }
        const rawItem = rawSection.items[ii]
        const rawTitle = isSong(rawItem) ? '' : rawItem.title
        const rawMins = isSong(rawItem) ? null : itemMinutes(rawItem)
        const editable = isLac && rawMins != null
        const mPos = movables.indexOf(ii)
        return (
          <div key={ii} className="plan-item">
            <div className="plan-item-head">
              {isTalk ? (
                <input
                  key={`talk-${state.week}-${ii}`}
                  type="text"
                  className="talk-title-input"
                  placeholder={t.vortragThemaPh}
                  aria-label={t.vortragThemaPh}
                  defaultValue={rawTitle === TALK_PLACEHOLDER ? '' : rawTitle}
                  onBlur={(e) => dispatch({ type: 'talkEdit', si, ii, title: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur()
                  }}
                />
              ) : (
                <div className="plan-item-title">{tpw(item.title)}</div>
              )}
              {editable && (
                <div className="lac-move">
                  <button
                    type="button"
                    className="lac-move-btn"
                    aria-label="▲"
                    disabled={mPos <= 0}
                    onClick={() => dispatch({ type: 'lacMove', si, ii, dir: -1 })}
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    className="lac-move-btn"
                    aria-label="▼"
                    disabled={mPos >= movables.length - 1}
                    onClick={() => dispatch({ type: 'lacMove', si, ii, dir: 1 })}
                  >
                    ▼
                  </button>
                </div>
              )}
            </div>
            {item.meta && <div className="plan-item-meta">{tpw(item.meta)}</div>}
            <div className="plan-slots">
              {item.names.map((slot, ni) => (
                <SlotChip
                  key={ni}
                  text={partChipText(slot)}
                  open={!slot.name}
                  showStatus={Boolean(slot.name)}
                  pending={isPending(slot.name)}
                  onClick={() => openPartSlot(ii, ni, item, slot)}
                />
              ))}
            </div>
            {editable && (
              <div className="lac-edit">
                <button
                  type="button"
                  className="lac-step-btn"
                  aria-label="–"
                  onClick={() => dispatch({ type: 'lacAdjust', si, ii, delta: -5 })}
                >
                  –
                </button>
                <span className="lac-mins">{tpw(`${rawMins} Min.`)}</span>
                <button
                  type="button"
                  className="lac-step-btn"
                  aria-label="+"
                  onClick={() => dispatch({ type: 'lacAdjust', si, ii, delta: 5 })}
                >
                  +
                </button>
                <span className="lac-spacer" />
                <button
                  type="button"
                  className="lac-remove"
                  aria-label="✕"
                  onClick={() => dispatch({ type: 'lacRemove', si, ii })}
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        )
      })}
      {isLac && (
        <div className="lac-add-row">
          <input
            type="text"
            className="lac-add-input"
            placeholder={t.lacPh}
            aria-label={t.lacPh}
            value={lacTitle}
            onChange={(e) => setLacTitle(e.target.value)}
          />
          <button type="button" className="lac-add-btn" onClick={addLac}>
            {t.lacAdd}
          </button>
        </div>
      )}
      {isOpening && (
        <div className="talk-song-row">
          <span className="plan-helper-label">{t.anfangsliedLbl}</span>
          <input
            key={`song-${state.week}`}
            type="text"
            inputMode="numeric"
            maxLength={4}
            className="lac-add-input talk-song-input"
            placeholder={t.liedNrPh}
            aria-label={t.anfangsliedLbl}
            defaultValue={openingSongNr(state.weeks[state.week].we)}
            onInput={(e) => {
              // Nur Ziffern zulassen (Liederbuch-Nummer)
              const el = e.currentTarget
              const digits = el.value.replace(/\D/g, '')
              if (el.value !== digits) el.value = digits
            }}
            onBlur={(e) => dispatch({ type: 'openingSong', song: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
            }}
          />
        </div>
      )}
    </div>
  )
}
