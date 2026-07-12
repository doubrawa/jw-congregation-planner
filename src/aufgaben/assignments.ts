/**
 * Eigene Aufgaben aus den Wochenprogrammen ableiten (statt der hartkodierten
 * Demo-Zeilen des Prototyps): alle Programmpunkt-Slots und Hilfsdienst-Plätze
 * mit dem eigenen Anzeigenamen, chronologisch. Dadurch erscheinen Zuteilungen
 * aus dem Planen-Bereich sofort unter "Meine Aufgaben".
 */

import { DEMO_TODAY } from '../data/demo'
import { isSong } from '../data/helpers'
import type { Service, Week } from '../data/types'

export interface MyAssignment {
  title: string // z. B. "Bibellesung · Jer 38:1-13" oder "Mikrofone"
  date: string // Kurzform "Di, 8. September · 19:00"
  chip: string | null // Countdown "in 4 Tagen" (nur zeitnah), sonst null
}

const MONTHS: Record<string, number> = {
  Januar: 0,
  Februar: 1,
  März: 2,
  April: 3,
  Mai: 4,
  Juni: 5,
  Juli: 6,
  August: 7,
  September: 8,
  Oktober: 9,
  November: 10,
  Dezember: 11,
}

/** "Dienstag, 8. September · 19:00 · Königreichssaal" → Datum (Demo-Jahr). */
function parseMeetingDate(date: string): Date | null {
  const match = /(\d{1,2})\.\s*([A-Za-zÄÖÜäöü]+)/.exec(date)
  if (!match) return null
  const month = MONTHS[match[2]]
  if (month === undefined) return null
  return new Date(DEMO_TODAY.getFullYear(), month, Number(match[1]))
}

/** "Dienstag, 8. September · 19:00 · Königreichssaal" → "Di, 8. September · 19:00". */
function shortMeetingDate(date: string): string {
  const [dayPart = '', time] = date.split(' · ')
  const [weekday = '', ...rest] = dayPart.split(', ')
  const short = `${weekday.slice(0, 2)}, ${rest.join(', ')}`
  return time ? `${short} · ${time}` : short
}

/** Countdown-Chip nur für zeitnahe Aufgaben (Demo-Grenze wie im Prototyp: ≤ 16 Tage). */
function countdownChip(date: string): string | null {
  const parsed = parseMeetingDate(date)
  if (!parsed) return null
  const days = Math.round((parsed.getTime() - DEMO_TODAY.getTime()) / 86_400_000)
  if (days < 0 || days > 16) return null
  if (days === 0) return 'heute'
  return days === 1 ? 'in 1 Tag' : `in ${days} Tagen`
}

export function deriveMyAssignments(
  weeks: Week[],
  services: Service[],
  myName: string,
): MyAssignment[] {
  const result: MyAssignment[] = []
  for (const week of weeks) {
    for (const meeting of [week.mid, week.we]) {
      const date = shortMeetingDate(meeting.date)
      const chip = countdownChip(meeting.date)
      for (const section of meeting.sections) {
        for (const item of section.items) {
          if (isSong(item)) continue
          for (const slot of item.names) {
            if (slot.name !== myName) continue
            const suffix = slot.rolle && !slot.rolle.startsWith('mit') ? ` · ${slot.rolle}` : ''
            result.push({ title: item.title + suffix, date, chip })
          }
        }
      }
      for (const service of services) {
        const assigned = meeting.helpers[service.key] ?? []
        for (const name of assigned) {
          if (name === myName) result.push({ title: service.name, date, chip })
        }
      }
    }
  }
  return result
}
