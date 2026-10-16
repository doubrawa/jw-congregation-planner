import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useApp, type AppAction } from '../app/context'
import { Zeichen } from '../bausteine/Zeichen'
import { EntfernenKnopf } from '../components/EntfernenKnopf'
import { Sheet } from '../components/Sheet'
import { treffpunktHaeufigkeit, treffpunktTitel } from '../components/treffpunkt-beschriftung'
import { fsSort, nachWochentag, neueRegel } from '../data/fs'
import type { FsRule } from '../data/types'
import { useT } from '../i18n/useT'
import {
  AusserVersammlungFeld,
  GruppeFeld,
  HaeufigkeitFeld,
  OrtFeld,
  UhrzeitFeld,
  WochentagFeld,
} from './TreffpunktFelder'
import { wochentagNameAusWd } from './wochentage'
import './planen.css'

/** Welches Blatt offen ist: eine neue Regel oder die mit dieser Id. */
type Offen = 'neu' | { id: string } | null

/** Was an einer Regel geändert werden kann — die Gruppe nur, solange sie neu ist. */
type RegelAenderung = Extract<AppAction, { type: 'fsRuleUpdate' }>['patch']

/**
 * **Der Grundplan der Treffpunkte** (T121, Entwurf `GGrundplan`): was jede
 * Woche gilt — je Wochentag eine Karte, darin jeder Treffpunkt mit Zeit, Titel
 * und Ort; ein Tipp öffnet ihn zum Ändern. Darunter „Treffpunkt für jede
 * Woche". Jede Änderung setzt die Wochenpläne neu auf; was in einer Woche
 * anders ist, gehört unter „Treffpunkte".
 *
 * Ohne festen Leiter (13.10.2026: „Nein, wie heute") — den teilt die Woche
 * zu. Der Gruppenaufseher sieht und ändert nur die Regeln seiner Gruppe
 * (`onlyGroup`) und legt in ihr an, ohne Wahl.
 *
 * Bis T121 stand je Gruppe eine Karte mit eigenem „+"-Knopf (T108: man tippte
 * leicht in die falsche Gruppe). Jetzt fragt das Blatt die Gruppe
 * ausdrücklich, und jede Zeile trägt sie im Titel.
 */
export function FsRulesPanel({ onlyGroup = null }: { onlyGroup?: string | null }) {
  const { state } = useApp()
  const i18n = useT()
  const { t, tu } = i18n
  const [offen, setOffen] = useState<Offen>(null)
  const schliessen = (): void => setOffen(null)

  const regeln = state.fsRules.filter((r) => onlyGroup === null || r.grp === onlyGroup).sort(fsSort)

  return (
    <>
      <p className="klein-text">{t.fsGrundDesc}</p>

      {nachWochentag(regeln).map((tag) => (
        <section key={tag.wd} className="prog-abschnitt treff-tag">
          <div className="prog-abschnitt-kopf">
            <h2 className="treff-tag-name">{wochentagNameAusWd(tag.wd, state.lang)}</h2>
          </div>
          {tag.items.map((regel) => (
            <button key={regel.id} type="button" className="regel-zeile" onClick={() => setOffen({ id: regel.id })}>
              <span className="treff-zeit-pille">{regel.time}</span>
              <span className="treff-text">
                <span className="treff-titel">{treffpunktTitel(regel, state.groups, i18n)}</span>
                {regel.place && (
                  <span className="treff-ort" dir="auto">
                    {tu(regel.place)}
                  </span>
                )}
                {/* Die Karte nennt den Wochentag; wie oft, steht nur da, wo es
                    nicht jede Woche ist. */}
                {regel.monthly > 0 && <span className="treff-ort">{treffpunktHaeufigkeit(regel.monthly, t)}</span>}
              </span>
              <Zeichen name="weiter" />
            </button>
          ))}
        </section>
      ))}

      <button type="button" className="knopf-neu" onClick={() => setOffen('neu')}>
        <Zeichen name="plus" />
        {t.fsFuerJedeWoche}
      </button>

      {/* Wie jedes Blatt beim Planen am Dokument, nicht im Fluss der Seite. */}
      {offen !== null &&
        createPortal(
          offen === 'neu' ? (
            <NeueRegelBlatt anlegenIn={onlyGroup} onClose={schliessen} />
          ) : (
            <RegelBlatt id={offen.id} onClose={schliessen} />
          ),
          document.body,
        )}
    </>
  )
}

