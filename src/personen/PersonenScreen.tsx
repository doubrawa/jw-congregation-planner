import { useState } from 'react'
import { useApp } from '../app/context'
import { QUALIFICATION_LABEL, QUALIFICATION_ORDER, ROLE_LABEL } from '../data/constants'
import { CONGREGATION } from '../data/demo'
import { initials, roleLabel } from '../data/helpers'
import type { Person, Role } from '../data/types'
import './personen.css'

const ROLE_ORDER: readonly Role[] = ['aeltester', 'dienstamtgehilfe', 'verkuendiger']

const EMPTY_PRIV: Person['priv'] = {
  vorsitz: false,
  vortrag: false,
  gebet: false,
  lesen: false,
  schulung: false,
  studium: false,
  mikrofon: false,
  ton: false,
  ordner: false,
}

/**
 * Personen (Screen 5, nur Planer): Liste mit Live-Suche und Detail mit
 * Stammdaten, Rollen-Chips und den 9 Aufgabenbereich-Toggles. Änderungen
 * wirken direkt auf den State (wie im Prototyp); SPEICHERN führt zur Liste
 * zurück und bestätigt per Toast.
 */
export function PersonenScreen() {
  const { state } = useApp()
  const selected = state.persons.find((p) => p.id === state.selectedPersonId)
  return selected ? <PersonDetail person={selected} /> : <PersonList />
}

function PersonList() {
  const { state, dispatch } = useApp()
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
        <h1 className="screen-title">Personen</h1>
        <span className="screen-head-note">{state.persons.length} Personen</span>
      </div>

      <input
        type="text"
        className="pers-search"
        placeholder="Suchen …"
        aria-label="Personen durchsuchen"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <button type="button" className="btn-outline pers-add" onClick={addPerson}>
        + NEUE PERSON ANLEGEN
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
              <span className="pers-name">{`${person.fn} ${person.ln}`.trim() || 'Neue Person'}</span>
              <span className="pers-sub">
                {roleLabel(person)} ·{' '}
                {Object.values(person.priv).filter(Boolean).length} Aufgabenbereiche
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
  const { dispatch } = useApp()
  const update = (patch: Partial<Person>) =>
    dispatch({ type: 'updatePerson', id: person.id, patch })

  const fields: Array<[keyof Person & ('fn' | 'ln' | 'tel' | 'mail'), string]> = [
    ['fn', 'VORNAME'],
    ['ln', 'NACHNAME'],
    ['tel', 'TELEFON'],
    ['mail', 'E-MAIL'],
  ]

  return (
    <section className="screen">
      <button
        type="button"
        className="pers-back"
        onClick={() => dispatch({ type: 'selectPerson', id: null })}
      >
        ‹ Alle Personen
      </button>

      <div className="pers-detail-head">
        <span className="avatar avatar--tint avatar--54">{initials(person)}</span>
        <div>
          <h1 className="pers-detail-name">{`${person.fn} ${person.ln}`.trim() || 'Neue Person'}</h1>
          <div className="pers-detail-sub">
            {roleLabel(person)} · Versammlung {CONGREGATION.name}
          </div>
        </div>
      </div>

      <div className="panel panel--lead panel--pb16" data-farbe="neutral">
        <div className="panel-label">STAMMDATEN</div>
        {fields.map(([key, label]) => (
          <div key={key} className="pers-field">
            <label className="field-label" htmlFor={`pers-${key}`}>
              {label}
            </label>
            <input
              id={`pers-${key}`}
              className="field-input"
              type="text"
              value={person[key]}
              onChange={(e) => update({ [key]: e.target.value })}
            />
          </div>
        ))}
        <div className="pers-role-block">
          <div className="field-label">ROLLE</div>
          <div className="role-chips">
            {ROLE_ORDER.map((role) => (
              <button
                key={role}
                type="button"
                className={person.role === role ? 'role-chip is-active' : 'role-chip'}
                aria-pressed={person.role === role}
                onClick={() => update({ role })}
              >
                {ROLE_LABEL[role]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="panel panel--pb10" data-farbe="petrol">
        <div className="panel-label">AUFGABENBEREICHE</div>
        {QUALIFICATION_ORDER.map((key) => {
          const on = person.priv[key]
          return (
            <div key={key} className="priv-row">
              <span className="priv-label">{QUALIFICATION_LABEL[key]}</span>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={QUALIFICATION_LABEL[key]}
                className={on ? 'switch is-on' : 'switch'}
                onClick={() => update({ priv: { ...person.priv, [key]: !on } })}
              >
                <span className="switch-knob" />
              </button>
            </div>
          )
        })}
      </div>

      <button
        type="button"
        className="btn-primary pers-save"
        onClick={() => dispatch({ type: 'savePerson' })}
      >
        SPEICHERN
      </button>
    </section>
  )
}
