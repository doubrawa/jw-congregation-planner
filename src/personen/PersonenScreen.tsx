import { useState } from 'react'
import { useApp } from '../app/context'
import { emptyQualifications, fullName, initials, personCompare, personLabel, roleLabel } from '../data/helpers'
import { sendInviteMails } from '../lib/invite'
import { fill, useT } from '../i18n/useT'
import { appUrl, linkedMember, makeInvite, openInvite } from './invite-helpers'
import { OrphanAccounts } from './OrphanAccounts'
import { PersonDetail } from './PersonDetail'
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
  const [search, setSearch] = useState('')

  const query = search.trim().toLowerCase()
  const sorted = [...state.persons].sort(personCompare)
  const filtered = sorted.filter((p) => !query || fullName(p).toLowerCase().includes(query))
  const production = state.dataStatus !== 'demo'

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
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      /* Zwischenablage nicht verfügbar — Codes stehen an den Personen */
    }
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

      {production && (
        <button type="button" className="btn-outline pers-add" onClick={() => void inviteAll()}>
          {t.alleEinladen}
        </button>
      )}

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

      <OrphanAccounts />
    </section>
  )
}
