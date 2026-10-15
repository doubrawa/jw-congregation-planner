import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useApp } from '../app/context'
import { Zeichen } from '../bausteine/Zeichen'
import { BesuchsMarke } from '../components/BesuchsMarke'
import { EntfernenKnopf } from '../components/EntfernenKnopf'
import { Sheet } from '../components/Sheet'
import { treffpunktTagLabel, treffpunktTitel } from '../components/treffpunkt-beschriftung'
import { fsInGruppe, fsKonfliktVon, fsWeekConflicts, nachWochentag, NEUER_TREFFPUNKT } from '../data/fs'
import { rechteVon, treffpunktGruppe } from '../data/rechte'
import type { FsInstance } from '../data/types'
import { useT } from '../i18n/useT'
import { istGewaehlt } from './planen-raster'
import { leiterAnzeige } from './platz-anzeige'
import { PlatzZeile } from './PlatzZeile'
import { GruppeFeld, OrtFeld, UhrzeitFeld, WochentagFeld } from './TreffpunktFelder'
import { useZusage } from './useZusage'
import { ZeitWahl } from './ZeitWahl'

/**
 * **Die Treffpunkte der Woche planen** (T121, Entwurf `GTreffpunktePlanen`):
 * je Tag eine Karte, darin jeder Treffpunkt mit Zeit, Titel und Ort, darunter
 * sein Leiter als Platz — ein Tipp öffnet das Zuteilen, mit derselben Lage wie
 * bei den Zusammenkünften. Darunter „Treffpunkt für diese Woche". „Automatisch"
 * und „Plan senden" stehen in der Leiste (`PlanenAktionen`); was jede Woche
 * gilt, im Grundplan.
 *
 * **Wer was ändert** (4.10.2026): Den Leiter setzt jeder, der hier plant. Zeit,
 * Ort, Entfernen und Hinzufügen nur, wer den Treffpunkt ändern darf — der
 * Admin jeden, der Gruppenaufseher die seiner Gruppe. Der Planer teilt zu; bei
 * ihm stehen Zeit und Ort als Text da. Die Datenbank prüft dasselbe
 * (`fs_weeks_pruefen`).
 *
 * Das Blatt zum Hinzufügen hängt per Portal am Dokument: Der Plan liegt im
 * Wochenstreifen, und der wird zum Wischen per `transform` verschoben.
 */
export function FsPlan() {
  const { state, dispatch } = useApp()
  const i18n = useT()
  const { t, tu } = i18n
  const zusage = useZusage()
  const [neu, setNeu] = useState(false)
  const wi = state.week
  const rechte = rechteVon(state)
  const aendernDarf = (inst: FsInstance): boolean =>
    rechte.zuteilen || (rechte.gruppe !== null && inst.grp === rechte.gruppe)
  // Gruppenaufseher, die nicht zuteilen, sehen und planen nur die Treffpunkte
  // ihrer eigenen Gruppe.
  const onlyGroup = treffpunktGruppe(rechte)
  const insts = (state.fsWeeks[wi] ?? []).filter((i) => fsInGruppe(i, onlyGroup))
  const kennung = state.weeks[wi]?.start ?? ''
  // Wer abwesend oder am selben Tag zweimal eingeteilt ist, steht an seinem
  // Platz rot da — dieselbe Quelle wie die Karte im Zuteilen-Blatt.
  const konfliktVon = fsKonfliktVon(
    fsWeekConflicts(state.fsWeeks, wi, state.persons, state.absences, kennung, onlyGroup),
  )
  const titel = (inst: FsInstance): string => treffpunktTitel(inst, state.groups, i18n)

  const openLeader = (inst: FsInstance) =>
    dispatch({
      type: 'openSlot',
      sel: { kind: 'fs', wi, instId: inst.id, label: titel(inst), priv: 'treffpunkt', groups: false },
    })

  return (
    <>
      <p className="klein-text">{t.fsNurWoche}</p>

      {insts.length === 0 && (
        <section className="karte treff-leer">
          <p className="prog-meta">{t.fsKeine}</p>
        </section>
      )}

      {nachWochentag(insts).map((tag) => (
        <section key={tag.wd} className="prog-abschnitt treff-tag">
          <div className="prog-abschnitt-kopf">
            <h2 className="treff-tag-name">{treffpunktTagLabel(kennung, tag.wd, state.lang)}</h2>
          </div>
          {tag.items.map((inst) => (
            <div key={inst.id} className="treff-planen">
              <TreffpunktKopf inst={inst} titel={titel(inst)} kennung={kennung} aendern={aendernDarf(inst)} />
              {/* Der Leiter unter dem Titel, nicht unter der Zeit — wie im Entwurf. */}
              <div className="treff-leiter-zeile">
                <PlatzZeile
                  name={inst.leader}
                  rolle={tu('Leiter')}
                  {...leiterAnzeige(inst, zusage.treffpunkt, konfliktVon(inst), t)}
                  gewaehlt={istGewaehlt(state.slotSel, { kind: 'fs', wi, instId: inst.id })}
                  onClick={() => openLeader(inst)}
                />
              </div>
            </div>
          ))}
        </section>
      ))}

      {(rechte.zuteilen || rechte.gruppe !== null) && (
        <button type="button" className="knopf-neu" onClick={() => setNeu(true)}>
          <Zeichen name="plus" />
          {t.fsFuerDieseWoche}
        </button>
      )}
      {neu && createPortal(<NeuerTreffpunktBlatt onClose={() => setNeu(false)} />, document.body)}
    </>
  )
}

