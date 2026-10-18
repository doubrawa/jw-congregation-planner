import { useId, useMemo, useState, type ReactNode } from 'react'
import { useApp, type AppState } from '../app/context'
import { useAbwesend } from '../app/useAbwesend'
import { Punkt } from '../bausteine/Punkt'
import { abwesendText } from '../components/abwesenheit-anzeige'
import { datumsFormat } from '../components/datum-anzeige'
import { EntfernenKnopf } from '../components/EntfernenKnopf'
import { Sheet } from '../components/Sheet'
import { nameTrifft } from '../components/suche'
import { LOAD_WEEKS } from '../data/auslastung'
import { dauerAbtrennen, herkunftVon, isSong, ROLE_GUEST_SPEAKER, ROLE_OWN_SPEAKER, rolleBasis } from '../data/helpers'
import { meetingDate } from '../data/meeting-dates'
import { platzDerAuswahl } from '../data/plaetze'
import { buildS89ForSlot } from '../data/planning'
import { rechteVon } from '../data/rechte'
import type { S89Payload, SlotAssignment, SlotSelection, Week } from '../data/types'
import { wochenHer } from '../i18n/relative-time'
import { fill, platzName, useProgWeek, useT, zuteilungenText, type I18n } from '../i18n/useT'
import { kandidaten, type Candidate } from './kandidaten'
import { auswahlImPlan } from './planen-raster'
import { useAktuellerPlatz, type AktuellerPlatz } from './useAktuellerPlatz'
import '../components/overlays.css'
import './planen.css'

/**
 * **Zuteilen** (T121, Entwurf `GZuteilen`): wer den Platz übernimmt. Oben, wer
 * ihn gerade hat und wie es um ihn steht — dieselbe Lage wie seine Zeile im
 * Plan —, darunter die Suche und alle, die ihn übernehmen können.
 *
 * Zuerst steht der **Vorschlag**: die Person, die „Automatisch" hier nähme
 * (`rangfolgeFuer`), die übrigen in derselben Ordnung. Jede Zeile sagt, was
 * für oder gegen die Person spricht — abwesend, an diesem Tag schon dran,
 * sonst wann zuletzt in diesem Bereich —, rechts die Punkte der Auslastung.
 * Abwesende stehen am Ende und lassen sich nicht wählen.
 */
export function AssignSheet({ sel }: { sel: SlotSelection }) {
  const { dispatch } = useApp()
  const kopf = useZuteilenKopf(sel)
  const close = () => dispatch({ type: 'closeSlot' })
  return (
    <Sheet
      label={kopf.label}
      eyebrow={kopf.abschnitt && <AbschnittMarke {...kopf.abschnitt} />}
      title={kopf.titel}
      sub={kopf.sub}
      onClose={close}
    >
      <ZuteilenInhalt sel={sel} onClose={close} />
    </Sheet>
  )
}

/**
 * **Zuteilen am Desktop** (T121, Entwurf `GDesktopPlanen`): kein Blatt über
 * dem Plan, sondern eine Spalte daneben — der Plan bleibt sichtbar, und ein
 * Klick auf den nächsten Platz wechselt nur, was hier steht. Derselbe Kopf und
 * derselbe Inhalt wie im Blatt.
 *
 * Gezeigt wird nur ein Platz des Plans, der gerade zu sehen ist — derselben
 * Woche und Zusammenkunft, beim Predigtdienst ein Treffpunkt der Woche
 * (`auswahlImPlan`). Nach einem Wechsel stünde sonst ein Platz da, den man
 * nirgends sieht.
 */
export function ZuteilenSpalte() {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const sel = state.slotSel
  const sichtbar = auswahlImPlan(state, sel) ? sel : null
  return (
    <aside className="zuteilen-spalte" aria-label={t.spurZuteilen}>
      {sichtbar ? (
        // Je Platz frisch: Suche und Freitext gehören dem Platz, nicht der Spalte.
        <SpaltenInhalt key={JSON.stringify(sichtbar)} sel={sichtbar} onClose={() => dispatch({ type: 'closeSlot' })} />
      ) : (
        <p className="zuteilen-leer">{t.zuteilenLeer}</p>
      )}
    </aside>
  )
}

