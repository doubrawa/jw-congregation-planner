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
import { articleTitle, MONTHS, songs, studyIssueSlugs, studySynopses } from './study.ts'

declare const Deno: { serve: (handler: (req: Request) => Promise<Response> | Response) => void }

const BASE = 'https://www.jw.org'
const UA = 'jw-congregation-planner/1.0 (+https://github.com/doubrawa/jw-congregation-planner)'

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

interface StudyArticle {
  title: string | null
  songOpen: string | null
  songClose: string | null
}

/**
 * Wachtturm-Studienartikel für die Wochenend-Studienwoche — Titel + beide Lieder
 * (vor dem Studium / Schluss), in der Versammlungssprache. Die Studienausgabe
 * erscheint ~2 Monate vor der Behandlung; wir probieren die beiden infrage
 * kommenden Ausgaben, ankern die Artikelliste immer auf Deutsch, matchen die
 * Woche über Tag + Monat des (sprachunabhängigen) ISO-Startdatums und holen die
 * Artikelseite über den „Lesen in“-Umschalter in die Zielsprache. Fehlt die
 * Sprache oder der (noch nicht veröffentlichte) Inhalt, bleiben die Felder null
 * und die editierbare Vorlage steht.
 */
async function studyArticle(start: Date, lang: string): Promise<StudyArticle | null> {
  const day = start.getUTCDate()
  const mon = start.getUTCMonth() + 1
  const empty: StudyArticle = { title: null, songOpen: null, songClose: null }
  for (const slug of studyIssueSlugs(start)) {
    let overview: string
    try {
      overview = await fetchText(`${BASE}/de/bibliothek/zeitschriften/${slug}/`)
    } catch {
      continue // Ausgabe evtl. noch nicht online — nächsten Kandidaten versuchen
    }
    const hit = studySynopses(overview).find((s) => s.day === day && s.mon === mon)
    if (!hit) continue

    const germanHtml = await fetchText(BASE + hit.href)
    let html = germanHtml
    if (lang && lang !== 'de') {
      const loc = localizedUrl(germanHtml, lang)
      if (!loc) return empty // Sprache für diesen Artikel (noch) nicht verfügbar
      try {
        html = await fetchText(loc)
      } catch {
        return empty
      }
    }
    const found = songs(html)
    return {
      title: articleTitle(html),
      songOpen: found[0] ?? null,
      songClose: found.length > 1 ? found[found.length - 1] : null,
    }
  }
  return null
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

/**
 * Wachtturm-Studium in die Wochenend-Vorlage eintragen (Titel, Lied vor dem
 * Studium, Schlusslied). `mirror` (Primärsprache) steuert bei Sprachvarianten
 * die Struktur: das Schlusslied wird genau dann eingefügt, wenn es auch in der
 * Primärwoche eingefügt wurde (fehlender lokalisierter Text fällt auf den
 * Primärtext zurück) — sonst wären die Varianten nicht mehr strukturgleich.
 */
function applyStudy(
  week: ImportedWeek,
  study: StudyArticle | null,
  mirror?: StudyArticle | null,
): void {
  const title = study?.title ?? mirror?.title ?? null
  const songOpen = study?.songOpen ?? mirror?.songOpen ?? null
  const songClose = study?.songClose ?? mirror?.songClose ?? null
  const insertClose = mirror ? Boolean(mirror.songClose) : Boolean(study?.songClose)

  const wt = week.we.sections.find((s) => s.label === 'WACHTTURM-STUDIUM')
  for (const it of wt?.items ?? []) {
    if ('song' in it && songOpen) it.song = songOpen
    else if ('names' in it && title) it.title = title
  }
  if (insertClose && songClose) {
    const abschluss = week.we.sections.find((s) => s.label === 'ABSCHLUSS')
    abschluss?.items.unshift({ song: songClose })
  }
}

/** Zuteilungs-Slots/Hilfsdienste aus einer Sprachvariante entfernen (nur Texte zählen). */
function stripVariant(week: ImportedWeek): ImportedWeek {
  for (const meeting of [week.mid, week.we]) {
    meeting.helpers = {}
    for (const section of meeting.sections) {
      for (const it of section.items) {
        if ('names' in it) it.names = []
      }
    }
  }
  return week
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const { url, after, start: startParam, lang = 'de', altLangs = [] } = (await req
      .json()
      .catch(() => ({}))) as {
      url?: string
      after?: string
      start?: string // ISO-Startdatum: genau DIESE Woche liefern (Varianten-Nachimport)
      lang?: string
      altLangs?: string[]
    }

    let weekUrl = url
    let start = url ? weekStart(url) : null

    if (!weekUrl) {
      const weeks = await discoverWeeks()
      if (startParam) {
        // Nachimport: exakt die Woche mit diesem Startdatum (z. B. um später
        // hinzugefügte Programmsprachen für bereits geladene Wochen zu holen).
        const hit = weeks.find((w) => w.start.toISOString().slice(0, 10) === startParam)
        if (!hit) return json({ error: `Woche ${startParam} nicht (mehr) im Arbeitsheft gefunden.` }, 404)
        weekUrl = hit.url
        start = hit.start
      } else {
        const now = new Date()
        const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
        // Standard: die Woche, die diese Woche beginnt (bis 6 Tage zurück).
        const cutoff = after ? new Date(after) : new Date(todayUtc - 6 * 864e5)
        const next = weeks.find((w) => w.start > cutoff) ?? weeks[weeks.length - 1]
        if (!next) return json({ error: 'Keine kommende Woche gefunden.' }, 404)
        weekUrl = next.url
        start = next.start
      }
    }

    const germanHtml = await fetchText(weekUrl)
    let html = germanHtml
    if (lang && lang !== 'de') {
      const loc = localizedUrl(germanHtml, lang)
      if (!loc) return json({ error: `Diese Woche ist in der gewählten Sprache (${lang}) noch nicht verfügbar.` }, 404)
      html = await fetchText(loc)
    }

    const week: ImportedWeek & { start?: string; lang?: string; alt?: Record<string, ImportedWeek> } =
      parseWorkbookWeek(html)
    if (start) week.start = start.toISOString().slice(0, 10)
    week.lang = lang

    // Wochenend-Wachtturm-Studienartikel automatisch eintragen: Titel + Lied vor
    // dem Studium (WACHTTURM-STUDIUM) und Schlusslied (ABSCHLUSS), in der
    // Versammlungssprache. Der öffentliche Vortrag wird lokal vergeben und steht
    // nicht auf jw.org — bleibt Platzhalter.
    const study = start ? await studyArticle(start, lang) : null
    if (study) applyStudy(week, study)

    // Sprachvarianten (Week.alt): dieselbe Woche in weiteren Sprachen —
    // strukturgleich (jw.org-Fassungen sind 1:1), ohne Zuteilungs-Slots. Fehlt
    // eine Sprache für diese Woche, wird sie still übersprungen. Maximal 4,
    // damit die Abrufe gegenüber jw.org überschaubar bleiben.
    const wanted = [...new Set(altLangs)].filter((c) => c && c !== lang).slice(0, 4)
    for (const code of wanted) {
      const loc = localizedUrl(germanHtml, code)
      if (!loc) continue
      try {
        const altWeek = parseWorkbookWeek(await fetchText(loc))
        const altStudy = start ? await studyArticle(start, code) : null
        // mirror immer setzen: die Variante folgt strukturell der Primärwoche
        applyStudy(altWeek, altStudy, study ?? { title: null, songOpen: null, songClose: null })
        week.alt = { ...week.alt, [code]: stripVariant(altWeek) }
      } catch {
        // Variante nicht verfügbar/fehlerhaft → Woche bleibt ohne diese Sprache
      }
    }

    return json({ week })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
