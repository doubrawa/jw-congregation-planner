import { describe, expect, it } from 'vitest'
import {
  assignSlot,
  editTalkTheme,
  isGuestRole,
  openingSongNr,
  setOpeningSong,
  TALK_PLACEHOLDER,
} from './planning'
import type { Meeting, PartItem, PartSlotSelection, Week } from './types'

/** Wochenend-Vorlage wie aus parse.ts (kanonisch + strukturgleiche en-Variante). */
function weekendMeeting(): Meeting {
  return {
    date: 'Sonntag, 13. September · 10:00',
    end: 'Ende ca. 11:45',
    sections: [
      { label: 'ERÖFFNUNG', farbe: 'neutral', items: [{ title: 'Lied · Gebet', names: [{ name: '', rolle: 'Vorsitz', bereichsKey: 'vorsitz' }, { name: '', rolle: 'Gebet', bereichsKey: 'gebet' }] }] },
      { label: 'ÖFFENTLICHER VORTRAG', farbe: 'petrol', items: [{ title: TALK_PLACEHOLDER, meta: '30 Min.', names: [{ name: '', rolle: 'Gastredner', bereichsKey: 'vortrag' }] }] },
      { label: 'ABSCHLUSS', farbe: 'neutral', items: [{ title: 'Schlussworte · Lied · Gebet', names: [{ name: '', rolle: 'Gebet', bereichsKey: 'gebet' }] }] },
    ],
    helpers: {},
  }
}

function makeWeek(): Week {
  const emptyMid: Meeting = { date: '', end: '', sections: [], helpers: {} }
  return {
    range: '7.–13. September',
    book: '',
    current: false,
    mid: structuredClone(emptyMid),
    we: weekendMeeting(),
    alt: {
      en: {
        range: 'September 7–13',
        book: '',
        current: false,
        mid: structuredClone(emptyMid),
        we: weekendMeeting(), // Vorlage ist in jeder Sprachfassung deutsch
      },
    },
  }
}

const talkTitle = (w: Week): string => (w.we.sections[1].items[0] as PartItem).title
const altTalkTitle = (w: Week): string => (w.alt!.en.we.sections[1].items[0] as PartItem).title
const openingTitle = (w: Week): string => (w.we.sections[0].items[0] as PartItem).title
const altOpeningTitle = (w: Week): string => (w.alt!.en.we.sections[0].items[0] as PartItem).title

describe('editTalkTheme (Vortragsthema als Freitext)', () => {
  it('setzt das Thema und spiegelt es in die Sprachvariante', () => {
    const next = editTalkTheme([makeWeek()], 0, 1, 0, '„Woran erkennt man echten Glauben?“')
    expect(talkTitle(next[0])).toBe('„Woran erkennt man echten Glauben?“')
    expect(altTalkTitle(next[0])).toBe('„Woran erkennt man echten Glauben?“')
  })

  it('leerer Text stellt den Platzhalter wieder her', () => {
    const withTheme = editTalkTheme([makeWeek()], 0, 1, 0, 'Ein Thema')
    const cleared = editTalkTheme(withTheme, 0, 1, 0, '   ')
    expect(talkTitle(cleared[0])).toBe(TALK_PLACEHOLDER)
    expect(altTalkTitle(cleared[0])).toBe(TALK_PLACEHOLDER)
  })

  it('unverändertes Thema liefert dieselbe Referenz (kein Save nötig)', () => {
    const weeks = [makeWeek()]
    expect(editTalkTheme(weeks, 0, 1, 0, TALK_PLACEHOLDER)).toBe(weeks)
  })
})

describe('setOpeningSong (Anfangslied Wochenende)', () => {
  it('trägt die Nummer in "Lied · Gebet" ein und spiegelt in die Variante', () => {
    const next = setOpeningSong([makeWeek()], 0, '78')
    expect(openingTitle(next[0])).toBe('Lied 78 · Gebet')
    expect(altOpeningTitle(next[0])).toBe('Lied 78 · Gebet')
    // ABSCHLUSS ("Schlussworte · Lied · Gebet") bleibt unangetastet
    expect((next[0].we.sections[2].items[0] as PartItem).title).toBe('Schlussworte · Lied · Gebet')
  })

  it('ersetzt eine vorhandene Nummer und entfernt sie bei leerer Eingabe', () => {
    const with78 = setOpeningSong([makeWeek()], 0, '78')
    const with12 = setOpeningSong(with78, 0, '12')
    expect(openingTitle(with12[0])).toBe('Lied 12 · Gebet')
    const cleared = setOpeningSong(with12, 0, '')
    expect(openingTitle(cleared[0])).toBe('Lied · Gebet')
    expect(altOpeningTitle(cleared[0])).toBe('Lied · Gebet')
  })

  it('filtert alles Nicht-Numerische aus der Eingabe', () => {
    const next = setOpeningSong([makeWeek()], 0, ' Lied 78! ')
    expect(openingTitle(next[0])).toBe('Lied 78 · Gebet')
    // reiner Text ohne Ziffern = keine Nummer → Vorlage bleibt
    const weeks = [makeWeek()]
    expect(setOpeningSong(weeks, 0, 'abc')).toBe(weeks)
  })

  it('openingSongNr liest die aktuelle Nummer zurück', () => {
    const weeks = [makeWeek()]
    expect(openingSongNr(weeks[0].we)).toBe('')
    const next = setOpeningSong(weeks, 0, '78')
    expect(openingSongNr(next[0].we)).toBe('78')
  })
})

describe('assignSlot mit Rolle (Gastredner + Herkunfts-Versammlung)', () => {
  const sel: PartSlotSelection = {
    kind: 'part',
    wi: 0,
    tab: 'we',
    si: 1,
    ii: 0,
    ni: 0,
    label: 'Öffentlicher Vortrag',
    priv: 'vortrag',
    groups: false,
    guest: true,
  }

  it('schreibt Name und Rolle (Freitext-Versammlung) in den Slot', () => {
    const next = assignSlot([makeWeek()], sel, 'M. Hartmann', 'Gastredner · Vers. Nordheim')
    const slot = (next[0].we.sections[1].items[0] as PartItem).names[0]
    expect(slot.name).toBe('M. Hartmann')
    expect(slot.rolle).toBe('Gastredner · Vers. Nordheim')
  })

  it('ohne Rolle bleibt die bestehende Rolle stehen', () => {
    const next = assignSlot([makeWeek()], sel, 'M. Hartmann')
    const slot = (next[0].we.sections[1].items[0] as PartItem).names[0]
    expect(slot.rolle).toBe('Gastredner')
  })

  it('isGuestRole erkennt externe Redner-Rollen (auch mit Versammlungs-Suffix)', () => {
    expect(isGuestRole('Gastredner')).toBe(true)
    expect(isGuestRole('Gastredner · Vers. Nordheim')).toBe(true)
    expect(isGuestRole('Kreisaufseher')).toBe(true)
    expect(isGuestRole('Vorsitz')).toBe(false)
    expect(isGuestRole(undefined)).toBe(false)
  })
})
