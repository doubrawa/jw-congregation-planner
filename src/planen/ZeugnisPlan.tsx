import { useMemo, useState } from 'react'
import { useApp } from '../app/context'
import { useKalendertag } from '../app/useKalendertag'
import { besuchsWocheText } from '../components/gruppenbesuch-anzeige'
import { OZ_ERSTE_WOCHEN, ozKurzTag, ozNachWoche, ozTagText, ozZeit } from '../components/zeugnis-anzeige'
import { istAbwesendAm } from '../data/absence'
import { FS_TIME_OPTIONS } from '../data/fs'
import { displayName, isQualified } from '../data/helpers'
import { fromIso } from '../data/meeting-dates'
import { OZ_BEREICH, ozAb, ozKonflikte, ozSchichten, ozVorbei, ozZusage, type OzSchicht } from '../data/zeugnis'
import { fill, useT } from '../i18n/useT'
import type { OzEintrag, OzTermin, Person } from '../data/types'
import { AutoAssignRow } from './AutoAssignPanel'
import { BannerKopf } from './PlanBanners'
import { ZeugnisSendenPanel } from './PlanSendenPanel'
import { ZUSAGE_LABEL } from './useZusage'
import { ZusageLegende, ZusagePunkt } from './ZusageStatus'
import { WOCHENTAGE_AB_MONTAG, wochentagNameAusWd } from './wochentage'
import '../components/zeugnis.css'

/** Plätze je Termin zur Wahl — so weit lässt sie auch die Datenbank zu (`oz_termine.plaetze`). */
const PLAETZE = [1, 2, 3, 4, 5, 6]

/**
 * **Öffentliches Zeugnisgeben** beim Planen (T120, Phase 3) — nur für Planer.
 *
 * Oben die Termine (die Regel: Wochentag, Zeit, Ort, Plätze), darunter das
 * automatische Besetzen, die Konflikte, die freien Plätze und die Schichten
 * Woche für Woche. Ganz unten „Plan senden" für alle Zugeteilten, die noch
 * nichts wissen. Wer sich selbst eingetragen hat, steht grün da: Er hat damit
 * zugesagt.
 */
