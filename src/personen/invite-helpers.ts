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
  // Auch die Adresse kodieren, nicht nur Betreff und Text: Ein `?` oder `&`
  // darin hängt sonst eigene Kopfzeilen an den Entwurf — `a@b.de?bcc=…` setzt
  // beim Öffnen eine stille Kopie. Die Adresse ist ein Feld, das ein anderer
  // gepflegt haben kann; sie ist damit genauso wenig „unser Text" wie der Rest.
  // Das `@` bleibt stehen: Es gehört laut RFC 6068 unkodiert in die Adresse,
  // und `%40` verwirrt manche Mail-Programme.
  const an = encodeURIComponent(person.mail).replace(/%40/g, '@')
  return `mailto:${an}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
