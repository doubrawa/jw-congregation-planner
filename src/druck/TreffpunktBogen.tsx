import { useApp } from '../app/context'
import { useKalendertag } from '../app/useKalendertag'
import { datumsFormat } from '../components/datum-anzeige'
import { besuchsGruppe, besuchsTreffpunktText, besuchsWocheText } from '../components/gruppenbesuch-anzeige'
import { treffpunktTitel } from '../components/treffpunkt-beschriftung'
import { useBesuchsLage } from '../components/useBesuchsLage'
import { eigeneGruppen, fsAbweichungen, fsTag, fsVisible } from '../data/fs'
import { besuchStand } from '../data/gruppenbesuche'
import { fromIso } from '../data/meeting-dates'
import { rechteVon } from '../data/rechte'
import type { FsInstance, FsRule } from '../data/types'
import type { Dict } from '../i18n/ui'
import { fill, useT } from '../i18n/useT'
import { Bogen, type DruckBlock } from './Bogen'
import { Offen } from './DruckBlatt'
import type { DruckZeile, TabellenForm } from './DruckTabelle'
import { tabellenBloecke } from './tabellen-bloecke'

/** Gruppenbesuche auf dem Bogen — die nächsten, wie im Entwurf ein halbes Jahr. */
const BESUCHE_HOECHSTENS = 6

/**
 * **Die Treffpunkte einer Woche oder eines Monats** (T121, Phase 9; Entwurf
 * `GDruckTreffpunkte`): die Versammlungstreffpunkte je Datum, die der Gruppen,
 * darunter, was **anders ist als sonst** — ein Treffpunkt des Grundplans, der
 * entfällt, einer, der dazukommt, einer mit anderer Zeit oder anderem Ort,
 * ein Gruppenbesuch —, und die nächsten Gruppenbesuche.
 *
 * Auf dem Bogen steht, was der Leser auch am Bildschirm sieht (`fsVisible`):
 * Wer zuteilt, druckt alle Gruppen; wer nicht, die Versammlung und die eigene.
 * Die Leiter stehen je Datum da, denn der Grundplan kennt keinen festen
 * (Entscheid 13.10.2026) — ein freier Platz ist gepunktet.
 */
export function TreffpunktBogen({ wochen, zeitraum }: { wochen: readonly number[]; zeitraum: string }) {
  const { state } = useApp()
  const i18n = useT()
  const { t, tu } = i18n
  const lage = useBesuchsLage()
  const alle = rechteVon(state).zuteilen
  const sichtbar = (insts: readonly FsInstance[]) => fsVisible(insts, state.persons, state.groups, state.personId, alle)
  const meine = eigeneGruppen(state.persons, state.groups, state.personId)
  const tagText = (kennung: string, wd: number) => {
    const tag = fsTag(kennung, wd)
    return tag ? datumsFormat(state.lang, 'wochentagZahl').format(tag) : ''
  }
  const leiter = (inst: FsInstance) => (inst.leader ? inst.leader : <Offen breite={140} />)
  // Wie es der Grundplan sonst hat — mit dem Tag, wenn er ein anderer ist:
  // Sonst stünde bei einem verlegten Tag „statt" vor denselben Angaben.
  const sonst = (kennung: string, inst: FsInstance, regel: FsRule) =>
    [regel.wd !== inst.wd ? tagText(kennung, regel.wd) : '', regel.time, tu(regel.place)].filter(Boolean).join(' · ')

  const termine = wochen.flatMap((wi) => {
    const kennung = state.weeks[wi]?.start ?? ''
    return sichtbar(state.fsWeeks[wi] ?? []).map((inst) => ({ kennung, inst }))
  })
  const versammlung: DruckZeile[] = termine
    .filter(({ inst }) => inst.grp == null)
    .map(({ kennung, inst }) => ({
      key: `${kennung}|${inst.id}`,
      zellen: [tagText(kennung, inst.wd), inst.time, tu(inst.place), leiter(inst)],
    }))
  const gruppen: DruckZeile[] = termine
    .filter(({ inst }) => inst.grp != null)
    .map(({ kennung, inst }) => ({
      key: `${kennung}|${inst.id}`,
      zellen: [tagText(kennung, inst.wd), inst.time, treffpunktTitel(inst, state.groups, i18n), tu(inst.place), leiter(inst)],
    }))

  const kennungen = new Set(wochen.map((wi) => state.weeks[wi]?.start ?? ''))
  const anders: DruckZeile[] = [
    ...wochen.flatMap((wi) => {
      const kennung = state.weeks[wi]?.start ?? ''
      const ist = state.fsWeeks[wi]
      if (!kennung || !ist) return []
      return fsAbweichungen(kennung, state.fsRules, ist)
        .filter(({ inst }) => sichtbar([inst]).length > 0)
        .map(({ art, inst, regel }) => ({
          key: `${kennung}|${art}|${inst.id}`,
          zellen: [
            tagText(kennung, inst.wd),
            [
              treffpunktTitel(inst, state.groups, i18n),
              ...(art === 'entfaellt' ? [t.druckEntfaellt] : [inst.time, tu(inst.place)]),
              ...(art === 'zusaetzlich' ? [t.druckZusaetzlich] : []),
              ...(art === 'anders' && regel ? [fill(t.druckStatt, { alt: sonst(kennung, inst, regel) })] : []),
            ].join(' · '),
          ],
        }))
    }),
    ...state.gruppenbesuche
      .filter((besuch) => kennungen.has(besuch.woche) && (alle || meine.has(besuch.grp)))
      .map((besuch) => {
        const treffpunkt = besuchStand(besuch, lage).treffpunkte[0]
        return {
          key: `besuch|${besuch.id}`,
          zellen: [
            treffpunkt ? tagText(besuch.woche, treffpunkt.wd) : besuchsWocheText(besuch.woche, state.lang),
            `${besuchsGruppe(besuch, state.groups, tu)} · ${t.gbMarker}`,
          ],
        }
      }),
  ]

  const besuche = useBesuchsZeilen({ ab: state.weeks[wochen[0] ?? -1]?.start ?? '', hoechstens: BESUCHE_HOECHSTENS })

  const bloecke: DruckBlock[] = [
    ...tabellenBloecke(
      'versammlung',
      {
        titel: t.druckVersammlungstreffpunkte,
        farbe: 'petrol',
        spalten: '120px 64px minmax(0, 1fr) 190px',
        kopf: [t.druckTag, t.druckZeit, t.druckTreffpunkt, tu('Leiter')],
      },
      versammlung,
    ),
    ...tabellenBloecke(
      'gruppen',
      {
        titel: t.druckGruppentreffpunkte,
        farbe: 'wein',
        spalten: '120px 64px 96px minmax(0, 1fr) 170px',
        kopf: [t.druckTag, t.druckZeit, t.gbGruppe, t.druckTreffpunkt, tu('Leiter')],
      },
      gruppen,
    ),
  ]
  if (anders.length) {
    bloecke.push({
      key: 'anders',
      inhalt: (
        <section className="druck-anders">
          <span className="druck-anders-titel">{t.druckAndersAlsSonst}</span>
          {anders.map((zeile) => (
            <span key={zeile.key} className="druck-anders-zeile">
              {zeile.zellen.map((zelle, i) => (
                <span key={i}>{zelle}</span>
              ))}
            </span>
          ))}
        </section>
      ),
    })
  }
  bloecke.push(...tabellenBloecke('besuche', besuchsForm(t), besuche))
  if (bloecke.length === 0) bloecke.push({ key: 'leer', inhalt: <p className="druck-hinweis">{t.fsKeine}</p> })

  return <Bogen titel={t.tabFs} zeitraum={`${t.fsShort} · ${zeitraum}`} bloecke={bloecke} />
}