export function ZeugnisPlan() {
  const { state, dispatch } = useApp()
  const { t, tu } = useT()
  const tag = useKalendertag()
  const [alle, setAlle] = useState(false)

  const schichten = useMemo(
    () => ozSchichten(state.ozTermine, state.ozEintraege, ozAb(fromIso(tag))),
    [state.ozTermine, state.ozEintraege, tag],
  )
  // Vorgeschlagen wird, wer den Aufgabenbereich hat — dieselbe Menge wie beim
  // automatischen Besetzen und beim Selbsteintragen.
  const kandidaten = useMemo(
    () =>
      state.persons
        .filter((p) => isQualified(p, OZ_BEREICH))
        .sort((a, b) => displayName(a).localeCompare(displayName(b), state.lang)),
    [state.persons, state.lang],
  )

  const heute = fromIso(tag)
  // Konflikte aus dem ganzen Vierteljahr: Eine Abwesenheit in acht Wochen ist
  // jetzt noch leicht zu lösen.
  const konflikte = ozKonflikte(schichten, state.persons, state.absences, heute)
  const wochen = ozNachWoche(schichten)
  const sichtbar = alle ? wochen : wochen.slice(0, OZ_ERSTE_WOCHEN)
  // Freie Plätze nur aus den Wochen, die dastehen: Über das ganze Vierteljahr
  // wären es zwei Dutzend Zeilen, die die Schichten darunter verdrängen — und
  // eine Zahl, die nicht zu dem passt, was man sieht.
  const frei = sichtbar.flatMap((w) => w.schichten).filter((s) => s.frei > 0 && !ozVorbei(s, heute))
  const ort = (s: OzSchicht): string => tu(s.termin.ort) || t.privZeugnis

  return (
    <>
      <TerminePanel />

      {state.ozTermine.length > 0 && (
        <>
          <div className="plan-auto">
            <AutoAssignRow
              label={t.privZeugnis}
              automatisch={() => dispatch({ type: 'ozAutoAssign' })}
              leeren={() => dispatch({ type: 'ozLeeren' })}
            />
          </div>
          <p className="plan-hint">{t.ozAutoHint}</p>
          <ZusageLegende />

          {konflikte.length > 0 && (
            <div className="plan-banner-box plan-conflicts">
              <BannerKopf zeichen="!" titel={t.konflikteTitle} anzahl={konflikte.length} />
              {konflikte.map(({ schicht, eintrag, name }) => (
                <div key={eintrag.id} className="plan-conflict-row">
                  <span className="plan-conflict-dot" data-kind="absent" />
                  <span className="plan-conflict-text" dir="auto">
                    {[ozKurzTag(schicht.datum, state.lang), ort(schicht), fill(t.ozAbwesend, { name })].join(' · ')}
                  </span>
                </div>
              ))}
            </div>
          )}

          {frei.length > 0 && (
            <div className="plan-banner-box plan-open">
              <BannerKopf zeichen="?" titel={t.ozFreiePlaetze} anzahl={frei.reduce((n, s) => n + s.frei, 0)} />
              {frei.map((s) => (
                <div key={`${s.termin.id}|${s.datum}`} className="plan-open-row">
                  <span className="plan-open-label" dir="auto">
                    {[ozKurzTag(s.datum, state.lang), ort(s), fill(t.ozFrei, { n: s.frei })].join(' · ')}
                  </span>
                </div>
              ))}
            </div>
          )}

          {sichtbar.map(({ montag, schichten: inWoche }) => (
            <div key={montag} className="panel" data-farbe="gold">
              <h2 className="panel-label">{besuchsWocheText(montag, state.lang)}</h2>
              {inWoche.map((s) => (
                <SchichtZeile key={`${s.termin.id}|${s.datum}`} schicht={s} kandidaten={kandidaten} />
              ))}
            </div>
          ))}
          {!alle && wochen.length > OZ_ERSTE_WOCHEN && (
            <button type="button" className="btn-outline oz-mehr" onClick={() => setAlle(true)}>
              {t.ozMehrWochen}
            </button>
          )}

          <ZeugnisSendenPanel />
        </>
      )}
    </>
  )
}

