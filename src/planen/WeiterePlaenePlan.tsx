import { useMemo, useState } from 'react'
import { useApp } from '../app/context'
import { useKalendertag } from '../app/useKalendertag'
import { DatePicker } from '../components/DatePicker'
import { useBackDismiss } from '../components/useBackDismiss'
import { besuchsWocheText } from '../components/gruppenbesuch-anzeige'
import { useZweiTipp } from '../components/useZweiTipp'
import {
  gastgeberName,
  gruppenName,
  mahlzeitName,
  vorlageName,
  vorlageText,
  zeitraumText,
} from '../components/weitere-plaene-anzeige'
import { zeitleisteDatum } from '../components/zeitleiste-gemeinsam'
import { displayName, personCompare } from '../data/helpers'
import { fromIso, montagVon } from '../data/meeting-dates'
import {
  eintraegeVon,
  MAHLZEITEN,
  neuerPlan,
  PLAN_VORLAGEN,
  planStand,
  planTage,
  planWochen,
  type PlanStand,
} from '../data/weitere-plaene'
import { LOCALES } from '../i18n/langs'
import { useT } from '../i18n/useT'
import type { PlanVorlage, WeitererPlan } from '../data/types'
import '../components/weitere-plaene.css'

/** Die Abschnitte der Liste, in ihrer Reihenfolge (wie auf der Canvas). */
const ABSCHNITTE: readonly PlanStand[] = ['aktuell', 'entwurf', 'abgeschlossen']

/**
 * **Weitere Pläne** beim Planen (T120, Phase 5) — nur für Planer.
 *
 * Drei Ansichten in einem Bildschirm: die Liste (aktuell, Entwürfe,
 * abgeschlossen), die Wahl der Vorlage und der geöffnete Plan. Welcher Plan
 * offen ist, merkt sich nur dieser Baustein: Wer das Thema verlässt und
 * zurückkommt, steht wieder vor der Liste.
 */
export function WeiterePlaenePlan() {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const tag = useKalendertag()
  const [offen, setOffen] = useState<string | null>(null)
  const [waehlen, setWaehlen] = useState(false)
  const plan = offen ? state.plaene.find((p) => p.id === offen) : undefined
  // Zurück am Handy schließt zuerst die Vorlagenwahl bzw. den geöffneten Plan
  // (4.10.2026). Eine Ebene für beide: Nach der Wahl der Vorlage steht der neue
  // Plan offen da, und Zurück führt zur Liste, nicht zurück zur Wahl.
  useBackDismiss(
    waehlen || plan !== undefined,
    () => {
      setOffen(null)
      setWaehlen(false)
    },
    'unteransicht',
  )

  if (waehlen) {
    const anlegen = (vorlage: PlanVorlage): void => {
      const id = `p${crypto.randomUUID()}`
      dispatch({ type: 'wpPlanAnlegen', plan: neuerPlan(id, vorlage, fromIso(tag)) })
      setOffen(id)
      setWaehlen(false)
    }
    return <VorlageWaehlen onZurueck={() => setWaehlen(false)} onWahl={anlegen} />
  }
  if (plan) return <PlanBearbeiten plan={plan} onZurueck={() => setOffen(null)} />

  const heute = fromIso(tag)
  const titel: Record<PlanStand, string> = {
    aktuell: t.wpAktuell,
    entwurf: t.wpEntwuerfe,
    abgeschlossen: t.wpAbgeschlossen,
  }
  return (
    <>
      <div className="panel panel--pb16" data-farbe="neutral">
        <p className="panel-hint">{t.wpHinweis}</p>
      </div>
      <button type="button" className="fs-add-btn wp-neu" onClick={() => setWaehlen(true)}>
        {t.wpNeu}
      </button>
      {state.plaene.length === 0 && <p className="wp-leer">{t.wpKeine}</p>}
      {ABSCHNITTE.map((stand) => {
        const imAbschnitt = state.plaene.filter((p) => planStand(p, heute) === stand)
        if (imAbschnitt.length === 0) return null
        return (
          <section key={stand} className="wp-abschnitt">
            <h2 className="wp-abschnitt-titel">{titel[stand]}</h2>
            {imAbschnitt.map((p) => (
              <PlanKarte key={p.id} plan={p} stand={stand} onOeffnen={() => setOffen(p.id)} />
            ))}
          </section>
        )
      })}
    </>
  )
}