/**
 * **Die Gruppenbesuche des Dienstaufsehers** (T121, Phase 9): die kommenden,
 * dieselbe Tabelle wie auf dem Bogen der Treffpunkte — für den Aushang, damit
 * sich jede Gruppe auf ihren Besuch einstellen kann.
 */
export function GruppenbesuchBogen() {
  const { t } = useT()
  const besuche = useBesuchsZeilen({ ab: '', hoechstens: Infinity, nurKommende: true })
  const bloecke = tabellenBloecke('besuche', besuchsForm(t), besuche)
  return (
    <Bogen
      titel={t.gbTitel}
      zeitraum={t.fsGruppenbesucheTab}
      bloecke={bloecke.length ? bloecke : [{ key: 'leer', inhalt: <p className="druck-hinweis">{t.gbLeer}</p> }]}
    />
  )
}

/** Die Tabelle der Gruppenbesuche — auf beiden Bögen dieselbe. */
function besuchsForm(t: Pick<Dict, 'fsGruppenbesucheTab' | 'gbWoche' | 'druckTreffpunkt' | 'gbGruppe'>): TabellenForm {
  return {
    titel: t.fsGruppenbesucheTab,
    farbe: 'gold',
    spalten: '170px minmax(0, 1fr) 120px',
    kopf: [t.gbWoche, t.druckTreffpunkt, t.gbGruppe],
  }
}

/**
 * Die Gruppenbesuche ab der Woche `ab` (Montag), höchstens `hoechstens`: Woche,
 * Treffpunkt, Gruppe — mit `nurKommende` ohne die vorbeigegangenen, wie die
 * Ansicht der Gruppenbesuche. Wo und wann sich eine fremde Gruppe trifft, zeigt
 * die App nur, wer zuteilt.
 */
function useBesuchsZeilen({ ab, hoechstens, nurKommende = false }: { ab: string; hoechstens: number; nurKommende?: boolean }): DruckZeile[] {
  const { state } = useApp()
  const { tu } = useT()
  const lage = useBesuchsLage()
  const heute = fromIso(useKalendertag())
  const alle = rechteVon(state).zuteilen
  const meine = eigeneGruppen(state.persons, state.groups, state.personId)
  return state.gruppenbesuche
    .filter((besuch) => besuch.woche >= ab && (!nurKommende || besuchStand(besuch, lage, heute).art !== 'vorbei'))
    .sort((a, b) => a.woche.localeCompare(b.woche))
    .slice(0, hoechstens)
    .map((besuch) => {
      const treffpunkt = alle || meine.has(besuch.grp) ? besuchStand(besuch, lage).treffpunkte[0] : undefined
      return {
        key: besuch.id,
        zellen: [
          besuchsWocheText(besuch.woche, state.lang),
          treffpunkt ? besuchsTreffpunktText(besuch.woche, treffpunkt, state.lang, tu) : '',
          besuchsGruppe(besuch, state.groups, tu),
        ],
      }
    })
}