/** Die Termine — die Regel, aus der jede Woche ihre Schichten bekommt. */
function TerminePanel() {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const upd = (id: string, patch: Partial<Omit<OzTermin, 'id'>>) => dispatch({ type: 'ozTerminUpdate', id, patch })

  return (
    <div className="panel panel--pb16" data-farbe="neutral">
      <h2 className="panel-label">{t.ozTermine}</h2>
      <p className="panel-hint">{state.ozTermine.length > 0 ? t.ozTermineHint : t.ozKeineTermine}</p>
      {state.ozTermine.map((termin) => (
        <div key={termin.id} className="fsr-row">
          <div className="fsr-line">
            <div className="fsr-wahl">
              <select
                className="fs-select"
                value={termin.wd}
                aria-label={t.a11yWeekday}
                onChange={(e) => upd(termin.id, { wd: Number(e.target.value) })}
              >
                {WOCHENTAGE_AB_MONTAG.map((d) => (
                  <option key={d} value={d}>
                    {wochentagNameAusWd(d, state.lang)}
                  </option>
                ))}
              </select>
              <select
                className="fs-select"
                value={termin.plaetze}
                aria-label={fill(t.ozPlaetze, { n: termin.plaetze })}
                onChange={(e) => upd(termin.id, { plaetze: Number(e.target.value) })}
              >
                {PLAETZE.map((n) => (
                  <option key={n} value={n}>
                    {fill(t.ozPlaetze, { n })}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="fs-remove"
              aria-label={t.a11yRemove}
              onClick={() => dispatch({ type: 'ozTerminRemove', id: termin.id })}
            >
              ✕
            </button>
          </div>
          <div className="fsr-line">
            <select
              className="fs-select fs-select--time"
              value={termin.von}
              aria-label={t.von}
              onChange={(e) => upd(termin.id, { von: e.target.value })}
            >
              {FS_TIME_OPTIONS.map((tm) => (
                <option key={tm} value={tm}>
                  {tm}
                </option>
              ))}
            </select>
            <select
              className="fs-select fs-select--time"
              value={termin.bis}
              aria-label={t.bis}
              onChange={(e) => upd(termin.id, { bis: e.target.value })}
            >
              {FS_TIME_OPTIONS.map((tm) => (
                <option key={tm} value={tm}>
                  {tm}
                </option>
              ))}
            </select>
          </div>
          <div className="fsr-line">
            <input
              className="fsr-input"
              type="text"
              dir="auto"
              value={termin.ort}
              placeholder={t.fsOrtPh}
              aria-label={t.fsOrtPh}
              onChange={(e) => upd(termin.id, { ort: e.target.value })}
            />
          </div>
        </div>
      ))}
      <button type="button" className="btn-outline fsr-add" onClick={() => dispatch({ type: 'ozTerminAdd' })}>
        {t.ozTerminAdd}
      </button>
    </div>
  )
}

/** Eine Schicht beim Planen: wann und wo, wer eingetragen ist, wer noch hineinkann. */
function SchichtZeile({ schicht, kandidaten }: { schicht: OzSchicht; kandidaten: readonly Person[] }) {
  const { state, dispatch } = useApp()
  const { t, tu } = useT()
  const tag = useKalendertag()
  const vorbei = ozVorbei(schicht, fromIso(tag))
  const amTag = fromIso(schicht.datum)
  const drin = new Set(schicht.eintraege.map((e) => e.pid))
  // Zur Wahl steht, wer den Aufgabenbereich hat, noch nicht in dieser Schicht
  // steht und an dem Tag nicht abwesend ist.
  const wahl = kandidaten.filter((p) => !drin.has(p.id) && !istAbwesendAm(state.absences, p.id, amTag))

  return (
    <div className={vorbei ? 'oz-schicht is-vorbei' : 'oz-schicht'}>
      <div className="fs-row-main">
        <span className="fs-time">{schicht.termin.von}</span>
        <div className="fs-row-text">
          <div className="fs-title" dir="auto">
            {tu(schicht.termin.ort) || t.privZeugnis}
          </div>
          <div className="fs-place">{`${ozTagText(schicht.datum, state.lang)} · ${ozZeit(schicht)}`}</div>
        </div>
      </div>
      <div className="oz-plaetze">
        {schicht.eintraege.map((eintrag) => (
          <EintragChip key={eintrag.id} eintrag={eintrag} vorbei={vorbei} abwesend={istAbwesendAm(state.absences, eintrag.pid, amTag)} />
        ))}
        {!vorbei &&
          Array.from({ length: schicht.frei }, (_unused, i) => (
            <select
              key={i}
              className="fs-select oz-zuteilen"
              value=""
              aria-label={t.zuteilenChip}
              onChange={(e) =>
                e.target.value &&
                dispatch({ type: 'ozZuteilen', terminId: schicht.termin.id, datum: schicht.datum, pid: e.target.value })
              }
            >
              <option value="">{t.zuteilenChip}</option>
              {wahl.map((p) => (
                <option key={p.id} value={p.id}>
                  {displayName(p)}
                </option>
              ))}
            </select>
          ))}
      </div>
    </div>
  )
}

/** Eine eingetragene Person: ihr Name, der Stand ihrer Zusage, und beim Kommenden das Austragen. */
function EintragChip({ eintrag, vorbei, abwesend }: { eintrag: OzEintrag; vorbei: boolean; abwesend: boolean }) {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const person = state.persons.find((p) => p.id === eintrag.pid)
  const stufe = ozZusage(eintrag, state.confirmations)
  return (
    <span className="oz-person">
      {/* Derselbe Punkt wie am Platz einer Zusammenkunft: Er verbindet den
          Namen mit seiner Zeile im Konflikt-Banner. */}
      {abwesend && !vorbei && <span className="slot-konflikt-dot" aria-hidden="true" />}
      <ZusagePunkt stufe={stufe} />
      <span dir="auto">{person ? displayName(person) : t.offenWort}</span>
      <span className="sr-only">{t[ZUSAGE_LABEL[stufe]]}</span>
      {!vorbei && (
        <button
          type="button"
          className="oz-raus"
          aria-label={t.a11yRemove}
          onClick={() => dispatch({ type: 'ozAustragen', id: eintrag.id })}
        >
          ✕
        </button>
      )}
    </span>
  )
}