function SpaltenInhalt({ sel, onClose }: { sel: SlotSelection; onClose: () => void }) {
  const kopf = useZuteilenKopf(sel)
  return (
    <>
      <div className="zuteilen-spalte-kopf">
        {kopf.abschnitt && <AbschnittMarke {...kopf.abschnitt} />}
        <h2 className="sheet-title">{kopf.titel}</h2>
        {kopf.sub && <div className="sheet-sub">{kopf.sub}</div>}
      </div>
      <ZuteilenInhalt sel={sel} onClose={onClose} fokusAufSuche />
    </>
  )
}

/** Der Abschnitt über dem Titel, in der Farbe des Arbeitshefts. */
function AbschnittMarke({ name, farbe }: { name: string; farbe?: string }) {
  return (
    <div className="sheet-marke zuteilen-abschnitt" data-farbe={farbe}>
      {name}
    </div>
  )
}

interface Kopf {
  /** Was ein Vorleseprogramm ansagt: Punkt und Rolle. */
  label: string
  titel: ReactNode
  /** Tag und Dauer, beim Treffpunkt Zeit und Ort. */
  sub: string
  /** Der Abschnitt über dem Titel, in seiner Farbe — nur bei Programmpunkten. */
  abschnitt?: { name: string; farbe?: string }
}

/**
 * Der Kopf des Blatts: der Abschnitt, der Punkt mit seiner Nummer, der Tag und
 * die Dauer. Titel und Abschnitt in der Sprache des Programms (`useProgWeek`,
 * wie im Plan), Rolle und Raum in der des Lesers.
 */
function useZuteilenKopf(sel: SlotSelection): Kopf {
  const { state } = useApp()
  const { t, tp, tu } = useT()
  const rawWeek = state.weeks[sel.wi]
  const { week, tpw } = useProgWeek(rawWeek)
  const rolle = sel.labelRolle ? tu(sel.labelRolle) : ''
  const mitRolle = (titel: string) => [titel, rolle].filter(Boolean).join(' · ')

  if (sel.kind === 'fs') {
    const inst = state.fsWeeks[sel.wi]?.find((i) => i.id === sel.instId)
    const label = mitRolle(tu(sel.label))
    // Der Ort ist frei und darf fehlen — dann nur die Zeit, ohne Punkt am Ende.
    return { label, titel: label, sub: inst ? [inst.time, tu(inst.place).trim()].filter(Boolean).join(' · ') : '' }
  }

  const datum = rawWeek ? datumsFormat(state.lang, 'tag').format(meetingDate(rawWeek, sel.tab, state.congregation.times)) : ''
  if (sel.kind !== 'part') {
    const label = mitRolle(tu(sel.label))
    return {
      label,
      titel: label,
      sub: datum,
      abschnitt: sel.kind === 'helper' ? { name: t.hilfsdienste } : undefined,
    }
  }

  const section = week?.[sel.tab].sections[sel.si]
  const roh = section?.items[sel.ii]
  const item = roh && !isSong(roh) ? roh : undefined
  const label = mitRolle(item ? tpw(item.title) : tp(sel.label))
  const dauer = item ? dauerAbtrennen(item.meta ?? '', item.mins).dauer : null
  return {
    label,
    titel: (
      <>
        {item?.num != null && <span className="prog-num">{item.num} </span>}
        {label}
      </>
    ),
    sub: [datum, dauer ? tpw(dauer) : ''].filter(Boolean).join(' · '),
    abschnitt: section ? { name: tpw(section.label), farbe: section.farbe } : undefined,
  }
}

/**
 * Der Inhalt des Blatts — ohne die Hülle, damit ihn am Desktop auch die
 * Spalte neben dem Programm zeigen kann.
 *
 * `fokusAufSuche`: In der Spalte geht der Fokus nach dem Klick auf einen Platz
 * gleich in die Suche — man tippt den Namen, statt sich mit der Tabulatortaste
 * durch das ganze Programm bis hierher zu arbeiten. Im Blatt nicht: Am Handy
 * schöbe das Feld die Tastatur vor die Liste.
 */
