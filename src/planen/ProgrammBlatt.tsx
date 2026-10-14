import { useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { useApp } from '../app/context'
import { GesperrterKnopf } from '../bausteine/GesperrterKnopf'
import { PlusMinus } from '../bausteine/PlusMinus'
import { Zeichen } from '../bausteine/Zeichen'
import { EntfernenKnopf } from '../components/EntfernenKnopf'
import { Sheet } from '../components/Sheet'
import { dauerAbtrennen, istArt, istCoPunkt, isSong } from '../data/helpers'
import { meetingDateText } from '../data/meeting-dates'
import { itemMinutes, LAC_MAX_MINUTEN, LAC_MIN_MINUTEN, movableIndices } from '../data/meeting-edit'
import type { Meeting, PartItem, Section } from '../data/types'
import { fill, useProgWeek, useT } from '../i18n/useT'

/** Welcher Punkt im Blatt darüber offen ist: ein bestehender (seine Kennung) oder ein neuer. */
type Offen = { iid: string } | 'neu' | null

/**
 * **Das Programm bearbeiten** (T121, Entwurf `GProgramm`) — hinter „Woche
 * einrichten", also beim Admin: die Zusammenkunft unter der Woche Abschnitt für
 * Abschnitt. Was aus dem Arbeitsheft kommt, steht nur da; unter „Unser Leben
 * als Christ" öffnet ein Tipp den Punkt (`ProgrammpunktBlatt`), und darunter
 * lässt sich ein eigener einfügen.
 *
 * Bis Phase 5b standen Minuten, Reihenfolge und Löschen mitten im Plan, an
 * jedem Punkt — beim Zuteilen, wo sie nicht gebraucht werden.
 *
 * Beide Blätter hängen per Portal am Dokument: `WochePanel` liegt im
 * Wochenstreifen, und der wird zum Wischen per `transform` verschoben.
 */
export function ProgrammBlatt({ onClose }: { onClose: () => void }) {
  const { state } = useApp()
  const { t } = useT()
  const rawWeek = state.weeks[state.week]
  const { week, tpw } = useProgWeek(rawWeek)
  const [offen, setOffen] = useState<Offen>(null)
  if (!rawWeek || !week) return null

  const meeting = week.mid
  const rawMeeting = rawWeek.mid
  const lacSi = rawMeeting.sections.findIndex((s) => istArt(s, 'lac'))
  const termin = [tpw(meetingDateText(rawWeek, 'mid', state.congregation.times)), tpw(meeting.end)]
    .filter(Boolean)
    .join(' · ')

  return (
    <>
      {createPortal(
        <Sheet variante="lang" label={t.programmTitel} title={t.programmTitel} sub={termin} onClose={onClose}>
          <div className="sheet-inhalt programm">
            {lacSi >= 0 && (
              <p className="klein-text">{fill(t.programmHinweis, { abschnitt: tpw(meeting.sections[lacSi]?.label ?? '') })}</p>
            )}
            {meeting.sections.map((section, si) => {
              const rawSection = rawMeeting.sections[si]
              if (!rawSection) return null
              return (
                <ProgrammAbschnitt
                  key={rawSection.label}
                  section={section}
                  rawSection={rawSection}
                  tpw={tpw}
                  onPunkt={(iid) => setOffen({ iid })}
                  onNeu={() => setOffen('neu')}
                />
              )
            })}
          </div>
        </Sheet>,
        document.body,
      )}
      {offen !== null &&
        lacSi >= 0 &&
        createPortal(
          offen === 'neu' ? (
            <NeuerPunktBlatt si={lacSi} onClose={() => setOffen(null)} />
          ) : (
            <ProgrammpunktBlatt iid={offen.iid} meeting={rawMeeting} anzeige={meeting} tpw={tpw} onClose={() => setOffen(null)} />
          ),
          document.body,
        )}
    </>
  )
}

/**
 * Ein Abschnitt im Programm: der Name, rechts die Lieder oder „aus dem
 * Arbeitsheft", darunter die Punkte mit ihrer Dauer. Bearbeiten lassen sich
 * nur die Punkte von „Unser Leben als Christ", die Minuten tragen — dieselbe
 * Grenze, die vorher die Steuerung im Plan zog.
 */
function ProgrammAbschnitt({
  section,
  rawSection,
  tpw,
  onPunkt,
  onNeu,
}: {
  section: Section
  rawSection: Section
  tpw: (s: string) => string
  onPunkt: (iid: string) => void
  onNeu: () => void
}) {
  const { t } = useT()
  const lac = istArt(rawSection, 'lac')
  const lieder = section.items.flatMap((item) => (isSong(item) ? [tpw(item.song)] : []))
  return (
    <section className="prog-abschnitt" data-farbe={section.farbe}>
      <div className="prog-abschnitt-kopf">
        <h3 className="prog-abschnitt-name">{tpw(section.label)}</h3>
        <span className="prog-lied">{lac ? lieder.join(' · ') : t.ausArbeitsheft}</span>
      </div>
      {section.items.map((item, ii) => {
        const rawItem = rawSection.items[ii]
        if (isSong(item) || !rawItem || isSong(rawItem)) return null
        const { dauer } = dauerAbtrennen(item.meta ?? '', item.mins)
        const inhalt = (
          <>
            <span className="programm-titel">
              {item.num != null && <span className="prog-num">{item.num} </span>}
              {tpw(item.title)}
            </span>
            {dauer && <span className="prog-dauer">{tpw(dauer)}</span>}
          </>
        )
        return lac && itemMinutes(rawItem) != null ? (
          <button key={rawItem.iid} type="button" className="programm-zeile is-bearbeitbar" onClick={() => onPunkt(rawItem.iid)}>
            {inhalt}
            <Zeichen name="weiter" />
          </button>
        ) : (
          <div key={rawItem.iid} className="programm-zeile">
            {inhalt}
          </div>
        )
      })}
      {lac && (
        <button type="button" className="zeile-hinzu" onClick={onNeu}>
          <Zeichen name="plus" />
          {t.programmpunktEinfuegen}
        </button>
      )}
    </section>
  )
}

/** Abschnitt und Stelle eines Punkts — an seiner Kennung gesucht: Verschoben wandert er, die Kennung bleibt. */
function stelleVon(meeting: Meeting, iid: string): { si: number; ii: number; section: Section; item: PartItem } | null {
  for (const [si, section] of meeting.sections.entries()) {
    const ii = section.items.findIndex((item) => !isSong(item) && item.iid === iid)
    const item = section.items[ii]
    if (item && !isSong(item)) return { si, ii, section, item }
  }
  return null
}

/**
 * **Ein Programmpunkt** (T121, Entwurf `GProgrammpunkt`): Titel, Dauer, wo er
 * in der Reihenfolge steht, und Entfernen. Dauer und Reihenfolge gelten mit
 * jedem Tipp, wie vorher im Plan — das Ende der Zusammenkunft darunter zieht
 * mit. Der Titel gilt beim Verlassen des Felds — auch wenn das Blatt
 * geschlossen wird, während getippt wird: Dann verlässt `Sheet` das Feld
 * vorher.
 *
 * Zugeteilt wird hier nicht, nur im Plan (Entscheid vom 13.10.2026).
 */
function ProgrammpunktBlatt({
  iid,
  meeting,
  anzeige,
  tpw,
  onClose,
}: {
  iid: string
  /** Die kanonische Zusammenkunft — an ihr wird gesucht und gerechnet. */
  meeting: Meeting
  /** Dieselbe in der Programmsprache — für Titel und Ende. */
  anzeige: Meeting
  tpw: (s: string) => string
  onClose: () => void
}) {
  const { dispatch } = useApp()
  const { t } = useT()
  const titelId = useId()
  /** Der getippte Titel — `null`, solange niemand tippt; dann steht der gespeicherte da. */
  const [entwurf, setEntwurf] = useState<string | null>(null)
  const stelle = stelleVon(meeting, iid)
  const mins = stelle ? itemMinutes(stelle.item) : null
  if (!stelle || mins === null) return null
  const { si, ii } = stelle
  const movables = movableIndices(stelle.section.items)
  const position = movables.indexOf(ii)
  const titel = anzeige.sections[si]?.items[ii]
  const titelText = titel && !isSong(titel) ? tpw(titel.title) : stelle.item.title

  /**
   * Übernommen wird nur, was sich gegenüber der Anzeige geändert hat: Wer das
   * Feld einer englischen Versammlung nur betritt und verlässt, schriebe sonst
   * „Local Needs" über alle Sprachen.
   */
  const titelUebernehmen = () => {
    if (entwurf === null) return
    setEntwurf(null)
    const neu = entwurf.trim()
    if (neu && neu !== titelText) dispatch({ type: 'lacTitel', si, ii, title: neu })
  }

  return (
    <Sheet
      variante="oben"
      label={titelText}
      eyebrow={<div className="sheet-marke">{tpw(anzeige.sections[si]?.label ?? '')}</div>}
      title={titelText}
      onClose={onClose}
    >
      <div className="sheet-inhalt programmpunkt">
        {/* Die Punkte des Kreisaufsehers tragen ihr Thema im Plan (`setPartThema`). */}
        {!istCoPunkt(stelle.item) && (
          <div className="programmpunkt-feld">
            <label className="feld-marke" htmlFor={titelId}>
              {t.programmpunktTitel}
            </label>
            <input
              id={titelId}
              className="feld"
              type="text"
              dir="auto"
              value={entwurf ?? titelText}
              onChange={(e) => setEntwurf(e.target.value)}
              onBlur={titelUebernehmen}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
                // Escape nimmt die Eingabe zurück und bleibt beim Feld; erst
                // ein zweites schließt das Blatt.
                if (e.key === 'Escape' && entwurf !== null) {
                  e.preventDefault()
                  e.stopPropagation()
                  setEntwurf(null)
                }
              }}
            />
          </div>
        )}
        <div className="programmpunkt-zeile">
          <span>{t.a11yMinuten}</span>
          {/*
            „N Min." kommt aus dem Programm-Übersetzer, nicht aus der
            Oberfläche: Die Angabe steht im Programm und folgt deshalb der
            Versammlungssprache („10 min.", „١٠ دقيقة", „10分").
          */}
          <PlusMinus
            wert={mins}
            min={LAC_MIN_MINUTEN}
            max={LAC_MAX_MINUTEN}
            label={t.a11yMinuten}
            anzeige={tpw(`${mins} Min.`)}
            onWert={(wert) => dispatch({ type: 'lacMinuten', si, ii, mins: wert })}
          />
        </div>
        <p className="klein-text programmpunkt-ende">{tpw(anzeige.end)}</p>
        <div className="programmpunkt-zeile programmpunkt-reihenfolge">
          <GesperrterKnopf
            className="knopf-umriss lac-move-btn"
            gesperrt={position <= 0}
            onTipp={() => dispatch({ type: 'lacMove', si, ii, dir: -1 })}
          >
            {t.a11yMoveUp}
          </GesperrterKnopf>
          <GesperrterKnopf
            className="knopf-umriss lac-move-btn"
            gesperrt={position < 0 || position >= movables.length - 1}
            onTipp={() => dispatch({ type: 'lacMove', si, ii, dir: 1 })}
          >
            {t.a11yMoveDown}
          </GesperrterKnopf>
        </div>
      </div>
      <div className="sheet-fuss-ende">
        {/* Zwei Tipps, wie jedes Löschen (4.10.2026): Mit dem Punkt gehen seine
            Zuteilungen und deren Zusagen. */}
        <EntfernenKnopf
          className="knopf-umriss knopf-entfernen"
          text={t.a11yRemove}
          frage={t.entfernenSicher}
          onEntfernen={() => {
            dispatch({ type: 'lacRemove', si, ii })
            onClose()
          }}
        />
      </div>
    </Sheet>
  )
}

