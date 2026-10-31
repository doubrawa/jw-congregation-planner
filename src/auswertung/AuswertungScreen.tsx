import { useMemo, useState } from 'react'
import { useApp } from '../app/context'
import { useAbwesend } from '../app/useAbwesend'
import { useKalendertag } from '../app/useKalendertag'
import { Wahl } from '../bausteine/Wahl'
import { Zeichen, type ZeichenName } from '../bausteine/Zeichen'
import { UnteransichtKopf } from '../components/UnteransichtKopf'
import { gebundenesDatum, jahrZahl, monatsName, tageSpanne, zeitspanne } from '../components/datum-anzeige'
import { gruppenName } from '../components/weitere-plaene-anzeige'
import { useBackDismiss } from '../components/useBackDismiss'
import { DESKTOP_BREITE, TABLET_BREITE, useMedia } from '../components/useMedia'
import { auswerten, istEinseitig, istKnapp, ZEITRAEUME, type Auswertung, type Zeitraum } from '../data/auswertung'
import { displayName } from '../data/helpers'
import { fromIso, tagNach } from '../data/meeting-dates'
import { LOCALES } from '../i18n/langs'
import { fill, useT } from '../i18n/useT'
import { bereichsName, bereichsTeile } from '../personen/priv-label'
import { EinseitigKarten, EinseitigMatrix } from './EinseitigAnsicht'
import { EngpaesseAnsicht } from './EngpaesseAnsicht'
import { HinweisListe } from './Hinweise'
import { PersonAnsicht } from './PersonAnsicht'
import { VerteilungAnsicht } from './VerteilungAnsicht'
import { WartezeitenAnsicht } from './WartezeitenAnsicht'
import { WeiteresAnsicht } from './WeiteresAnsicht'
import { AnwesenheitAnsicht } from '../anwesenheit/AnwesenheitAnsicht'
import { useAnwesenheitMonate } from '../anwesenheit/useAnwesenheitMonate'
import type { Ansicht, Kontext } from './kontext'
import './auswertung.css'

/**
 * **Auswertung der Zuteilungen** (T126; Entwurf auf der Leinwand „Auswertung der
 * Zuteilungen", 16.10.2026; nur Admin und Planer, nicht druckbar).
 *
 * Am Handy der Überblick — Kennzahlen und was auffällt — und fünf Kacheln zu
 * den Unteransichten mit Zurück. Ab dem Tablet steht alles auf einer Seite, ab
 * dem Desktop mit der Tabelle Person × Bereich. Eine Person öffnet sich überall
 * als Unteransicht. Gerechnet wird in `data/auswertung.ts`; hier werden die
 * Zahlen zu Wörtern.
 *
 * Die Karte „Wie sich die Last verteilt" ist mit der Jahresprobe vom 18.10.2026
 * gegangen: Die zehn oberen lagen auf ihrer Erwartung — sie zeigte Struktur,
 * keinen Befund. An ihrer Stelle stehen die Engpässe.
 */
/** Wo jede Unteransicht ab dem Tablet auf der Seite steht — ein Hinweis rollt dorthin. */
const ANKER = {
  verteilung: 'aw-verteilung',
  einseitig: 'aw-einseitig',
  wartezeiten: 'aw-wartezeiten',
  engpaesse: 'aw-engpaesse',
  weiteres: 'aw-weiteres',
  anwesenheit: 'aw-anwesenheit',
} as const satisfies Record<Exclude<Ansicht, 'ueberblick'>, string>

