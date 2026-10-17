import { useMemo, useState } from 'react'
import { useApp } from '../app/context'
import { useAbwesend } from '../app/useAbwesend'
import { useKalendertag } from '../app/useKalendertag'
import { Wahl } from '../bausteine/Wahl'
import { Zeichen, type ZeichenName } from '../bausteine/Zeichen'
import { UnteransichtKopf } from '../components/UnteransichtKopf'
import { datumsFormat, zeitspanne } from '../components/datum-anzeige'
import { gruppenName } from '../components/weitere-plaene-anzeige'
import { useBackDismiss } from '../components/useBackDismiss'
import { DESKTOP_BREITE, TABLET_BREITE, useMedia } from '../components/useMedia'
import { auswerten, istEinseitig, OBEN_ANZAHL, ZEITRAEUME, type Auswertung, type Zeitraum } from '../data/auswertung'
import { displayName } from '../data/helpers'
import { fromIso, tagNach } from '../data/meeting-dates'
import { LOCALES } from '../i18n/langs'
import { fill, useT } from '../i18n/useT'
import { bereichsName } from '../personen/priv-label'
import { Legende } from './Diagramme'
import { EinseitigKarten, EinseitigMatrix } from './EinseitigAnsicht'
import { HinweisListe } from './Hinweise'
import { PersonAnsicht } from './PersonAnsicht'
import { VerteilungAnsicht } from './VerteilungAnsicht'
import { WartezeitenAnsicht } from './WartezeitenAnsicht'
import { WeiteresAnsicht } from './WeiteresAnsicht'
import type { Ansicht, Kontext } from './kontext'
import './auswertung.css'

/**
 * **Auswertung der Zuteilungen** (T126; Entwurf auf der Leinwand „Auswertung der
 * Zuteilungen", 16.10.2026; nur Admin und Planer, nicht druckbar).
 *
 * Am Handy der Überblick — Kennzahlen, was auffällt, wie sich die Last verteilt —
 * und vier Kacheln zu den Unteransichten mit Zurück. Ab dem Tablet steht alles
 * auf einer Seite, ab dem Desktop mit der Tabelle Person × Bereich. Eine Person öffnet sich
 * überall als Unteransicht. Gerechnet wird in `data/auswertung.ts`; hier werden
 * die Zahlen zu Wörtern.
 */
/** Wo jede Unteransicht ab dem Tablet auf der Seite steht — ein Hinweis rollt dorthin. */
const ANKER = {
  verteilung: 'aw-verteilung',
  einseitig: 'aw-einseitig',
  wartezeiten: 'aw-wartezeiten',
  weiteres: 'aw-weiteres',
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
    const tag = datumsFormat(lang, 'tagMonatKurz')
    return {
      a,
      t,
      lang,
      name: (pid) => namen.get(pid) ?? '',
      bereich: (key) => bereichsName(key, services, t, tu),
      gruppe: (id) => (id === null ? t.versammlungLbl : gruppenName(id, groups, tu)),
      dauer: (wochen) => zeitspanne(wochen, 'week', lang),
      zahl: (n) => zahl.format(n),
      datum: (iso) => tag.format(fromIso(iso)),
      prozent: (anteil) => prozent.format(anteil),
      personOeffnen: setPerson,
      // Ab dem Tablet steht die Unteransicht schon auf der Seite: dorthin rollen.
      ansichtOeffnen: (ziel) =>
        breit ? document.getElementById(ANKER[ziel])?.scrollIntoView?.({ block: 'start', behavior: 'smooth' }) : setAnsicht(ziel),
    }
  }, [a, persons, services, groups, lang, t, tu, breit])

  if (person !== null) {
    return (
      <section className="screen auswertung">
        <UnteransichtKopf titel={k.name(person)} onZurueck={() => setPerson(null)} />
        <ZeitraumZeile a={a} k={k} />
        <PersonAnsicht k={k} pid={person} weeks={weeks} persons={persons} abwesend={abwesend} />
      </section>
    )
  }

  if (unten) {
    const titel: Record<Exclude<Ansicht, 'ueberblick'>, string> = {
      verteilung: t.awVerteilungTitel,
      einseitig: t.awEinseitigTitel,
      wartezeiten: t.awWartezeitenTitel,
      weiteres: t.awWeiteresTitel,
    }
    return (
      <section className="screen auswertung">
        <UnteransichtKopf titel={titel[ansicht]} onZurueck={() => setAnsicht('ueberblick')} />
        <ZeitraumZeile a={a} k={k} />
        {ansicht === 'verteilung' && <VerteilungAnsicht k={k} />}
        {ansicht === 'einseitig' && <EinseitigKarten k={k} />}
        {ansicht === 'wartezeiten' && <WartezeitenAnsicht k={k} />}
        {ansicht === 'weiteres' && <WeiteresAnsicht k={k} />}
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
        <Last k={k} />
        <Kacheln k={k} zu={setAnsicht} />
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
          <Last k={k} />
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
          <WartezeitenAnsicht k={k} />
        </section>
        <section id={ANKER.weiteres} className="aw-spalte" aria-label={t.awWeiteresTitel}>
          <h2 className="abschnitt-titel">{t.awWeiteresTitel}</h2>
          <WeiteresAnsicht k={k} />
        </section>
      </div>
      <p className="klein-text aw-fussnote">{t.awFussnote}</p>
    </section>
  )
}

