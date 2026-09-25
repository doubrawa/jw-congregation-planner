import { useState } from 'react'
import { useApp } from '../app/context'
import { treffpunktTagLabel, treffpunktTitel } from '../components/treffpunkt-beschriftung'
import { FS_TIME_OPTIONS, fsLeiterZuteilung, fsWeekConflicts, nachWochentag } from '../data/fs'
import { useT } from '../i18n/useT'
import type { FsInstance } from '../data/types'
import { AutoAssignRow } from './AutoAssignPanel'
import { BannerKopf } from './PlanBanners'
import { SlotChip } from './SlotChip'
import { machBetrifft } from './useKonflikte'
import { WOCHENTAGE_AB_MONTAG, wochentagNameAusWd } from './wochentage'
import { useZusage } from './useZusage'
import { ZusageLegende } from './ZusageStatus'

/**
 * Treffpunkte planen (Planen-Tab): je Tag eine Karte mit editierbaren Zeilen
 * (Zeit, Ort, Leiter zuteilen, entfernen) und einer Karte zum Hinzufügen eines
 * Treffpunkts nur für diese Woche (z. B. Pioniertage). Grundplan-Änderungen
 * laufen über die Einstellungen.
 */
export function FsPlan({ onlyGroup = null }: { onlyGroup?: string | null }) {
  const { state, dispatch } = useApp()
  const i18n = useT()
  const { t, tu } = i18n
  const zusage = useZusage()
  const wi = state.week
  // Gruppenaufseher sehen/planen nur die Treffpunkte ihrer eigenen Gruppe.
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

  // „Für diese Woche hinzufügen"-Formular (Gruppenaufseher: Ziel = eigene Gruppe).
  const [grp, setGrp] = useState(onlyGroup ?? '')
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
      // leere Wert und in den Daten `null` (wie `Person.grp`).
      grp: grp || null,
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

  const wdName = (d: number): string => wochentagNameAusWd(d, state.lang)

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
              <div className="fs-edit-head">
                <select
                  className="fs-select fs-select--time"
                  value={inst.time}
                  aria-label={title(inst)}
                  onChange={(e) => dispatch({ type: 'fsInstUpdate', wi, id: inst.id, patch: { time: e.target.value } })}
                >
                  {FS_TIME_OPTIONS.map((tm) => (
                    <option key={tm} value={tm}>
                      {tm}
                    </option>
                  ))}
                </select>
                <div className="fs-edit-title">{title(inst)}</div>
                <button
                  type="button"
                  className="fs-remove"
                  aria-label={t.a11yRemove}
                  onClick={() => dispatch({ type: 'fsInstRemove', wi, id: inst.id })}
                >
                  ✕
                </button>
              </div>
              <input
                className="fs-input"
                type="text"
                dir="auto"
                value={inst.place}
                placeholder={t.fsOrtPh}
                aria-label={t.fsOrtPh}
                onChange={(e) => dispatch({ type: 'fsInstUpdate', wi, id: inst.id, patch: { place: e.target.value } })}
              />
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

      <div className="panel panel--pb16 fs-add" data-farbe="neutral2">
        <h2 className="panel-label">{t.fsAddWeekLbl}</h2>
        <div className="fs-add-grid">
          {!onlyGroup && (
            <select className="fs-select" value={grp} aria-label={t.fsVers} onChange={(e) => setGrp(e.target.value)}>
              <option value="">{t.fsVers}</option>
              {state.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {tu(g.name)}
                </option>
              ))}
            </select>
          )}
          <select className="fs-select" value={wd} aria-label={t.a11yWeekday} onChange={(e) => setWd(Number(e.target.value))}>
            {WOCHENTAGE_AB_MONTAG.map((d) => (
              <option key={d} value={d}>
                {wdName(d)}
              </option>
            ))}
          </select>
          <select className="fs-select" value={time} aria-label={t.a11yTime} onChange={(e) => setTime(e.target.value)}>
            {FS_TIME_OPTIONS.map((tm) => (
              <option key={tm} value={tm}>
                {tm}
              </option>
            ))}
          </select>
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
    </>
  )
}
