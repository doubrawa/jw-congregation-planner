/**
 * Einladungs-Helfer (personenzentriert): Code am Personen-Detail erzeugen und
 * per eigenem Mail-Programm (mailto:) oder Teilen/Kopieren weitergeben — die
 * App verschickt selbst nichts (Server-Versand nur via send-invite, wenn eine
 * eigene Domain konfiguriert ist).
 */

import { generateInviteCode } from '../lib/data'
import { fill } from '../i18n/useT'
import type { AppState } from '../app/context'
import type { Invite, Member, Person } from '../data/types'

export function linkedMember(state: AppState, personId: string): Member | undefined {
  return state.members.find((m) => m.personId === personId)
}

export function openInvite(state: AppState, personId: string): Invite | undefined {
  return state.invites.find((i) => i.personId === personId)
}

export function appUrl(): string {
  return new URL(import.meta.env.BASE_URL, window.location.origin).href
}

export function makeInvite(person: Person): Invite {
  return {
    id: crypto.randomUUID(),
    code: generateInviteCode(),
    personId: person.id,
    planner: Boolean(person.planner),
  }
}

export function inviteMailHref(
  person: Person,
  code: string,
  subject: string,
  bodyTemplate: string,
): string {
  const body = fill(bodyTemplate, { name: person.fn, code, url: appUrl() })
  return `mailto:${person.mail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
