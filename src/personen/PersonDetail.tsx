import { useApp } from '../app/context'
import { QUALIFICATION_ORDER, WT_ROLE_ORDER } from '../data/constants'
import { initials, personLabel, roleLabel, serviceQualKey } from '../data/helpers'
import { fill, useT } from '../i18n/useT'
import { PRIV_KEY, ROLE_KEY } from '../i18n/ui'
import type { Person, QualificationKey, Role } from '../data/types'
import { KontoCard } from './KontoCard'
import { PlannerToggle, PrivToggle } from './PrivToggle'

const ROLE_ORDER: readonly Role[] = ['aeltester', 'dienstamtgehilfe', 'verkuendiger']

/**
 * Personen-Detail: Stammdaten, Geschlecht/Rolle/Gruppe, die Aufgabenbereich-
 * Toggles (feste Bereiche + je konfiguriertem Hilfsdienst einer), die festen
 * Wachtturm-Rollen samt Planer-Recht, im Produktionsmodus die Konto-Karte.
 */
export function PersonDetail({ person }: { person: Person }) {
  const { state, dispatch } = useApp()
  const { t, tu } = useT()
  const update = (patch: Partial<Person>) =>
    dispatch({ type: 'updatePerson', id: person.id, patch })

  // Vorsitz ist nach Zusammenkunft getrennt: Basis-Label „Vorsitz" + Zusatz
  // aus den bereits übersetzten Tab-Namen (unter der Woche / Wochenende).
  const privLabel = (key: QualificationKey): string =>
    key === 'vorsitzMid'
      ? `${t.privVorsitz} · ${t.tabMid}`
      : key === 'vorsitzWe'
        ? `${t.privVorsitz} · ${t.tabWe}`
        : t[PRIV_KEY[key]]

  const fields: Array<[keyof Person & ('fn' | 'ln' | 'dn' | 'tel' | 'mail'), string]> = [
    ['fn', t.vorname],
    ['ln', t.nachname],
    ['dn', t.anzeigename],
    ['tel', t.telefon],
    ['mail', t.emailLbl],
  ]

  return (
    <section className="screen">
      <button
        type="button"
        className="pers-back"
        onClick={() => dispatch({ type: 'selectPerson', id: null })}
      >
        <span className="pers-back-chev" aria-hidden="true">
          ‹
        </span>
        {t.allePersonen.replace(/^[‹›]\s*/, '')}
      </button>

      <div className="pers-detail-head">
        <span className="avatar avatar--tint avatar--54">{initials(person)}</span>
        <div>
          <h1 className="pers-detail-name">{personLabel(person)}</h1>
          <div className="pers-detail-sub">
            {tu(roleLabel(person))} · {fill(t.congLabel, { name: state.congregation.name })}
          </div>
        </div>
      </div>

      <div className="panel panel--lead panel--pb16" data-farbe="neutral">
        <div className="panel-label">{t.stammdaten}</div>
        {fields.map(([key, label]) => (
          <div key={key} className="pers-field">
            <label className="field-label" htmlFor={`pers-${key}`}>
              {label}
            </label>
            <input
              id={`pers-${key}`}
              className="field-input"
              type="text"
              value={person[key] ?? ''}
              onChange={(e) => update({ [key]: e.target.value })}
            />
          </div>
        ))}
        <div className="pers-role-block">
          <div className="field-label">{t.geschlecht}</div>
          <div className="role-chips">
            <button
              type="button"
              className={!person.female ? 'role-chip is-active' : 'role-chip'}
              aria-pressed={!person.female}
              onClick={() => update({ female: false })}
            >
              {t.bruder}
            </button>
            <button
              type="button"
              className={person.female ? 'role-chip is-active' : 'role-chip'}
              aria-pressed={Boolean(person.female)}
              onClick={() => update({ female: true })}
            >
              {t.schwester}
            </button>
          </div>
        </div>
        <div className="pers-role-block">
          <div className="field-label">{t.rolle}</div>
          <div className="role-chips">
            {ROLE_ORDER.map((role) => (
              <button
                key={role}
                type="button"
                className={person.role === role ? 'role-chip is-active' : 'role-chip'}
                aria-pressed={person.role === role}
                onClick={() => update({ role })}
              >
                {t[ROLE_KEY[role]]}
              </button>
            ))}
          </div>
        </div>
        <div className="pers-role-block">
          <label className="field-label" htmlFor="pers-grp">
            {t.gruppeLbl}
          </label>
          <select
            id="pers-grp"
            className="mem-select pers-grp-select"
            value={person.grp ?? ''}
            onChange={(e) => update({ grp: e.target.value || null })}
          >
            <option value="">—</option>
            {state.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {tu(g.name)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="panel panel--pb10" data-farbe="petrol">
        <div className="panel-label">{t.aufgabenbereiche}</div>
        {QUALIFICATION_ORDER.map((key) => (
          <PrivToggle key={key} qkey={key} label={privLabel(key)} person={person} update={update} />
        ))}
        {/* Je Hilfsdienst ein Bereich; Gruppen-Dienste (Reinigung) rotieren
            Gruppen statt Personen und haben deshalb keinen. */}
        {state.services
          .filter((service) => !service.groups)
          .map((service) => (
            <PrivToggle
              key={service.key}
              qkey={serviceQualKey(service.key)}
              label={tu(service.name)}
              person={person}
              update={update}
            />
          ))}
      </div>

      <div className="panel panel--pb10" data-farbe="acc">
        <div className="panel-label">{t.wtRollenLabel}</div>
        <p className="panel-hint">{t.wtRollenHint}</p>
        {WT_ROLE_ORDER.map((key) => (
          <PrivToggle key={key} qkey={key} label={privLabel(key)} person={person} update={update} />
        ))}
        <PlannerToggle person={person} update={update} />
      </div>

      {state.dataStatus !== 'demo' && <KontoCard person={person} />}

      <button
        type="button"
        className="pers-delete"
        onClick={() => {
          const name = personLabel(person)
          if (window.confirm(fill(t.confirmPersonDel, { name }))) {
            dispatch({ type: 'removePerson', id: person.id })
          }
        }}
      >
        {t.persLoeschen}
      </button>
    </section>
  )
}