/**
 * **Einen eigenen Punkt einfügen** — er kommt vor das Versammlungsbibelstudium
 * (`lacAddIndex`) und beginnt mit zehn Minuten; die Dauer ändert danach sein
 * eigenes Blatt.
 */
function NeuerPunktBlatt({ si, onClose }: { si: number; onClose: () => void }) {
  const { dispatch } = useApp()
  const { t } = useT()
  const [titel, setTitel] = useState('')
  const einfuegen = () => {
    if (!titel.trim()) {
      dispatch({ type: 'showToast', text: t.toastNameEingeben })
      return
    }
    dispatch({ type: 'lacAdd', si, title: titel })
    onClose()
  }
  return (
    <Sheet variante="oben" label={t.programmpunktEinfuegen} title={t.programmpunktEinfuegen} onClose={onClose}>
      <div className="sheet-inhalt programmpunkt">
        <input
          type="text"
          dir="auto"
          className="feld"
          placeholder={t.lacPh}
          aria-label={t.lacPh}
          value={titel}
          onChange={(e) => setTitel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') einfuegen()
          }}
        />
      </div>
      <div className="sheet-fuss-ende">
        {/* Nicht `uebernehmen`: Das heißt „eine Aufgabe übernehmen" — englisch
            „Take over", französisch „Je m’en charge". */}
        <button type="button" className="knopf-haupt" onClick={einfuegen}>
          {t.hinzufuegenKnopf}
        </button>
      </div>
    </Sheet>
  )
}
