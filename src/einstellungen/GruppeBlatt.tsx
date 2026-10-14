import { useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { useApp } from '../app/context'
import { BlattFeld } from '../bausteine/BlattFeld'
import { EntfernenKnopf } from '../components/EntfernenKnopf'
import { Sheet } from '../components/Sheet'
import { amtBesetzen, amtKandidaten, type GruppenAmt, personCompare, personLabel } from '../data/helpers'
import type { Group } from '../data/types'
import type { Dict } from '../i18n/ui'
import { fill, useT } from '../i18n/useT'
import { gruppenFolgen, doppelterName, zusammenkunftText, type GruppenFolge } from './einstellungen-anzeige'

/** Der Satz zu jeder Folge des Entfernens. */
const FOLGE_TEXT = {
  mitglieder: 'gruppeDelMitglieder',
  treffpunkte: 'gruppeDelTreffpunkte',
  besuche: 'gruppeDelBesuche',
  plaene: 'gruppeDelPlaene',
} as const satisfies Record<GruppenFolge, keyof Dict>

/**
 * **Eine Predigtdienstgruppe** (T121, Entwurf `GGruppe`): ihr Name — frei,
 * entschieden am 11.10.2026 —, Aufseher und Gehilfe, ihre Treffpunkte und wie
 * viele zu ihr gehören. Darunter steht, was mit ihr verloren ginge, und
 * „Gruppe entfernen" (zwei Tipps, wie jedes Löschen).
 *
 * **Der Name gilt beim Schließen**, wie bei der Person: Ein halb getippter Name
 * stünde sonst schon in den Plänen. Leer oder doppelt bleibt der alte, und ein
 * Hinweis sagt warum — die geplante Reinigung kennt die Gruppe nur beim Namen
 * (`gruppeInWochenUmbenennen`). Im Feld steht der Name, wie man ihn liest
 * (`tu`); wer ihn nicht anfasst, lässt den kanonischen stehen — „Gruppe 1"
 * bleibt übersetzbar.
 *
 * Aufseher nur aus Ältesten und Dienstamtgehilfen, Gehilfe jeder Bruder, der
 * Verkündiger ist — beides aus den Mitgliedern der Gruppe (`amtKandidaten`),
 * keiner beides (`amtBesetzen`), und beides gilt sofort.
 */
export function GruppeBlatt({ gruppe, onClose }: { gruppe: Group; onClose: () => void }) {
  const { state, dispatch } = useApp()
  const { t, tu } = useT()
  const gelesen = tu(gruppe.name)
  const [name, setName] = useState(gelesen)
  const fehlerId = useId()
  const wahlHinweisId = useId()
  const update = (patch: Partial<Pick<Group, 'name' | 'overseerId' | 'assistantId'>>) =>
    dispatch({ type: 'updateGroup', id: gruppe.id, patch })
  const leer = name.trim() === ''
  const dublette = doppelterName(state.groups, gruppe.id, name, tu)
  // Was beim Schließen statt des neuen Namens gilt — und schon am Feld steht.
  const fehler = leer ? t.toastNameLeer : dublette ? fill(t.toastNameNichtGeaendert, { name: tu(dublette.name) }) : null

  const schliessen = () => {
    const neu = name.trim()
    if (neu !== gelesen) {
      if (fehler) dispatch({ type: 'showToast', text: fehler })
      else update({ name: neu })
    }
    onClose()
  }

  // Erst die Kandidaten, dann sortieren: Zur Wahl steht nur die Gruppe, und das
  // Blatt zeichnet bei jedem Tastenanschlag im Namen neu.
  const wahl = (amt: GruppenAmt) => (
    <select
      className="feld-wahl"
      value={gruppe[amt] ?? ''}
      aria-describedby={wahlHinweisId}
      onChange={(e) => update(amtBesetzen(gruppe, amt, e.target.value || null))}
    >
      <option value="">—</option>
      {amtKandidaten(state.persons, gruppe, amt)
        .sort((a, b) => personCompare(a, b, state.lang))
        .map((p) => (
          <option key={p.id} value={p.id}>
            {personLabel(p)}
          </option>
        ))}
    </select>
  )
  const mitglieder = state.persons.filter((p) => p.grp === gruppe.id).length
  const treffpunkte = state.fsRules.filter((r) => r.grp === gruppe.id)
  const folgen = gruppenFolgen(state, gruppe.id)

  return createPortal(
    <Sheet variante="lang" label={t.gruppeLbl} title={t.gruppeLbl} onClose={schliessen}>
      <div className="sheet-inhalt blatt-felder">
        <BlattFeld marke={t.nameLbl}>
          <input
            className="feld"
            type="text"
            dir="auto"
            autoComplete="off"
            value={name}
            aria-invalid={fehler ? true : undefined}
            aria-describedby={fehler ? fehlerId : undefined}
            onChange={(e) => setName(e.target.value)}
          />
        </BlattFeld>
        {fehler && (
          /* `dir="auto"`: Der Hinweis nennt den Namen der anderen Gruppe — frei getippt. */
          <p id={fehlerId} className="feld-fehler" role="alert" dir="auto">
            {fehler}
          </p>
        )}
        <BlattFeld marke={t.aufseherLbl}>{wahl('overseerId')}</BlattFeld>
        <BlattFeld marke={t.gehilfeLbl}>{wahl('assistantId')}</BlattFeld>
        {/* Warum jemand fehlt — und bei einer neuen Gruppe, warum niemand da ist. */}
        <p id={wahlHinweisId} className="klein-text">
          {t.gruppeWahlMitglieder}
        </p>
        {treffpunkte.length > 0 && (
          <div className="blatt-feld">
            <span className="feld-marke">{t.fsShort}</span>
            {treffpunkte.map((regel) => (
              <span key={regel.id}>
                {/* Der Ort gehört der Versammlung, der Tag der Oberfläche. */}
                <bdi>{tu(regel.place)}</bdi>, {zusammenkunftText(regel, state.lang)}
              </span>
            ))}
          </div>
        )}
        <p>{fill(t.mitgliederN, { n: mitglieder })}</p>
        {folgen.length > 0 && (
          <section className="blatt-folgen" aria-label={t.gruppeWennEntfernt}>
            <h3 className="feld-marke">{t.gruppeWennEntfernt}</h3>
            {folgen.map((folge) => (
              <p key={folge}>{t[FOLGE_TEXT[folge]]}</p>
            ))}
          </section>
        )}
      </div>
      <div className="sheet-fuss-ende">
        <EntfernenKnopf
          className="knopf-umriss knopf-entfernen"
          text={t.gruppeEntfernen}
          onEntfernen={() => {
            dispatch({ type: 'removeGroup', id: gruppe.id })
            onClose()
          }}
        />
        <button type="button" className="knopf-haupt" onClick={schliessen}>
          {t.fertig}
        </button>
      </div>
    </Sheet>,
    document.body,
  )
}