function ZuteilenInhalt({
  sel,
  onClose,
  fokusAufSuche = false,
}: {
  sel: SlotSelection
  onClose: () => void
  fokusAufSuche?: boolean
}) {
  const { state, dispatch } = useApp()
  const abwesend = useAbwesend()
  const i18n = useT()
  const { t, tu } = i18n
  const sucheId = useId()
  const [suche, setSuche] = useState('')
  const aktuell = useAktuellerPlatz(sel)
  const current = aktuell?.name ?? ''
  const s89 = sel.kind === 'fs' ? null : buildS89ForSlot(state.weeks, sel, state.congregation.times)

  // Redner-Platz des öffentlichen Vortrags. Er kann **zweierlei** sein, und der
  // Planer entscheidet es Woche für Woche (T29):
  //
  //   Freitext eintragen  → auswärtiger Redner („Gastredner · Vers. Nordheim")
  //   Person antippen     → eigener Redner (Rolle „Redner" + pid)
  //
  // Die Wahl **ist** der Schalter — es braucht keinen zusätzlichen Umschalter.
  // Das Blatt zeigt beides untereinander, also führt jeder Weg in den jeweils
  // anderen Zustand zurück.
  const guest = sel.kind === 'part' && Boolean(sel.guest)
  /** Der Platz, um den es hier geht — nur bei Programmpunkten. */
  const slotJetzt = (): SlotAssignment | undefined => {
    if (sel.kind !== 'part') return undefined
    const meeting = state.weeks[sel.wi]?.[sel.tab]
    return meeting && platzDerAuswahl(meeting, state.services, sel)?.slot
  }
  const rolleJetzt = rolleBasis(slotJetzt()?.rolle)
  const eigenerRedner = rolleJetzt === ROLE_OWN_SPEAKER
  // Basis-Rolle für den Freitext-Weg. Steht dort gerade ein eigener Redner,
  // führt der Freitext zurück zum Gastredner — „Redner" mit Freitext wäre ein
  // Widerspruch: eine Person der eigenen Versammlung ohne pid.
  const guestBase = !rolleJetzt || eigenerRedner ? ROLE_GUEST_SPEAKER : rolleJetzt
  // Beim eigenen Redner bleiben die Freitext-Felder leer: der Name gehört einer
  // Person, nicht einem Gast. Vorbelegt wäre er ein Angebot, ihn zu verdoppeln.
  const [guestName, setGuestName] = useState(guest && !eigenerRedner ? current : '')
  const [guestCong, setGuestCong] = useState(guest && !eigenerRedner ? herkunftVon(slotJetzt()) : '')

  const applyGuest = () => {
    const name = guestName.trim()
    if (!name) {
      dispatch({ type: 'showToast', text: t.toastNameEingeben })
      return
    }
    // Herkunft als eigenes Feld: an die Rolle gehängt stünde ein
    // Versammlungsname mitten in dem Feld, über das die Regeln entscheiden.
    dispatch({ type: 'assign', name, rolle: guestBase, herkunft: guestCong.trim() })
  }

  // Treffpunkt-Leiter: derselbe Doppelweg wie beim Redner, aus demselben Grund
  // — den Treffpunkt der Dienstwoche leitet in der Regel der Kreisaufseher, und
  // der steht in keiner Personenliste. Nur ein Feld statt zweier: eine
  // Herkunftsversammlung hat er nicht, und Zeit und Ort stehen schon im Kopf.
  const fsFrei = sel.kind === 'fs'
  const fsInst = sel.kind === 'fs' ? state.fsWeeks[sel.wi]?.find((i) => i.id === sel.instId) : undefined
  // Vorbelegt nur, wenn dort schon Freitext steht. Gehört der Name einer
  // Person, wäre er hier ein Angebot, sie zu verdoppeln (wie beim Redner).
  const [externName, setExternName] = useState(fsInst?.lext ? current : '')
  const applyExtern = () => {
    const name = externName.trim()
    if (!name) {
      dispatch({ type: 'showToast', text: t.toastNameEingeben })
      return
    }
    dispatch({ type: 'assign', name, extern: true })
  }

  /*
   * **Gemerkt, nicht bei jedem Render neu.** Die Liste rechnet je Kandidat
   * Auslastung, Rangfolge und „zuletzt" über die geladenen Wochen — bei 300
   * Personen weit über hunderttausend Schritte. Ohne `useMemo` liefe das bei
   * jedem Buchstaben in der Suche und in den Freitext-Feldern.
   *
   * Neu gerechnet wird nur, wenn sich eines der Felder ändert, die sie liest
   * (`KandidatenDaten`) — nicht bei jedem Toast. Fehlt hier ein Feld, das dazu
   * kommt, meldet es der Typ.
   */
  const { weeks, persons, groups, services, fsWeeks, absences, lang, congregation } = state
  const candidates = useMemo(
    () => kandidaten({ weeks, persons, groups, services, fsWeeks, absences, lang, congregation }, sel, abwesend, t, tu),
    [weeks, persons, groups, services, fsWeeks, absences, lang, congregation, sel, abwesend, t, tu],
  )
  const gefiltert = suche.trim() ? candidates.filter((c) => nameTrifft(c.name, suche.trim())) : candidates
  const personen = !sel.groups && candidates.length > 0
  // Gezählt wird, wer den Bereich hat — am Redner-Platz stehen statt dessen
  // die Ältesten und Dienstamtgehilfen (`kandidaten`), dort fehlt die Zahl.
  const mitBereich = personen && !guest
  const mitLast = candidates.some((c) => c.last !== undefined)

  /*
   * Entfernen setzt den Redner-Platz auf seinen Ausgangszustand zurück
   * (`guestBase` ist beim eigenen Redner „Gastredner"). Der leere Platz ist
   * damit wieder auswärtig — so kommt er aus dem Import, und so bleibt er von
   * der Auto-Zuteilung unberührt: den Redner vereinbart man, man verlost ihn
   * nicht.
   *
   * **Mit Rückfrage** (4.10.2026): Wer zugesagt hatte, bekommt sofort
   * „Zuteilung zurückgezogen" — ein Fehltipp ließe sich nicht zurückholen.
   */
  const freimachen = () =>
    dispatch(guest ? { type: 'assign', name: '', rolle: guestBase } : { type: 'assign', name: '' })

  const pick = (cand: Candidate) => {
    if (cand.absent) {
      dispatch({ type: 'showToast', text: fill(t.toastAbsentP, { name: cand.name }) })
      return
    }
    // Redner-Platz: eine Person aus dieser Liste ist per Definition eine der
    // eigenen Versammlung — die Zuteilung wird damit zum **eigenen Redner**.
    // Rolle „Redner" und `pid`; die fremde Herkunftsversammlung fällt weg.
    // Alles Weitere folgt daraus von selbst, weil „Redner" nicht in
    // `SKIP_ROLE` steht: Aufgabe, Bestätigung, Erinnerung, Auslastung.
    //
    // pid nur für echte Personen (nicht für die Gruppen-Rotation).
    dispatch(
      guest
        ? { type: 'assign', name: cand.assignName, rolle: ROLE_OWN_SPEAKER, pid: cand.key }
        : { type: 'assign', name: cand.assignName, pid: sel.groups ? undefined : cand.key },
    )
  }

  return (
    <>
      {aktuell && (
        <AktuellKarte
          aktuell={aktuell}
          gruppe={sel.groups}
          s89={s89}
          onS89={(payload) => dispatch({ type: 'openS89', payload })}
          onEntfernen={freimachen}
        />
      )}

      {guest && (
        <div className="sheet-guest">
          <input
            type="text"
            dir="auto"
            className="feld"
            placeholder={t.rednerNamePh}
            aria-label={t.rednerNamePh}
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
          />
          <input
            type="text"
            dir="auto"
            className="feld"
            placeholder={t.rednerVersPh}
            aria-label={t.rednerVersPh}
            value={guestCong}
            onChange={(e) => setGuestCong(e.target.value)}
          />
          <button type="button" className="knopf-pille" onClick={applyGuest}>
            {t.uebernehmenBtn}
          </button>
        </div>
      )}

      {fsFrei && (
        <div className="sheet-guest">
          <input
            type="text"
            dir="auto"
            className="feld"
            placeholder={t.personNameLbl}
            aria-label={t.personNameLbl}
            value={externName}
            onChange={(e) => setExternName(e.target.value)}
          />
          <button type="button" className="knopf-pille" onClick={applyExtern}>
            {t.uebernehmenBtn}
          </button>
        </div>
      )}

      {/* Wo es auch einen Freitext gibt, ist die Liste der andere Weg — und
          sagt das, statt noch einmal zu fragen, wer übernimmt. */}
      {personen && (
        <div className="zuteilen-suche">
          <label className="feld-marke" htmlFor={sucheId}>
            {guest || fsFrei ? t.oderPersonWaehlen : t.werUebernimmt}
          </label>
          <input
            id={sucheId}
            type="search"
            dir="auto"
            className="feld"
            placeholder={t.nameSuchen}
            value={suche}
            autoFocus={fokusAufSuche}
            onChange={(e) => setSuche(e.target.value)}
          />
        </div>
      )}

      {(mitBereich || mitLast) && (
        <div className="zuteilen-zaehler">
          <span>{mitBereich ? fill(t.mitBereichN, { n: candidates.length }) : ''}</span>
          {mitLast && <span>{fill(t.aufgabenInWochen, { w: LOAD_WEEKS })}</span>}
        </div>
      )}

      <div className="zuteilen-liste">
        {sel.groups && candidates.length === 0 && <KeineGruppeZurWahl sel={sel} onClose={onClose} />}
        {gefiltert.map((cand) => (
          <KandidatZeile key={cand.key} cand={cand} week={state.weeks[sel.wi]} i18n={i18n} onClick={() => pick(cand)} />
        ))}
      </div>
    </>
  )
}

