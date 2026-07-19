import { useState } from 'react'
import { useApp } from '../app/context'
import type { AppState } from '../app/context'
import { QUALIFICATION_ORDER, WT_ROLE_ORDER } from '../data/constants'
import { initials, personCompare, roleLabel, serviceQualKey } from '../data/helpers'
import { generateInviteCode } from '../lib/data'
import { sendInviteMails } from '../lib/invite'
import { fill, useT } from '../i18n/useT'
import { PRIV_KEY, ROLE_KEY } from '../i18n/ui'
import type { Invite, Member, Person, Role } from '../data/types'
import './personen.css'

/* ---- Einladungs-Helfer ----------------------------------------------------
 * Einladungen sind personenzentriert: Code am Personen-Detail erzeugen und per
 * eigenem Mail-Programm (mailto:) oder Teilen/Kopieren weitergeben — die App
 * verschickt selbst nichts.
 */

function linkedMember(state: AppState, personId: string): Member | undefined {
  return state.members.find((m) => m.personId === personId)
}

function openInvite(state: AppState, personId: string): Invite | undefined {
  return state.invites.find((i) => i.personId === personId)
}

function appUrl(): string {
  return new URL(import.meta.env.BASE_URL, window.location.origin).href
}

function makeInvite(person: Person): Invite {
  return {
    id: crypto.randomUUID(),
    code: generateInviteCode(),
    personId: person.id,
    planner: Boolean(person.planner),
  }
}