/** Ein Plan in der Liste: Vorlage, Zeitraum, Name — ein Tipp öffnet ihn. */
function PlanKarte({ plan, stand, onOeffnen }: { plan: WeitererPlan; stand: PlanStand; onOeffnen: () => void }) {
  const { state } = useApp()
  const { t } = useT()
  return (
    <button type="button" className="wp-karte" data-stand={stand} onClick={onOeffnen}>
      <span className="wp-karte-kopf">
        <span className="wp-vorlage">{vorlageName(plan.vorlage, t)}</span>
        {stand === 'entwurf' && <span className="wp-marke">{t.wpEntwurf}</span>}
      </span>
      <span className="wp-karte-name" dir="auto">
        {plan.name || t.wpOhneName}
      </span>
      <span className="wp-karte-zeitraum">{zeitraumText(plan, state.lang)}</span>
    </button>
  )
}

/** Die Wahl der Vorlage — jede bringt ihren Aufbau mit. */
function VorlageWaehlen({ onZurueck, onWahl }: { onZurueck: () => void; onWahl: (v: PlanVorlage) => void }) {
  const { t } = useT()
  return (
    <>
      <button type="button" className="wp-zurueck" onClick={onZurueck}>
        {`‹ ${t.navWeiterePlaene}`}
      </button>
      <h2 className="wp-titel">{t.wpNeuTitel}</h2>
      <div className="wp-vorlagen">
        {PLAN_VORLAGEN.map((vorlage) => (
          <button key={vorlage} type="button" className="wp-vorlage-karte" data-vorlage={vorlage} onClick={() => onWahl(vorlage)}>
            <span className="wp-vorlage-name">{vorlageName(vorlage, t)}</span>
            <span className="wp-vorlage-text">{vorlageText(vorlage, t)}</span>
          </button>
        ))}
      </div>
    </>
  )
}

/** Ein geöffneter Plan: Name, Zeitraum, veröffentlichen — darunter seine Wochen bzw. Tage. */
function PlanBearbeiten({ plan, onZurueck }: { plan: WeitererPlan; onZurueck: () => void }) {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const aendern = (patch: Partial<Pick<WeitererPlan, 'name' | 'von' | 'bis' | 'entwurf'>>): void =>
    dispatch({ type: 'wpPlanAendern', id: plan.id, patch })
  const loeschen = useZweiTipp(() => {
    dispatch({ type: 'wpPlanLoeschen', id: plan.id })
    onZurueck()
  })
  const locale = LOCALES[state.lang]
  const sicht = plan.vorlage === 'saal' ? t.wpSichtSaal : t.wpSichtFamilien

  return (
    <>
      <button type="button" className="wp-zurueck" onClick={onZurueck}>
        {`‹ ${t.navWeiterePlaene}`}
      </button>
      <div className="panel panel--pb16" data-farbe="neutral">
        <div className="wp-karte-kopf">
          <h2 className="panel-label">{vorlageName(plan.vorlage, t)}</h2>
          {plan.entwurf && <span className="wp-marke">{t.wpEntwurf}</span>}
        </div>
        <p className="panel-hint">{vorlageText(plan.vorlage, t)}</p>
        <label className="wp-feld">
          <span className="field-label">{t.nameLbl}</span>
          <input
            className="field-input"
            type="text"
            dir="auto"
            value={plan.name}
            placeholder={plan.vorlage === 'saal' ? t.wpNamePhSaal : t.wpNamePhFamilien}
            onChange={(e) => aendern({ name: e.target.value })}
          />
        </label>
        <div className="wp-zeitraum-felder">
          <div className="wp-feld">
            <span className="field-label">{t.von}</span>
            <DatePicker
              value={plan.von}
              onChange={(von) => von && aendern({ von, ...(von > plan.bis ? { bis: von } : {}) })}
              locale={locale}
              placeholder={t.datumPh}
              ariaLabel={t.von}
              prevLabel={t.a11yPrevMonth}
              nextLabel={t.a11yNextMonth}
            />
          </div>
          <div className="wp-feld">
            <span className="field-label">{t.bis}</span>
            <DatePicker
              value={plan.bis}
              onChange={(bis) => bis && aendern({ bis })}
              locale={locale}
              min={plan.von}
              placeholder={t.datumPh}
              ariaLabel={t.bis}
              prevLabel={t.a11yPrevMonth}
              nextLabel={t.a11yNextMonth}
            />
          </div>
        </div>
        <p className="panel-hint">{plan.entwurf ? `${t.wpEntwurfHint} ${sicht}` : sicht}</p>
        <button
          type="button"
          className={`${plan.entwurf ? 'plan-auto-btn plan-auto-btn--primary' : 'btn-outline'} wp-veroeffentlichen`}
          onClick={() => aendern({ entwurf: !plan.entwurf })}
        >
          {plan.entwurf ? t.wpVeroeffentlichen : t.wpZurueckziehen}
        </button>
      </div>

      {plan.vorlage === 'saal' ? <SaalWochen plan={plan} /> : <FamilienTage plan={plan} />}

      <button type="button" className="btn-outline wp-loeschen" onClick={loeschen.onClick} onBlur={loeschen.onBlur}>
        {loeschen.armed ? t.loeschenSicher : t.wpLoeschen}
      </button>
    </>
  )
}

