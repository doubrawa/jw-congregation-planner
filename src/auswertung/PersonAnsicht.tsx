import { useMemo } from 'react'
import { personBild, lageVon, type FeldArt, type PersonWoche } from '../data/auswertung'
import type { AbsenceSet } from '../data/absence'
import { MEETING_TABS } from '../data/helpers'
import type { FsInstance, MeetingTimes, Person, Week } from '../data/types'
import { monatsErster } from '../data/weitere-plaene'
import { fill } from '../i18n/useT'
import { LageMarke, Legende, WochenKalender, type KalenderMonat, type MusterArt } from './Diagramme'
import { gerundet, type Kontext } from './kontext'

/**
 * Die Wochen je Monat (der seines Montags), der neueste oben, die Monate je
 * Jahr. Neben dem Monat jede Aufgabe und Absage einmal — kam derselbe Eintrag
 * öfter, mit der Zahl („Gebete: 2"). Die Bereiche kurz wie im Kopf der Tabelle
 * („Vorsitz · unter der Woche"): Die Spalte neben den Feldern ist schmal.
 * Geordnet wird nach dem Datum, nicht nach der Folge in `weeks` — kam eine
 * Woche außer der Reihe dazu, stünde ihr Monat sonst an falscher Stelle und ein
 * Jahr zweimal da (Review 24.10.2026).
 */
function kalender(wochen: readonly PersonWoche[], k: Kontext): { jahr: string; monate: KalenderMonat[] }[] {
  const { t } = k
  const monate = new Map<string, PersonWoche[]>()
  for (const w of [...wochen].sort((a, b) => a.start.localeCompare(b.start))) {
    const erster = monatsErster(w.start)
    const liste = monate.get(erster)
    if (liste) liste.push(w)
    else monate.set(erster, [w])
  }
  const jahre: { jahr: string; monate: KalenderMonat[] }[] = []
  for (const [erster, hier] of [...monate].reverse()) {
    const eintraege = new Map<string, { text: string; absage: boolean; n: number }>()
    for (const w of hier) {
      for (const e of w.eintraege) {
        const name = e.bereich === null ? t.awAufgabe : k.bereichKurz(e.bereich).join(' · ')
        const stand = e.art === 'absage' ? t.awAbgesagt : e.geplant ? t.awGeplantKurz : null
        const text = stand ? fill(t.awEintragStand, { bereich: name, stand }) : name
        const da = eintraege.get(text)
        if (da) da.n++
        else eintraege.set(text, { text, absage: e.art === 'absage', n: 1 })
      }
    }
    const monat: KalenderMonat = {
      erster,
      name: k.monat(erster),
      wochen: hier,
      eintraege: [...eintraege.values()].map((e) => ({ text: e.n > 1 ? fill(t.awBereichZahl, { bereich: e.text, n: k.zahl(e.n) }) : e.text, absage: e.absage })),
    }
    const jahr = k.jahr(erster)
    const letztes = jahre[jahre.length - 1]
    if (letztes?.jahr === jahr) letztes.monate.push(monat)
    else jahre.push({ jahr, monate: [monat] })
  }
  return jahre
}

/**
 * Die Legende nennt Aufgabe und Hilfsdienst immer, die übrigen Felder nur, wo
 * sie vorkommen. Geplante Aufgaben und Hilfsdienste sind gestrichelt — sie
 * zeigt „geplant"; abwesend und ohne Zusammenkunft sehen vorher wie nachher
 * gleich aus.
 */
function legende(wochen: readonly PersonWoche[], k: Kontext): [MusterArt, string][] {
  const { t } = k
  const kommt = (arten: readonly FeldArt[], geplant?: boolean) =>
    wochen.some((w) => MEETING_TABS.some((tab) => (geplant === undefined || w.geplant[tab] === geplant) && arten.includes(w.felder[tab])))
  const eintraege: [MusterArt, string, boolean][] = [
    ['aufgabe', t.awAufgabe, true],
    ['dienst', t.awHilfsdienst, true],
    ['beides', t.awBeides, kommt(['beides'], false)],
    ['abwesend', t.awAbwesendKurz, kommt(['abwesend'])],
    ['abgesagt', t.awAbgesagt, kommt(['abgesagt'], false)],
    ['ausgefallen', t.awAusgefallen, kommt(['ausgefallen'])],
    ['geplant', t.awGeplantKurz, kommt(['aufgabe', 'hilfsdienst', 'beides'], true)],
  ]
  return eintraege.filter(([, , zeigen]) => zeigen).map(([art, text]) => [art, text])
}

/** Was in einer Zusammenkunft, die noch aussteht, „ansteht" — eine leere oder ausgefallene nicht. */
const ANSTEHEND: readonly FeldArt[] = ['aufgabe', 'hilfsdienst', 'beides', 'abwesend']

/**
 * Steht etwas an? Dann sagt es die Überschrift (Betreiber 24.10.2026:
 * „Ergänzen") — sonst stünde über dem Gestrichelten nur „Die letzten … Wochen".
 */
