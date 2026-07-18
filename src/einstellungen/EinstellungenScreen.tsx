import { useState, type FormEvent } from 'react'
import { useApp } from '../app/context'
import { generateInviteCode } from '../lib/data'
import { importNextWeek, latestImportedStart } from '../lib/import'
import { CONG_TO_JW } from '../i18n/langs'
import { displayName } from '../data/helpers'
import { type Dict } from '../i18n/ui'
import { fill, useT } from '../i18n/useT'
import type { Service } from '../data/types'
import './einstellungen.css'

/**
 * Einstellungen (Screen 6, nur Planer): Versammlung, Mitglieder & Einladungen
 * (nur Produktionsmodus), Hilfsdienste, Sprache (Versammlungssprache-Sheet),
 * Erinnerungen und Programm-Import.
 */
export function EinstellungenScreen() {
  const { state, dispatch } = useApp()
  const { t, tu } = useT()
  const [serviceName, setServiceName] = useState('')
  const [invitePerson, setInvitePerson] = useState('')
  const [invitePlanner, setInvitePlanner] = useState(false)

  // Jeder Dienst ist sein eigener Aufgabenbereich (Schalter im Personen-Detail);
  // nur Gruppen-Dienste rotieren stattdessen Gruppen.
  const serviceSub = (service: Service): string =>
    service.groups ? t.gruppenRotation : t.eigenerBereich

  const reminderSub = (n: number): string => {
    if (n === 0) return t.remAmTag
    return n === 1 ? t.remTagVorher : fill(t.remTageVorher, { n })
  }

  const addService = (event: FormEvent) => {
    event.preventDefault()
    const name = serviceName.trim()
    if (!name) {
      dispatch({ type: 'showToast', text: t.toastNameEingeben })
      return
    }
    dispatch({
      type: 'addService',
      service: { key: `svc-${crypto.randomUUID()}`, name, count: 1, groups: false },
    })
    setServiceName('')
  }

  const importWorkbook = async () => {
    if (state.importing) return
    // Demo-Modus: simulierter Abruf (eine Beispielwoche) wie bisher
    if (state.dataStatus === 'demo') {
      if (state.imported) {
        dispatch({ type: 'showToast', text: t.toastAlleWochen })
        return
      }
      dispatch({ type: 'startImport' })
      setTimeout(() => dispatch({ type: 'finishImport' }), 900)
      return
    }
    // Produktion: echter Abruf der nächsten Woche von jw.org (Edge Function),
    // direkt in der Versammlungssprache (jw.org-Code, sonst Deutsch).
    dispatch({ type: 'startImport' })
    const langCode = CONG_TO_JW[state.congLang] ?? 'de'
    // Weitere Programmsprachen als Varianten mitholen (ohne die Primärsprache)
    const altCodes = [
      ...new Set(
        state.progLangs
          .map((name) => CONG_TO_JW[name])
          .filter((c): c is string => Boolean(c) && c !== langCode),
      ),
    ]
    const res = await importNextWeek(latestImportedStart(state.weeks), langCode, altCodes)
    if (!res.ok) {
      dispatch({ type: 'stopImport' })
      dispatch({ type: 'showToast', text: res.error === 'demo' ? t.demoHinweis : res.error })
      return
    }
    dispatch({ type: 'addImportedWeek', week: res.week })
  }

  const importLabel = state.importing
    ? t.importiere
    : state.imported
      ? t.alleImportiert
      : t.importBtn

  const createInvite = () => {
    dispatch({
      type: 'addInvite',
      invite: {
        id: crypto.randomUUID(),
        code: generateInviteCode(),
        personId: invitePerson || null,
        planner: invitePlanner,
      },
    })
    setInvitePerson('')
    setInvitePlanner(false)
  }

  const personName = (id: string | null): string => {
    const person = state.persons.find((p) => p.id === id)
    return person ? `${person.fn} ${person.ln}`.trim() : ''
  }

  const personOptions = (
    <>
      <option value="">{t.keinePersonOpt}</option>
      {state.persons.map((p) => (
        <option key={p.id} value={p.id}>
          {`${p.fn} ${p.ln}`.trim() || '—'}
        </option>
      ))}
    </>
  )

  // Aufseher nur aus Ältesten/Dienstamtgehilfen, Gehilfe aus allen außer
  // Schwestern (Predigtdienstgruppen).
  const groupPersonOptions = (allowed: (p: (typeof state.persons)[number]) => boolean) => (
    <>
      <option value="">—</option>
      {state.persons.filter(allowed).map((p) => (
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
    return n === 1 ? t.mitglied1 : fill(t.mitgliederN, { n })
  }

  const addGroup = () => {
    const maxN = state.groups.reduce(
      (m, g) => Math.max(m, Number.parseInt(g.name.replace(/\D/g, ''), 10) || 0),
      0,
    )
    dispatch({
      type: 'addGroup',
      group: { id: crypto.randomUUID(), name: `Gruppe ${maxN + 1}`, ov: null, as: null },
    })
  }

  const reminderRows: Array<{ key: 'first' | 'last'; name: keyof Dict }> = [
    { key: 'first', name: 'remErste' },
    { key: 'last', name: 'remLetzte' },
  ]

  const congFields: Array<['name' | 'hall' | 'meetings', string]> = [
    ['name', t.nameLbl],
    ['hall', t.saal],
    ['meetings', t.zusammenkuenfte],
  ]

  return (
    <section className="screen">
      <h1 className="screen-title">{t.einstellungen}</h1>
      <p className="screen-subtitle">{fill(t.congLabel, { name: state.congregation.name })}</p>

      <div className="panel panel--lead panel--pb16" data-farbe="neutral">
        <div className="panel-label">{t.versammlungCard}</div>
        {congFields.map(([key, label]) => (
          <div key={key} className="cong-field">
            <label className="field-label" htmlFor={`cong-${key}`}>
              {label}
            </label>
            <input
              id={`cong-${key}`}
              className="field-input"
              type="text"
              value={state.congregation[key]}
              onChange={(e) => dispatch({ type: 'updateCongregation', patch: { [key]: e.target.value } })}
            />
          </div>
        ))}
        <button
          type="button"
          className="btn-primary cong-save"
          onClick={() => dispatch({ type: 'saveCongregation' })}
        >
          {t.speichern}
        </button>
      </div>

      {state.dataStatus !== 'demo' && (
        <div className="panel panel--pb16" data-farbe="neutral2">
          <div className="panel-label">{t.mitgliederCard}</div>
          <p className="panel-hint">{t.mitgliederDesc}</p>
          {state.members.map((member) => {
            const self = member.userId === state.userId
            return (
              <div key={member.userId} className="mem-row">
                <div className="mem-mail" dir="auto">
                  {member.email || member.userId.slice(0, 8)}
                  {self && <span className="mem-du">{t.duMarker}</span>}
                </div>
                <div className="mem-line">
                  <select
                    className="mem-select"
                    aria-label={t.nameLbl}
                    value={member.personId ?? ''}
                    onChange={(e) =>
                      dispatch({
                        type: 'updateMember',
                        userId: member.userId,
                        patch: { personId: e.target.value || null },
                      })
                    }
                  >
                    {personOptions}
                  </select>
                  <span className="mem-planner-lbl">{t.planerLbl}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={member.planner}
                    aria-label={t.planerLbl}
                    className={member.planner ? 'switch is-on' : 'switch'}
                    disabled={self}
                    onClick={() =>
                      dispatch({
                        type: 'updateMember',
                        userId: member.userId,
                        patch: { planner: !member.planner },
                      })
                    }
                  >
                    <span className="switch-knob" />
                  </button>
                  {/* Eigenes Konto: unsichtbarer ✕-Platzhalter, damit die Switches fluchten */}
                  <button
                    type="button"
                    className={self ? 'svc-remove mem-remove--ph' : 'svc-remove'}
                    aria-label="✕"
                    aria-hidden={self || undefined}
                    tabIndex={self ? -1 : undefined}
                    disabled={self}
                    onClick={
                      self ? undefined : () => dispatch({ type: 'removeMember', userId: member.userId })
                    }
                  >
                    ✕
                  </button>
                </div>
              </div>
            )
          })}

          <div className="panel-label mem-inv-label">{t.einladungenLbl}</div>
          <p className="panel-hint">{t.einladungenDesc}</p>
          {state.invites.map((invite) => (
            <div key={invite.id} className="svc-row">
              <div>
                <div className="mem-code">{invite.code}</div>
                <div className="svc-sub">
                  {personName(invite.personId) || t.ohnePerson}
                  {invite.planner ? ` · ${t.planerLbl}` : ''}
                </div>
              </div>
              <button
                type="button"
                className="svc-remove"
                aria-label="✕"
                onClick={() => dispatch({ type: 'removeInvite', id: invite.id })}
              >
                ✕
              </button>
            </div>
          ))}
          {state.invites.length === 0 && <p className="abs-empty">{t.keineEinladungen}</p>}
          <div className="mem-inv-form">
            <select
              className="mem-select"
              aria-label={t.nameLbl}
              value={invitePerson}
              onChange={(e) => setInvitePerson(e.target.value)}
            >
              {personOptions}
            </select>
            <button
              type="button"
              className={invitePlanner ? 'role-chip is-active' : 'role-chip'}
              aria-pressed={invitePlanner}
              onClick={() => setInvitePlanner(!invitePlanner)}
            >
              {t.planerLbl}
            </button>
            <button type="button" className="svc-add-btn" onClick={createInvite}>
              {t.codeErstellen}
            </button>
          </div>
        </div>
      )}

      <div className="panel panel--pb16" data-farbe="neutral">
        <div className="panel-label">{t.gruppenCard}</div>
        <p className="panel-hint">{t.gruppenDesc}</p>
        {state.groups.map((group) => (
          <div key={group.id} className="grp-block">
            <div className="grp-head">
              <div className="grp-name">{tu(group.name)}</div>
              <div className="grp-count">{groupMemberLabel(group.id)}</div>
              <button
                type="button"
                className="svc-remove"
                aria-label="✕"
                onClick={() => dispatch({ type: 'removeGroup', id: group.id })}
              >
                ✕
              </button>
            </div>
            <div className="grp-selects">
              <label className="grp-field">
                <span className="field-label">{t.aufseherLbl}</span>
                <select
                  className="mem-select"
                  value={group.ov ?? ''}
                  onChange={(e) =>
                    dispatch({ type: 'updateGroup', id: group.id, patch: { ov: e.target.value || null } })
                  }
                >
                  {ovOptions}
                </select>
              </label>
              <label className="grp-field">
                <span className="field-label">{t.gehilfeLbl}</span>
                <select
                  className="mem-select"
                  value={group.as ?? ''}
                  onChange={(e) =>
                    dispatch({ type: 'updateGroup', id: group.id, patch: { as: e.target.value || null } })
                  }
                >
                  {asOptions}
                </select>
              </label>
            </div>
          </div>
        ))}
        <button type="button" className="btn-outline grp-add" onClick={addGroup}>
          {t.gruppeHinzu}
        </button>
      </div>

      <form className="panel panel--pb16" data-farbe="petrol" onSubmit={addService}>
        <div className="panel-label">{t.hilfsdienste}</div>
        <p className="panel-hint">{t.hdDesc}</p>
        {state.services.map((service) => (
          <div key={service.key} className="svc-row">
            <div>
              <div className="svc-name">{tu(service.name)}</div>
              <div className="svc-sub">{serviceSub(service)}</div>
            </div>
            <div className="svc-controls">
              <button
                type="button"
                className="stepper-btn"
                aria-label="–"
                onClick={() => dispatch({ type: 'changeServiceCount', key: service.key, delta: -1 })}
              >
                –
              </button>
              <span className="svc-count">{service.count}</span>
              <button
                type="button"
                className="stepper-btn"
                aria-label="+"
                onClick={() => dispatch({ type: 'changeServiceCount', key: service.key, delta: 1 })}
              >
                +
              </button>
              <button
                type="button"
                className="svc-remove"
                aria-label="✕"
                onClick={() => dispatch({ type: 'removeService', key: service.key })}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
        <div className="svc-add-row">
          <input
            type="text"
            className="svc-add-input"
            placeholder={t.neuerDienstPh}
            aria-label={t.neuerDienstPh}
            value={serviceName}
            onChange={(e) => setServiceName(e.target.value)}
          />
          <button type="submit" className="svc-add-btn">
            {t.hinzufuegen}
          </button>
        </div>
      </form>

      <div className="panel panel--pb14" data-farbe="gold">
        <div className="panel-label">{t.spracheCard}</div>
        <button
          type="button"
          className="lang-card-row"
          onClick={() => dispatch({ type: 'openLangSheet' })}
        >
          <span className="lang-card-key">{t.versSprache}</span>
          <span className="lang-card-val">
            <span>{state.congLang}</span>
            <span className="lang-card-chevron">›</span>
          </span>
        </button>
        <p className="lang-card-desc">{t.versSpracheDesc}</p>

        <div className="lang-card-key proglang-label">{t.progLangsLbl}</div>
        <div className="proglang-chips">
          {state.progLangs.map((name) => (
            <span key={name} className="proglang-chip">
              {name}
              <button
                type="button"
                className="proglang-chip-x"
                aria-label="✕"
                onClick={() => dispatch({ type: 'removeProgLang', name })}
              >
                ✕
              </button>
            </span>
          ))}
          <button
            type="button"
            className="role-chip"
            onClick={() => dispatch({ type: 'openLangSheet', mode: 'alt' })}
          >
            {t.hinzufuegen}
          </button>
        </div>
        <p className="lang-card-desc">{t.progLangsDesc}</p>
      </div>

      <div className="panel panel--pb14" data-farbe="wein">
        <div className="panel-label">{t.erinnerungenCard}</div>
        <p className="panel-hint">{t.remDesc}</p>
        <div className="kv-row">
          <span className="kv-key">{t.remBeiZut}</span>
          <span className="kv-val">{t.remSofort}</span>
        </div>
        {reminderRows.map(({ key, name }) => (
          <div key={key} className="svc-row">
            <div>
              <div className="svc-name">{t[name]}</div>
              <div className="svc-sub">{reminderSub(state.reminders[key])}</div>
            </div>
            <div className="svc-controls">
              <button
                type="button"
                className="stepper-btn"
                aria-label="–"
                onClick={() => dispatch({ type: 'changeReminder', key, delta: -1 })}
              >
                –
              </button>
              <span className="svc-count">{state.reminders[key]}</span>
              <button
                type="button"
                className="stepper-btn"
                aria-label="+"
                onClick={() => dispatch({ type: 'changeReminder', key, delta: 1 })}
              >
                +
              </button>
            </div>
          </div>
        ))}
        <div className="rem-toggle-row">
          <span className="rem-toggle-label">{t.remRepeat}</span>
          <button
            type="button"
            role="switch"
            aria-checked={state.reminders.repeat}
            aria-label={t.remRepeat}
            className={state.reminders.repeat ? 'switch is-on' : 'switch'}
            onClick={() => dispatch({ type: 'toggleReminderRepeat' })}
          >
            <span className="switch-knob" />
          </button>
        </div>
      </div>

      <div className="panel panel--pb16" data-farbe="neutral">
        <div className="panel-label">{t.importCard}</div>
        <p className="panel-hint">{t.importDesc}</p>
        <div className="imp-status">
          <span className="kv-key">{t.arbeitsheftLbl}</span>
          <span className="imp-count">{fill(t.wochenGeladen, { n: state.weeks.length })}</span>
        </div>
        <button type="button" className="btn-outline imp-btn" onClick={importWorkbook}>
          {importLabel}
        </button>
      </div>
    </section>
  )
}
