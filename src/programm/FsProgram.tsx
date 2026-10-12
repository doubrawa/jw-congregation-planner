import type { ReactNode } from 'react'
import { useApp } from '../app/context'
import { eigenePerson } from '../app/eigene-person'
import { BesuchsMarke } from '../components/BesuchsMarke'
import { treffpunktTagLabel, treffpunktTitel } from '../components/treffpunkt-beschriftung'
import { eigeneGruppen, fsLeiterZuteilung, fsVisible, nachWochentag } from '../data/fs'
import { gehoertZu } from '../data/helpers'
import { rechteVon } from '../data/rechte'
import type { FsInstance, Person } from '../data/types'
import { useT } from '../i18n/useT'
import { PersonZeile } from './PersonZeile'

/**
 * **Die Treffpunkte der Woche** (Thema Predigtdienst; T121, Entwurf
 * `GTreffpunkte`): je Tag eine Karte — oben der Tag und, wenn sich die eigene
 * Gruppe an ihm trifft, „Deine Gruppe" —, darin je Treffpunkt die Uhrzeit
 * groß, Versammlungs- oder Gruppentreffpunkt, der Ort und der Leiter.
 *
 * Gezeigt wird nur, was den Leser angeht: die Versammlungstreffpunkte und die
 * seiner eigenen Gruppe (`fsVisible`). Fremde Gruppentreffpunkte stünden hier
 * sonst als Termine, zu denen niemand kommt.
 *
 * `druck` ist der Druckknopf (T105), falls er über den Treffpunkten stehen
 * soll — am Handy; ab dem Tablet steht er neben der Wochenwahl. Er steht auch
 * über einer Woche ohne Treffpunkte: Der Monat hat vielleicht welche.
 */
export function FsProgram({ druck }: { druck?: ReactNode }) {
  const { state } = useApp()
  const { t } = useT()
  const insts = fsVisible(
    state.fsWeeks[state.week] ?? [],
    state.persons,
    state.groups,
    state.personId,
    // Wer zuteilt, sieht die Treffpunkte aller Gruppen — er besetzt sie.
    rechteVon(state).zuteilen,
  )
  const druckZeile = druck && <div className="prog-meta-row druck-zeile">{druck}</div>

  if (insts.length === 0) {
    return (
      <>
        {druckZeile}
        <section className="karte treff-leer">
          <p className="prog-meta">{t.fsKeine}</p>
        </section>
      </>
    )
  }

  // Der Montag der Woche selbst (T66) — eine Rechnung aus der Ordnungszahl
  // nannte bei einer Lücke im Bestand ab dort den falschen Tag.
  const kennung = state.weeks[state.week]?.start ?? ''
  const meine = eigeneGruppen(state.persons, state.groups, state.personId)
  const me = eigenePerson(state)

  const eigene = (inst: FsInstance) => inst.grp != null && meine.has(inst.grp)

  return (
    <>
      {druckZeile}
      {nachWochentag(insts).map((tag) => {
        // Wer nur die eigene Gruppe sieht, liest „Deine Gruppe" am Tag, wie im
        // Entwurf. Wer alle sieht (wer zuteilt), am Treffpunkt selbst — am Tag
        // stünde es über vier Gruppen und meinte eine.
        const amTreffpunkt = tag.items.some((inst) => inst.grp != null && !eigene(inst))
        return (
          <section key={tag.wd} className="prog-abschnitt treff-tag">
            <div className="prog-abschnitt-kopf">
              <h2 className="treff-tag-name">{treffpunktTagLabel(kennung, tag.wd, state.lang)}</h2>
              {!amTreffpunkt && tag.items.some(eigene) && <span className="treff-deine">{t.gbDeineGruppe}</span>}
            </div>
            {tag.items.map((inst) => (
              <Treffpunkt key={inst.id} inst={inst} kennung={kennung} me={me} deine={amTreffpunkt && eigene(inst)} />
            ))}
          </section>
        )
      })}
    </>
  )
}

/** Ein Treffpunkt: Uhrzeit, wer sich trifft, wo — und wer leitet. */
function Treffpunkt({
  inst,
  kennung,
  me,
  deine,
}: {
  inst: FsInstance
  kennung: string
  me: Person | undefined
  /** „Deine Gruppe" an diesem Treffpunkt statt am Tag. */
  deine: boolean
}) {
  const { state } = useApp()
  const i18n = useT()
  return (
    <div className="treff-punkt">
      <span className="treff-zeit">{inst.time}</span>
      <div className="treff-text">
        <div className="treff-titel">{treffpunktTitel(inst, state.groups, i18n)}</div>
        {/* Der Ort ist Freitext, aber der Vorgabewert („Königreichssaal")
            steht im Wörterbuch — ohne tu bliebe er als einziges Feld deutsch.
            Freitext der Versammlung: eigene Schreibrichtung. */}
        <div className="treff-ort" dir="auto">
          {i18n.tu(inst.place)}
        </div>
        {deine && <span className="treff-deine">{i18n.t.gbDeineGruppe}</span>}
        <BesuchsMarke woche={kennung} grp={inst.grp} />
      </div>
      <div className="treff-leiter">
        {/* „Du" über `fsLeiterZuteilung`, nicht über den Namen — „Id vor
            Name", wie `deriveMyFsTasks` für dieselben Treffpunkte. Ein Leiter
            als Freitext gehört niemandem hier, auch keinem Namensgleichen. */}
        <PersonZeile
          name={inst.leader}
          rolle={i18n.tu('Leiter')}
          du={me != null && gehoertZu(fsLeiterZuteilung(inst), me)}
        />
      </div>
    </div>
  )
}
