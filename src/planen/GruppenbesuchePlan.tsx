import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useApp } from '../app/context'
import { useKalendertag } from '../app/useKalendertag'
import { BlattFeld } from '../bausteine/BlattFeld'
import { Zeichen } from '../bausteine/Zeichen'
import { datumsFormat, wochenSpanne } from '../components/datum-anzeige'
import { EntfernenKnopf } from '../components/EntfernenKnopf'
import {
  besuchsGruppe,
  besuchsTreffpunktText,
  besucherName,
} from '../components/gruppenbesuch-anzeige'
import { Sheet } from '../components/Sheet'
import { useBesuchsLage } from '../components/useBesuchsLage'
import { fsTag, fsTaskKey } from '../data/fs'
import {
  besuchStand,
  besuchsWochenAuswahl,
  besuchVorschlag,
  type BesuchsStand,
} from '../data/gruppenbesuche'
import { displayName, isQualified, personCompare } from '../data/helpers'
import { fromIso, montagNach, montagVon } from '../data/meeting-dates'
import { zusageStatus } from '../data/planning'
import { rechteVon } from '../data/rechte'
import type { Gruppenbesuch, Person } from '../data/types'
import type { Dict } from '../i18n/ui'
import { fill, useT } from '../i18n/useT'
import { ZUSAGE_LABEL } from './useZusage'
import '../components/gruppenbesuche.css'

/** Wie weit zurück vergangene Besuche noch dastehen: zwei Monate, als Rückblick. */
const RUECKBLICK_WOCHEN = 8

/** Welches Blatt offen ist: ein neuer Besuch oder der mit dieser Id. */
type Offen = 'neu' | { id: string } | null

/**
 * **Gruppenbesuche des Dienstaufsehers** beim Planen (T120, Phase 2; T121,
 * Entwurf `GGruppenbesuchePlanen`) — für Admin und Planer; der Planer wechselt
 * nur den Besucher (4.10.2026).
 *
 * Eine Karte mit den Besuchen, jeder eine Zeile: Woche, Tag und Zeit seines
 * Treffpunkts, was nicht aufgeht, rechts die Gruppe. Ein Tipp öffnet ihn;
 * darunter „Besuch hinzufügen". **Ohne Automatik** (13.10.2026: „der
 * dienstaufseher legt die besuche einfach selber manuell an … maximal 12
 * termine im jahr") — das Blatt schlägt nur vor (`besuchVorschlag`). „Takt",
 * „Reihenfolge" und „Reihum füllen" aus dem Entwurf entfallen damit, ebenso das
 * frühere „Reihum verteilen".
 */
export function GruppenbesuchePlan() {
  const { state } = useApp()
  const { t } = useT()
  const tag = useKalendertag()
  const lage = useBesuchsLage()
  const [offen, setOffen] = useState<Offen>(null)
  const schliessen = (): void => setOffen(null)
  // Besuche anlegen, verlegen und streichen ist der Plan — das tun Admin und
  // Planer (seit dem 15.10.2026; bis dahin wechselte der Planer nur den Besucher).
  const admin = rechteVon(state).zuteilen

  const eintraege = useMemo(() => {
    const heute = fromIso(tag)
    const ab = montagNach(montagVon(tag), -RUECKBLICK_WOCHEN)
    return state.gruppenbesuche
      .map((besuch) => ({ besuch, stand: besuchStand(besuch, lage, heute) }))
      .filter(({ besuch, stand }) => stand.art !== 'vorbei' || besuch.woche >= ab)
  }, [lage, state.gruppenbesuche, tag])

  return (
    <>
      <p className="klein-text">{t.gbWirkung}</p>
      <section className="karte gb-karte">
        <h2 className="gb-karte-titel">{t.gbAlle}</h2>
        {eintraege.length === 0 && <p className="gb-leer">{t.gbLeer}</p>}
        {eintraege.map(({ besuch, stand }) => (
          <BesuchZeile key={besuch.id} besuch={besuch} stand={stand} onOeffnen={() => setOffen({ id: besuch.id })} />
        ))}
        {admin && (
          <button type="button" className="gb-neu" onClick={() => setOffen('neu')}>
            <Zeichen name="plus" />
            {t.gbHinzufuegen}
          </button>
        )}
      </section>

      {/* Wie jedes Blatt beim Planen am Dokument, nicht im Fluss der Seite. */}
      {offen !== null &&
        createPortal(
          offen === 'neu' ? <NeuerBesuchBlatt onClose={schliessen} /> : <BesuchBlatt id={offen.id} onClose={schliessen} />,
          document.body,
        )}
    </>
  )
}

