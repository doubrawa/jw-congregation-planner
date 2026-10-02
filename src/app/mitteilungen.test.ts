import { describe, expect, it } from 'vitest'
import type { Notification } from '../data/types'
import { sichtbareMitteilungen } from './mitteilungen'

const zeile = (over: Partial<Notification> = {}): Notification => ({
  id: 'n1', type: 'verhindert', title: 'Verhinderung gemeldet', text: 'Mikrofone — X',
  at: '2026-10-01T10:00:00.000Z', read: false, ...over,
})

describe('sichtbareMitteilungen', () => {
  it('ein Verkündiger sieht seine eigene, lokal entstandene Absage-Meldung nicht', () => {
    // Sie ist für die Admins bestimmt und kommt bei ihm nach dem Laden ohnehin
    // nicht wieder — stand aber bis zum 1.10.2026 als „Neu" in seiner Glocke.
    const lokal = zeile({ id: 'lokal', local: true })
    const geladen = zeile({ id: 'geladen', type: 'erinnerung', title: 'Erinnerung' })
    expect(sichtbareMitteilungen([lokal, geladen], false).map((n) => n.id)).toEqual(['geladen'])
  })

  it('ein Admin sieht alles — die lokale Zeile ist das Echo dessen, was er auch geladen bekäme', () => {
    const lokal = zeile({ id: 'lokal', local: true })
    expect(sichtbareMitteilungen([lokal], true)).toEqual([lokal])
  })
})
