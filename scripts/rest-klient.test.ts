import { afterEach, describe, expect, it, vi } from 'vitest'
// @ts-expect-error — JS-Modul ohne Typen (Wartungsskripte laufen unter Node)
import { pruefKlient, restKlient, versammlungHolen } from './gemeinsam.mjs'

/**
 * **Der eine Zugriff auf PostgREST, den alle Wartungsskripte nehmen.**
 *
 * Elf Skripte trugen dafür je eine eigene Closure — und normalisiert waren es
 * vier verschiedene Fassungen: Nur eine erklärte den 401, zwei nannten im
 * Fehlertext nicht einmal die Methode, beim `Prefer`-Kopf war jede anders.
 * Solche Unterschiede sieht beim Lesen einer einzelnen Datei niemand.
 *
 * Seit der Zugriff an **einer** Stelle steht, ist er auch prüfbar — und das
 * muss er sein: Diese Skripte schreiben in die **echte** Datenbank. Ein
 * verschluckter Fehler heißt hier nicht „ein Test ist rot", sondern „die halbe
 * Versammlung ist angelegt und niemand hat es gemerkt".
 *
 * Geprüft wird gegen ein vorgetäuschtes `fetch`; es geht um den Vertrag, nicht
 * um das Netz.
 */

const URL_ = 'https://beispiel.supabase.co'
const SECRET = 'sb_secret_abc'

