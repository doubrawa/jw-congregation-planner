import { useMemo, useState } from 'react'
import { useApp } from '../app/context'
import { useKalendertag } from '../app/useKalendertag'
import {
  besuchsGruppe,
  besuchsTreffpunktText,
  besuchsWocheText,
  besucherName,
  monatText,
  montagDerWoche,
  nachMonat,
} from '../components/gruppenbesuch-anzeige'
import { fsTaskKey } from '../data/fs'
import { besuchHatKonflikt, besuchStand, VERTEILEN_MONATE, type BesuchsStand } from '../data/gruppenbesuche'
import { displayName, isQualified } from '../data/helpers'
import { fromIso, montagNach } from '../data/meeting-dates'
import { zusageStatus } from '../data/planning'
import { fill, useT } from '../i18n/useT'
import type { Gruppenbesuch, Person } from '../data/types'
import { AutoAssignRow } from './AutoAssignPanel'
import { BannerKopf } from './PlanBanners'
import { ZUSAGE_LABEL } from './useZusage'
import { ZusageLegende, ZusagePunkt } from './ZusageStatus'
import '../components/gruppenbesuche.css'

/** Wie weit zurück vergangene Besuche noch dastehen: zwei Monate, als Rückblick. */
const RUECKBLICK_WOCHEN = 8

/**
 * **Gruppenbesuche des Dienstaufsehers** beim Planen (T120, Phase 2) — nur für
 * Planer.
 *
 * Oben der Besucher für neue Besuche und „Reihum verteilen", darunter die
 * Konflikte und die Besuche Monat für Monat. Jeder Besuch nennt seine
 * Treffpunkte (geladen oder laut Grundplan), seinen Besucher und dessen
 * Zusage — die Zusage gehört dem Treffpunkt, der Besuch zeigt sie nur.
 */
