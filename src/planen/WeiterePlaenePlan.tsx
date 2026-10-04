import { useState } from 'react'
import { useApp } from '../app/context'
import { useKalendertag } from '../app/useKalendertag'
import { DatePicker } from '../components/DatePicker'
import { useBackDismiss } from '../components/useBackDismiss'
import { useZweiTipp } from '../components/useZweiTipp'
import { gruppenName, spannenText, zeitraumText } from '../components/weitere-plaene-anzeige'
import { fromIso } from '../data/meeting-dates'
import { eintraegeVon, neuerPlan, planSpannen, planStand, spanneVon, taktVon, type PlanStand } from '../data/weitere-plaene'
import { LOCALES } from '../i18n/langs'
import { useT } from '../i18n/useT'
import type { PlanTakt, WeitererPlan } from '../data/types'
import '../components/weitere-plaene.css'

/** Die Abschnitte der Liste, in ihrer Reihenfolge (wie auf der Canvas). */
const ABSCHNITTE: readonly PlanStand[] = ['aktuell', 'entwurf', 'abgeschlossen']

/**
 * **Weitere Pläne** beim Planen (T120, Phase 5) — nur für Planer.
 *
 * Zwei Ansichten in einem Bildschirm: die Liste (aktuell, Entwürfe,
 * abgeschlossen) und der geöffnete Plan. Welcher Plan offen ist, merkt sich
 * nur dieser Baustein: Wer das Thema verlässt und zurückkommt, steht wieder
 * vor der Liste.
 *
 * Eine Wahl der Vorlage gibt es seit dem 4.10.2026 nicht mehr: Mit „Familien
 * reihum" ging die zweite Vorlage, und jeder Plan ist ein Königreichssaal.
 * „+ Neuer Plan" legt ihn an und öffnet ihn gleich.
 */