/** Ein `fetch`, das eine feste Antwort gibt und den Aufruf festhält. */
function fakeFetch(antwort: { ok?: boolean; status?: number; text?: string }) {
  const aufrufe: Array<{ url: string; init: RequestInit }> = []
  const f = vi.fn(async (url: string, init: RequestInit = {}) => {
    aufrufe.push({ url, init })
    return {
      ok: antwort.ok ?? true,
      status: antwort.status ?? 200,
      text: async () => antwort.text ?? '',
    }
  })
  vi.stubGlobal('fetch', f)
  return aufrufe
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('restKlient', () => {
  it('baut die Adresse und schickt die Anmelde-Kopfzeilen mit', async () => {
    const aufrufe = fakeFetch({ text: '[{"id":"c1"}]' })
    const rest = restKlient(URL_, SECRET)
    const daten = await rest('congregations?select=id')

    expect(daten).toEqual([{ id: 'c1' }])
    expect(aufrufe[0]!.url).toBe(`${URL_}/rest/v1/congregations?select=id`)
    const kopf = aufrufe[0]!.init.headers as Record<string, string>
    // Der neue `sb_secret_…` gehört laut Supabase-Doku **nur** in `apikey` —
    // im `Authorization`-Kopf läse die Plattform ihn als JWT (siehe authKopf).
    expect(kopf.apikey).toBe(SECRET)
    expect(kopf.Authorization).toBeUndefined()
    expect(kopf['Content-Type']).toBe('application/json')
  })

  it('reicht Methode, Körper und eigene Kopfzeilen durch', async () => {
    const aufrufe = fakeFetch({ text: '' })
    const rest = restKlient(URL_, SECRET)
    await rest('weeks', {
      method: 'POST',
      body: JSON.stringify([{ start: '2026-09-07' }]),
      headers: { Prefer: 'return=minimal' },
    })

    const { init } = aufrufe[0]!
    expect(init.method).toBe('POST')
    expect(init.body).toBe('[{"start":"2026-09-07"}]')
    const kopf = init.headers as Record<string, string>
    expect(kopf.Prefer).toBe('return=minimal')
    // Die eigene Kopfzeile kommt dazu, die Anmeldung bleibt.
    expect(kopf.apikey).toBe(SECRET)
  })

  it('ein leerer Körper ist kein Fehler, sondern null', async () => {
    // `Prefer: return=minimal` liefert auch bei POST ein 201 **ohne** Inhalt.
    // `res.json()` darauf wirft „Unexpected end of JSON input" — der Grund,
    // warum hier über `text()` gelesen wird.
    fakeFetch({ status: 201, text: '' })
    const rest = restKlient(URL_, SECRET)
    await expect(rest('weeks', { method: 'POST' })).resolves.toBeNull()
  })

  it('wirft bei einem Fehler — mit Methode, Pfad, Status und Antwort', async () => {
    fakeFetch({ ok: false, status: 409, text: 'duplicate key' })
    const rest = restKlient(URL_, SECRET)
    await expect(rest('persons', { method: 'POST' })).rejects.toThrow(
      /POST persons 409: duplicate key/,
    )
  })

  /**
   * Der 401 ist der Fehler, den jeder beim Einrichten einmal bekommt — und die
   * nackte Meldung nennt die Ursache nicht. Nur **eine** der elf Abschriften
   * sagte sie dazu; jetzt tun es alle.
   */
  it('erklärt den 401 — sonst sucht man im Dashboard', async () => {
    fakeFetch({ ok: false, status: 401, text: 'Invalid API key' })
    const rest = restKlient(URL_, SECRET)
    await expect(rest('weeks')).rejects.toThrow(/sb_secret_/)
  })

  it('ein Legacy-JWT geht in beide Kopfzeilen', async () => {
    const aufrufe = fakeFetch({ text: '[]' })
    await restKlient(URL_, 'eyJhbGciOiJIUzI1NiJ9.x.y')('weeks')
    const kopf = aufrufe[0]!.init.headers as Record<string, string>
    expect(kopf.apikey).toBe('eyJhbGciOiJIUzI1NiJ9.x.y')
    expect(kopf.Authorization).toBe('Bearer eyJhbGciOiJIUzI1NiJ9.x.y')
  })
})

describe('pruefKlient — die Sicht eines angemeldeten Mitglieds', () => {
  it('schickt den anon-Schlüssel mit dem Nutzer-Token', async () => {
    const aufrufe = fakeFetch({ text: '[{"congregation_id":"c1"}]' })
    const rest = pruefKlient(URL_, 'anon-key', 'nutzer-token')
    const { status, daten } = await rest('members?select=congregation_id')

    expect(status).toBe(200)
    expect(daten).toEqual([{ congregation_id: 'c1' }])
    const kopf = aufrufe[0]!.init.headers as Record<string, string>
    // Nur so greifen die RLS-Richtlinien: Der Service-Role-Schlüssel umginge
    // sie, und ein Nachweis damit wäre wertlos.
    expect(kopf.apikey).toBe('anon-key')
    expect(kopf.Authorization).toBe('Bearer nutzer-token')
  })

  /**
   * **Der ganze Zweck**: Eine abgewiesene Abfrage ist hier der Beweis, nicht
   * der Abbruch. Würfe dieser Klient, könnte die Probe nichts messen — sie
   * stürbe an dem Ergebnis, auf das sie wartet.
   */
  it('wirft nicht — der Statuscode ist der Messwert', async () => {
    fakeFetch({ ok: false, status: 403, text: '{"message":"permission denied"}' })
    const rest = pruefKlient(URL_, 'anon-key', 'nutzer-token')
    const { status, daten } = await rest('weeks', 'PATCH', { x: 1 })
    expect(status).toBe(403)
    expect(daten).toEqual({ message: 'permission denied' })
  })

  it('antwortet PostgREST in Klartext, ist der Text die Auskunft', async () => {
    fakeFetch({ ok: false, status: 400, text: 'nicht mein JSON' })
    const rest = pruefKlient(URL_, 'anon-key', 'nutzer-token')
    expect((await rest('weeks')).daten).toBe('nicht mein JSON')
  })

  it('ohne Körper geht keiner mit (GET verträgt keinen)', async () => {
    const aufrufe = fakeFetch({ text: '[]' })
    await pruefKlient(URL_, 'anon-key', 'token')('weeks?select=start')
    expect(aufrufe[0]!.init.body).toBeUndefined()
    expect(aufrufe[0]!.init.method).toBe('GET')
  })
})

/**
 * **Welche Versammlung ist gemeint?**
 *
 * Sechs Skripte beantworteten das je selbst, und drei davon nahmen `--cong`
 * auf Treu und Glauben — sie fragten die Datenbank gar nicht erst. Eine
 * vertippte Id lief damit anstandslos durch: Jede folgende Abfrage traf null
 * Zeilen, jedes Schreiben ging ins Leere, und am Ende meldete das Skript
 * zufrieden, was es alles getan habe.
 */
describe('versammlungHolen', () => {
  /** Ein `rest`, das eine feste Antwort gibt und den Pfad festhält. */
  function fakeRest(zeilen: unknown[]) {
    const pfade: string[] = []
    const rest = async (pfad: string) => {
      pfade.push(pfad)
      return zeilen
    }
    return { rest, pfade }
  }

  it('ohne --cong die erste Zeile', async () => {
    const { rest, pfade } = fakeRest([{ id: 'c1' }])
    expect(await versammlungHolen(rest, {})).toEqual({ id: 'c1' })
    expect(pfade[0]).toBe('congregations?select=id&limit=1')
  })

  it('mit --cong genau diese — und die Datenbank wird wirklich gefragt', async () => {
    const { rest, pfade } = fakeRest([{ id: 'c9' }])
    await versammlungHolen(rest, { cong: 'c9' })
    expect(pfade[0]).toBe('congregations?select=id&id=eq.c9')
  })

  it('eine vertippte --cong bricht ab, statt ins Leere zu schreiben', async () => {
    const { rest } = fakeRest([])
    await expect(versammlungHolen(rest, { cong: 'gibt-es-nicht' })).rejects.toThrow(
      /Keine Versammlung mit der Id gibt-es-nicht/,
    )
  })

  it('eine leere Datenbank sagt, was zu tun ist', async () => {
    const { rest } = fakeRest([])
    await expect(versammlungHolen(rest, {})).rejects.toThrow(/versammlung-anlegen/)
  })

  it('die Spalten kommen vom Aufrufer, `id` ist immer dabei', async () => {
    const { rest, pfade } = fakeRest([{ id: 'c1', hall: 'Saal' }])
    await versammlungHolen(rest, {}, 'id,hall')
    await versammlungHolen(rest, {}, 'hall')
    expect(pfade[0]).toBe('congregations?select=id,hall&limit=1')
    expect(pfade[1]).toBe('congregations?select=id,hall&limit=1')
  })

  it('ein Spaltenname, der `id` enthält, wird nicht dafür gehalten', async () => {
    // `'person_id'.includes('id')` wäre wahr — verglichen wird deshalb je Feld.
    const { rest, pfade } = fakeRest([{ id: 'c1' }])
    await versammlungHolen(rest, {}, 'cong_lang')
    expect(pfade[0]).toBe('congregations?select=id,cong_lang&limit=1')
  })
})