/** Königreichssaal: reihum verteilen, darunter die Wochen mit ihrer Gruppe. */
function SaalWochen({ plan }: { plan: WeitererPlan }) {
  const { state, dispatch } = useApp()
  const { t, tu } = useT()
  const tag = useKalendertag()
  const [ab, setAb] = useState(state.groups[0]?.id ?? '')
  const eintraege = eintraegeVon(state.planEintraege, plan.id)
  const dieseWoche = montagVon(tag)

  return (
    <>
      {state.groups.length > 0 && (
        <div className="panel panel--pb16" data-farbe="neutral2">
          <div className="wp-verteilen">
            <label className="wp-feld">
              <span className="field-label">{t.wpAbGruppe}</span>
              <select className="fs-select" value={ab} onChange={(e) => setAb(e.target.value)}>
                {state.groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {tu(g.name)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn-outline"
              disabled={!ab}
              onClick={() => dispatch({ type: 'wpGruppenVerteilen', planId: plan.id, abGruppe: ab })}
            >
              {t.gbVerteilen}
            </button>
          </div>
          <p className="panel-hint">{t.wpVerteilenHint}</p>
        </div>
      )}
      <div className="panel" data-farbe="petrol">
        {planWochen(plan).map((woche) => {
          const eintrag = eintraege.find((e) => e.datum === woche)
          const vorbei = woche < dieseWoche
          return (
            <div key={woche} className={vorbei ? 'wp-zeile is-vorbei' : 'wp-zeile'}>
              <span className="wp-zeile-wann">{besuchsWocheText(woche, state.lang)}</span>
              {vorbei ? (
                <span className="wp-zeile-wer">{gruppenName(eintrag?.grp ?? null, state.groups, tu) || t.offenDash}</span>
              ) : (
                <select
                  className="fs-select"
                  value={eintrag?.grp ?? ''}
                  aria-label={t.gbGruppe}
                  onChange={(e) =>
                    dispatch({
                      type: 'wpEintragSetzen',
                      planId: plan.id,
                      datum: woche,
                      mahlzeit: null,
                      grp: e.target.value || null,
                      pid: null,
                    })
                  }
                >
                  <option value="">{t.offenDash}</option>
                  {state.groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {tu(g.name)}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}

/** Familien reihum: je Tag die Mahlzeiten, je Mahlzeit ein Gastgeber. */
function FamilienTage({ plan }: { plan: WeitererPlan }) {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const tag = useKalendertag()
  const eintraege = eintraegeVon(state.planEintraege, plan.id)
  const gastgeber = useMemo(
    () => [...state.persons].sort((a, b) => personCompare(a, b, state.lang)),
    [state.persons, state.lang],
  )

  return (
    <>
      {planTage(plan).map((datum) => {
        const vorbei = datum < tag
        return (
          <div key={datum} className={vorbei ? 'panel is-vorbei' : 'panel'} data-farbe="gold">
            <h2 className="panel-label">{zeitleisteDatum(fromIso(datum), state.lang)}</h2>
            {MAHLZEITEN.map((mahlzeit) => {
              const eintrag = eintraege.find((e) => e.datum === datum && e.mahlzeit === mahlzeit)
              return (
                <div key={mahlzeit} className="wp-zeile">
                  <span className="wp-zeile-wann">{mahlzeitName(mahlzeit, t)}</span>
                  {vorbei ? (
                    <span className="wp-zeile-wer">{gastgeberName(eintrag?.pid ?? null, state.persons) || t.offenDash}</span>
                  ) : (
                    <select
                      className="fs-select"
                      value={eintrag?.pid ?? ''}
                      aria-label={`${mahlzeitName(mahlzeit, t)} · ${t.familieLabel}`}
                      onChange={(e) =>
                        dispatch({
                          type: 'wpEintragSetzen',
                          planId: plan.id,
                          datum,
                          mahlzeit,
                          grp: null,
                          pid: e.target.value || null,
                        })
                      }
                    >
                      <option value="">{t.offenDash}</option>
                      {gastgeber.map((p) => (
                        <option key={p.id} value={p.id}>
                          {displayName(p)}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}
    </>
  )
}
