// =============================================================================
// Supabase Edge Function: import-week
// =============================================================================
// Holt das Arbeitsheft-Programm einer Woche von jw.org (serverseitig, umgeht
// CORS) und liefert es als Week-JSON zurück. Ohne konkrete `url` wird die
// nächste kommende Woche automatisch ermittelt (Übersicht → Zeitraum → Woche).
//
// MEHRSPRACHIG: Die Woche wird immer zuerst auf **Deutsch** ermittelt (der
// deutsche Index ist die verlässliche Anker-Sprache; andere Sprachen haben
// abweichende URL-Pfade). Ist `lang` ≠ "de", wird auf der deutschen Wochenseite
// die passende lokalisierte URL aus dem „Lesen in“-Umschalter
// (`otherAvailLangsChooser`, je Sprache ein `data-url`) aufgelöst und **diese**
// Seite geparst. Damit steht das Programm direkt in der Versammlungssprache
// (~480 Sprachen); der Parser ist ohnehin sprachunabhängig.
//
// Fairer Umgang: ein Abruf je Seite, kurzer In-Memory-Cache, klarer User-Agent.
//
// Deploy:  supabase functions deploy import-week
// =============================================================================

import { parseWorkbookWeek, type ImportedWeek } from './parse.ts'

declare const Deno: { serve: (handler: (req: Request) => Promise<Response> | Response) => void }

const BASE = 'https://www.jw.org'
const UA = 'jw-congregation-planner/1.0 (+https://github.com/doubrawa/jw-congregation-planner)'

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MONTHS: Record<string, number> = {
  januar: 1, februar: 2, maerz: 3, 'märz': 3, april: 4, mai: 5, juni: 6,
  juli: 7, august: 8, september: 9, oktober: 10, november: 11, dezember: 12,
}

const TTL = 10 * 60 * 1000
const cache = new Map<string, { at: number; text: string }>()

async function fetchText(url: string): Promise<string> {
  const hit = cache.get(url)
  if (hit && Date.now() - hit.at < TTL) return hit.text
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'de' } })
  if (!res.ok) throw new Error(`HTTP ${res.status} bei ${url}`)
  const text = await res.text()
  cache.set(url, { at: Date.now(), text })
  return text
}

/** Startdatum aus einem deutschen Wochen-Slug (…Zusammenkunft-6-12-Juli-2026). */
function weekStart(url: string): Date | null {
  const tail = decodeURIComponent((url.split('Zusammenkunft-')[1] || '').replace(/\/$/, ''))
  const cross = tail.match(/^(\d+)-([A-Za-zäöü]+)-\d+-([A-Za-zäöü]+)-(\d{4})/)
  if (cross) {
    const mo = MONTHS[cross[2].toLowerCase()]
    if (mo) return new Date(Date.UTC(Number(cross[4]), mo - 1, Number(cross[1])))
  }
  const same = tail.match(/^(\d+)-\d+-([A-Za-zäöü]+)-(\d{4})/)
  if (same) {
    const mo = MONTHS[same[2].toLowerCase()]
    if (mo) return new Date(Date.UTC(Number(same[3]), mo - 1, Number(same[1])))
  }
  return null
}

/** Kommende Wochen (immer aus dem deutschen Arbeitsheft), nach Startdatum. */
async function discoverWeeks(): Promise<{ start: Date; url: string }[]> {
  const index = await fetchText(`${BASE}/de/bibliothek/jw-arbeitsheft/`)
  const now = new Date()
  const periods = [...new Set([...index.matchAll(/jw-arbeitsheft\/([a-zä]+-[a-zä]+-\d{4}-mwb)\//g)].map((m) => m[1]))]
    .map((slug) => {
      const m = slug.match(/^([a-zä]+)-([a-zä]+)-(\d{4})-mwb$/)
      return m ? { slug, year: Number(m[3]), endMonth: MONTHS[m[2]] ?? 0 } : null
    })
    .filter((p): p is { slug: string; year: number; endMonth: number } => p != null)
    .filter((p) => p.year > now.getFullYear() || (p.year === now.getFullYear() && p.endMonth >= now.getMonth() + 1))
    .sort((a, b) => a.year - b.year || a.endMonth - b.endMonth)
    .slice(0, 3)

  const weeks: { start: Date; url: string }[] = []
  for (const p of periods) {
    const page = await fetchText(`${BASE}/de/bibliothek/jw-arbeitsheft/${p.slug}/`)
    const re = new RegExp(`/de/bibliothek/jw-arbeitsheft/${p.slug}/[^"'>]*Zusammenkunft-[^"'>]*`, 'g')
    for (const href of new Set([...page.matchAll(re)].map((m) => m[0]))) {
      const start = weekStart(href)
      if (start) weeks.push({ start, url: `${BASE}${href}` })
    }
  }
  weeks.sort((a, b) => a.start.getTime() - b.start.getTime())
  return weeks
}

/**
 * Lokalisierte URL derselben Woche: auf der deutschen Seite trägt jede Option des
 * „Lesen in“-Umschalters `value="<code>"` und `data-url="/<code>/…"`. Liefert die
 * absolute URL für `lang` oder null, wenn die Woche in der Sprache fehlt.
 */
function localizedUrl(germanHtml: string, lang: string): string | null {
  const code = lang.replace(/[^a-z0-9-]/gi, '')
  const re = new RegExp(`<option\\b[^>]*\\bvalue="${code}"[^>]*\\bdata-url="([^"]*)"`, 'i')
  const m = germanHtml.match(re)
  if (!m) return null
  const path = m[1].replace(/&amp;/g, '&')
  return path.startsWith('http') ? path : BASE + path
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const { url, after, lang = 'de' } = (await req.json().catch(() => ({}))) as {
      url?: string
      after?: string
      lang?: string
    }

    let weekUrl = url
    let start = url ? weekStart(url) : null

    if (!weekUrl) {
      const weeks = await discoverWeeks()
      const now = new Date()
      const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
      // Standard: die Woche, die diese Woche beginnt (bis 6 Tage zurück).
      const cutoff = after ? new Date(after) : new Date(todayUtc - 6 * 864e5)
      const next = weeks.find((w) => w.start > cutoff) ?? weeks[weeks.length - 1]
      if (!next) return json({ error: 'Keine kommende Woche gefunden.' }, 404)
      weekUrl = next.url
      start = next.start
    }

    const germanHtml = await fetchText(weekUrl)
    let html = germanHtml
    if (lang && lang !== 'de') {
      const loc = localizedUrl(germanHtml, lang)
      if (!loc) return json({ error: `Diese Woche ist in der gewählten Sprache (${lang}) noch nicht verfügbar.` }, 404)
      html = await fetchText(loc)
    }

    const week: ImportedWeek & { start?: string; lang?: string } = parseWorkbookWeek(html)
    if (start) week.start = start.toISOString().slice(0, 10)
    week.lang = lang
    return json({ week })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