function inviteMailHref(
  person: Person,
  code: string,
  subject: string,
  bodyTemplate: string,
): string {
  const body = fill(bodyTemplate, { name: person.fn, code, url: appUrl() })
  return `mailto:${person.mail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

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
  const sorted = [...state.persons].sort(personCompare)
  const filtered = sorted.filter((p) => !query || `${p.fn} ${p.ln}`.toLowerCase().includes(query))
  const production = state.dataStatus !== 'demo'
  const orphanAccounts = state.members.filter((m) => !m.personId)

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
      lines.push(`${`${person.fn} ${person.ln}`.trim()}: ${invite.code}`)
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

      {production && orphanAccounts.length > 0 && (
        <div className="panel panel--pb14 pers-orphans" data-farbe="neutral2">
          <div className="panel-label">{t.kontenOhnePerson}</div>
          <p className="panel-hint">{t.kontenOhnePersonHint}</p>
          {orphanAccounts.map((member) => (
            <div key={member.userId} className="mem-row">
              <div className="mem-mail" dir="auto">
                {member.email || member.userId.slice(0, 8)}
                {member.userId === state.userId && <span className="mem-du">{t.duMarker}</span>}
              </div>
              <div className="mem-line">
                <select
                  className="mem-select"
                  aria-label={t.nameLbl}
                  value=""
                  onChange={(e) =>
                    e.target.value &&
                    dispatch({
                      type: 'updateMember',
                      userId: member.userId,
                      patch: { personId: e.target.value },
                    })
                  }
                >
                  <option value="">{t.keinePersonOpt}</option>
                  {sorted.map((p) => (
                    <option key={p.id} value={p.id}>
                      {`${p.fn} ${p.ln}`.trim() || '—'}
                    </option>
                  ))}
                </select>
                {member.userId !== state.userId && (
                  <button
                    type="button"
                    className="svc-remove"
                    aria-label="✕"
                    onClick={() => dispatch({ type: 'removeMember', userId: member.userId })}
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
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

      <div className="panel panel--pb10" data-farbe="acc">
        <div className="panel-label">{t.wtRollenLabel}</div>
        <p className="panel-hint">{t.wtRollenHint}</p>
        {WT_ROLE_ORDER.map((key) => (
          <PrivToggle key={key} qkey={key} label={t[PRIV_KEY[key]]} person={person} update={update} />
        ))}
        <PlannerToggle person={person} update={update} />
      </div>

      {state.dataStatus !== 'demo' && <KontoCard person={person} />}

      <button
        type="button"
        className="pers-delete"
        onClick={() => {
          const name = `${person.fn} ${person.ln}`.trim() || '—'
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

/**
 * Planer-Recht (Feste Rollen): sieht Planen/Personen/Einstellungen. Wird in
 * verknüpfte Konten gespiegelt; das eigene Recht ist gesperrt (sonst könnte
 * sich der letzte Planer selbst aussperren).
 */
function PlannerToggle({
  person,
  update,
}: {
  person: Person
  update: (patch: Partial<Person>) => void
}) {
  const { state } = useApp()
  const { t } = useT()
  const self = state.members.some((m) => m.personId === person.id && m.userId === state.userId)
  const on = Boolean(person.planner)
  return (
    <div className={self ? 'priv-row priv-row--locked' : 'priv-row'}>
      <span className="priv-label">{t.planerLbl}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={t.planerLbl}
        disabled={self}
        className={on ? 'switch is-on' : 'switch'}
        onClick={() => update({ planner: !on })}
      >
        <span className="switch-knob" />
      </button>
    </div>
  )
}

/**
 * Konto-Karte (nur Produktionsmodus): Status des App-Zugangs der Person —
 * verknüpftes Konto, offener Einladungscode oder Einladen-Aktion. Mit
 * E-Mail-Adresse öffnet Einladen das eigene Mail-Programm (mailto:), ohne
 * werden Code + Teilen/Kopieren angeboten. Die App verschickt selbst nichts.
 */
function KontoCard({ person }: { person: Person }) {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const member = linkedMember(state, person.id)
  const invite = openInvite(state, person.id)
  const self = member?.userId === state.userId

  const shareText = (code: string) => fill(t.inviteShareText, { code, url: appUrl() })

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(shareText(code))
      dispatch({ type: 'showToast', text: t.toastCodeKopiert })
    } catch {
      dispatch({ type: 'showToast', text: code })
    }
  }

  const share = async (code: string) => {
    if (navigator.share) {
      try {
        await navigator.share({ text: shareText(code) })
      } catch {
        /* Teilen abgebrochen */
      }
      return
    }
    await copyCode(code)
  }

  // Einladen: Code anlegen; mit E-Mail zuerst Server-Versand (eigene Domain
  // via send-invite) versuchen, sonst/als Fallback das Mail-Programm öffnen.
  const invitePerson = async () => {
    const created = makeInvite(person)
    dispatch({ type: 'addInvite', invite: created })
    if (!person.mail) return
    const res = await sendInviteMails([{ personId: person.id, code: created.code }])
    if (res.ok && res.sent > 0) {
      dispatch({ type: 'showToast', text: t.toastInviteMail })
      return
    }
    window.location.href = inviteMailHref(person, created.code, t.inviteMailSubject, t.inviteMailBody)
  }

  const mailInvite = async (code: string) => {
    const res = await sendInviteMails([{ personId: person.id, code }])
    if (res.ok && res.sent > 0) {
      dispatch({ type: 'showToast', text: t.toastInviteMail })
      return
    }
    window.location.href = inviteMailHref(person, code, t.inviteMailSubject, t.inviteMailBody)
  }

  return (
    <div className="panel panel--pb14" data-farbe="neutral2">
      <div className="panel-label">{t.kontoCard}</div>
      {member ? (
        <div className="konto-row">
          <span className="konto-mail" dir="auto">
            ✓ {member.email || t.kontoVerknuepft}
            {self && <span className="mem-du">{t.duMarker}</span>}
          </span>
          {!self && (
            <button
              type="button"
              className="svc-remove"
              aria-label="✕"
              onClick={() => dispatch({ type: 'removeMember', userId: member.userId })}
            >
              ✕
            </button>
          )}
        </div>
      ) : invite ? (
        <>
          <p className="panel-hint">{t.codeOffenHint}</p>
          <div className="konto-row">
            <span className="mem-code">{invite.code}</span>
            <div className="konto-actions">
              {person.mail && (
                <button
                  type="button"
                  className="konto-link"
                  onClick={() => void mailInvite(invite.code)}
                >
                  {t.mailBtn}
                </button>
              )}
              <button type="button" className="konto-link" onClick={() => void share(invite.code)}>
                {t.teilenBtn}
              </button>
              <button type="button" className="konto-link" onClick={() => void copyCode(invite.code)}>
                {t.kopierenBtn}
              </button>
              <button
                type="button"
                className="svc-remove"
                aria-label="✕"
                onClick={() => dispatch({ type: 'removeInvite', id: invite.id })}
              >
                ✕
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <p className="panel-hint">{person.mail ? t.einladenHintMail : t.einladenHintOhneMail}</p>
          <button type="button" className="btn-outline konto-invite" onClick={() => void invitePerson()}>
            {t.einladenBtn}
          </button>
        </>
      )}
    </div>
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
  // Keine Geschlechts-Sperre: übernehmen Schwestern Bereiche (z. B. weil
  // Brüder fehlen), steuern das allein diese Schalter.
  const on = Boolean(person.priv[qkey])
  return (
    <div className="priv-row">
      <span className="priv-label">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        className={on ? 'switch is-on' : 'switch'}
        onClick={() => update({ priv: { ...person.priv, [qkey]: !on } })}
      >
        <span className="switch-knob" />
      </button>
    </div>
  )
}