/** „13. Okt. 2025 – 11. Okt. 2026 · 52 Wochen · Zusammenkünfte: 101" */
function ZeitraumZeile({ a, k }: { a: Auswertung; k: Kontext }) {
  const { von, bis } = a.grundlage.fenster
  const spanne = datumsFormat(k.lang, 'tagKurzJahr').formatRange(fromIso(von), fromIso(tagNach(bis, -1)))
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

/**
 * **Wie sich die Last verteilt**: je Person ein Balken, die meisten zuerst — die
 * zehn oberen in Minze, wer nie dran war, gestrichelt. Auf Wunsch als Tabelle.
 */
function Last({ k }: { k: Kontext }) {
  const [tabelle, setTabelle] = useState(false)
  const { t } = k
  const { last, anteilOben } = k.a.kennzahlen
  if (last.length === 0) return null
  const max = Math.max(1, ...last.map((z) => z.n))
  // Erst ab elf Personen gibt es „die zehn oberen" und „alle anderen".
  const viele = last.length > OBEN_ANZAHL
  const prozent = new Intl.NumberFormat(LOCALES[k.lang] ?? k.lang, { style: 'percent', maximumFractionDigits: 0 }).format(anteilOben)
  return (
    <section className="karte aw-last-karte" aria-label={t.awLastTitel}>
      <h2 className="karte-titel">{t.awLastTitel}</h2>
      {viele && <p className="klein-text">{fill(t.awLastText, { anteil: prozent })}</p>}
      {tabelle ? (
        <table className="aw-tabelle">
          <thead>
            <tr>
              <th scope="col">{t.awPerson}</th>
              <th scope="col">{t.awZuteilungen}</th>
            </tr>
          </thead>
          <tbody>
            {last.map((z) => (
              <tr key={z.pid}>
                <th scope="row">{k.name(z.pid)}</th>
                <td>{k.zahl(z.n)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <>
          <div className="aw-last" role="img" aria-label={t.awLastBild} style={{ columnGap: `min(2px, ${33 / last.length}%)` }}>
            {last.map((z, i) => (
              <span
                key={z.pid}
                // „Die zehn oberen" gibt es erst ab elf — sonst wären alle Balken
                // Minze und die Legende grau.
                className={z.n === 0 ? 'aw-last-balken is-leer' : viele && i < OBEN_ANZAHL ? 'aw-last-balken is-oben' : 'aw-last-balken'}
                style={{ height: z.n === 0 ? undefined : `${Math.max(3, (z.n / max) * 100)}%` }}
              />
            ))}
          </div>
          <Legende
            eintraege={[
              ...(viele ? ([['oben', t.awLegendeOben]] as const) : []),
              ['andere', viele ? t.awLegendeAndere : t.awZuteilungen],
              ...(k.a.kennzahlen.nie > 0 ? ([['leer', t.awNieDran]] as const) : []),
            ]}
          />
        </>
      )}
      <button type="button" className="knopf-pille aw-mehr" aria-pressed={tabelle} onClick={() => setTabelle(!tabelle)}>
        {tabelle ? t.awAlsDiagramm : t.awAlsTabelle}
      </button>
    </section>
  )
}

/** Die vier Kacheln zu den Unteransichten — nur am Handy. */
function Kacheln({ k, zu }: { k: Kontext; zu: (ansicht: Ansicht) => void }) {
  const { t, a } = k
  const v = a.hinweise
  const oft = v.filter((h) => h.art === 'oft').length
  const selten = v.filter((h) => h.art === 'selten').length
  const kacheln: { ansicht: Exclude<Ansicht, 'ueberblick'>; zeichen: ZeichenName; titel: string; zahl: string }[] = [
    { ansicht: 'verteilung', zeichen: 'auswertung', titel: t.awVerteilungTitel, zahl: fill(t.awVerteilungStat, { n: k.zahl(oft), m: k.zahl(selten) }) },
    { ansicht: 'einseitig', zeichen: 'halb', titel: t.awEinseitigTitel, zahl: fill(t.awPersonenZahl, { n: k.zahl(a.einseitig.filter(istEinseitig).length) }) },
    {
      ansicht: 'wartezeiten',
      zeichen: 'uhr',
      titel: t.awWartezeitenTitel,
      zahl: fill(t.awWartenLangeZahl, { n: k.zahl(v.filter((h) => h.art === 'wartet').length) }),
    },
    {
      ansicht: 'weiteres',
      zeichen: 'predigtdienst',
      titel: t.awWeiteresTitel,
      zahl: [
        fill(t.awAbsagenZahl, { n: k.zahl(a.grundlage.absagen.length) }),
        fill(t.awBallungenZahl, { n: k.zahl(a.ballungen.zweimal.length + a.ballungen.folge.length) }),
      ].join(' · '),
    },
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