export function AuswertungScreen() {
  const { state } = useApp()
  const { t, tu } = useT()
  const heute = useKalendertag()
  const abwesend = useAbwesend()
  const breit = useMedia(TABLET_BREITE)
  // Die Tabelle Person × Bereich braucht die Breite des Desktops: Am Tablet
  // passten vierzehn Bereiche nur mit Rollbalken — dort stehen die Karten.
  const desktop = useMedia(DESKTOP_BREITE)
  const [zeitraum, setZeitraum] = useState<Zeitraum>(12)
  const [ansicht, setAnsicht] = useState<Ansicht>('ueberblick')
  const [person, setPerson] = useState<string | null>(null)
  // Der Bereich der Wartezeiten — ein Hinweis „Lange Wartezeit" stellt ihn ein.
  const [warteBereich, setWarteBereich] = useState<string | null>(null)
  const unten = !breit && ansicht !== 'ueberblick'
  useBackDismiss(unten, () => setAnsicht('ueberblick'), 'unteransicht')
  useBackDismiss(person !== null, () => setPerson(null), 'unteransicht')

  const { weeks, fsWeeks, persons, services, groups, absagen, lang } = state
  const a = useMemo(
    () => auswerten({ weeks, fsWeeks, persons, services, groups, abwesend, absagen, heute, zeitraum }),
    [weeks, fsWeeks, persons, services, groups, abwesend, absagen, heute, zeitraum],
  )
  const k = useMemo<Kontext>(() => {
    const namen = new Map(persons.map((p) => [p.id, displayName(p)]))
    const zahl = new Intl.NumberFormat(LOCALES[lang] ?? lang, { maximumFractionDigits: 1 })
    const prozent = new Intl.NumberFormat(LOCALES[lang] ?? lang, { style: 'percent', maximumFractionDigits: 1 })
    return {
      a,
      t,
      lang,
      name: (pid) => namen.get(pid) ?? '',
      bereich: (key) => bereichsName(key, services, t, tu),
      bereichKurz: (key) => bereichsTeile(key, services, t, tu, true),
      gruppe: (id) => (id === null ? t.versammlungLbl : gruppenName(id, groups, tu)),
      dauer: (wochen) => zeitspanne(wochen, 'week', lang),
      zahl: (n) => zahl.format(n),
      datum: (iso) => gebundenesDatum(fromIso(iso), lang, 'tagMonatKurz'),
      monat: (iso) => monatsName(iso, lang),
      jahr: (iso) => jahrZahl(iso, lang),
      prozent: (anteil) => prozent.format(anteil),
      personOeffnen: setPerson,
      ansichtOeffnen: (ziel, bereich) => {
        if (bereich !== undefined) setWarteBereich(bereich)
        // Ab dem Tablet steht die Unteransicht schon auf der Seite: dorthin rollen.
        if (breit) document.getElementById(ANKER[ziel])?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
        else setAnsicht(ziel)
      },
    }
  }, [a, persons, services, groups, lang, t, tu, breit])
  const wartezeiten = <WartezeitenAnsicht k={k} bereich={warteBereich} onBereich={setWarteBereich} />
  // Die Anwesenheit je Monat (T152) — für die Ansicht und die Zahl der Kachel:
  // die Zusammenkünfte ohne Anwesende im Zeitraum. Einmal gerechnet, für beide.
  const anwesenheitMonate = useAnwesenheitMonate(zeitraum)
  const ohneZahl = anwesenheitMonate.reduce((n, m) => n + m.je.mid.fehlt.length + m.je.we.fehlt.length, 0)

  if (person !== null) {
    return (
      <section className="screen auswertung">
        <UnteransichtKopf titel={k.name(person)} onZurueck={() => setPerson(null)} />
        <ZeitraumZeile a={a} k={k} />
        <PersonAnsicht k={k} pid={person} weeks={weeks} fsWeeks={fsWeeks} zeiten={state.congregation.times} persons={persons} abwesend={abwesend} />
      </section>
    )
  }

  if (unten) {
    const titel: Record<Exclude<Ansicht, 'ueberblick'>, string> = {
      verteilung: t.awVerteilungTitel,
      einseitig: t.awEinseitigTitel,
      wartezeiten: t.awWartezeitenTitel,
      engpaesse: t.awEngpaesseTitel,
      weiteres: t.awWeiteresTitel,
      anwesenheit: t.awAnwesenheitTitel,
    }
    return (
      <section className="screen auswertung">
        <UnteransichtKopf titel={titel[ansicht]} onZurueck={() => setAnsicht('ueberblick')} />
        <ZeitraumZeile a={a} k={k} />
        {ansicht === 'verteilung' && <VerteilungAnsicht k={k} />}
        {ansicht === 'einseitig' && <EinseitigKarten k={k} />}
        {ansicht === 'wartezeiten' && wartezeiten}
        {ansicht === 'engpaesse' && <EngpaesseAnsicht k={k} />}
        {ansicht === 'weiteres' && <WeiteresAnsicht k={k} />}
        {ansicht === 'anwesenheit' && <AnwesenheitAnsicht monate={anwesenheitMonate} zahl={k.zahl} />}
      </section>
    )
  }

  const kopf = (
    <div className="aw-kopf">
      <h1 className="seitentitel seitentitel--gross">{t.navAuswertung}</h1>
      <div className="aw-zeitraum">
        <Wahl
          label={t.awZeitraum}
          optionen={ZEITRAEUME.map((m) => ({ wert: String(m) as `${Zeitraum}`, text: zeitspanne(m, 'month', lang) }))}
          wert={String(zeitraum) as `${Zeitraum}`}
          onWahl={(w) => setZeitraum(Number(w) as Zeitraum)}
        />
        <ZeitraumZeile a={a} k={k} />
      </div>
    </div>
  )

  if (a.grundlage.zusammenkuenfte === 0) {
    return (
      <section className="screen auswertung">
        {kopf}
        <p className="karte aw-leer">{t.awKeineDaten}</p>
      </section>
    )
  }

  if (!breit) {
    return (
      <section className="screen auswertung">
        {kopf}
        <Kennzahlen k={k} />
        <WasAuffaellt k={k} />
        <Kacheln k={k} zu={setAnsicht} ohneZahl={ohneZahl} />
        <p className="klein-text aw-fussnote">{t.awFussnote}</p>
      </section>
    )
  }

  return (
    <section className="screen auswertung auswertung--breit">
      {kopf}
      <Kennzahlen k={k} />
      <div className="aw-raster">
        <div className="aw-spalte">
          <WasAuffaellt k={k} />
          <section id={ANKER.engpaesse} className="aw-abschnitt" aria-label={t.awEngpaesseTitel}>
            <h2 className="abschnitt-titel">{t.awEngpaesseTitel}</h2>
            <EngpaesseAnsicht k={k} />
          </section>
        </div>
        <section id={ANKER.verteilung} className="aw-spalte" aria-label={t.awVerteilungTitel}>
          <h2 className="abschnitt-titel">{t.awVerteilungTitel}</h2>
          <VerteilungAnsicht k={k} />
        </section>
      </div>
      {desktop ? (
        <div id={ANKER.einseitig}>
          <EinseitigMatrix k={k} persons={persons} services={services} />
        </div>
      ) : (
        <section id={ANKER.einseitig} className="aw-abschnitt" aria-label={t.awEinseitigTitel}>
          <h2 className="abschnitt-titel">{t.awEinseitigTitel}</h2>
          <EinseitigKarten k={k} />
        </section>
      )}
      <div className="aw-raster">
        <section id={ANKER.wartezeiten} className="aw-spalte" aria-label={t.awWartezeitenTitel}>
          <h2 className="abschnitt-titel">{t.awWartezeitenTitel}</h2>
          {wartezeiten}
        </section>
        <section id={ANKER.weiteres} className="aw-spalte" aria-label={t.awWeiteresTitel}>
          <h2 className="abschnitt-titel">{t.awWeiteresTitel}</h2>
          <WeiteresAnsicht k={k} />
        </section>
      </div>
      <section id={ANKER.anwesenheit} className="aw-abschnitt" aria-label={t.awAnwesenheitTitel}>
        <h2 className="abschnitt-titel">{t.awAnwesenheitTitel}</h2>
        <AnwesenheitAnsicht monate={anwesenheitMonate} zahl={k.zahl} />
      </section>
      <p className="klein-text aw-fussnote">{t.awFussnote}</p>
    </section>
  )
}

