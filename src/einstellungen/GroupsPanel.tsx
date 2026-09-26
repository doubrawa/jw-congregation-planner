import { useId, useState, type ReactNode } from 'react'
import { useApp } from '../app/context'
import { Chevron } from '../components/Chevron'
import { fsGruppeEntfernen } from '../data/fs'
import { displayName, ohneGruppe, personCompare } from '../data/helpers'
import { fill, useT } from '../i18n/useT'
import type { Group, Person } from '../data/types'

/**
 * Eine Gruppe: Name, Mitgliederzahl, Aufseher und Gehilfe — und das Löschen.
 *
 * **Löschen mit Rückfrage.** Ein Tipp löschte bis dahin sofort, und mit der
 * Gruppe verloren ihre Mitglieder still die Zuordnung. Jetzt wie beim Löschen
 * einer Person und beim Leeren der Zuteilungen: Der erste Tipp bewaffnet den
 * Knopf und nennt, was verloren geht; erst der zweite löscht. Verlässt der
 * Fokus den Knopf, entschärft er sich wieder.
 *
 * Nicht über `useZweiTipp`, sondern mit dem Zustand des Elternteils: Es ist
 * **eine** Gruppe zur Zeit bewaffnet — wer die nächste antippt, entschärft
 * die vorige, auch wenn der Fokus die erste nie verlassen hat.
 */
function GruppenZeile({
  group,
  mitglieder,
  armed,
  bewaffnen,
  entschaerfen,
  folgen,
  ovOptions,
  asOptions,
}: {
  group: Group
  mitglieder: string
  armed: boolean
  bewaffnen: () => void
  entschaerfen: () => void
  /** Was mit der Gruppe verloren geht — nur gefragt, wenn der Knopf bewaffnet ist. */
  folgen: (group: Group) => string[]
  ovOptions: ReactNode
  asOptions: ReactNode
}) {
  const { dispatch } = useApp()
  const { t, tu } = useT()
  const warnung = armed ? folgen(group) : []
  const warnId = useId()
  return (
    <div className="grp-block">
      <div className="grp-head">
        <div className="grp-name">{tu(group.name)}</div>
        <div className="grp-count">{mitglieder}</div>
        <button
          type="button"
          className={armed ? 'svc-remove grp-remove is-armed' : 'svc-remove grp-remove'}
          // Bewaffnet trägt der Knopf seinen Text selbst; das ✕ davor
          // braucht die Beschriftung für den Screenreader.
          aria-label={armed ? undefined : t.a11yRemove}
          aria-describedby={warnung.length > 0 ? warnId : undefined}
          onClick={() => {
            if (!armed) {
              bewaffnen()
              return
            }
            entschaerfen()
            dispatch({ type: 'removeGroup', id: group.id })
          }}
          onBlur={entschaerfen}
        >
          {armed ? t.loeschenSicher : '✕'}
        </button>
      </div>
      {warnung.length > 0 && (
        <p id={warnId} className="grp-del-warn">
          {warnung.join(' ')}
        </p>
      )}
      <div className="grp-selects">
        <label className="grp-field">
          <span className="field-label">{t.aufseherLbl}</span>
          <select
            className="mem-select"
            value={group.overseerId ?? ''}
            onChange={(e) =>
              dispatch({
                type: 'updateGroup',
                id: group.id,
                patch: { overseerId: e.target.value || null },
              })
            }
          >
            {ovOptions}
          </select>
        </label>
        <label className="grp-field">
          <span className="field-label">{t.gehilfeLbl}</span>
          <select
            className="mem-select"
            value={group.assistantId ?? ''}
            onChange={(e) =>
              dispatch({
                type: 'updateGroup',
                id: group.id,
                patch: { assistantId: e.target.value || null },
              })
            }
          >
            {asOptions}
          </select>
        </label>
      </div>
    </div>
  )
}