export function WeiterePlaenePlan() {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const tag = useKalendertag()
  const [offen, setOffen] = useState<string | null>(null)
  const plan = offen ? state.plaene.find((p) => p.id === offen) : undefined
  // Zurück am Handy schließt zuerst den geöffneten Plan (4.10.2026).
  useBackDismiss(plan !== undefined, () => setOffen(null), 'unteransicht')

  if (plan) return <PlanBearbeiten plan={plan} onZurueck={() => setOffen(null)} />

  const anlegen = (): void => {
    const id = `p${crypto.randomUUID()}`
    dispatch({ type: 'wpPlanAnlegen', plan: neuerPlan(id, fromIso(tag)) })
    setOffen(id)
  }
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
      {/* Einen Plan legt der Admin an; der Planer verteilt darin die Gruppen
          (4.10.2026). */}
      {state.planner && (
        <button type="button" className="fs-add-btn wp-neu" onClick={anlegen}>
          {t.wpNeu}
        </button>
      )}
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

/** Ein Plan in der Liste: Art, Zeitraum, Name — ein Tipp öffnet ihn. */
function PlanKarte({ plan, stand, onOeffnen }: { plan: WeitererPlan; stand: PlanStand; onOeffnen: () => void }) {
  const { state } = useApp()
  const { t } = useT()
  return (
    <button type="button" className="wp-karte" data-stand={stand} onClick={onOeffnen}>
      <span className="wp-karte-kopf">
        <span className="wp-vorlage">{t.saal}</span>
        {stand === 'entwurf' && <span className="wp-marke">{t.wpEntwurf}</span>}
      </span>
      <span className="wp-karte-name" dir="auto">
        {plan.name || t.wpOhneName}
      </span>
      <span className="wp-karte-zeitraum">{zeitraumText(plan, state.lang)}</span>
    </button>
  )
}

/** Ein geöffneter Plan: Name, Zeitraum, Takt, veröffentlichen — darunter seine Wochen oder Monate. */
function PlanBearbeiten({ plan, onZurueck }: { plan: WeitererPlan; onZurueck: () => void }) {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const aendern = (patch: Partial<Pick<WeitererPlan, 'name' | 'von' | 'bis' | 'entwurf' | 'takt'>>): void =>
    dispatch({ type: 'wpPlanAendern', id: plan.id, patch })
  const monatlich = taktVon(plan) === 'monat'
  const loeschen = useZweiTipp(() => {
    dispatch({ type: 'wpPlanLoeschen', id: plan.id })
    onZurueck()
  })
  const locale = LOCALES[state.lang]

  // Name, Zeitraum, Takt, Veröffentlichen und Löschen sind der Plan selbst —
  // die ändert der Admin. Der Planer sieht sie und verteilt die Gruppen.
  if (!state.planner) {
    return (
      <>
        <button type="button" className="wp-zurueck" onClick={onZurueck}>
          {`‹ ${t.navWeiterePlaene}`}
        </button>
        <div className="panel panel--pb16" data-farbe="neutral">
          <div className="wp-karte-kopf">
            <h2 className="panel-label">{t.saal}</h2>
            {plan.entwurf && <span className="wp-marke">{t.wpEntwurf}</span>}
          </div>
          <p className="wp-karte-name" dir="auto">
            {plan.name || t.wpOhneName}
          </p>
          <p className="wp-karte-zeitraum">{zeitraumText(plan, state.lang)}</p>
        </div>
        <SaalSpannen plan={plan} />
      </>
    )
  }

  return (
    <>
      <button type="button" className="wp-zurueck" onClick={onZurueck}>
        {`‹ ${t.navWeiterePlaene}`}
      </button>
      <div className="panel panel--pb16" data-farbe="neutral">
        <div className="wp-karte-kopf">
          <h2 className="panel-label">{t.saal}</h2>
          {plan.entwurf && <span className="wp-marke">{t.wpEntwurf}</span>}
        </div>
        <p className="panel-hint">{monatlich ? t.wpSaalTextMonat : t.wpSaalText}</p>
        <label className="wp-feld">
          <span className="field-label">{t.nameLbl}</span>
          <input
            className="field-input"
            type="text"
            dir="auto"
            value={plan.name}
            placeholder={t.wpNamePhSaal}
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
        {/*
          Der Takt (4.10.2026): je Woche oder je Monat eine Gruppe. Ein Wechsel
          nimmt die Einteilung ins neue Raster mit (`taktWechseln`).
        */}
        <label className="wp-feld">
          <span className="field-label">{t.wpTakt}</span>
          <select
            className="fs-select"
            value={taktVon(plan)}
            onChange={(e) => aendern({ takt: e.target.value as PlanTakt })}
          >
            <option value="woche">{t.fsFreqW}</option>
            <option value="monat">{t.wpJedenMonat}</option>
          </select>
        </label>
        <p className="panel-hint">{plan.entwurf ? `${t.wpEntwurfHint} ${t.wpSichtSaal}` : t.wpSichtSaal}</p>
        <button
          type="button"
          className={`${plan.entwurf ? 'plan-auto-btn plan-auto-btn--primary' : 'btn-outline'} wp-veroeffentlichen`}
          onClick={() => aendern({ entwurf: !plan.entwurf })}
        >
          {plan.entwurf ? t.wpVeroeffentlichen : t.wpZurueckziehen}
        </button>
      </div>

      <SaalSpannen plan={plan} />

      <button type="button" className="btn-outline wp-loeschen" onClick={loeschen.onClick} onBlur={loeschen.onBlur}>
        {loeschen.armed ? t.loeschenSicher : t.wpLoeschen}
      </button>
    </>
  )
}

/** Reihum verteilen, darunter die Wochen oder Monate mit ihrer Gruppe. */
function SaalSpannen({ plan }: { plan: WeitererPlan }) {
  const { state, dispatch } = useApp()
  const { t, tu } = useT()
  const tag = useKalendertag()
  const [ab, setAb] = useState(state.groups[0]?.id ?? '')
  const eintraege = eintraegeVon(state.planEintraege, plan.id)
  const monatlich = taktVon(plan) === 'monat'
  const jetzt = spanneVon(taktVon(plan), tag)

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
          <p className="panel-hint">{monatlich ? t.wpVerteilenHintMonat : t.wpVerteilenHint}</p>
        </div>
      )}
      <div className="panel" data-farbe="petrol">
        {planSpannen(plan).map((spanne) => {
          const eintrag = eintraege.find((e) => e.datum === spanne)
          const vorbei = spanne < jetzt
          return (
            <div key={spanne} className={vorbei ? 'wp-zeile is-vorbei' : 'wp-zeile'}>
              <span className="wp-zeile-wann">{spannenText(plan, spanne, state.lang)}</span>
              {vorbei ? (
                <span className="wp-zeile-wer">{gruppenName(eintrag?.grp ?? null, state.groups, tu) || t.offenDash}</span>
              ) : (
                <select
                  className="fs-select"
                  value={eintrag?.grp ?? ''}
                  aria-label={t.gbGruppe}
                  onChange={(e) =>
                    dispatch({ type: 'wpEintragSetzen', planId: plan.id, datum: spanne, grp: e.target.value || null })
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
