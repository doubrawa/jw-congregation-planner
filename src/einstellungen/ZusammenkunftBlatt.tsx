import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useApp } from '../app/context'
import { BlattFeld } from '../bausteine/BlattFeld'
import { EntfernenKnopf } from '../components/EntfernenKnopf'
import { Sheet } from '../components/Sheet'
import { wochenSpanne } from '../components/datum-anzeige'
import { montagNach, regelzeit, wirktAb } from '../data/meeting-dates'
import type { MeetingKey, MeetingTime } from '../data/types'
import { kommendeWechsel, ohneWechsel, zeitAb, type Regelzeit } from '../data/zeit-wechsel'
import { useT } from '../i18n/useT'
import { WochentagFeld } from '../planen/TreffpunktFelder'
import { wechselText } from './einstellungen-anzeige'
import { timeOptions } from './meeting-times'

/**
 * Wie viele Wochen zur Wahl stehen: die laufende und die 51 danach. Ein Jahr
 * reicht für den Wechsel zum Jahresanfang, und keine Spanne steht zweimal da —
 * „9.–15. November" hieße nach 52 Wochen fast genauso.
 */
const WOCHEN_ZUR_WAHL = 52

/**
 * **Wann eine Zusammenkunft ist** (T121, Zeilen „Unter der Woche" und „Am
 * Wochenende" in `GEinstellungen`): Wochentag, Uhrzeit — und **ab welcher
 * Woche** das gilt.
 *
 * Bis zum 13.11.2026 galt jede Änderung sofort und für jede Woche zugleich:
 * Die vergangenen Wochen bekamen den neuen Tag mit, und ein Wechsel zum
 * Jahresanfang ließ sich nicht vorbereiten. Jetzt bleibt, was vor der
 * gewählten Woche liegt, wie es ist (`zeitAb`).
 *
 * Darum gilt hier nichts beim Tippen: Tag, Uhrzeit und Woche gehören zusammen,
 * und erst „Übernehmen" trägt sie ein — mit dem ersten Tipp auf den Wochentag
 * stünde er sonst schon für die laufende Woche da, bevor die Woche gewählt
 * ist. Die Endzeiten der betroffenen Wochen wandern mit (`updateCongregation`).
 *
 * Darunter stehen die Wechsel, die noch bevorstehen; jeder lässt sich
 * streichen, das gilt gleich (mit Rückfrage, wie jedes Entfernen).
 */
export function ZusammenkunftBlatt({ welche, titel, onClose }: { welche: MeetingKey; titel: string; onClose: () => void }) {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const zeiten = state.congregation.times
  // Einmal je Blatt: Springt die Woche um, während es offen ist, bleibt die Wahl stehen.
  const [laufend] = useState(() => wirktAb())
  const [ab, setAb] = useState(laufend)
  // Unberührt zeigen die Felder, was in der gewählten Woche gilt — auch einen
  // dort schon geplanten Wechsel, der sich so ändern lässt. Einmal gewählt,
  // bleibt die Wahl stehen, wenn danach die Woche wechselt.
  const [wahl, setWahl] = useState<Regelzeit | null>(null)
  const wert = wahl ?? regelzeit(zeiten, welche, ab)
  const waehle = (patch: Partial<Regelzeit>) => setWahl({ ...wert, ...patch })
  const schreibe = (neu: MeetingTime) => dispatch({ type: 'updateCongregation', patch: { times: { ...zeiten, [welche]: neu } } })
  // Die Zeit der Zusammenkunft geht nur als Ganzes an die Funktionen, die ihre
  // Wechsel kennen — nie über ihre Grundzeit gelesen (`tests/zeit-je-woche.test.ts`).
  const geplant = kommendeWechsel(zeiten[welche], laufend)

  return createPortal(
    <Sheet label={titel} title={titel} onClose={onClose}>
      <div className="sheet-inhalt blatt-felder">
        <WochentagFeld value={wert.wd} onChange={(wd) => waehle({ wd })} />
        <BlattFeld marke={t.a11yTime}>
          <select className="feld-wahl" value={wert.time} onChange={(e) => waehle({ time: e.target.value })}>
            {timeOptions(wert.time).map((uhrzeit) => (
              <option key={uhrzeit} value={uhrzeit}>
                {uhrzeit}
              </option>
            ))}
          </select>
        </BlattFeld>
        <BlattFeld marke={t.zeitGiltAbWoche}>
          <select className="feld-wahl" value={ab} onChange={(e) => setAb(e.target.value)}>
            {Array.from({ length: WOCHEN_ZUR_WAHL }, (_, i) => montagNach(laufend, i)).map((montag) => (
              <option key={montag} value={montag}>
                {montag === laufend ? `${wochenSpanne(montag, state.lang)} · ${t.aktuelleWoche}` : wochenSpanne(montag, state.lang)}
              </option>
            ))}
          </select>
        </BlattFeld>
        <p className="klein-text">{t.zeitGiltAbHinweis}</p>
        {geplant.length > 0 && (
          <section className="zeit-geplant" aria-label={t.zeitGeplanteWechsel}>
            <h3 className="feld-marke">{t.zeitGeplanteWechsel}</h3>
            {geplant.map((wechsel) => {
              const text = wechselText(wechsel, t, state.lang)
              return (
                <div key={wechsel.ab} className="einst-zeile einst-zeile--entfernbar">
                  <span>{text}</span>
                  <EntfernenKnopf
                    className="rund-knopf rund-knopf--feld"
                    frage={t.entfernenSicher}
                    label={`${text}: ${t.a11yRemove}`}
                    onEntfernen={() => schreibe(ohneWechsel(zeiten[welche], wechsel.ab))}
                  />
                </div>
              )
            })}
          </section>
        )}
      </div>
      <div className="sheet-fuss">
        <button
          type="button"
          className="knopf-haupt"
          onClick={() => {
            schreibe(zeitAb(zeiten[welche], ab, wert))
            onClose()
          }}
        >
          {t.uebernehmenBtn}
        </button>
        <button type="button" className="knopf-leise" onClick={onClose}>
          {t.abbrechen}
        </button>
      </div>
    </Sheet>,
    document.body,
  )
}