/**
 * **Keine Gruppe zur Wahl** an einem Gruppen-Platz (Reinigung).
 *
 * Ohne angelegte Gruppen blieb die Liste wortlos leer, während die
 * Auto-Zuteilung trotzdem „Gruppe 1…3" einträgt (feste Dreizahl in
 * planning.ts): Der Planer sah eine Zuteilung, die er nicht ändern konnte, und
 * nirgends einen Grund. Der Hinweis benennt mit `gruppenCard`, was fehlt, und
 * führt in die Einstellungen.
 *
 * Gibt es Gruppen, sind alle aus der Reinigung genommen (18.10.2026): Dann
 * steht „Gruppen: 0" da, wie unter der Reinigung in den Einstellungen, und der
 * Knopf öffnet gleich ihr Blatt (`openServiceSheet`) — dort schaltet man sie
 * wieder an. „Predigtdienstgruppen" hätte behauptet, es gäbe keine.
 *
 * Den Knopf bekommt nur, wer die Einstellungen sieht (`rechteVon`): Einen
 * Planer führte er ins Programm, Gruppen ändert nur der Admin (Review
 * 18.10.2026). Alle Texte gibt es schon in allen App-Sprachen.
 */
function KeineGruppeZurWahl({ sel, onClose }: { sel: SlotSelection; onClose: () => void }) {
  const { state, dispatch } = useApp()
  const { t, tu } = useT()
  const dienst = sel.kind === 'helper' && state.groups.length > 0 ? state.services.find((s) => s.key === sel.svc) : undefined
  const oeffnen = (): void => {
    onClose()
    dispatch(dienst ? { type: 'openServiceSheet', key: dienst.key } : { type: 'navigate', screen: 'einstellungen' })
  }
  return (
    <div className="sheet-empty">
      <div className="sheet-empty-label">{dienst ? fill(t.gruppenN, { n: 0 }) : t.gruppenCard}</div>
      {rechteVon(state).admin && (
        <button type="button" className="sheet-empty-action" onClick={oeffnen}>
          {dienst ? tu(dienst.name) : t.navEinstellungen} ›
        </button>
      )}
    </div>
  )
}

