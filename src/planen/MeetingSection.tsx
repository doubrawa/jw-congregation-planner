import { Fragment, useState } from 'react'
import { useApp } from '../app/context'
import { LABEL_ABSCHLUSS, LABEL_EROEFFNUNG, LABEL_LAC, LABEL_VORTRAG } from '../data/constants'
import { istSchuelerteil } from '../data/aux-class'
import { isSong, splitOpeningSong } from '../data/helpers'
import { closingSongNr, itemMinutes, openingSongNr, TALK_PLACEHOLDER } from '../data/meeting-edit'
import { isSpeakerRole, kennungVon } from '../data/planning'
import { SONG_WORD } from '../i18n/translate-data'
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
  mitAux,
  tpw,
}: {
  si: number
  section: Section
  rawSection: Section
  mitAux: boolean // Zusammenkunft mit Zusätzlicher Klasse
  tpw: (s: string) => string
}) {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const [lacTitle, setLacTitle] = useState('')

  const isLac = rawSection.label === LABEL_LAC
  // Wochenende: Vortragsthema als Freitext, Anfangslied als Nummernfeld
  const isTalk = state.tab === 'we' && rawSection.label === LABEL_VORTRAG
  const isOpening = state.tab === 'we' && rawSection.label === LABEL_EROEFFNUNG
  // …und am Wochenende ebenso das Schlusslied: es steht nicht im Arbeitsheft,
  // sondern kommt aus der Studienausgabe — fehlt sie, muss es nachtragbar sein.
  const isClosing = state.tab === 'we' && rawSection.label === LABEL_ABSCHLUSS
  // „SCHLUSSLIED“ gäbe es nur auf Deutsch — und jede der 33 Sprachen muss jeden
  // UI-Schlüssel selbst übersetzen (ui.test.ts). Das Wort „Lied“ liegt dagegen
  // in allen gemessen vor; im ABSCHLUSS-Block darüber ist es eindeutig genug.
  const schlussliedLbl = (SONG_WORD[state.lang] ?? 'Lied').toUpperCase()
  // Lied aus dem ERÖFFNUNG/ABSCHLUSS-Sammeltitel mittig+kursiv herausziehen —
  // außer dort, wo es als editierbares Nummernfeld bleibt („beim Planen am
  // Sonntag"): Wochenend-Eröffnung und Wochenend-Abschluss.
  const splitSong =
    (rawSection.label === LABEL_EROEFFNUNG && !isOpening) ||
    (rawSection.label === LABEL_ABSCHLUSS && !isClosing)
  const movables = movableIndices(rawSection)

  const isPending = (slot: SlotAssignment | undefined) =>
    state.pendingIds.includes(kennungVon(slot?.name ?? "", slot?.pid))

  /**
   * Die Platzreihen eines Programmpunkts: nur Hauptsaal — oder Hauptsaal und
   * Zusätzliche Klasse, wenn eine eingerichtet ist und der Punkt ein
   * Schülerteil ist (Bibellesung, „Uns im Dienst verbessern").
   */
  const auxRows = (item: PartItem): Array<{ aux: boolean; slots: SlotAssignment[] }> => {
    const rows = [{ aux: false, slots: item.names }]
    if (mitAux && istSchuelerteil(item)) rows.push({ aux: true, slots: item.aux ?? [] })
    return rows
  }

  const partChipText = (slot: SlotAssignment): string => {
    if (!slot.name) return t.zuteilenChip
    return slot.rolle && !slot.rolle.startsWith('mit') ? `${tpw(slot.rolle)}: ${slot.name}` : slot.name
  }

  const openPartSlot = (
    ii: number,
    ni: number,
    item: PartItem,
    slot: SlotAssignment,
    aux = false,
  ) => {
    const suffix = slot.rolle && !slot.rolle.startsWith('mit') ? ` · ${slot.rolle}` : ''
    // Im Sheet-Titel den Raum nennen: sonst sieht man beim Zuteilen nicht,
    // ob man gerade den Hauptsaal oder die Zusätzliche Klasse besetzt.
    const raum = aux ? ` · ${t.auxKlasse}` : ''
    dispatch({
      type: 'openSlot',
      sel: {
        kind: 'part',
        wi: state.week,
        tab: state.tab === 'fs' ? 'mid' : state.tab,
        si,
        ii,
        ni,
        aux: aux || undefined,
        label: item.title + suffix + raum,
        priv: slot.bereichsKey ?? null,
        groups: false,
        // `isSpeakerRole`, nicht `isGuestRole`: das Flag öffnet die
        // Freitext-Felder und muss deshalb auch beim **eigenen** Redner gesetzt
        // sein — sonst gäbe es keinen Weg zurück zum Gastredner (T29).
        guest: isSpeakerRole(slot.rolle),
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
      <h2 className="panel-label">{tpw(section.label)}</h2>
      {section.items.map((item, ii) => {
        if (isSong(item)) {
          return (
            <div key={ii} className="panel-song">
              {tpw(item.song)}
            </div>
          )
        }
        // Die Sprachvariante ist strukturgleich zur kanonischen Woche
        // (`localizedWeek` prüft das); ohne kanonisches Gegenstück bleibt der
        // Punkt lesbar, aber nicht bearbeitbar.
        const rawItem = rawSection.items[ii] ?? item
        const rawTitle = isSong(rawItem) ? '' : rawItem.title
        const rawMins = isSong(rawItem) ? null : itemMinutes(rawItem)
        const editable = isLac && rawMins != null
        const mPos = movables.indexOf(ii)
        // Schülerteil (Gesprächsführer-Slot vorhanden) → Partner an-/abschaltbar.
        // Sprachunabhängig über die Qualifikation erkannt, nicht über den Label-Text.
        const canPartner = !isSong(rawItem) && rawItem.names.some((n) => n.bereichsKey === 'schulung')
        const hasPartner =
          !isSong(rawItem) && rawItem.names.some((n) => n.bereichsKey === 'schulungPartner')
        const { song, rest } = splitSong
          ? splitOpeningSong(tpw(item.title))
          : { song: null, rest: '' }
        return (
          <Fragment key={ii}>
            {song && <div className="panel-song">{song}</div>}
            <div className="plan-item">
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
                <div className="plan-item-title">{song ? rest : tpw(item.title)}</div>
              )}
              {editable && (
                <div className="lac-move">
                  <button
                    type="button"
                    className="lac-move-btn"
                    aria-label={t.a11yMoveUp}
                    disabled={mPos <= 0}
                    onClick={() => dispatch({ type: 'lacMove', si, ii, dir: -1 })}
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    className="lac-move-btn"
                    aria-label={t.a11yMoveDown}
                    disabled={mPos >= movables.length - 1}
                    onClick={() => dispatch({ type: 'lacMove', si, ii, dir: 1 })}
                  >
                    ▼
                  </button>
                </div>
              )}
            </div>
            {item.meta && <div className="plan-item-meta">{tpw(item.meta)}</div>}
            {/*
              Zwei Reihen, sobald eine Zusätzliche Klasse eingerichtet ist:
              derselbe Programmpunkt wird dort parallel durchgeführt. Ohne
              Klasse bleibt es die schlichte, unbeschriftete Reihe von vorher.
            */}
            {auxRows(item).map(({ aux, slots }, _, reihen) => (
              <Fragment key={aux ? 'aux' : 'haupt'}>
                {/* Raum nur benennen, wo es tatsächlich zwei Reihen gibt —
                    sonst stünde „Hauptsaal" auch über Gebet und Vorsitz. */}
                {reihen.length > 1 && (
                  <div className="plan-raum">{aux ? t.auxKlasse : t.auxHauptsaal}</div>
                )}
                <div className="plan-slots">
                  {slots.map((slot, ni) => (
                    <SlotChip
                      key={ni}
                      text={partChipText(slot)}
                      open={!slot.name}
                      showStatus={Boolean(slot.name)}
                      pending={isPending(slot)}
                      onClick={() => openPartSlot(ii, ni, item, slot, aux)}
                    />
                  ))}
                </div>
              </Fragment>
            ))}
            {canPartner && (
              <button
                type="button"
                className="partner-toggle"
                onClick={() => dispatch({ type: 'togglePartner', si, ii })}
              >
                {hasPartner ? t.partnerEntfernen : t.partnerHinzu}
              </button>
            )}
            {editable && (
              <div className="lac-edit">
                <button
                  type="button"
                  className="lac-step-btn"
                  aria-label={t.a11yDecrease}
                  onClick={() => dispatch({ type: 'lacAdjust', si, ii, delta: -5 })}
                >
                  –
                </button>
                <span className="lac-mins">{tpw(`${rawMins} Min.`)}</span>
                <button
                  type="button"
                  className="lac-step-btn"
                  aria-label={t.a11yIncrease}
                  onClick={() => dispatch({ type: 'lacAdjust', si, ii, delta: 5 })}
                >
                  +
                </button>
                <span className="lac-spacer" />
                <button
                  type="button"
                  className="lac-remove"
                  aria-label={t.a11yRemove}
                  onClick={() => dispatch({ type: 'lacRemove', si, ii })}
                >
                  ✕
                </button>
              </div>
            )}
            </div>
          </Fragment>
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
      {(isOpening || isClosing) && (
        <div className="talk-song-row">
          <span className="plan-helper-label">
            {isOpening ? t.anfangsliedLbl : schlussliedLbl}
          </span>
          <input
            key={`song-${isOpening ? 'open' : 'close'}-${state.week}`}
            type="text"
            inputMode="numeric"
            maxLength={4}
            className="lac-add-input talk-song-input"
            placeholder={t.liedNrPh}
            aria-label={isOpening ? t.anfangsliedLbl : schlussliedLbl}
            defaultValue={(() => {
              // Ohne Woche gäbe es diesen Abschnitt nicht; der Index-Zugriff
              // sieht das nicht.
              const we = state.weeks[state.week]?.we
              if (!we) return ''
              return isOpening ? openingSongNr(we) : closingSongNr(we)
            })()}
            onInput={(e) => {
              // Nur Ziffern zulassen (Liederbuch-Nummer)
              const el = e.currentTarget
              const digits = el.value.replace(/\D/g, '')
              if (el.value !== digits) el.value = digits
            }}
            onBlur={(e) =>
              dispatch({ type: isOpening ? 'openingSong' : 'closingSong', song: e.target.value })
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
            }}
          />
        </div>
      )}
    </div>
  )
}
