import { useState } from 'react'
import { useApp } from '../app/context'
import { BesuchsMarke } from '../components/BesuchsMarke'
import { EntfernenKnopf } from '../components/EntfernenKnopf'
import { treffpunktTagLabel, treffpunktTitel } from '../components/treffpunkt-beschriftung'
import { fsLeiterZuteilung, fsWeekConflicts, nachWochentag } from '../data/fs'
import { rechteVon } from '../data/rechte'
import { useT } from '../i18n/useT'
import type { FsInstance } from '../data/types'
import { AutoAssignRow } from './AutoAssignPanel'
import { BannerKopf } from './PlanBanners'
import { SlotChip } from './SlotChip'
import { machBetrifft } from './useKonflikte'
import { useZusage } from './useZusage'
import { WochentagWahl, ZeitWahl } from './ZeitWahl'
import { ZusageLegende } from './ZusageStatus'

/**
 * Treffpunkte planen (Planen-Tab): je Tag eine Karte mit editierbaren Zeilen
 * (Zeit, Ort, Leiter zuteilen, entfernen) und einer Karte zum Hinzufügen eines
 * Treffpunkts nur für diese Woche (z. B. Pioniertage). Grundplan-Änderungen
 * laufen über den Reiter „Grundplan" (bis T120 über die Einstellungen).
 *
 * **Wer was ändert** (4.10.2026): Den Leiter setzt jeder, der hier plant. Zeit,
 * Ort, Entfernen und Hinzufügen nur, wer den Treffpunkt ändern darf — der
 * Admin jeden, der Gruppenaufseher die seiner Gruppe. Der Planer teilt zu; bei
 * ihm steht Zeit und Ort als Text da. Die Datenbank prüft dasselbe
 * (`fs_weeks_pruefen`).
 */