/** Predigtdienstgruppen: Aufseher/Gehilfe je Gruppe, Mitgliederzahl, hinzufügen/löschen. */
export function GroupsPanel() {
  const { state, dispatch } = useApp()
  const { t } = useT()
  /** Die Gruppe, deren ✕ gerade bewaffnet ist (siehe `GruppenZeile`). */
  const [loeschArmed, setLoeschArmed] = useState<string | null>(null)

  const sortedPersons = [...state.persons].sort((a, b) => personCompare(a, b, state.lang))
  const ohne = ohneGruppe(state.persons, state.groups)

  // Aufseher nur aus Ältesten/Dienstamtgehilfen, Gehilfe aus allen außer
  // Schwestern (Predigtdienstgruppen).
  const groupPersonOptions = (allowed: (p: Person) => boolean) => (
    <>
      <option value="">—</option>
      {sortedPersons.filter(allowed).map((p) => (
        <option key={p.id} value={p.id}>
          {displayName(p)}
        </option>
      ))}
    </>
  )
  const ovOptions = groupPersonOptions((p) => p.role === 'aeltester' || p.role === 'dienstamtgehilfe')
  const asOptions = groupPersonOptions((p) => !p.female)

  const groupMemberLabel = (id: string): string => {
    const n = state.persons.filter((p) => p.grp === id).length
    return fill(t.mitgliederN, { n })
  }

  /**
   * Was mit der Gruppe verloren geht — gefragt wird dieselbe Stelle, die beim
   * Löschen streicht. Eine eigene Zählung hier könnte eines Tages Treffpunkte
   * nennen, die gar nicht gehen, oder die verschweigen, die gehen.
   */
  const folgen = (group: Group): string[] => {
    const out: string[] = []
    if (state.persons.some((p) => p.grp === group.id)) out.push(t.gruppeDelMitglieder)
    const rest = fsGruppeEntfernen(state.fsRules, state.fsWeeks, group.id)
    if (rest.fsRules !== state.fsRules || rest.fsWeeks !== state.fsWeeks) out.push(t.gruppeDelTreffpunkte)
    return out
  }

  const addGroup = () => {
    const maxN = state.groups.reduce(
      (m, g) => Math.max(m, Number.parseInt(g.name.replace(/\D/g, ''), 10) || 0),
      0,
    )
    dispatch({
      type: 'addGroup',
      group: { id: crypto.randomUUID(), name: `Gruppe ${maxN + 1}`, overseerId: null, assistantId: null },
    })
  }

  return (
    <div className="panel panel--pb16" data-farbe="neutral2">
      <h2 className="panel-label">{t.gruppenCard}</h2>
      <p className="panel-hint">{t.gruppenDesc}</p>
      {/* Wer keiner Gruppe zugeordnet ist, steht hier — an der Stelle, an der
          eine gelöschte Gruppe ihre Mitglieder zurücklässt. Zuordnen lässt es
          sich im Personen-Detail; die Liste dort nennt die Namen. */}
      {ohne.length > 0 && (
        <button
          type="button"
          className="grp-ohne"
          onClick={() => dispatch({ type: 'navigate', screen: 'personen' })}
        >
          <span className="grp-ohne-badge" aria-hidden="true">
            !
          </span>
          <span className="grp-ohne-title">{t.ohneGruppeTitle}</span>
          <span className="grp-ohne-count">{ohne.length}</span>
          <Chevron dir="next" />
        </button>
      )}
      {state.groups.map((group) => (
        <GruppenZeile
          key={group.id}
          group={group}
          mitglieder={groupMemberLabel(group.id)}
          armed={loeschArmed === group.id}
          bewaffnen={() => setLoeschArmed(group.id)}
          entschaerfen={() => setLoeschArmed(null)}
          folgen={folgen}
          ovOptions={ovOptions}
          asOptions={asOptions}
        />
      ))}
      <button type="button" className="btn-outline grp-add" onClick={addGroup}>
        {t.gruppeHinzu}
      </button>
    </div>
  )
}
