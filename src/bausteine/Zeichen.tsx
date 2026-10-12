import type { ReactNode } from 'react'

/**
 * **Die Zeichen der Leinwand** (T121): 24 × 24, Strich 1,6, abgerundet, in der
 * Farbe des Texts drumherum. Keine Emoji, keine Schrift-Glyphen — die Pfade
 * stehen so in `desktop-teile.mjs` und `bauen-menue.mjs` der Arbeitskopie.
 *
 * Gespiegelt wird in Rechts-nach-links nur, was eine Richtung zeigt (Pfeile);
 * Haus, Kalender, Glocke und die übrigen bleiben, wie sie sind.
 */
const PFADE = {
  menue: <path d="M4.5 7h15M4.5 12h15M4.5 17h15" />,
  kreuz: <path d="m6.5 6.5 11 11M17.5 6.5l-11 11" />,
  glocke: (
    <>
      <path d="M6.5 16.5v-5.2a5.5 5.5 0 0 1 11 0v5.2l1.5 2H5z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </>
  ),
  start: <path d="M4 11 12 4.5 20 11v8a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />,
  aufgaben: (
    <>
      <path d="M10 7h10M10 12h10M10 17h10" />
      <path d="m3.8 7 1.3 1.3L7.4 6M3.8 12l1.3 1.3L7.4 11M3.8 17l1.3 1.3L7.4 16" />
    </>
  ),
  zusammenkuenfte: (
    <>
      <rect x="4" y="5.5" width="16" height="14.5" rx="2" />
      <path d="M4 10.5h16M8.5 3.5v4M15.5 3.5v4" />
    </>
  ),
  predigtdienst: (
    <>
      <path d="M12 20.5s-6.5-5.4-6.5-10.6a6.5 6.5 0 0 1 13 0c0 5.2-6.5 10.6-6.5 10.6z" />
      <circle cx="12" cy="10" r="2.4" />
    </>
  ),
  plaene: (
    <>
      <rect x="5" y="4.5" width="14" height="16" rx="2" />
      <path d="M9 4.5V3.5h6v1M8.5 10h7M8.5 14h7M8.5 18h4" />
    </>
  ),
  planung: (
    <>
      <path d="M5 19l1-4L16.6 4.4a1.8 1.8 0 0 1 2.5 0l.5.5a1.8 1.8 0 0 1 0 2.5L9 18z" />
      <path d="M14.5 6.5l3 3" />
    </>
  ),
  personen: (
    <>
      <circle cx="9" cy="9" r="3.2" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <circle cx="17" cy="10" r="2.4" />
      <path d="M16.2 14.7a4.4 4.4 0 0 1 4.8 4.3" />
    </>
  ),
  einstellungen: (
    <>
      <path d="M4 7h8M16 7h4M4 12h2M10 12h10M4 17h10M18 17h2" />
      <circle cx="14" cy="7" r="2" />
      <circle cx="8" cy="12" r="2" />
      <circle cx="16" cy="17" r="2" />
    </>
  ),
} satisfies Record<string, ReactNode>

export type ZeichenName = keyof typeof PFADE

/** Ein Zeichen, für Vorleseprogramme verborgen — die Beschriftung trägt der Knopf. */
export function Zeichen({ name }: { name: ZeichenName }) {
  return (
    <svg
      className="zeichen"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PFADE[name]}
    </svg>
  )
}
