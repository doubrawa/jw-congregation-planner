import { useMemo, useState } from 'react'
import { useApp } from '../app/context'
import { useKalendertag } from '../app/useKalendertag'
import { EntfernenKnopf } from '../components/EntfernenKnopf'
import {
  besuchsGruppe,
  besuchsMonatKurz,
  besuchsTreffpunktText,
  besuchsWocheText,
  besucherName,
  nachMonat,
} from '../components/gruppenbesuch-anzeige'
import { fsTaskKey } from '../data/fs'
import {
  besuchHatKonflikt,
  besuchStand,
  besuchsWochenAuswahl,
  verteilenMonate,
  vorgabeWochenende,
  WOCHENENDEN,
  type BesuchsStand,
  type Wochenende,
} from '../data/gruppenbesuche'
import { useBesuchsLage } from '../components/useBesuchsLage'
import { displayName, isQualified, personCompare } from '../data/helpers'
import { fromIso, montagNach, montagVon } from '../data/meeting-dates'
import { monatsName } from '../programm/druck'
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
      state.persons.filter((p) => isQualified(p, 'treffpunkt')).sort((a, b) => personCompare(a, b, state.lang)),
    [state.persons, state.lang],
  )

  // Vorgabe: der Besucher des jüngsten Besuchs — gespeichert wird sie nicht,
  // der Plan selbst trägt sie. Nur, wenn er noch Treffpunkte leiten darf.
  const juengster = [...state.gruppenbesuche].reverse().find((b) => b.pid !== null)
  const vorgabe = kandidaten.some((p) => p.id === juengster?.pid) ? (juengster?.pid ?? '') : ''
  const [besucher, setBesucher] = useState(vorgabe)

  // Das Wochenende folgt dem jüngsten Besuch, bis der Planer selbst wählt —
  // ein unten angelegter Besuch am dritten Wochenende setzt so die Vorgabe.
  const [wahlWochenende, setWahlWochenende] = useState<Wochenende | null>(null)
  const wochenende = wahlWochenende ?? vorgabeWochenende(state.gruppenbesuche)
  // Die Monate, die „Reihum verteilen" füllt — und welche davon es auslässt.
  const monate = verteilenMonate(state.gruppenbesuche, fromIso(tag))
  const [ausgelassen, setAusgelassen] = useState<readonly string[]>([])
  const umschalten = (monat: string): void =>
    setAusgelassen((liste) => (liste.includes(monat) ? liste.filter((m) => m !== monat) : [...liste, monat]))

  const lage = useBesuchsLage()
  const eintraege = useMemo(() => {
    const heute = fromIso(tag)
    const ab = montagNach(montagVon(tag), -RUECKBLICK_WOCHEN)
    return state.gruppenbesuche
      .map((besuch) => ({ besuch, stand: besuchStand(besuch, lage, heute) }))
      .filter(({ besuch, stand }) => stand.art !== 'vorbei' || besuch.woche >= ab)
  }, [lage, state.gruppenbesuche, tag])

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
  const dieseWoche = montagVon(tag)
  const wochen = besuchsWochenAuswahl(dieseWoche)
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
        <select
          className="fs-select gb-wochenende"
          value={String(wochenende)}
          aria-label={t.gbWochenende}
          onChange={(e) => setWahlWochenende(e.target.value === 'letztes' ? 'letztes' : (Number(e.target.value) as Wochenende))}
        >
          {WOCHENENDEN.map((w) => (
            <option key={w} value={String(w)}>
              {w === 'letztes' ? t.gbWochenendeLetztes : fill(t.gbWochenendeNr, { n: w })}
            </option>
          ))}
        </select>
        <div className="gb-monate" role="group" aria-label={t.gbMonate}>
          {monate.map((monat) => {
            const an = !ausgelassen.includes(monat)
            return (
              <button
                key={monat}
                type="button"
                className={an ? 'gb-monat is-an' : 'gb-monat'}
                aria-pressed={an}
                aria-label={monatsName(monat, state.lang)}
                onClick={() => umschalten(monat)}
              >
                {besuchsMonatKurz(monat, state.lang)}
              </button>
            )
          })}
        </div>
        <p className="panel-hint">{t.gbMonateHint}</p>
      </div>

      <div className="plan-auto">
        <AutoAssignRow
          label={t.fsGruppenbesucheTab}
          aktion={t.gbVerteilen}
          bereit={besucher !== ''}
          automatisch={() =>
            besucher &&
            dispatch({
              type: 'besucheVerteilen',
              pid: besucher,
              wochenende,
              auslassen: ausgelassen.filter((m) => monate.includes(m)),
            })
          }
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
          <h2 className="panel-label">{monatsName(monat, state.lang)}</h2>
          {imMonat.map(({ besuch, stand }) => (
            <BesuchZeile
              key={besuch.id}
              besuch={besuch}
              stand={stand}
              probleme={probleme(besuch, stand)}
              kandidaten={kandidaten}
              dieseWoche={dieseWoche}
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

/**
 * Ein Besuch: Woche und Gruppe, seine Treffpunkte, der Besucher und was zu tun ist.
 *
 * **Woche und Gruppe lassen sich ändern** (4.10.2026), solange der Besuch
 * kommt: Der Besucher geht dann aus den bisherigen Treffpunkten und tritt in
 * die neuen (`besuchAendern`). Was es für diese Gruppe schon gibt — dieselbe
 * Gruppe in einer anderen Woche desselben Besuchs —, steht gesperrt in der
 * Liste, wie es auch die Datenbank abweist.
 */
function BesuchZeile({
  besuch,
  stand,
  probleme,
  kandidaten,
  dieseWoche,
}: {
  besuch: Gruppenbesuch
  stand: BesuchsStand
  probleme: string[]
  kandidaten: readonly Person[]
  dieseWoche: string
}) {
  const { state, dispatch } = useApp()
  const { t, tu } = useT()
  const vorbei = stand.art === 'vorbei'
  const aendern = (patch: { woche?: string; grp?: string }) => dispatch({ type: 'besuchAendern', id: besuch.id, patch })
  const andere = state.gruppenbesuche.filter((b) => b.id !== besuch.id)
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
      {vorbei ? (
        <div className="gb-kopf">
          <span className="gb-woche">{besuchsWocheText(besuch.woche, state.lang)}</span>
          <span className="gb-gruppe">{besuchsGruppe(besuch, state.groups, tu)}</span>
        </div>
      ) : (
        <div className="gb-kopf gb-kopf--wahl">
          <div className="gb-wahl">
            <select
              className="fs-select"
              value={besuch.woche}
              aria-label={t.gbWoche}
              onChange={(e) => aendern({ woche: e.target.value })}
            >
              {besuchsWochenAuswahl(dieseWoche, besuch.woche).map((w) => (
                <option key={w} value={w} disabled={andere.some((b) => b.woche === w && b.grp === besuch.grp)}>
                  {besuchsWocheText(w, state.lang)}
                </option>
              ))}
            </select>
            <select
              className="fs-select"
              value={besuch.grp}
              aria-label={t.gbGruppe}
              onChange={(e) => aendern({ grp: e.target.value })}
            >
              {state.groups.map((g) => (
                <option key={g.id} value={g.id} disabled={andere.some((b) => b.woche === besuch.woche && b.grp === g.id)}>
                  {tu(g.name)}
                </option>
              ))}
            </select>
          </div>
          <EntfernenKnopf className="fs-remove" onEntfernen={() => dispatch({ type: 'besuchEntfernen', id: besuch.id })} />
        </div>
      )}
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