/**
 * „13. Okt. 2025 – 11. Okt. 2026 · 52 Wochen · Zusammenkünfte: 101" — die
 * Spanne gebunden wie jede (T128: „2026|г." bei 320 px, seit „4 недели"
 * zusammenbleibt).
 */
function ZeitraumZeile({ a, k }: { a: Auswertung; k: Kontext }) {
  const { von, bis } = a.grundlage.fenster
  const spanne = tageSpanne(von, tagNach(bis, -1), k.lang, 'tagKurzJahr')
  return (
    <p className="klein-text aw-zeitraum-zeile">
      {[spanne, k.dauer(a.grundlage.fenster.wochen.length), fill(k.t.awZusammenkuenfte, { n: k.zahl(a.grundlage.zusammenkuenfte) })].join(' · ')}
    </p>
  )
}

function Kennzahlen({ k }: { k: Kontext }) {
  const z = k.a.kennzahlen
  const { t } = k
  return (
    <section className="karte aw-kennzahlen" aria-label={t.navAuswertung}>
      <div className="aw-kennzahl">
        <span className="aw-kennzahl-wert">{k.zahl(z.zuteilungen)}</span>
        <span className="aw-kennzahl-text">{t.awZuteilungen}</span>
      </div>
      <div className="aw-kennzahl">
        <span className="aw-kennzahl-wert">
          {k.zahl(z.eingeteilt)} <span className="aw-kennzahl-von">{fill(t.awVonGesamt, { m: k.zahl(z.mitBereichen) })}</span>
        </span>
        <span className="aw-kennzahl-text">{t.awEingeteilt}</span>
      </div>
      <div className="aw-kennzahl">
        <span className="aw-kennzahl-wert">{k.zahl(z.nie)}</span>
        <span className="aw-kennzahl-text">{t.awNieDran}</span>
      </div>
    </section>
  )
}

