import { useApp } from '../app/context'
import { eigenePerson } from '../app/eigene-person'
import { treffpunktTagLabel, treffpunktTitel } from '../components/treffpunkt-beschriftung'
import { fsLeiterZuteilung, fsVisible, nachWochentag } from '../data/fs'
import { gehoertZu } from '../data/helpers'
import { useT } from '../i18n/useT'
import { DruckWahl } from './DruckWahl'

/**
 * Der Druckknopf über den Treffpunkten (T105) — dieselbe Auswahl wie bei den
 * Zusammenkünften: diese Woche oder der ganze Monat. Er steht auch über einer
 * Woche ohne Treffpunkte: Der Monat hat vielleicht welche.
 */
function FsDruck() {
  return (
    <div className="prog-meta-row fs-druck-row">
      <DruckWahl />
    </div>
  )
}

/**
 * Treffpunkte-Anzeige (Programm-Tab „Zusammenkünfte für den Predigtdienst"):
 * pro Tag eine gold getönte Karte mit Zeit · Versammlungs-/Gruppentreffpunkt ·
 * Ort und dem zugeteilten Leiter (DU-Chip beim angemeldeten Nutzer).
 *
 * Gezeigt wird nur, was den Leser angeht: die Versammlungstreffpunkte und die
 * seiner eigenen Gruppe (`fsVisible`). Fremde Gruppentreffpunkte stünden hier
 * sonst als Termine, zu denen niemand kommt.
 */
export function FsProgram() {
  const { state } = useApp()
  const i18n = useT()
  const { t, tu } = i18n
  const me = eigenePerson(state)
  const insts = fsVisible(
    state.fsWeeks[state.week] ?? [],
    state.persons,
    state.groups,
    state.personId,
    state.planner,
  )

  if (insts.length === 0) {
    return (
      <>
        <FsDruck />
        <div className="panel panel--lead panel--pb16" data-farbe="gold">
          <p className="prog-meta">{t.fsKeine}</p>
        </div>
      </>
    )
  }

  // Der Montag der Woche selbst (T66) — eine Rechnung aus der Ordnungszahl
  // nannte bei einer Lücke im Bestand ab dort den falschen Tag.
  const kennung = state.weeks[state.week]?.start ?? ''
  const days = nachWochentag(insts)

  return (
    <>
      <FsDruck />
      {days.map((day) => (
        <div key={day.wd} className="panel" data-farbe="gold">
          <h2 className="panel-label">{treffpunktTagLabel(kennung, day.wd, state.lang)}</h2>
          {day.items.map((inst) => (
            <div key={inst.id} className="fs-row">
              <div className="fs-row-main">
                <span className="fs-time">{inst.time}</span>
                <div className="fs-row-text">
                  <div className="fs-title">{treffpunktTitel(inst, state.groups, i18n)}</div>
                  {/* Der Ort ist Freitext, aber der Vorgabewert („Königreichssaal")
                      steht im Wörterbuch — ohne tu bliebe er als einziges Feld
                      dieser Karte deutsch. */}
                  {/* Freitext der Versammlung — eigene Schreibrichtung. */}
                  <div className="fs-place" dir="auto">{tu(inst.place)}</div>
                </div>
              </div>
              <div className="fs-leader">
                <div className="fs-leader-name">
                  {/* Über `gehoertZu`, nicht über den Namen — „Id vor Name",
                      wie es `deriveMyFsTasks` für dieselben Treffpunkte tut.
                      Namensgleiche sahen den Chip sonst beide. `gehoertZu`
                      fällt ohne pid auf den Namen zurück (außer bei
                      Gast-Rollen, die ein Treffpunkt nicht hat) — deshalb
                      kommt die Zuteilung aus `fsLeiterZuteilung`, das den
                      Freitext-Leiter gar nicht erst als Person ausgibt. */}
                  {me && gehoertZu(fsLeiterZuteilung(inst), me) && (
                    <span className="chip-du">DU</span>
                  )}
                  <span className={inst.leader ? 'fs-leader-person' : 'fs-leader-person fs-leader-open'}>
                    {inst.leader || t.offenDash}
                  </span>
                </div>
                <div className="fs-leader-role">{tu('Leiter')}</div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </>
  )
}
