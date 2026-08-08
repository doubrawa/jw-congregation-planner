import { useEffect, useRef, useState } from 'react'
import { useApp } from '../app/context'
import { useAbwesend } from '../app/useAbwesend'
import { useBackDismiss } from '../components/useBackDismiss'
import { useDialogFocus } from '../components/useDialogFocus'
import { useSwipeDown } from '../components/useSwipeDown'
import { isSong, LOAD_RADIUS, type WeekLoad } from '../data/helpers'
import { fsLeaderValue } from '../data/fs'
import { buildS89ForSlot, ROLE_GUEST_SPEAKER, ROLE_OWN_SPEAKER, slotValue } from '../data/planning'
import type { Dict } from '../i18n/ui'
import { fill, useT } from '../i18n/useT'
import { relativeWeekLabel } from '../i18n/relative-time'
import type { Lang, SlotSelection } from '../data/types'
import { kandidaten, type Candidate } from './kandidaten'
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

  // Redner-Platz des öffentlichen Vortrags. Er kann **zweierlei** sein, und der
  // Planer entscheidet es Woche für Woche (T29):
  //
  //   Freitext eintragen  → auswärtiger Redner („Gastredner · Vers. Nordheim")
  //   Person antippen     → eigener Redner (Rolle „Redner" + pid)
  //
  // Die Wahl **ist** der Schalter — es braucht keinen zusätzlichen Umschalter.
  // Das Sheet zeigt beides untereinander, also führt jeder Weg in den jeweils
  // anderen Zustand zurück.
  const guest = sel.kind === 'part' && Boolean(sel.guest)
  const rolleJetzt = (): string => {
    if (sel.kind !== 'part') return ''
    const item = state.weeks[sel.wi][sel.tab].sections[sel.si]?.items[sel.ii]
    return !item || isSong(item) ? '' : (item.names[sel.ni]?.rolle ?? '')
  }
  const rolleAtoms = rolleJetzt().split(' · ')
  const eigenerRedner = rolleAtoms[0] === ROLE_OWN_SPEAKER
  // Basis-Rolle für den Freitext-Weg. Steht dort gerade ein eigener Redner,
  // führt der Freitext zurück zum Gastredner — „Redner" mit Freitext wäre ein
  // Widerspruch: eine Person der eigenen Versammlung ohne pid.
  const guestBase = !rolleAtoms[0] || eigenerRedner ? ROLE_GUEST_SPEAKER : rolleAtoms[0]
  // Beim eigenen Redner bleiben die Freitext-Felder leer: der Name gehört einer
  // Person, nicht einem Gast. Vorbelegt wäre er ein Angebot, ihn zu verdoppeln.
  const [guestName, setGuestName] = useState(guest && !eigenerRedner ? current : '')
  const [guestCong, setGuestCong] = useState(
    guest && !eigenerRedner ? rolleAtoms.slice(1).join(' · ') : '',
  )

  const applyGuest = () => {
    const name = guestName.trim()
    if (!name) {
      dispatch({ type: 'showToast', text: t.toastNameEingeben })
      return
    }
    const cong = guestCong.trim()
    dispatch({ type: 'assign', name, rolle: cong ? `${guestBase} · ${cong}` : guestBase })
  }

  const candidates = kandidaten(state, sel, abwesend, t, tu)

  const pick = (cand: Candidate) => {
    if (cand.absent) {
      dispatch({ type: 'showToast', text: fill(t.toastAbsentP, { name: cand.name }) })
      return
    }
    // Redner-Platz: eine Person aus dieser Liste ist per Definition eine der
    // eigenen Versammlung — die Zuteilung wird damit zum **eigenen Redner**.
    // Rolle „Redner" und `pid`; die fremde Herkunftsversammlung fällt weg.
    // Alles Weitere folgt daraus von selbst, weil „Redner" nicht in
    // `SKIP_ROLE` steht: Aufgabe, Bestätigung, Erinnerung, Auslastung.
    //
    // pid nur für echte Personen (nicht für die Gruppen-Rotation).
    dispatch(
      guest
        ? { type: 'assign', name: cand.assignName, rolle: ROLE_OWN_SPEAKER, pid: cand.key }
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
              {/* Entfernen setzt den Redner-Platz auf seinen Ausgangszustand
                  zurück (`guestBase` ist beim eigenen Redner „Gastredner").
                  Der leere Platz ist damit wieder auswärtig — so kommt er aus
                  dem Import, und so bleibt er von der Auto-Zuteilung
                  unberührt: den Redner vereinbart man, man verlost ihn nicht. */}
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
          {/*
            Gruppen-Slot ohne angelegte Gruppen: die Liste blieb wortlos leer,
            während die Auto-Zuteilung trotzdem „Gruppe 1…3" einträgt (feste
            Dreizahl in planning.ts). Der Planer sah eine Zuteilung, die er
            nicht ändern konnte, und nirgends einen Grund dafür.

            Der Hinweis kommt ohne neuen Wörterbuch-Schlüssel aus: er benennt
            mit `gruppenCard`, was fehlt, und führt mit `navEinstellungen`
            dorthin, wo es angelegt wird — beide Texte gibt es in allen 34
            Sprachen. Ein eigener Satz hieße 34 Übersetzungen, und eine
            erfundene ist schlimmer als eine zusammengesetzte aus geprüften
            Bausteinen.
          */}
          {sel.groups && candidates.length === 0 && (
            <div className="sheet-empty">
              <div className="sheet-empty-label">{t.gruppenCard}</div>
              <button
                type="button"
                className="sheet-empty-action"
                onClick={() => {
                  close()
                  dispatch({ type: 'navigate', screen: 'einstellungen' })
                }}
              >
                {t.navEinstellungen} ›
              </button>
            </div>
          )}
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