/** Was an einem Besuch nicht aufgeht — die Art und der Satz dazu. */
interface Problem {
  art: 'besucher' | 'abwesend' | 'keinTreffpunkt' | 'andererLeiter' | 'offen'
  text: string
}

/**
 * Was an einem Besuch nicht aufgeht — dieselben Sätze an der Zeile, im Blatt
 * und beim Anlegen. Vergangenes meldet nichts mehr.
 */
function probleme(
  besuch: Gruppenbesuch,
  stand: BesuchsStand,
  t: Pick<Dict, 'gbBesucherWaehlen' | 'toastAbsentP' | 'gbKeinTreffpunkt' | 'gbAndererLeiter' | 'gbOffen'>,
  persons: readonly Person[],
): Problem[] {
  if (stand.art === 'vorbei') return []
  const out: Problem[] = []
  if (besuch.pid === null) out.push({ art: 'besucher', text: t.gbBesucherWaehlen })
  if (stand.abwesend) out.push({ art: 'abwesend', text: fill(t.toastAbsentP, { name: besucherName(besuch, persons) }) })
  if (stand.art === 'keinTreffpunkt') out.push({ art: 'keinTreffpunkt', text: t.gbKeinTreffpunkt })
  if (stand.art === 'andererLeiter') {
    out.push({ art: 'andererLeiter', text: fill(t.gbAndererLeiter, { name: stand.andererLeiter ?? '' }) })
  }
  if (stand.art === 'offen') out.push({ art: 'offen', text: t.gbOffen })
  return out
}

/** Die Sätze untereinander, in der Farbe der Probleme. */
function ProblemListe({ liste }: { liste: readonly Problem[] }) {
  return liste.map((p) => (
    <p key={p.art} className="gb-problem">
      {p.text}
    </p>
  ))
}

/** Wer besuchen darf: wer Treffpunkte leiten darf — ein eigener Aufgabenbereich wäre eine zweite Pflege derselben Frage. */
function useBesucher(): Person[] {
  const { state } = useApp()
  return useMemo(
    () => state.persons.filter((p) => isQualified(p, 'treffpunkt')).sort((a, b) => personCompare(a, b, state.lang)),
    [state.persons, state.lang],
  )
}

/**
 * Ein Besuch als Zeile: Woche, Tag und Uhrzeit seines (ersten) Treffpunkts —
 * vorgemerkt, wenn die Woche noch nicht geladen ist —, darunter der erste
 * Satz dessen, was nicht aufgeht; rechts die Gruppe. Ein vergangener steht nur
 * noch da, zum Ändern gibt es nichts mehr.
 */
function BesuchZeile({
  besuch,
  stand,
  onOeffnen,
}: {
  besuch: Gruppenbesuch
  stand: BesuchsStand
  onOeffnen: () => void
}) {
  const { state } = useApp()
  const { t, tu } = useT()
  const vorbei = stand.art === 'vorbei'
  const erster = stand.treffpunkte[0]
  const datum = erster ? fsTag(besuch.woche, erster.wd) : null
  const termin = [datum ? datumsFormat(state.lang, 'kurzerTag').format(datum) : '', erster?.time ?? '']
  const marke = vorbei ? t.gbVorbei : stand.art === 'vorgemerkt' ? t.gbVorgemerkt : ''
  const unterzeile = [...termin, marke].filter(Boolean).join(' · ')
  const problem = probleme(besuch, stand, t, state.persons)[0]

  const inhalt = (
    <>
      <span className="gb-zeile-text">
        <span className="gb-zeile-woche">{wochenSpanne(besuch.woche, state.lang)}</span>
        {unterzeile && <span className="klein-text">{unterzeile}</span>}
        {problem && <span className="gb-problem">{problem.text}</span>}
      </span>
      <span className="gb-gruppe-pille">{besuchsGruppe(besuch, state.groups, tu)}</span>
    </>
  )
  if (vorbei) return <div className="gb-zeile is-vorbei">{inhalt}</div>
  return (
    <button type="button" className="gb-zeile" onClick={onOeffnen}>
      {inhalt}
      <Zeichen name="weiter" />
    </button>
  )
}

/** Die Woche eines Besuchs — gesperrt, was es für die Gruppe schon gibt. */
function WocheFeld({
  wochen,
  value,
  gesperrt,
  onChange,
}: {
  wochen: readonly string[]
  value: string
  gesperrt: (woche: string) => boolean
  onChange: (woche: string) => void
}) {
  const { state } = useApp()
  const { t } = useT()
  return (
    <BlattFeld marke={t.gbWoche}>
      <select className="feld-wahl" value={value} onChange={(e) => onChange(e.target.value)}>
        {wochen.map((w) => (
          <option key={w} value={w} disabled={gesperrt(w)}>
            {wochenSpanne(w, state.lang)}
          </option>
        ))}
      </select>
    </BlattFeld>
  )
}