/**
 * Wer den Platz gerade hat: Punkt nach seiner Lage, der Name, darunter wie es
 * steht — bei einer Abwesenheit ihr Zeitraum. Daneben „Entfernen" (mit
 * Rückfrage) und bei einer Schulungsaufgabe der Weg zum S-89.
 */
function AktuellKarte({
  aktuell,
  gruppe,
  s89,
  onS89,
  onEntfernen,
}: {
  aktuell: AktuellerPlatz
  /** Der Platz rotiert unter den Gruppen (Reinigung) — dann steht dort ein Gruppenname. */
  gruppe: boolean
  s89: S89Payload | null
  onS89: (payload: S89Payload) => void
  onEntfernen: () => void
}) {
  const { state } = useApp()
  const i18n = useT()
  const { t } = i18n
  const { anzeige, abwesenheit } = aktuell
  const zeile = abwesenheit ? abwesendText(abwesenheit, t, state.lang) : (anzeige.hinweis ?? anzeige.status)
  const problem = anzeige.lage === 'problem'
  return (
    <div className="zuteilen-aktuell">
      <Punkt art={anzeige.lage} />
      <span className="zuteilen-aktuell-text">
        <span className="sr-only">{t.aktuellLbl} </span>
        <span className="zuteilen-name">{platzName(aktuell.name, gruppe, i18n)}</span>
        {zeile && <span className={problem ? 'zuteilen-info is-problem' : 'zuteilen-info'}>{zeile}</span>}
        {s89 && (
          <button type="button" className="verweis-leise zuteilen-s89" onClick={() => onS89(s89)}>
            {t.s89Open}
          </button>
        )}
      </span>
      <EntfernenKnopf
        className="knopf-pille zuteilen-entfernen"
        text={t.entfernen}
        frage={t.entfernenSicher}
        onEntfernen={onEntfernen}
      />
    </div>
  )
}

