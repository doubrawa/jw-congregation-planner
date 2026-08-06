import { useId, useState } from 'react'
import { useApp } from '../app/context'
import { QUALIFICATION_ORDER, ROLE_ORDER } from '../data/constants'
import { duplicateDisplayNames, emptyQualifications, fullName, initials, personCompare, personLabel, roleLabel, serviceQualKey } from '../data/helpers'
import { copyText } from '../lib/clipboard'
import { sendInviteMails } from '../lib/invite'
import { fill, useT } from '../i18n/useT'
import { ROLE_KEY } from '../i18n/ui'
import { appUrl, linkedMember, makeInvite, openInvite } from './invite-helpers'
import { OrphanAccounts } from './OrphanAccounts'
import { PersonDetail } from './PersonDetail'
import { KEIN_FILTER, passtZumFilter, type PersonFilter } from './person-filter'
import { privLabel } from './priv-label'
import './personen.css'

/**
 * Personen (Screen 5, nur Planer): Liste mit Live-Suche + Sammel-Einladung
 * (PersonList) oder Detail (PersonDetail). Konten ohne verknüpfte Person
 * verwaltet OrphanAccounts.
 */
export function PersonenScreen() {
  const { state } = useApp()
  const selected = state.persons.find((p) => p.id === state.selectedPersonId)
  return selected ? <PersonDetail person={selected} /> : <PersonList />
}

function PersonList() {
  const { state, dispatch } = useApp()
  const { t, tu } = useT()
  const [filter, setFilter] = useState<PersonFilter>(KEIN_FILTER)
  const setz = (patch: Partial<PersonFilter>) => setFilter((f) => ({ ...f, ...patch }))

  const sorted = [...state.persons].sort(personCompare)
  const filtered = sorted.filter((p) => passtZumFilter(p, filter))
  const production = state.dataStatus !== 'demo'
  const dupes = duplicateDisplayNames(state.persons)

  // Sammel-Einladung: Codes für alle ohne Konto/offenen Code erzeugen. Mit
  // konfigurierter Domain gehen die Mails direkt raus (send-invite); die
  // Liste "Name: Code" landet zusätzlich in der Zwischenablage (für Personen
  // ohne E-Mail bzw. als Fallback ohne Domain).
  const inviteAll = async () => {
    const candidates = sorted.filter((p) => !linkedMember(state, p.id) && !openInvite(state, p.id))
    if (candidates.length === 0) {
      dispatch({ type: 'showToast', text: t.toastAlleHabenKonto })
      return
    }
    const lines: string[] = []
    const mailable: Array<{ personId: string; code: string }> = []
    for (const person of candidates) {
      const invite = makeInvite(person)
      dispatch({ type: 'addInvite', invite })
      lines.push(`${fullName(person)}: ${invite.code}`)
      if (person.mail) mailable.push({ personId: person.id, code: invite.code })
    }
    const text = `${fill(t.inviteListeTitel, { url: appUrl() })}\n\n${lines.join('\n')}`
    // Zwischenablage best effort — misslingt sie, stehen die Codes weiterhin an
    // den Personen (Konto-Karte).
    await copyText(text)
    const res = mailable.length > 0 ? await sendInviteMails(mailable) : null
    if (res?.ok && res.sent > 0) {
      dispatch({
        type: 'showToast',
        text: fill(t.toastEinladungenMailN, { n: candidates.length, m: res.sent }),
      })
    } else {
      dispatch({ type: 'showToast', text: fill(t.toastEinladungenN, { n: candidates.length }) })
    }
  }

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
        priv: emptyQualifications(),
      },
    })
  }

  return (
    <section className="screen">
      <div className="screen-head">
        <h1 className="screen-title">{t.personen}</h1>
        {/* Zählt die sichtbaren Personen — so zeigt der Kopf zugleich, wie
            stark Suche und Filter gerade einschränken. */}
        <span className="screen-head-note">{fill(t.personenCount, { n: filtered.length })}</span>
      </div>

      {dupes.length > 0 && (
        <div className="pers-dupes">
          <div className="pers-dupes-head">
            <span className="pers-dupes-badge">!</span>
            <span className="pers-dupes-title">{t.dublettenTitle}</span>
            <span className="pers-dupes-count">{dupes.length}</span>
          </div>
          <div className="pers-dupes-hint">{t.dublettenHint}</div>
          {dupes.map((d) => (
            <div key={d.name} className="pers-dupes-row">
              <span dir="auto">{fill(t.dublettenRow, { name: d.name, n: d.count })}</span>
            </div>
          ))}
        </div>
      )}

      {/* Konten ohne Person ganz oben — sonst leicht zu übersehen (nur wenn
          es welche gibt; rendert sonst nichts). */}
      <OrphanAccounts />

      <button type="button" className="btn-outline pers-add" onClick={addPerson}>
        {t.neuePerson}
      </button>

      {production && (
        <button type="button" className="btn-outline pers-add" onClick={() => void inviteAll()}>
          {t.alleEinladen}
        </button>
      )}

      <input
        type="search"
        className="pers-search"
        placeholder={t.suchen}
        aria-label={t.suchen}
        value={filter.q}
        onChange={(e) => setz({ q: e.target.value })}
      />

      <div className="pers-filters">
        <FilterSelect
          label={t.geschlecht}
          value={filter.sex}
          onChange={(v) => setz({ sex: v as PersonFilter['sex'] })}
          options={[
            ['m', t.bruder],
            ['w', t.schwester],
          ]}
        />
        <FilterSelect
          label={t.rolle}
          value={filter.role}
          onChange={(v) => setz({ role: v as PersonFilter['role'] })}
          options={ROLE_ORDER.map((role) => [role, t[ROLE_KEY[role]]])}
        />
        {/* Ohne angelegte Gruppen hätte die Auswahl nur den Platzhalter. */}
        {state.groups.length > 0 && (
          <FilterSelect
            label={t.gruppeLbl}
            value={filter.grp}
            onChange={(v) => setz({ grp: v })}
            options={state.groups.map((g) => [g.id, tu(g.name)])}
          />
        )}
        <FilterSelect
          label={t.aufgabenbereiche}
          value={filter.priv}
          onChange={(v) => setz({ priv: v })}
          options={[
            ...QUALIFICATION_ORDER.map((key) => [key, privLabel(t, key)] as [string, string]),
            // Wie im Detail: Gruppen-Dienste (Reinigung) rotieren Gruppen
            // statt Personen und haben deshalb keinen Bereich.
            ...state.services
              .filter((service) => !service.groups)
              .map((service) => [serviceQualKey(service.key), tu(service.name)] as [string, string]),
          ]}
        />
      </div>

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
              <span className="pers-name">{personLabel(person)}</span>
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

/**
 * Ein Filterfeld der Personenliste. Der Platzhalter „—" steht wie überall im
 * Screen für „nicht eingeschränkt"; ist etwas gewählt, hebt sich das Feld ab.
 */
function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: ReadonlyArray<readonly [string, string]>
}) {
  const id = useId()
  return (
    <div className="pers-filter">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className={value ? 'mem-select pers-grp-select is-active' : 'mem-select pers-grp-select'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">—</option>
        {options.map(([key, text]) => (
          <option key={key} value={key}>
            {text}
          </option>
        ))}
      </select>
    </div>
  )
}