export function FsPlan({ onlyGroup = null }: { onlyGroup?: string | null }) {
  const { state, dispatch } = useApp()
  const i18n = useT()
  const { t, tu } = i18n
  const zusage = useZusage()
  const wi = state.week
  const rechte = rechteVon(state)
  const aendernDarf = (inst: FsInstance): boolean =>
    rechte.admin || (rechte.gruppe !== null && inst.grp === rechte.gruppe)
  // Gruppenaufseher, die nicht zuteilen, sehen/planen nur die Treffpunkte
  // ihrer eigenen Gruppe.
  const insts = (state.fsWeeks[wi] ?? []).filter((i) => !onlyGroup || i.grp === onlyGroup)

  // Wie bei den Zusammenkünften: wen das Banner darüber nennt, den hebt der
  // Plan hervor. Eigene Quelle, weil Treffpunkte eine eigene haben.
  const kennung = state.weeks[wi]?.start ?? ''
  const betrifft = machBetrifft(
    state.persons,
    fsWeekConflicts(state.fsWeeks, wi, state.persons, state.absences, kennung, onlyGroup),
  )

  const title = (inst: FsInstance): string => treffpunktTitel(inst, state.groups, i18n)
  const dayLabel = (wd: number): string => treffpunktTagLabel(kennung, wd, state.lang)

  const openLeader = (inst: FsInstance) =>
    dispatch({
      type: 'openSlot',
      sel: { kind: 'fs', wi, instId: inst.id, label: title(inst), priv: 'treffpunkt', groups: false },
    })

  const days = nachWochentag(insts)

  // „Für diese Woche hinzufügen"-Formular. Der Admin wählt die Gruppe, der
  // Gruppenaufseher legt in seiner an; der Planer legt nichts an.
  const anlegenIn = rechte.admin ? null : rechte.gruppe
  const darfAnlegen = rechte.admin || rechte.gruppe !== null
  const [grp, setGrp] = useState(anlegenIn ?? '')
  const [wd, setWd] = useState(6)
  const [time, setTime] = useState('09:30')
  const [place, setPlace] = useState('')
  const addInst = () => {
    const inst: FsInstance = {
      // Eindeutig statt zeitgestempelt: `x${Date.now()}` gab zwei Treffpunkte
      // derselben Millisekunde dieselbe Id — und sie steckt im Aufgaben-
      // Schlüssel (`fs|<Montag>|<instId>`). Zwei Treffpunkte hätten sich eine
      // Bestätigung geteilt. Dieselbe Stelle gab es bei den Regeln.
      id: `x${crypto.randomUUID()}`,
      ruleId: null,
      manual: true,
      // Das Auswahlfeld kennt nur Zeichenketten; „keine Gruppe" ist dort der
      // leere Wert und in den Daten `null` (wie `Person.grp`). Wer nur in
      // seiner Gruppe anlegt, legt dort an — gleich, was im Zustand steht.
      grp: anlegenIn ?? (grp || null),
      wd,
      time,
      // Vorgabe ist der Saal **dieser** Versammlung, nicht das deutsche Wort:
      // „Königreichssaal" stand sonst auch in einer spanischen Versammlung da.
      place: place.trim() || state.congregation.hall,
      leader: '',
    }
    dispatch({ type: 'fsInstAdd', inst })
    setPlace('')
  }

  // Treffpunkte dieser Woche ohne zugeteilten Leiter → Warn-Banner (analog zu
  // den offenen Zuteilungen der Zusammenkünfte). Konflikte gibt es hier nicht.
  const openLeaders = insts.filter((inst) => !inst.leader)

  return (
    <>
      <p className="plan-hint">{t.fsNurWoche}</p>

      {/* `onlyGroup` grenzt bei Gruppenaufsehern auf die eigene Gruppe ein. */}
      <div className="plan-auto">
        <AutoAssignRow
          label={t.fsLeiterLbl}
          automatisch={() => dispatch({ type: 'fsAutoAssign', onlyGroup })}
          leeren={() => dispatch({ type: 'fsClear', onlyGroup })}
        />
      </div>
      {/* Die Leiter-Chips tragen dieselben Punkte wie die Zusammenkünfte —
          also steht auch hier, was sie bedeuten. */}
      <ZusageLegende />

      {openLeaders.length > 0 && (
        <div className="plan-banner-box plan-open">
          <BannerKopf zeichen="?" titel={t.offeneTitle} anzahl={openLeaders.length} />
          {openLeaders.map((inst) => (
            <div key={inst.id} className="plan-open-row">
              <span className="plan-open-label" dir="auto">
                {dayLabel(inst.wd)} · {title(inst)}
              </span>
            </div>
          ))}
        </div>
      )}

      {days.map((day) => (
        <div key={day.wd} className="panel" data-farbe="gold">
          <h2 className="panel-label">{dayLabel(day.wd)}</h2>
          {day.items.map((inst) => (
            <div key={inst.id} className="fs-edit-row">
              {aendernDarf(inst) ? (
                <>
                  <div className="fs-edit-head">
                    <ZeitWahl
                      value={inst.time}
                      label={title(inst)}
                      onChange={(time) => dispatch({ type: 'fsInstUpdate', wi, id: inst.id, patch: { time } })}
                    />
                    <div className="fs-edit-title">{title(inst)}</div>
                    <EntfernenKnopf className="fs-remove" onEntfernen={() => dispatch({ type: 'fsInstRemove', wi, id: inst.id })} />
                  </div>
                  <BesuchsMarke woche={kennung} grp={inst.grp} />
                  <input
                    className="fs-input"
                    type="text"
                    dir="auto"
                    value={inst.place}
                    placeholder={t.fsOrtPh}
                    aria-label={t.fsOrtPh}
                    onChange={(e) => dispatch({ type: 'fsInstUpdate', wi, id: inst.id, patch: { place: e.target.value } })}
                  />
                </>
              ) : (
                <>
                  {/* Nur ansehen: Zeit, Titel und Ort wie im Programm. */}
                  <div className="fs-edit-head">
                    <span className="fs-edit-time">{inst.time}</span>
                    <div className="fs-edit-title">{title(inst)}</div>
                  </div>
                  <BesuchsMarke woche={kennung} grp={inst.grp} />
                  {inst.place && (
                    <div className="fs-edit-ort" dir="auto">
                      {inst.place}
                    </div>
                  )}
                </>
              )}
              <div className="fs-edit-slot">
                {/* Beim Freitext-Leiter bleibt der Ampel-Punkt ganz weg: Der
                    Kreisaufseher hat die App gar nicht — ein Punkt behauptete
                    dort eine Zusage oder ein Warten, das es nie gibt.
                    `konflikt` fragt aus demselben Grund `fsLeiterZuteilung`. */}
                <SlotChip
                  text={inst.leader ? `${tu('Leiter')}: ${inst.leader}` : t.zuteilenChip}
                  open={!inst.leader}
                  showStatus={Boolean(inst.leader) && !inst.lext}
                  status={zusage.treffpunkt(inst)}
                  konflikt={betrifft(fsLeiterZuteilung(inst))}
                  onClick={() => openLeader(inst)}
                />
              </div>
            </div>
          ))}
        </div>
      ))}

      {darfAnlegen && (
        <div className="panel panel--pb16 fs-add" data-farbe="neutral2">
          <h2 className="panel-label">{t.fsAddWeekLbl}</h2>
          <div className="fs-add-grid">
            {anlegenIn === null && (
              <select className="fs-select" value={grp} aria-label={t.fsVers} onChange={(e) => setGrp(e.target.value)}>
                <option value="">{t.fsVers}</option>
                {state.groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {tu(g.name)}
                  </option>
                ))}
              </select>
            )}
            <WochentagWahl value={wd} label={t.a11yWeekday} onChange={setWd} />
            <ZeitWahl className="fs-select" value={time} label={t.a11yTime} onChange={setTime} />
            <input
              className="fs-input"
              type="text"
              dir="auto"
              value={place}
              placeholder={t.fsOrtPh}
              aria-label={t.fsOrtPh}
              onChange={(e) => setPlace(e.target.value)}
            />
          </div>
          <button type="button" className="fs-add-btn" onClick={addInst}>
            {t.fsAdd}
          </button>
        </div>
      )}
    </>
  )
}