/** Die besuchte Gruppe — gesperrt, was in dieser Woche schon besucht wird. */
function BesuchsGruppeFeld({
  value,
  gesperrt,
  onChange,
}: {
  value: string
  gesperrt: (grp: string) => boolean
  onChange: (grp: string) => void
}) {
  const { state } = useApp()
  const { t, tu } = useT()
  return (
    <BlattFeld marke={t.gbGruppe}>
      <select className="feld-wahl" value={value} onChange={(e) => onChange(e.target.value)}>
        {state.groups.map((g) => (
          <option key={g.id} value={g.id} disabled={gesperrt(g.id)}>
            {tu(g.name)}
          </option>
        ))}
      </select>
    </BlattFeld>
  )
}

/** Der Besucher — „Besucher wählen" steht vorn, solange keiner gewählt ist. */
function BesucherFeld({
  value,
  wahl,
  onChange,
}: {
  value: string
  wahl: readonly Person[]
  onChange: (pid: string) => void
}) {
  const { t } = useT()
  return (
    <BlattFeld marke={t.gbBesucher}>
      <select className="feld-wahl" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t.gbBesucherWaehlen}</option>
        {wahl.map((p) => (
          <option key={p.id} value={p.id}>
            {displayName(p)}
          </option>
        ))}
      </select>
    </BlattFeld>
  )
}

/**
 * **Ein Besuch** — jede Änderung gilt gleich. Woche und Gruppe verlegt der
 * Admin (4.10.2026): Der Besucher geht dann aus den bisherigen Treffpunkten und
 * tritt in die neuen (`besuchAendern`); gesperrt ist, was es schon gibt, wie
 * es auch die Datenbank abweist. Den Besucher wechselt auch der Planer.
 * Darunter die Treffpunkte, die Zusage des Besuchers und was nicht aufgeht —
 * mit „Übernehmen" oder „Eintragen", wo der Besucher dort noch nicht leitet.
 */
function BesuchBlatt({ id, onClose }: { id: string; onClose: () => void }) {
  const { state, dispatch } = useApp()
  const { t, tu } = useT()
  const tag = useKalendertag()
  const lage = useBesuchsLage()
  const kandidaten = useBesucher()
  const besuch = state.gruppenbesuche.find((b) => b.id === id)
  // Anderswo entfernt: Das Blatt geht mit.
  if (!besuch) return null

  const stand = besuchStand(besuch, lage, fromIso(tag))
  // Woche und Gruppe verlegen und den Besuch streichen Admin und Planer.
  const verlegen = rechteVon(state).zuteilen
  const andere = state.gruppenbesuche.filter((b) => b.id !== id)
  // Darf der eingesetzte Besucher inzwischen keine Treffpunkte mehr leiten,
  // steht er trotzdem zur Wahl — sonst zeigte das Feld „Besucher wählen", als
  // gäbe es keinen.
  const eingesetzt = state.persons.find((p) => p.id === besuch.pid)
  const wahl = eingesetzt && !kandidaten.includes(eingesetzt) ? [...kandidaten, eingesetzt] : kandidaten
  // Die Zusage des Besuchers: die seines (ersten) Treffpunkts — sie steht dort.
  const eigener = stand.treffpunkte.find((inst) => inst.lpid && inst.lpid === besuch.pid)
  const zusage = eigener ? zusageStatus(state.confirmations, fsTaskKey(besuch.woche, eigener.id)) : null
  const aendern = (patch: { woche?: string; grp?: string }) => dispatch({ type: 'besuchAendern', id, patch })
  const titel = wochenSpanne(besuch.woche, state.lang)

  return (
    <Sheet label={titel} title={titel} sub={besuchsGruppe(besuch, state.groups, tu)} onClose={onClose}>
      <div className="sheet-inhalt blatt-felder">
        {verlegen && (
          <>
            <WocheFeld
              wochen={besuchsWochenAuswahl(montagVon(tag), besuch.woche)}
              value={besuch.woche}
              gesperrt={(w) => andere.some((b) => b.woche === w && b.grp === besuch.grp)}
              onChange={(woche) => aendern({ woche })}
            />
            <BesuchsGruppeFeld
              value={besuch.grp}
              gesperrt={(grp) => andere.some((b) => b.woche === besuch.woche && b.grp === grp)}
              onChange={(grp) => aendern({ grp })}
            />
          </>
        )}
        {/* „Besucher wählen" allein ändert nichts — ein Besuch ohne Besucher
            entsteht nur, wenn die Person gelöscht wird. */}
        <BesucherFeld
          value={besuch.pid ?? ''}
          wahl={wahl}
          onChange={(pid) => pid && dispatch({ type: 'besuchBesucher', id, pid })}
        />
        <div className="gb-stand">
          {stand.treffpunkte.map((inst) => (
            <p key={inst.id} className="klein-text" dir="auto">
              {besuchsTreffpunktText(besuch.woche, inst, state.lang, tu)}
            </p>
          ))}
          {zusage && <p className="klein-text">{t[ZUSAGE_LABEL[zusage]]}</p>}
          {stand.art === 'vorgemerkt' && <p className="klein-text">{t.gbVorgemerktHint}</p>}
          <ProblemListe liste={probleme(besuch, stand, t, state.persons)} />
        </div>
        {(stand.art === 'andererLeiter' || stand.art === 'offen') && besuch.pid && (
          <button
            type="button"
            className="knopf-umriss gb-aktion"
            onClick={() => dispatch({ type: 'besuchUebernehmen', id })}
          >
            {stand.art === 'andererLeiter' ? t.gbUebernehmen : t.gbEintragen}
          </button>
        )}
      </div>
      {verlegen && (
        <div className="sheet-fuss-ende">
          <EntfernenKnopf
            className="knopf-umriss knopf-entfernen"
            text={t.a11yRemove}
            onEntfernen={() => {
              dispatch({ type: 'besuchEntfernen', id })
              onClose()
            }}
          />
        </div>
      )}
    </Sheet>
  )
}

