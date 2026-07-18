import { useState } from 'react'
import { useApp } from '../app/context'
import { QUALIFICATION_ORDER, WT_ROLE_ORDER } from '../data/constants'
import { initials, isBrothersOnly, roleLabel, serviceQualKey } from '../data/helpers'
import { fill, useT } from '../i18n/useT'
import { PRIV_KEY, ROLE_KEY } from '../i18n/ui'
import type { Person, Role } from '../data/types'
import './personen.css'

const ROLE_ORDER: readonly Role[] = ['aeltester', 'dienstamtgehilfe', 'verkuendiger']

const EMPTY_PRIV: Person['priv'] = {
  vorsitz: false,
  vortrag: false,
  gebet: false,
  bibellesung: false,
  leser: false,
  schulung: false,
  studium: false,
}

/**
 * Personen (Screen 5, nur Planer): Liste mit Live-Suche und Detail mit
 * Stammdaten, Rollen-Chips und den Aufgabenbereich-Toggles (feste Bereiche +
 * je konfiguriertem Hilfsdienst einer).
 */
export function PersonenScreen() {
  const { state } = useApp()
  const selected = state.persons.find((p) => p.id === state.selectedPersonId)
  return selected ? <PersonDetail person={selected} /> : <PersonList />
}

function PersonList() {
  const { state, dispatch } = useApp()
  const { t, tu } = useT()
  const [search, setSearch] = useState('')

  const query = search.trim().toLowerCase()
  const filtered = state.persons.filter(
    (p) => !query || `${p.fn} ${p.ln}`.toLowerCase().includes(query),
  )

  const addPerson = () => {
    dispatch({
      type: 'addPerson',
      person: {
        id: crypto.randomUUID(),
        fn: '',
        ln: '',
        role: 'verkuendiger',
        tel: '',
        mail: '',
        absent: [],
        priv: { ...EMPTY_PRIV },
      },
    })
  }

  return (
    <section className="screen">
      <div className="screen-head">
        <h1 className="screen-title">{t.personen}</h1>
        <span className="screen-head-note">{fill(t.personenCount, { n: state.persons.length })}</span>
      </div>

      <input
        type="text"
        className="pers-search"
        placeholder={t.suchen}
        aria-label={t.suchen}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <button type="button" className="btn-outline pers-add" onClick={addPerson}>
        {t.neuePerson}
      </button>

      <div className="pers-list">
        {filtered.map((person) => (
          <button
            key={person.id}
            type="button"
            className="pers-row"
            onClick={() => dispatch({ type: 'selectPerson', id: person.id })}
          >
            <span className="avatar avatar--tint avatar--40">{initials(person)}</span>
            <span>
              <span className="pers-name">{`${person.fn} ${person.ln}`.trim() || '—'}</span>
              <span className="pers-sub">
                {tu(roleLabel(person))} ·{' '}
                {fill(t.aufgabenbereicheN, { n: Object.values(person.priv).filter(Boolean).length })}
              </span>
            </span>
            <span className="pers-chevron">›</span>
          </button>
        ))}
      </div>
    </section>
  )
}

function PersonDetail({ person }: { person: Person }) {
  const { state, dispatch } = useApp()
  const { t, tu } = useT()
  const update = (patch: Partial<Person>) =>
    dispatch({ type: 'updatePerson', id: person.id, patch })

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
          <h1 className="pers-detail-name">{`${person.fn} ${person.ln}`.trim() || '—'}</h1>
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
          <PrivToggle key={key} qkey={key} label={t[PRIV_KEY[key]]} person={person} update={update} />
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

      <div className="panel panel--pb10" data-farbe="gold">
        <div className="panel-label">{t.wtRollenLabel}</div>
        <p className="panel-hint">{t.wtRollenHint}</p>
        {WT_ROLE_ORDER.map((key) => (
          <PrivToggle key={key} qkey={key} label={t[PRIV_KEY[key]]} person={person} update={update} />
        ))}
      </div>

      <button
        type="button"
        className="btn-primary pers-save"
        onClick={() => dispatch({ type: 'savePerson' })}
      >
        {t.speichern}
      </button>
    </section>
  )
}

/** Einzelner Aufgabenbereich-/Rollen-Schalter im Personen-Detail. */
function PrivToggle({
  qkey,
  label,
  person,
  update,
}: {
  qkey: string
  label: string
  person: Person
  update: (patch: Partial<Person>) => void
}) {
  // Schwestern können nur Schulungsaufgaben — alle anderen Bereiche gesperrt.
  const locked = Boolean(person.female) && isBrothersOnly(qkey)
  const on = !locked && Boolean(person.priv[qkey])
  return (
    <div className={locked ? 'priv-row priv-row--locked' : 'priv-row'}>
      <span className="priv-label">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        disabled={locked}
        className={on ? 'switch is-on' : 'switch'}
        onClick={() => update({ priv: { ...person.priv, [qkey]: !on } })}
      >
        <span className="switch-knob" />
      </button>
    </div>
  )
}