function stehtAn(wochen: readonly PersonWoche[]): boolean {
  return wochen.some((w) => w.eintraege.some((e) => e.geplant) || MEETING_TABS.some((tab) => w.geplant[tab] && ANSTEHEND.includes(w.felder[tab])))
}

/**
 * **Eine Person** (Entwurf `HandyPerson`): ihre Zuteilungen gegen die Erwartung,
 * ihre Wochen als Kalender (Entwurf `GWochenbildKalender`, 23.10.2026) und je
 * Bereich, wie oft und wann zuletzt — hinten die Bereiche, in denen sie
 * eingeteilt war, ohne sie zu haben.
 */
export function PersonAnsicht({
  k,
  pid,
  weeks,
  fsWeeks,
  zeiten,
  persons,
  abwesend,
}: {
  k: Kontext
  pid: string
  weeks: readonly Week[]
  fsWeeks: readonly (readonly FsInstance[])[]
  zeiten: MeetingTimes
  persons: readonly Person[]
  abwesend: AbsenceSet
}) {
  const { t } = k
  const bild = useMemo(
    () => personBild(k.a.grundlage, weeks, persons, abwesend, pid, { fsWeeks, zeiten }),
    [k.a.grundlage, weeks, fsWeeks, zeiten, persons, abwesend, pid],
  )
  if (!bild) return null
  const wochenAria = fill(t.awWochenBild, {
    name: k.name(pid),
    a: k.zahl(bild.aufgaben),
    h: k.zahl(bild.hilfsdienste),
    w: k.zahl(bild.abwesend),
  })

  return (
    <div className="aw-ansicht">
      <section aria-label={k.name(pid)} className="karte aw-kennzahlen is-vier">
        <div className="aw-kennzahl">
          <span className="aw-kennzahl-wert">{k.zahl(bild.aufgaben)}</span>
          <span className="aw-kennzahl-text">{fill(t.awAufgabenErwartet, { e: k.zahl(gerundet(bild.erwartetAufgaben)) })}</span>
        </div>
        <div className="aw-kennzahl">
          <span className="aw-kennzahl-wert">{k.zahl(bild.hilfsdienste)}</span>
          <span className="aw-kennzahl-text">{t.awHilfsdienste}</span>
        </div>
        <div className="aw-kennzahl">
          <span className="aw-kennzahl-wert">{k.zahl(bild.abwesend)}</span>
          <span className="aw-kennzahl-text">{t.awAbwesend}</span>
        </div>
        <div className="aw-kennzahl">
          <span className="aw-kennzahl-wert">{k.zahl(bild.absagen)}</span>
          <span className="aw-kennzahl-text">{t.awAbsagen}</span>
        </div>
      </section>

      <section className="karte aw-gruppe" aria-label={wochenAria}>
        {/* So viele Wochen, wie die App vom Zeitraum kennt — nicht die 52 des Zeitraums, und ohne das Geplante. */}
        <h2 className="aw-gruppe-kopf">
          {fill(stehtAn(bild.wochen) ? t.awLetzteUndKommend : t.awLetzte, { dauer: k.dauer(k.a.grundlage.fenster.wochen.length) })}
        </h2>
        <WochenKalender jahre={kalender(bild.wochen, k)} />
        <p className="klein-text aw-wochen-erklaerung">{t.awZweiFelder}</p>
        <Legende eintraege={legende(bild.wochen, k)} />
      </section>

      <section className="karte aw-gruppe" aria-label={t.awJeBereich}>
        <h2 className="aw-gruppe-kopf">{t.awJeBereich}</h2>
        <ul className="aw-zeilen">
          {bild.bereiche.map((b) => {
            const wann = b.vorWochen === null ? t.awNieImZeitraum : fill(t.awZuletztVor, { dauer: k.dauer(b.vorWochen) })
            // Ohne den Bereich eingeteilt: keine Erwartung, kein Vergleich — nur wie oft.
            if (!b.hat) {
              return (
                <li key={b.bereich} className="aw-zeile">
                  <div className="aw-zeile-kopf">
                    <span className="aw-zeile-name">{k.bereich(b.bereich)}</span>
                    <span className="aw-zeile-zahl">{k.zahl(b.n)}</span>
                  </div>
                  <span className="klein-text">{`${t.awOhneBereich} · ${wann}`}</span>
                </li>
              )
            }
            return (
              <li key={b.bereich} className="aw-zeile">
                <div className="aw-zeile-kopf">
                  <span className="aw-zeile-name">{k.bereich(b.bereich)}</span>
                  <LageMarke lage={lageVon(b.n, b.erwartet)} n={b.n} erwartet={b.erwartet} k={k} />
                </div>
                <span className="aw-zeile-zahl">{`${fill(t.awNErwartet, { n: k.zahl(b.n), e: k.zahl(gerundet(b.erwartet)) })} · ${wann}`}</span>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