function WasAuffaellt({ k }: { k: Kontext }) {
  return (
    <section className="aw-abschnitt" aria-label={k.t.awWasAuffaellt}>
      <div className="aw-abschnitt-kopf">
        <h2 className="abschnitt-titel">{k.t.awWasAuffaellt}</h2>
        {k.a.hinweise.length > 0 && <span className="klein-text">{fill(k.t.awHinweiseZahl, { n: k.zahl(k.a.hinweise.length) })}</span>}
      </div>
      <HinweisListe k={k} />
    </section>
  )
}

/** Die sechs Kacheln zu den Unteransichten — nur am Handy. */
function Kacheln({ k, zu, ohneZahl }: { k: Kontext; zu: (ansicht: Ansicht) => void; ohneZahl: number }) {
  const { t, a } = k
  const v = a.hinweise
  const oft = v.filter((h) => h.art === 'oft').length
  const selten = v.filter((h) => h.art === 'selten').length
  // Wer in zwei Bereichen lange wartet, zählt einmal.
  const wartende = new Set(v.flatMap((h) => (h.art === 'wartet' ? h.pids : [])))
  const kacheln: { ansicht: Exclude<Ansicht, 'ueberblick'>; zeichen: ZeichenName; titel: string; zahl: string }[] = [
    { ansicht: 'verteilung', zeichen: 'auswertung', titel: t.awVerteilungTitel, zahl: fill(t.awVerteilungStat, { n: k.zahl(oft), m: k.zahl(selten) }) },
    { ansicht: 'einseitig', zeichen: 'halb', titel: t.awEinseitigTitel, zahl: fill(t.awPersonenZahl, { n: k.zahl(a.einseitig.filter(istEinseitig).length) }) },
    { ansicht: 'wartezeiten', zeichen: 'uhr', titel: t.awWartezeitenTitel, zahl: fill(t.awWartenLangeZahl, { n: k.zahl(wartende.size) }) },
    // Die knappen Bereiche, nicht der knappste aller (T139): „Am knappsten: Gebete" stand auch bei vierzehn Wochen Abstand da.
    { ansicht: 'engpaesse', zeichen: 'personen', titel: t.awEngpaesseTitel, zahl: fill(t.awKnappeZahl, { n: k.zahl(a.engpaesse.filter(istKnapp).length) }) },
    {
      ansicht: 'weiteres',
      zeichen: 'predigtdienst',
      titel: t.awWeiteresTitel,
      // Die Absagen der Liste, also nur die mit Bereich (Betreiber 18.10.2026) —
      // eine ohne steht nur bei der Person.
      zahl: [
        fill(t.awAbsagenZahl, { n: k.zahl(a.absagen.reduce((s, z) => s + z.n, 0)) }),
        fill(t.awBallungenZahl, { n: k.zahl(a.ballungen.zweimal.length + a.ballungen.folge.length) }),
      ].join(' · '),
    },
    // Die Anwesenden (T152): wie viele Zusammenkünfte im Zeitraum noch keine Zahl haben.
    { ansicht: 'anwesenheit', zeichen: 'personen', titel: t.awAnwesenheitTitel, zahl: fill(t.awAnwesenheitOhneN, { n: k.zahl(ohneZahl) }) },
  ]
  return (
    <section className="aw-abschnitt" aria-label={t.awGenauer}>
      <h2 className="abschnitt-titel">{t.awGenauer}</h2>
      <div className="aw-kacheln">
        {kacheln.map((kachel) => (
          <button key={kachel.ansicht} type="button" className="aw-kachel" onClick={() => zu(kachel.ansicht)}>
            <Zeichen name={kachel.zeichen} />
            <span className="aw-kachel-titel">{kachel.titel}</span>
            <span className="klein-text">{kachel.zahl}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