/**
 * Zeit, Titel und Ort eines Treffpunkts — für den, der ihn ändern darf, Zeit
 * und Ort als Felder (nur für diese Woche) und das ✕, sonst als Text.
 */
function TreffpunktKopf({
  inst,
  titel,
  kennung,
  aendern,
}: {
  inst: FsInstance
  titel: string
  kennung: string
  aendern: boolean
}) {
  const { state, dispatch } = useApp()
  const { t, tu } = useT()
  const wi = state.week
  const aendere = (patch: Partial<Pick<FsInstance, 'time' | 'place'>>) =>
    dispatch({ type: 'fsInstUpdate', wi, id: inst.id, patch })
  return (
    <div className={aendern ? 'treff-planen-kopf is-aenderbar' : 'treff-planen-kopf'}>
      {aendern ? (
        <ZeitWahl
          className="treff-zeit-wahl"
          value={inst.time}
          label={`${t.a11yTime} · ${titel}`}
          onChange={(time) => aendere({ time })}
        />
      ) : (
        <span className="treff-zeit-pille">{inst.time}</span>
      )}
      <div className="treff-text">
        <div className="treff-titel">{titel}</div>
        {aendern ? (
          <input
            className="treff-ort-feld"
            type="text"
            dir="auto"
            value={inst.place}
            placeholder={t.fsOrtPh}
            aria-label={`${t.ortLbl} · ${titel}`}
            onChange={(e) => aendere({ place: e.target.value })}
          />
        ) : (
          inst.place && (
            <div className="treff-ort" dir="auto">
              {tu(inst.place)}
            </div>
          )
        )}
        <BesuchsMarke woche={kennung} grp={inst.grp} />
      </div>
      {aendern && (
        <EntfernenKnopf
          className="treff-entfernen"
          onEntfernen={() => dispatch({ type: 'fsInstRemove', wi, id: inst.id })}
        />
      )}
    </div>
  )
}

/**
 * **Treffpunkt für diese Woche** — etwa ein Pioniertag oder ein zusätzlicher
 * Termin. Admin und Planer wählen, für wen er gilt; der Gruppenaufseher legt
 * in seiner Gruppe an. Was jede Woche gilt, gehört in den Grundplan.
 */
function NeuerTreffpunktBlatt({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const rechte = rechteVon(state)
  // Wer nicht plant, legt in seiner Gruppe an — ohne Wahl.
  const anlegenIn = treffpunktGruppe(rechte)
  const [grp, setGrp] = useState(anlegenIn)
  const [wd, setWd] = useState<number>(NEUER_TREFFPUNKT.wd)
  const [time, setTime] = useState<string>(NEUER_TREFFPUNKT.time)
  const [place, setPlace] = useState('')

  const anlegen = () => {
    dispatch({
      type: 'fsInstAdd',
      inst: {
        // Eindeutig statt zeitgestempelt: `x${Date.now()}` gab zwei Treffpunkten
        // derselben Millisekunde dieselbe Id — und sie steckt im Aufgaben-
        // Schlüssel (`fs|<Montag>|<instId>`).
        id: `x${crypto.randomUUID()}`,
        ruleId: null,
        manual: true,
        grp,
        wd,
        time,
        // Vorgabe ist der Saal **dieser** Versammlung, nicht das deutsche Wort.
        place: place.trim() || state.congregation.hall,
        leader: '',
      },
    })
    onClose()
  }

  return (
    <Sheet label={t.fsFuerDieseWoche} title={t.fsFuerDieseWoche} onClose={onClose}>
      <div className="sheet-inhalt blatt-felder">
        {anlegenIn === null && <GruppeFeld value={grp} onChange={setGrp} />}
        <WochentagFeld value={wd} onChange={setWd} />
        <UhrzeitFeld value={time} onChange={setTime} />
        <OrtFeld value={place} placeholder={state.congregation.hall} onChange={setPlace} />
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
