// =============================================================================
// Texte des Kalender-Abos — in der Sprache, die beim Ausstellen galt
// =============================================================================
// Der Kalender ist fertiger Text, sobald die Kalender-App ihn holt; übersetzt
// wird hier, nicht beim Anzeigen. Die Wörter sind die der App
// (`navAufgabenLong`, `tabMid`, `tabWe`, `heftPunkt`), damit Kalender und App
// gleich reden — `texte.test.ts` hält sie gleich. Die Anrede folgt der App je
// Sprache (du, Sie).
// =============================================================================

import { ziffernDerSprache } from '../_shared/i18n/ziffern-der-sprache.ts'
import type { KalenderTermin } from '../_shared/kalender.ts'
import { texteFuer } from '../_shared/texte.ts'

export interface KalenderTexte {
  /** Hinter „Versammlung.app · " der Name des Kalenders. */
  meineAufgaben: string
  /** Notiz eines gesendeten, noch nicht bestätigten Termins. */
  offen: string
  /** Notiz eines bestätigten Termins. */
  bestaetigt: string
  /** Die Zusammenkünfte, wie die App sie nennt. */
  zusammenkunft: Record<'mid' | 'we', string>
  /** Ein Programmpunkt mit seiner Nummer: „Punkt {n}". */
  punkt: string
}

const DE: KalenderTexte = {
  meineAufgaben: 'Meine Aufgaben',
  offen: 'Noch nicht bestätigt – bestätige es in der App.',
  bestaetigt: 'Bestätigt.',
  zusammenkunft: { mid: 'Zusammenkunft unter der Woche', we: 'Zusammenkunft am Wochenende' },
  punkt: 'Punkt {n}',
}

const TEXTE: Record<string, KalenderTexte> = {
  de: DE,
  en: {
    meineAufgaben: 'My Assignments',
    offen: 'Not confirmed yet – confirm it in the app.',
    bestaetigt: 'Confirmed.',
    zusammenkunft: { mid: 'Midweek Meeting', we: 'Weekend Meeting' },
    punkt: 'Part {n}',
  },
  es: {
    meineAufgaben: 'Mis asignaciones',
    offen: 'Aún sin confirmar – confírmalo en la aplicación.',
    bestaetigt: 'Confirmado.',
    zusammenkunft: { mid: 'Reunión de entre semana', we: 'Reunión del fin de semana' },
    punkt: 'Parte {n}',
  },
  fr: {
    meineAufgaben: 'Mes attributions',
    offen: 'Pas encore confirmé – confirme-le dans l’application.',
    bestaetigt: 'Confirmé.',
    zusammenkunft: { mid: 'Réunion de semaine', we: 'Réunion de week-end' },
    punkt: 'Partie {n}',
  },
  it: {
    meineAufgaben: 'I miei incarichi',
    offen: 'Non ancora confermato – confermalo nell’app.',
    bestaetigt: 'Confermato.',
    zusammenkunft: { mid: 'Adunanza infrasettimanale', we: 'Adunanza del fine settimana' },
    punkt: 'Parte {n}',
  },
  pl: {
    meineAufgaben: 'Moje zadania',
    offen: 'Jeszcze niepotwierdzone – potwierdź w aplikacji.',
    bestaetigt: 'Potwierdzono.',
    zusammenkunft: { mid: 'Zebranie w tygodniu', we: 'Zebranie w weekend' },
    punkt: 'Punkt {n}',
  },
  ru: {
    meineAufgaben: 'Мои задания',
    offen: 'Ещё не подтверждено – подтвердите в приложении.',
    bestaetigt: 'Подтверждено.',
    zusammenkunft: { mid: 'Встреча в будние дни', we: 'Встреча в выходные дни' },
    punkt: 'Пункт {n}',
  },
  uk: {
    meineAufgaben: 'Мої завдання',
    offen: 'Ще не підтверджено – підтвердьте в застосунку.',
    bestaetigt: 'Підтверджено.',
    zusammenkunft: { mid: 'Зібрання серед тижня', we: 'Зібрання у вихідні' },
    punkt: 'Пункт {n}',
  },
  ro: {
    meineAufgaben: 'Însărcinările mele',
    offen: 'Încă neconfirmat – confirmă în aplicație.',
    bestaetigt: 'Confirmat.',
    zusammenkunft: { mid: 'Întrunirea din timpul săptămânii', we: 'Întrunirea de la sfârșitul săptămânii' },
    punkt: 'Partea {n}',
  },
  tr: {
    meineAufgaben: 'Görevlerim',
    offen: 'Henüz onaylanmadı – uygulamada onayla.',
    bestaetigt: 'Onaylandı.',
    zusammenkunft: { mid: 'Hafta içi ibadeti', we: 'Hafta sonu ibadeti' },
    punkt: '{n}. bölüm',
  },
  ar: {
    meineAufgaben: 'تعييناتي',
    offen: 'لم يُؤكَّد بعد – أكِّده في التطبيق.',
    bestaetigt: 'مؤكّد.',
    zusammenkunft: { mid: 'اجتماع وسط الأسبوع', we: 'اجتماع نهاية الأسبوع' },
    punkt: 'الفقرة {n}',
  },
  fa: {
    meineAufgaben: 'وظایف من',
    offen: 'هنوز تأیید نشده است – لطفاً در برنامه تأیید کنید.',
    bestaetigt: 'تأیید شد.',
    zusammenkunft: { mid: 'جلسهٔ میان‌هفته', we: 'جلسهٔ آخر هفته' },
    punkt: 'بخش {n}',
  },
}

/** Die Texte für die Sprache des Abos — unbekannt oder leer: Deutsch. */
export const kalenderTexte = texteFuer(TEXTE, DE)

/**
 * **Die Notiz eines Termins**: wohin er gehört — die Zusammenkunft und, wo er
 * eine trägt, die Nummer des Programmpunkts („Zusammenkunft unter der Woche ·
 * Punkt 4") —, darunter der Stand der Zusage; beim Trolley sein Hinweis. Die
 * Nummer steht in den Ziffern der Sprache, wie in der App.
 */
export function kalenderNotiz(termin: KalenderTermin, sprache: string): string {
  const t = kalenderTexte(sprache)
  const punkt = termin.punkt ? t.punkt.replace('{n}', ziffernDerSprache(termin.punkt, sprache)) : ''
  const wo = termin.zusammenkunft ? [t.zusammenkunft[termin.zusammenkunft], punkt].filter(Boolean).join(' · ') : ''
  const stand = termin.zusage === 'offen' ? t.offen : termin.zusage === 'bestätigt' ? t.bestaetigt : (termin.hinweis ?? '')
  return [wo, stand].filter(Boolean).join('\n')
}
