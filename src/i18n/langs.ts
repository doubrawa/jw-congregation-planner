/**
 * Sprachlisten für die Mehrsprachigkeit (v3).
 *
 * `CONG_LANGS`: komplette „LESEN IN“-Liste des jw.org-Arbeitshefts
 * (deutsche Bezeichnungen) — Auswahl der Versammlungssprache. `APP_LANGS`:
 * die vier UI-Sprachen. `CONG_TO_CODE`: Versammlungssprache → Übersetzungs-
 * code, sofern Demo-Programminhalte vorliegen (sonst Anzeige auf Deutsch).
 *
 * Quelle: docs/design-handoff/design/i18n.js.
 */

import type { Lang } from '../data/types'

export const APP_LANGS: ReadonlyArray<{ code: Lang; label: string }> = [
  { code: 'de', label: 'Deutsch' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
]

export const CONG_TO_CODE: Record<string, Lang | undefined> = {
  Deutsch: 'de',
  Englisch: 'en',
  Spanisch: 'es',
  Französisch: 'fr',
}

export const LOCALES: Record<Lang, string> = {
  de: 'de-DE',
  en: 'en-US',
  es: 'es-ES',
  fr: 'fr-FR',
}

export const CONG_LANGS: readonly string[] =
['Abchasisch','Abe','Acholi','Adangme','Afan Oromo','Afrikaans','Ahanta','Aja','Akha','Albanisch','Altaisch','Alur','Amerikanische Gebärdensprache','Amharisch','Angolanische Gebärdensprache','Arabisch','Arabisch (Ägypten)','Argentinische Gebärdensprache','Armenisch','Armenisch (Westarmenisch)','Aserbaidschanisch','Aserbaidschanisch (kyrillische Schrift)','Assamesisch','Attié','Aukisch','Aymaranisch','Baschkirisch','Bassa (Kamerun)','Baule','Belize-Kreolisch','Bemba','Bengalisch','Bergdama','Betye','Bikol','Birmanisch','Bislama','Bolivianische Gebärdensprache','Brasilianische Gebärdensprache','Britische Gebärdensprache','Bulgarisch','Bulu','Cakchiquel (Westlich)','Cebuano','Cewa','Chabacano','Changana (Mosambik)','Chilenische Gebärdensprache','Chin, Haka','Chinesisch (Hochchinesisch, traditionell)','Chinesisch (Hochchinesisch, vereinfachte Schriftzeichen)','Chinesisch (Kantonesisch, traditionell)','Chinesisch (Kantonesisch, vereinfachte Schriftzeichen)','Chinesische Gebärdensprache','Chokwe','Chol','Chopi','Chwabo','Cookinseln-Maori','Costa-ricanische Gebärdensprache','Dagari','Dan','Deutsch','Deutsche Gebärdensprache','Digorisch','Duala','Dänisch','Ecuadorianische Gebärdensprache','Edo','Efik','Empera (Catío)','Englisch','Englisch (Liberia)','Esan','Estnisch','Ewe','Fang','Fante','Fidschi','Finnisch','Fon-Gbe','Frafra','Frankokanadische Gebärdensprache','Französisch','Französische Gebärdensprache','Ga','Ganda','Georgisch','Gere','Ghanaische Gebärdensprache','Gilbertesisch','Gitonga','Gokana','Griechisch','Grönländisch','Guarani','Guatemaltekische Gebärdensprache','Gujarati','Gun-Gbe','Haitianisch','Haussa','Havu','Hebräisch','Herero','Hiligaynon','Hindi','Hiri-Motu','Honduranische Gebärdensprache','Huallaga-Quechua','Huastekisch (San Luis Potosi)','Huautla-Mazatekisch','Hunsrückisch','Iban','Ibanag','Igbo','Iloko','Indische Gebärdensprache','Indonesisch','Indonesische Gebärdensprache','Isländisch','Italienisch','Italienische Gebärdensprache','Japanisch','Javanisch','Kabiye','Kamba','Kambodschanisch','Kana','Kannada','Kaonde','Kapverdisch','Karenisch (S\u2019gaw)','Karif','Karo-Batak','Kasachisch','Kasachisch (Arabisch)','Katschinisch','Kekchi','Kikongo','Kikuyu','Kinyaruanda','Kirgisisch','Kisi','Kituba','Kituba (Kikongo)','Kokola','Kolumbianische Gebärdensprache','Kongo','Konjo','Konkani (lateinische Schrift)','Koreanisch','Koreanische Gebärdensprache','Krio','Kroatisch','Kurdisch Kurmandschi','Kwangali','Kwanyama','Kyangonde','Kymrisch (Walisisch)','Laadi','Lambya','Laotisch','Lendu','Lenje','Lettisch','Lingala','Litauisch','Lolo','Lomwe','Lozi','Luba','Luba-Lulua','Luena','Lunda','Luo','Makua','Makua-Shirima','Malagassi','Malaiisch','Malawische Gebärdensprache','Malayalam','Maltesisch','Mam','Mambwe-Lungu','Manyawa','Marathi','Marshallesisch','Mashi','Maya','Mazahua','Mazedonisch','Mbundu','Mbuun','Medo','Meru','Mexikanische Gebärdensprache','Mezquital Otomi','Mingrelisch','Miskito','Mixe (Nordzentral)','Mixtekisch (Guerrero)','Mixtekisch (Tlaxiaco)','Mizo','Mongolisch','More','Morisyen','Mwanga','Nahuatl (Guerrero)','Nahuatl (Huastekisch)','Nahuatl (Nord-Puebla)','Ndau','Ndebele','Ndebele (Simbabwe)','Ndonga','Nepali','Ngangwela','Ngbandi (Nördlich)','Ngyemboon','Ngäbere','Niassisch','Nicaraguanische Gebärdensprache','Niederländisch','Nigerianische Gebärdensprache','Nikobaresisch','Niue','Nkole','Norwegisch','Nsenga (Sambia)','Nyaneka','Nyanja','Nyungwe','Nzima','Okpe','Oriya','Ossetisch','Panamaische Gebärdensprache','Pangasinan','Panjabi','Papiamento (Curaçao)','Pedi','Pende','Persisch','Peruanische Gebärdensprache','Philippinische Gebärdensprache','Phimbi','Pidgin (Westafrika)','Plautdietsch','Polnisch','Polnische Gebärdensprache','Pomoranisch','Portugiesisch (Angola)','Portugiesisch (Brasilien)','Portugiesisch (Portugal)','Quechua (Ancash)','Quechua (Ayacucho)','Quechua (Bolivien)','Quechua (Cuzco)','Quichua (Chimborazo)','Quichua (Imbabura)','Quichua (Tena)','Quiché','Romani (Rumänien)','Romani (Serbien)','Romani (Südgriechenland)','Romani (Vlach-Romani, Russland)','Ronga','Rumänisch','Rumänische Gebärdensprache','Rundi','Runyoro-Rutooro','Russisch','Russische Gebärdensprache','Ruund','Salomonen-Pidgin','Salvadorianische Gebärdensprache','Sambische Gebärdensprache','Samoanisch','Sango','Schwedisch','Schwedische Gebärdensprache','Sena','Sepulana','Serbisch (kyrillische Schrift)','Serbisch (lateinische Schrift)','Shona','Shuara','Sidamo','Simbabwische Gebärdensprache','Singhalesisch','Slowakisch','Slowakische Gebärdensprache','Slowenisch','Soko','Songe','Songo','Songomeno','Sotho (Lesotho)','Sotho (Südafrika)','Spanisch','Spanische Gebärdensprache','Srananisch','Swahili','Swahili (Kongo)','Swazi','Südafrikanische Gebärdensprache','Tabwa','Tadschikisch','Tagalog','Tahitisch','Talian','Tamil','Tandroy','Tankarana','Tarahumara','Taraskanisch','Tatarisch','Telugu','Teso','Tetela','Tetun-Prasa','Thai','Tigrinja','Tiv','Tlapanekisch','Tlascalan','Toba-Batak','Tojolabal','Tok Pisin','Tonga (Malawi)','Tonga (Sambia)','Tonga (Simbabwe)','Tonganisch','Totonakisch','Tschechisch','Tschechische Gebärdensprache','Tschuwaschisch','Tshwa','Tsonga','Tswana','Tumbuka','Turkmenisch','Tuvaluanisch','Tuwinisch','Twi','Tzeltal','Tzotzil','Türkisch','Udmurtisch','Uigurisch (kyrillische Schrift)','Ukrainisch','Umbundu','Ungarisch','Ungarische Gebärdensprache','Urdu','Urhobo','Usbekisch','Venda','Venezolanische Gebärdensprache','Vezo','Vietnamesisch','Vietnamesische Gebärdensprache','Wallisianisch','Waray-Waray','Wayuunaiki','Welaita','Xhosa','Yao','Yembe','Yombe','Yoruba','Zande','Zapotekisch (Tehuantepec)','Zapotekisch (Tehuantepecano)','Zulu'];