/**
 * Die Felder einer Regel — beim Ändern und beim Anlegen dieselben. „Außer bei
 * Versammlungstreffpunkt" gibt es nur bei einer Gruppe.
 */
function RegelFelder({
  regel,
  aendere,
}: {
  regel: Omit<FsRule, 'id'>
  aendere: (patch: RegelAenderung) => void
}) {
  const { state } = useApp()
  return (
    <>
      <WochentagFeld value={regel.wd} onChange={(wd) => aendere({ wd })} />
      <HaeufigkeitFeld value={regel.monthly} onChange={(monthly) => aendere({ monthly })} />
      <UhrzeitFeld value={regel.time} onChange={(time) => aendere({ time })} />
      <OrtFeld value={regel.place} placeholder={state.congregation.hall} onChange={(place) => aendere({ place })} />
      {regel.grp !== null && (
        <AusserVersammlungFeld value={regel.skipCong} onChange={(skipCong) => aendere({ skipCong })} />
      )}
    </>
  )
}

/**
 * Eine Regel ändern — jede Änderung gilt gleich, wie bisher im Grundplan:
 * Er setzt die Wochenpläne neu auf (`fsRuleUpdate`). Die Gruppe bleibt; wer
 * eine andere will, legt eine neue Regel an. Unten „Entfernen", mit Rückfrage.
 */
function RegelBlatt({ id, onClose }: { id: string; onClose: () => void }) {
  const { state, dispatch } = useApp()
  const i18n = useT()
  const { t } = i18n
  const regel = state.fsRules.find((r) => r.id === id)
  // Anderswo entfernt: Das Blatt geht mit.
  if (!regel) return null
  const aendere = (patch: RegelAenderung) => dispatch({ type: 'fsRuleUpdate', id, patch })
  const titel = treffpunktTitel(regel, state.groups, i18n)

  return (
    <Sheet label={titel} title={titel} onClose={onClose}>
      <div className="sheet-inhalt blatt-felder">
        <RegelFelder regel={regel} aendere={aendere} />
      </div>
      <div className="sheet-fuss-ende">
        <EntfernenKnopf
          className="knopf-umriss knopf-entfernen"
          text={t.a11yRemove}
          onEntfernen={() => {
            dispatch({ type: 'fsRuleRemove', id })
            onClose()
          }}
        />
      </div>
    </Sheet>
  )
}

/**
 * **Treffpunkt für jede Woche** — erst „Hinzufügen" legt die Regel an. Ohne Ort
 * nimmt sie den Saal dieser Versammlung, wie ein Treffpunkt der Woche. Der
 * Admin wählt die Gruppe; `anlegenIn` ist die des Gruppenaufsehers.
 */
function NeueRegelBlatt({ anlegenIn, onClose }: { anlegenIn: string | null; onClose: () => void }) {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const [regel, setRegel] = useState(() => neueRegel(anlegenIn))
  const aendere = (patch: RegelAenderung) => setRegel((r) => ({ ...r, ...patch }))
  // Mit der Gruppe wechselt die Vorgabe für „Außer bei Versammlungstreffpunkt".
  const gruppeWaehlen = (grp: string | null) => setRegel((r) => ({ ...r, grp, skipCong: neueRegel(grp).skipCong }))

  const anlegen = () => {
    dispatch({ type: 'fsRuleAdd', rule: { ...regel, place: regel.place.trim() || state.congregation.hall } })
    onClose()
  }

  return (
    <Sheet label={t.fsFuerJedeWoche} title={t.fsFuerJedeWoche} onClose={onClose}>
      <div className="sheet-inhalt blatt-felder">
        {anlegenIn === null && <GruppeFeld value={regel.grp} onChange={gruppeWaehlen} />}
        <RegelFelder regel={regel} aendere={aendere} />
      </div>
      <div className="sheet-fuss">
        <button type="button" className="knopf-haupt" onClick={anlegen}>
          {t.hinzufuegenKnopf}
        </button>
        <button type="button" className="knopf-leise" onClick={onClose}>
          {t.abbrechen}
        </button>
      </div>
    </Sheet>
  )
}
