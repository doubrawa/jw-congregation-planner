/**
 * Titel der Plan-Benachrichtigungen je Sprache.
 *
 * Wie in `send-reminders` und `substitute` eine eigene, kleine Liste statt des
 * App-Wörterbuchs: die Function wird getrennt deployt und würde sonst die ganze
 * i18n-Schicht mitziehen.
 *
 * Warum das hier stehen **muss**: Ein Push ist fertiger Text, sobald er das
 * Gerät erreicht — der Service Worker zeigt Titel und Rumpf unverändert an, die
 * App ist gar nicht beteiligt. Was hier fehlt, geht auf Deutsch hinaus und ist
 * beim Empfänger nicht mehr zu heilen. Die Glocke in der App darf dagegen
 * kanonisch deutsch in der Datenbank stehen; sie wird beim Anzeigen übersetzt
 * (NOTIF_TITLE_KEY in src/i18n/ui.ts).
 *
 * Die Sprache steht am Push-Abo (push_subscriptions.lang), also je Gerät.
 * Fehlt sie, gilt Deutsch.
 *
 * Der **Rumpf** wird nicht hier übersetzt: er besteht aus ` · `-Atomen (Termin,
 * Aufgabe), die der Fragment-Übersetzer erledigt.
 */

import { texteFuer } from '../_shared/texte.ts'

export interface PlanTexte {
  /** „Plan senden": die eigenen Aufgaben einer Woche, an die eingeteilte Person. */
  zuteilung: string
  /** Eine Zuteilung, von der die Person wusste (zugesagt oder gemeldet), wurde zurückgezogen oder verlegt. */
  entzug: string
}

/** Kanonisch deutsch — zugleich der Schlüssel, unter dem die Glocke übersetzt. */
export const TITEL_ZUTEILUNG = 'Neue Zuteilung'
export const TITEL_ENTZUG = 'Zuteilung zurückgezogen'

const DE: PlanTexte = {
  zuteilung: TITEL_ZUTEILUNG,
  entzug: TITEL_ENTZUG,
}

const TEXTE: Record<string, PlanTexte> = {
  de: DE,
  en: {
    zuteilung: 'New assignment',
    entzug: 'Assignment withdrawn',
  },
  es: {
    zuteilung: 'Nueva asignación',
    entzug: 'Asignación retirada',
  },
  fr: {
    zuteilung: 'Nouvelle attribution',
    entzug: 'Attribution retirée',
  },
  it: {
    zuteilung: 'Nuovo incarico',
    entzug: 'Incarico ritirato',
  },
  pl: {
    zuteilung: 'Nowy przydział',
    entzug: 'Zadanie wycofane',
  },
  ru: {
    zuteilung: 'Новое назначение',
    entzug: 'Назначение отменено',
  },
  uk: {
    zuteilung: 'Нове призначення',
    entzug: 'Призначення скасовано',
  },
  ro: {
    zuteilung: 'Însărcinare nouă',
    entzug: 'Sarcină retrasă',
  },
  tr: {
    zuteilung: 'Yeni görev',
    entzug: 'Görev geri alındı',
  },
  ar: {
    zuteilung: 'تعيين جديد',
    entzug: 'تم سحب التعيين',
  },
  fa: {
    zuteilung: 'وظیفهٔ جدید',
    entzug: 'وظیفه لغو شد',
  },
}

/** Texte für eine Sprache; unbekannte Codes fallen auf Deutsch zurück. */
export const planTexte = texteFuer(TEXTE, DE)