/**
 * **Besuch hinzufügen** — vorbelegt mit dem, was der Planer vermutlich eingibt
 * (`besuchVorschlag`): die Gruppe, die am längsten nicht dran war, die Woche
 * einen Monat nach dem letzten Besuch, dessen Besucher. Erst „Hinzufügen" legt
 * an; ohne Besucher und für eine Gruppe, die in der Woche schon besucht wird,
 * geht es nicht.
 */
function NeuerBesuchBlatt({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const tag = useKalendertag()
  const lage = useBesuchsLage()
  const kandidaten = useBesucher()
  const dieseWoche = montagVon(tag)
  const [vorschlag] = useState(() => besuchVorschlag(state.gruppenbesuche, state.groups, dieseWoche))
  const [woche, setWoche] = useState(vorschlag.woche)
  const [grp, setGrp] = useState(vorschlag.grp ?? '')
  // Der Besucher des letzten Besuchs — nur, wenn er noch Treffpunkte leiten darf.
  const [pid, setPid] = useState(kandidaten.some((p) => p.id === vorschlag.pid) ? (vorschlag.pid ?? '') : '')
  const besucht = (w: string, g: string): boolean => state.gruppenbesuche.some((b) => b.woche === w && b.grp === g)
  // Was auch nach dem Anlegen nicht aufginge — vorher gesagt statt danach
  // gefunden. Ein freier Treffpunkt füllt sich beim Anlegen, und ohne Besucher
  // ist der Knopf ohnehin gesperrt.
  const entwurf: Gruppenbesuch = { id: '', woche, grp, pid: pid || null }
  const hinweise = grp
    ? probleme(entwurf, besuchStand(entwurf, lage, fromIso(tag)), t, state.persons).filter(
        (p) => p.art !== 'offen' && p.art !== 'besucher',
      )
    : []

  const anlegen = () => {
    dispatch({ type: 'besuchHinzufuegen', woche, grp, pid })
    onClose()
  }

  return (
    <Sheet label={t.gbHinzufuegen} title={t.gbHinzufuegen} onClose={onClose}>
      <div className="sheet-inhalt blatt-felder">
        <WocheFeld
          wochen={besuchsWochenAuswahl(dieseWoche, vorschlag.woche)}
          value={woche}
          gesperrt={(w) => besucht(w, grp)}
          onChange={setWoche}
        />
        <BesuchsGruppeFeld value={grp} gesperrt={(g) => besucht(woche, g)} onChange={setGrp} />
        <BesucherFeld value={pid} wahl={kandidaten} onChange={setPid} />
        <ProblemListe liste={hinweise} />
      </div>
      <div className="sheet-fuss">
        <button type="button" className="knopf-haupt" disabled={!pid || !grp || besucht(woche, grp)} onClick={anlegen}>
          {t.hinzufuegenKnopf}
        </button>
        <button type="button" className="knopf-leise" onClick={onClose}>
          {t.abbrechen}
        </button>
      </div>
    </Sheet>
  )
}