/** Ganze Klassennamen, damit eine Textsuche sie findet (`tests/css-klassen.test.ts`). */
const INFO_KLASSE = {
  problem: 'zuteilen-info is-problem',
  doppelt: 'zuteilen-info is-doppelt',
  leise: 'zuteilen-info',
} as const

/**
 * Was eine Zeile über die Person sagt — das Dringendste zuerst: abwesend
 * (mit Zeitraum), an diesem Tag schon dran, sonst wann zuletzt in diesem
 * Bereich und was am anderen Tag der Woche schon ansteht („So. Saalordner").
 * Wo es davon nichts gibt (Gruppen, Treffpunkte), die Stellung.
 */
function kandidatInfo(
  cand: Candidate,
  week: Week | undefined,
  i18n: I18n,
  { lang, congregation }: Pick<AppState, 'lang' | 'congregation'>,
): { text: string; ton: keyof typeof INFO_KLASSE } {
  const { t } = i18n
  if (cand.absent) {
    return { text: cand.abwesenheit ? abwesendText(cand.abwesenheit, t, lang) : t.abwesendChip, ton: 'problem' }
  }
  if (cand.today.length > 0) return { text: `${t.sheetSchonHeute}: ${zuteilungenText(cand.today, i18n)}`, ton: 'doppelt' }
  const teile: string[] = []
  if (cand.zuletzt === null) teile.push(t.zuletztLange)
  else if (cand.zuletzt !== undefined) {
    const her = wochenHer(cand.zuletzt, lang)
    if (her) teile.push(fill(t.zuletztWann, { wann: her }))
  }
  if (cand.andererTag && week) {
    const tag = datumsFormat(lang, 'wochentagKurz').format(meetingDate(week, cand.andererTag.tab, congregation.times))
    teile.push(`${tag} ${zuteilungenText(cand.andererTag.aufgaben, i18n)}`)
  }
  return { text: teile.join(' · ') || cand.sub, ton: 'leise' }
}

function KandidatZeile({
  cand,
  week,
  i18n,
  onClick,
}: {
  cand: Candidate
  week: Week | undefined
  i18n: I18n
  onClick: () => void
}) {
  const { state } = useApp()
  const { t } = i18n
  const info = kandidatInfo(cand, week, i18n, state)
  return (
    <button type="button" className={cand.absent ? 'zuteilen-zeile is-abwesend' : 'zuteilen-zeile'} onClick={onClick}>
      <span className="zuteilen-zeile-text">
        <span className="zuteilen-name">
          {cand.name}
          {cand.vorschlag && <span className="zuteilen-vorschlag"> · {t.vorschlag}</span>}
        </span>
        <span className={INFO_KLASSE[info.ton]}>{info.text}</span>
      </span>
      {cand.last !== undefined && <LastPunkte n={cand.last} />}
    </button>
  )
}

/**
 * Die Auslastung als Punkte: so viele voll, wie die Person im Fenster
 * Aufgaben hat (`LOAD_WEEKS` Wochen um die geplante) — dieselbe Zahl, nach der
 * „Automatisch" sortiert. Für Vorleseprogramme als Satz mit der Zahl.
 */
function LastPunkte({ n }: { n: number }) {
  const { t } = useT()
  return (
    <span className="zuteilen-last" role="img" aria-label={fill(t.aufgabenInW, { n, w: LOAD_WEEKS })}>
      {Array.from({ length: LOAD_WEEKS }, (_, i) => (
        <span key={i} className={i < n ? 'zuteilen-last-punkt is-voll' : 'zuteilen-last-punkt'} />
      ))}
    </span>
  )
}
