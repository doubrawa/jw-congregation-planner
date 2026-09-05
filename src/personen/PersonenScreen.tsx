import { useId, useState } from 'react'
import { useApp } from '../app/context'
import { QUALIFICATION_ORDER, ROLE_ORDER, WT_ROLE_ORDER } from '../data/constants'
import { doppelteFesteRollen, duplicateDisplayNames, emptyQualifications, fullName, initials, listName, personCompare, serviceQualKey } from '../data/helpers'
import { copyText } from '../lib/clipboard'
import { sendInviteMails } from '../lib/invite'
import { congAppCode, LOCALES } from '../i18n/langs'
import { fill, useT } from '../i18n/useT'
import { ROLE_KEY } from '../i18n/ui'
import { appUrl, linkedMember, makeInvite, openInvite } from './invite-helpers'
import { OrphanAccounts } from './OrphanAccounts'
import { PersonDetail } from './PersonDetail'
import { KEIN_FILTER, passtZumFilter, type PersonFilter } from './person-filter'
import type { Person } from '../data/types'
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

/**
 * Zahl der gesetzten **Aufgabenbereiche** einer Person.
 *
 * Ohne die festen Wachtturm-Rollen: `person.priv` trägt sie mit
 * (`wtLeiter`/`wtVertreter`), das Detail zeigt sie aber ausdrücklich in einer
 * eigenen Karte („Feste Rollen") neben den Aufgabenbereichen. Über alle Werte
 * zu zählen hieß, dass der feste Studienleiter in der Liste einen Bereich mehr
 * hatte, als sein Detail zeigt.
 */
function bereicheCount(person: Person): number {
  const feste = new Set<string>(WT_ROLE_ORDER)
  return Object.entries(person.priv).filter(([key, an]) => an && !feste.has(key)).length
}

function PersonList() {
  const { state, dispatch } = useApp()
  const { t, tu } = useT()
  const [filter, setFilter] = useState<PersonFilter>(KEIN_FILTER)
  const setz = (patch: Partial<PersonFilter>) => setFilter((f) => ({ ...f, ...patch }))
  const locale = LOCALES[state.lang]

  const sorted = [...state.persons].sort(personCompare)
  const filtered = sorted.filter((p) => passtZumFilter(p, filter))
  const production = state.dataStatus !== 'demo'
  const dupes = duplicateDisplayNames(state.persons)
  const mehrfachRollen = doppelteFesteRollen(state.persons)

  // Sammel-Einladung: Codes für alle ohne Konto/offenen Code erzeugen. Mit
  // konfigurierter Domain gehen die Mails direkt raus (send-invite); die
  // Liste "Name: Code" landet zusätzlich in der Zwischenablage (für Personen
  // ohne E-Mail bzw. als Fallback ohne Domain).
  const inviteAll = async () => {
    /*
     * **Offline-Stand: gar nicht erst anfangen.**
     *
     * Der Reducer weist Schreib-Aktionen im Offline-Stand ab (`readonly.ts`) —
     * aber nur den Reducer. Was danach in derselben Funktion steht, lief
     * weiter: Die Codes entstehen hier im Baustein, keiner davon landet im Zustand
     * oder in der Datenbank — und die Mails gingen trotzdem an **alle** ohne
     * Konto, samt Liste in der Zwischenablage. Lauter Codes, die
     * `redeem_invite` nicht kennt.
     *
     * `PlanSendenPanel` zieht dieselbe Grenze und aus demselben Grund: Wer eine
     * Edge Function unmittelbar ruft, kommt am Reducer vorbei.
     */
    if (state.staleAt) {
      dispatch({ type: 'showToast', text: t.offlineReadOnly })
      return
    }
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
    const res = mailable.length > 0 ? await sendInviteMails(mailable, congAppCode(state.congLang)) : null
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

      {/* Feste Rollen sind der Sache nach je EINE Person. Sind zwei Schalter
          gesetzt, greift sich die Auto-Zuteilung irgendeinen — bisher ohne
          jeden Hinweis (F7). Gleiche Optik wie die Dubletten-Warnung; alle
          Texte sind vorhandene Bausteine, damit sie in jeder Sprache stimmen. */}
      {mehrfachRollen.length > 0 && (
        <div className="pers-dupes">
          <div className="pers-dupes-head">
            <span className="pers-dupes-badge">!</span>
            <span className="pers-dupes-title">{t.wtRollenLabel}</span>
            <span className="pers-dupes-count">{mehrfachRollen.length}</span>
          </div>
          <div className="pers-dupes-hint">{t.wtRollenHint}</div>
          {mehrfachRollen.map((r) => (
            <div key={r.key} className="pers-dupes-row">
              <span dir="auto">{fill(t.dublettenRow, { name: privLabel(t, r.key), n: r.count })}</span>
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
          locale={locale}
          label={t.geschlecht}
          value={filter.sex}
          onChange={(v) => setz({ sex: v as PersonFilter['sex'] })}
          options={[
            ['m', t.bruder],
            ['w', t.schwester],
          ]}
        />
        <FilterSelect
          locale={locale}
          label={t.rolle}
          value={filter.role}
          onChange={(v) => setz({ role: v as PersonFilter['role'] })}
          options={ROLE_ORDER.map((role) => [role, t[ROLE_KEY[role]]])}
        />
        {/* Ohne angelegte Gruppen hätte die Auswahl nur den Platzhalter. */}
        {state.groups.length > 0 && (
          <FilterSelect
          locale={locale}
            label={t.gruppeLbl}
            value={filter.grp}
            onChange={(v) => setz({ grp: v })}
            options={state.groups.map((g) => [g.id, tu(g.name)])}
          />
        )}
        <FilterSelect
          locale={locale}
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
              <span className="pers-name" dir="auto">{listName(person)}</span>
              <span className="pers-sub">
                {t[ROLE_KEY[person.role]]} · {fill(t.aufgabenbereicheN, { n: bereicheCount(person) })}
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
  locale,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: ReadonlyArray<readonly [string, string]>
  locale: string
}) {
  const id = useId()
  // Alphabetisch nach der übersetzten Beschriftung — in einer langen Auswahl
  // sucht man nach dem Wort, nicht nach der Programmreihenfolge. `numeric`
  // hält „Gruppe 2" vor „Gruppe 10".
  const sortiert = [...options].sort((a, b) => a[1].localeCompare(b[1], locale, { numeric: true }))
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
        {sortiert.map(([key, text]) => (
          <option key={key} value={key}>
            {text}
          </option>
        ))}
      </select>
    </div>
  )
}