export function GruppenbesuchePlan() {
  const { state, dispatch } = useApp()
  const { t, tu } = useT()
  const tag = useKalendertag()

  // Wer einen Treffpunkt leiten darf, darf auch besuchen — ein eigener
  // Aufgabenbereich „Dienstaufseher" wäre eine zweite Pflege derselben Frage.
  const kandidaten = useMemo(
    () =>
      state.persons
        .filter((p) => isQualified(p, 'treffpunkt'))
        .sort((a, b) => displayName(a).localeCompare(displayName(b), state.lang)),
    [state.persons, state.lang],
  )

  // Vorgabe: der Besucher des jüngsten Besuchs — gespeichert wird sie nicht,
  // der Plan selbst trägt sie. Nur, wenn er noch Treffpunkte leiten darf.
  const juengster = [...state.gruppenbesuche].reverse().find((b) => b.pid !== null)
  const vorgabe = kandidaten.some((p) => p.id === juengster?.pid) ? (juengster?.pid ?? '') : ''
  const [besucher, setBesucher] = useState(vorgabe)

  const eintraege = useMemo(() => {
    const lage = {
      kennungen: state.weeks.map((w) => w.start),
      fsWeeks: state.fsWeeks,
      fsRules: state.fsRules,
      absences: state.absences,
    }
    const heute = fromIso(tag)
    const ab = montagNach(montagDerWoche(heute), -RUECKBLICK_WOCHEN)
    return state.gruppenbesuche
      .map((besuch) => ({ besuch, stand: besuchStand(besuch, lage, heute) }))
      .filter(({ besuch, stand }) => stand.art !== 'vorbei' || besuch.woche >= ab)
  }, [state.weeks, state.fsWeeks, state.fsRules, state.absences, state.gruppenbesuche, tag])

  const konflikte = eintraege.filter(({ besuch, stand }) => besuchHatKonflikt(besuch, stand))

  /** Was an einem Besuch nicht aufgeht — dieselben Sätze im Banner und an der Zeile. */
  const probleme = (besuch: Gruppenbesuch, stand: BesuchsStand): string[] => {
    if (stand.art === 'vorbei') return []
    const out: string[] = []
    if (besuch.pid === null) out.push(t.gbBesucherWaehlen)
    if (stand.abwesend) out.push(fill(t.toastAbsentP, { name: besucherName(besuch, state.persons) }))
    if (stand.art === 'keinTreffpunkt') out.push(t.gbKeinTreffpunkt)
    if (stand.art === 'andererLeiter') out.push(fill(t.gbAndererLeiter, { name: stand.andererLeiter ?? '' }))
    if (stand.art === 'offen') out.push(t.gbOffen)
    return out
  }

  // „Besuch hinzufügen": die Wochen des nächsten halben Jahres, ab dieser.
  const dieseWoche = montagDerWoche(fromIso(tag))
  const wochen = Array.from({ length: VERTEILEN_MONATE * 5 }, (_unused, i) => montagNach(dieseWoche, i))
  const [neueWoche, setNeueWoche] = useState(dieseWoche)
  const [neueGruppe, setNeueGruppe] = useState(state.groups[0]?.id ?? '')

  return (
    <>
      <div className="panel panel--pb16" data-farbe="neutral">
        <h2 className="panel-label">{t.gbTitel}</h2>
        <p className="panel-hint">{t.gbWirkung}</p>
        <label className="gb-besucher">
          <span className="gb-feld">{t.gbBesucher}</span>
          <select className="fs-select" value={besucher} onChange={(e) => setBesucher(e.target.value)}>
            <option value="">{t.gbBesucherWaehlen}</option>
            {kandidaten.map((p) => (
              <option key={p.id} value={p.id}>
                {displayName(p)}
              </option>
            ))}
          </select>
        </label>
        <p className="panel-hint">{t.gbBesucherHint}</p>
      </div>

      <div className="plan-auto">
        <AutoAssignRow
          label={t.fsGruppenbesucheTab}
          aktion={t.gbVerteilen}
          bereit={besucher !== ''}
          automatisch={() => besucher && dispatch({ type: 'besucheVerteilen', pid: besucher })}
          leeren={() => dispatch({ type: 'besucheLeeren' })}
        />
      </div>
      <p className="plan-hint">{t.gbVerteilenHint}</p>
      {/* Die Punkte an den Besuchern sind die Zusagen ihrer Treffpunkte. */}
      <ZusageLegende />

      {konflikte.length > 0 && (
        <div className="plan-banner-box plan-conflicts">
          <BannerKopf zeichen="!" titel={t.konflikteTitle} anzahl={konflikte.length} />
          {konflikte.map(({ besuch, stand }) => (
            <div key={besuch.id} className="plan-conflict-row">
              <span className="plan-conflict-dot" data-kind="absent" />
              <span className="plan-conflict-text">
                {[besuchsWocheText(besuch.woche, state.lang), besuchsGruppe(besuch, state.groups, tu), ...probleme(besuch, stand)].join(' · ')}
              </span>
            </div>
          ))}
        </div>
      )}

      {eintraege.length === 0 && (
        <div className="panel panel--lead panel--pb16" data-farbe="gold">
          <p className="prog-meta">{t.gbLeer}</p>
        </div>
      )}

      {nachMonat(eintraege).map(({ monat, eintraege: imMonat }) => (
        <div key={monat} className="panel" data-farbe="gold">
          <h2 className="panel-label">{monatText(monat, state.lang)}</h2>
          {imMonat.map(({ besuch, stand }) => (
            <BesuchZeile
              key={besuch.id}
              besuch={besuch}
              stand={stand}
              probleme={probleme(besuch, stand)}
              kandidaten={kandidaten}
            />
          ))}
        </div>
      ))}

      <div className="panel panel--pb16 fs-add" data-farbe="neutral2">
        <h2 className="panel-label">{t.gbHinzufuegen}</h2>
        <div className="fs-add-grid">
          <select className="fs-select" value={neueWoche} aria-label={t.gbWoche} onChange={(e) => setNeueWoche(e.target.value)}>
            {wochen.map((w) => (
              <option key={w} value={w}>
                {besuchsWocheText(w, state.lang)}
              </option>
            ))}
          </select>
          <select className="fs-select" value={neueGruppe} aria-label={t.gbGruppe} onChange={(e) => setNeueGruppe(e.target.value)}>
            {state.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {tu(g.name)}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="fs-add-btn"
          disabled={!besucher || !neueGruppe}
          onClick={() => dispatch({ type: 'besuchHinzufuegen', woche: neueWoche, grp: neueGruppe, pid: besucher })}
        >
          {t.hinzufuegen}
        </button>
      </div>
    </>
  )
}

/** Ein Besuch: Woche und Gruppe, seine Treffpunkte, der Besucher und was zu tun ist. */
function BesuchZeile({
  besuch,
  stand,
  probleme,
  kandidaten,
}: {
  besuch: Gruppenbesuch
  stand: BesuchsStand
  probleme: string[]
  kandidaten: readonly Person[]
}) {
  const { state, dispatch } = useApp()
  const { t, tu } = useT()
  const vorbei = stand.art === 'vorbei'
  // Darf der eingesetzte Besucher inzwischen keine Treffpunkte mehr leiten,
  // steht er trotzdem zur Wahl — sonst zeigte das Feld „Besucher wählen", als
  // gäbe es keinen.
  const eingesetzt = state.persons.find((p) => p.id === besuch.pid)
  const wahl = eingesetzt && !kandidaten.includes(eingesetzt) ? [...kandidaten, eingesetzt] : kandidaten
  // Die Zusage des Besuchers: die seines (ersten) Treffpunkts — sie steht dort.
  const eigener = stand.treffpunkte.find((inst) => inst.lpid && inst.lpid === besuch.pid)
  const zusage = eigener && !vorbei ? zusageStatus(state.confirmations, fsTaskKey(besuch.woche, eigener.id)) : null

  return (
    <div className={vorbei ? 'gb-zeile is-vorbei' : 'gb-zeile'}>
      <div className="gb-kopf">
        <span className="gb-woche">{besuchsWocheText(besuch.woche, state.lang)}</span>
        <span className="gb-gruppe">{besuchsGruppe(besuch, state.groups, tu)}</span>
        {!vorbei && (
          <button
            type="button"
            className="fs-remove"
            aria-label={t.a11yRemove}
            onClick={() => dispatch({ type: 'besuchEntfernen', id: besuch.id })}
          >
            ✕
          </button>
        )}
      </div>
      {stand.treffpunkte.map((inst) => (
        <div key={inst.id} className="gb-treffpunkt" dir="auto">
          {besuchsTreffpunktText(besuch.woche, inst, state.lang, tu)}
        </div>
      ))}
      <div className="gb-besucher-zeile">
        {vorbei ? (
          <span className="gb-name">{besucherName(besuch, state.persons)}</span>
        ) : (
          <select
            className="fs-select"
            value={besuch.pid ?? ''}
            aria-label={t.gbBesucher}
            onChange={(e) => e.target.value && dispatch({ type: 'besuchBesucher', id: besuch.id, pid: e.target.value })}
          >
            <option value="">{t.gbBesucherWaehlen}</option>
            {wahl.map((p) => (
              <option key={p.id} value={p.id}>
                {displayName(p)}
              </option>
            ))}
          </select>
        )}
        {zusage && (
          <span className="gb-zusage">
            <ZusagePunkt stufe={zusage} />
            {t[ZUSAGE_LABEL[zusage]]}
          </span>
        )}
        {(stand.art === 'vorgemerkt' || vorbei) && (
          <span className="gb-marke" data-art={stand.art}>
            {vorbei ? t.gbVorbei : t.gbVorgemerkt}
          </span>
        )}
      </div>
      {stand.art === 'vorgemerkt' && <p className="gb-hinweis">{t.gbVorgemerktHint}</p>}
      {probleme.map((text) => (
        <p key={text} className="gb-problem">
          {text}
        </p>
      ))}
      {(stand.art === 'andererLeiter' || stand.art === 'offen') && besuch.pid && (
        <button
          type="button"
          className="btn-outline gb-aktion"
          onClick={() => dispatch({ type: 'besuchUebernehmen', id: besuch.id })}
        >
          {stand.art === 'andererLeiter' ? t.gbUebernehmen : t.gbEintragen}
        </button>
      )}
    </div>
  )
}
