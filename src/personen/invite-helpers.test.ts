/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest'
import { appUrl, inviteMailHref, linkedMember, makeInvite, openInvite } from './invite-helpers'
import type { AppState } from '../app/context'
import type { Invite, Member, Person } from '../data/types'

const member = (userId: string, personId: string | null): Member => ({ userId, email: `${userId}@x`, personId, planner: false })
const invite = (id: string, personId: string | null): Invite => ({ id, code: 'ABC', personId, planner: false })
const person = (id: string, planner = false): Person =>
  ({ id, fn: 'A', ln: 'B', role: 'verkuendiger', tel: '', mail: 'a@b', absent: [], priv: {} as Person['priv'], grp: null, planner } as Person)

const state = (over: Partial<AppState>): AppState => ({ members: [], invites: [], ...over } as AppState)

describe('linkedMember', () => {
  it('findet das Konto zur Person, sonst undefined', () => {
    const s = state({ members: [member('u1', 'p1'), member('u2', null)] })
    expect(linkedMember(s, 'p1')?.userId).toBe('u1')
    expect(linkedMember(s, 'p9')).toBeUndefined()
  })
})

describe('openInvite', () => {
  it('findet den offenen Code zur Person, sonst undefined', () => {
    const s = state({ invites: [invite('i1', 'p1')] })
    expect(openInvite(s, 'p1')?.id).toBe('i1')
    expect(openInvite(s, 'p9')).toBeUndefined()
  })
})

describe('makeInvite', () => {
  it('erzeugt einen eindeutigen Code und übernimmt das Planer-Recht', () => {
    const a = makeInvite(person('p1', true))
    const b = makeInvite(person('p2', false))
    expect(a.personId).toBe('p1')
    expect(a.planner).toBe(true)
    expect(b.planner).toBe(false)
    expect(a.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/) // ohne 0/O/1/I
    expect(a.id).not.toBe(b.id)
    expect(a.code).not.toBe(b.code)
  })
})

describe('appUrl / inviteMailHref (Browser-Kontext)', () => {
  it('appUrl liefert eine absolute App-Adresse', () => {
    expect(appUrl()).toMatch(/^https?:\/\//)
  })

  it('inviteMailHref baut einen mailto:-Link mit Betreff, Code und Namen', () => {
    const person = { id: 'p1', fn: 'Anna', ln: 'B', mail: 'anna@example.com' } as Person
    const href = inviteMailHref(person, 'CODE123', 'Einladung', 'Hallo {name}, dein Code: {code} · {url}')
    expect(href.startsWith('mailto:anna@example.com?')).toBe(true)
    expect(href).toContain(`subject=${encodeURIComponent('Einladung')}`)
    expect(decodeURIComponent(href)).toContain('Hallo Anna, dein Code: CODE123')
  })
})
