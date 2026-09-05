import { useApp } from '../app/context'
import { fsKennung, fsLeiterZuteilung, fsTag, fsVisible } from '../data/fs'
import { gehoertZu } from '../data/helpers'
import { LOCALES } from '../i18n/langs'
import { useT } from '../i18n/useT'
import type { FsInstance } from '../data/types'
import { wochentagName } from '../planen/wochentage'

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
  const { t, tu } = useT()
  const me = state.persons.find((p) => p.id === state.personId)
  const insts = fsVisible(
    state.fsWeeks[state.week] ?? [],
    state.persons,
    state.groups,
    state.personId,
    state.planner,
  )

  if (insts.length === 0) {
    return (
      <div className="panel panel--lead panel--pb16" data-farbe="gold">
        <p className="prog-meta">{t.fsKeine}</p>
      </div>
    )
  }

  // Nach Wochentag gruppieren (fsWeeks ist bereits sortiert: Mo→So, Zeit, Gruppe).
  const days: { wd: number; label: string; items: FsInstance[] }[] = []
  for (const inst of insts) {
    let day = days.find((d) => d.wd === inst.wd)
    if (!day) {
      // Montag aus der Woche selbst (siehe `fsKennung`) — `fsBase + wi·7`
      // nennt bei einer Lücke im Bestand ab dort den falschen Tag.
      const tag = fsTag(fsKennung(state.weeks[state.week], state.fsBase, state.week), inst.wd)
      const label = tag
        ? tag.toLocaleDateString(LOCALES[state.lang], { weekday: 'long', day: 'numeric', month: 'long' })
        : wochentagName((inst.wd + 6) % 7, state.lang)
      day = { wd: inst.wd, label, items: [] }
      days.push(day)
    }
    day.items.push(inst)
  }

  const groupName = (grp: string): string => {
    const g = state.groups.find((x) => x.id === grp)
    return g ? tu(g.name) : grp
  }

  return (
    <>
      {days.map((day) => (
        <div key={day.wd} className="panel" data-farbe="gold">
          <h2 className="panel-label">{day.label}</h2>
          {day.items.map((inst) => (
            <div key={inst.id} className="fs-row">
              <div className="fs-row-main">
                <span className="fs-time">{inst.time}</span>
                <div>
                  <div className="fs-title">{inst.grp === '' ? t.fsVers : groupName(inst.grp)}</div>
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
                  <span className={inst.leader ? '' : 'fs-leader-open'}>
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
