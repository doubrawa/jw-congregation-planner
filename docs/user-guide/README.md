# Benutzerdokumentation

Anwender‑Handbücher für den Congregation Planner, getrennt nach Rolle:

- **[verkuendiger.md](verkuendiger.md)** – für alle Verkündiger (Programm ansehen,
  Aufgaben bestätigen, Abwesenheiten, Profil).
- **[planer.md](planer.md)** – zusätzlich für Koordinatoren/Planer (Zuteilen,
  Personen, Gruppen, Einstellungen, Import, Drucken).

Die Screenshots liegen in [`screenshots/`](screenshots/) und werden **automatisch**
erzeugt – nie von Hand.

---

## Screenshots neu erzeugen

Die App wird im **Demo‑Modus** über den DEV‑Debug‑Hash direkt in den jeweiligen
Zustand versetzt (kein Login/Netz nötig). Ablauf:

```bash
npm run dev                               # Dev-Server auf Port 5173 starten
bash docs/user-guide/capture-screenshots.sh
```

Das Skript fährt per **Chrome (headless)** jeden dokumentierten Zustand an und legt
die PNGs in `screenshots/` ab. Es ist die *einzige* Quelle der Screenshots –
dadurch bleiben Bilder und App immer konsistent.

### Debug‑Hash (nur DEV, siehe `src/app/init.ts` → `parseDebugHash`)

`#s=<screen>&tab=<mid|we|fs>&pl=<0|1>&p=<personId>&t=<theme>&l=<lang>&c=<congLang>`

| Parameter | Bedeutung |
| --- | --- |
| `s`   | Bildschirm: `login`, `start`, `programm`, `aufgaben`, `planen`, `personen`, `einstellungen`, `profil` |
| `tab` | Reiter in Programm/Planen: `mid` (unter der Woche), `we` (Wochenende), `fs` (Treffpunkte) |
| `pl`  | Rechte erzwingen: `0` = Verkündiger‑Ansicht, `1` = Planer |
| `p`   | Person‑Id (setzt „DU"; auf der Personen‑Seite öffnet es das Detail) |
| `t`   | Theme (z. B. `weiss` für die druckfreundliche Doku) |
| `l` / `c` | App‑Sprache / Versammlungssprache |

## Screenshot‑Manifest

| Datei | Debug‑Hash | verwendet in |
| --- | --- | --- |
| `login.png` | `s=login` | beide |
| `programm-woche.png` | `s=programm&tab=mid` | (Reserve) |
| `programm-wochenende.png` | `s=programm&tab=we` | (Reserve) |
| `programm-treffpunkte.png` | `s=programm&tab=fs` | beide |
| `verkuendiger-start.png` | `s=start&pl=0&p=p9` | verkuendiger |
| `verkuendiger-aufgaben.png` | `s=aufgaben&pl=0&p=p9` | verkuendiger |
| `verkuendiger-profil.png` | `s=profil&pl=0&p=p9` | verkuendiger |
| `planer-start.png` | `s=start` | planer |
| `planer-aufgaben.png` | `s=aufgaben` | (Reserve) |
| `planer-planen-woche.png` | `s=planen&tab=mid` | planer |
| `planer-planen-treffpunkte.png` | `s=planen&tab=fs` | (Reserve) |
| `planer-personen.png` | `s=personen` | planer |
| `planer-person-detail.png` | `s=personen&p=p1` | planer |
| `planer-einstellungen.png` | `s=einstellungen` | planer |

Alle Screenshots werden im hellen Theme (`t=weiss`) und in 1280×940 erzeugt.

---

## Aktuell halten (Pflege‑Mechanismus)

Damit Handbücher und App nicht auseinanderlaufen, gilt bei **jeder Änderung an
einem sichtbaren Feature** diese Reihenfolge:

1. **Text** im betroffenen Handbuch (`verkuendiger.md` / `planer.md`) anpassen.
2. **Screenshot‑Zustand** prüfen: Ist ein neuer Screen/Reiter dazugekommen, eine
   Zeile im `SHOTS`‑Array von `capture-screenshots.sh` ergänzen (und das
   Manifest oben aktualisieren). Reicht der Debug‑Hash nicht aus, um den Zustand
   anzufahren, `parseDebugHash` in `src/app/init.ts` um einen Parameter erweitern.
3. **Neu erzeugen:** Dev‑Server starten und `capture-screenshots.sh` ausführen –
   das aktualisiert alle Bilder, nicht nur das geänderte.
4. Änderungen committen (Handbücher + Screenshots gemeinsam).

So bleibt die Dokumentation ohne manuelles Abtippen der Screenshots aktuell.
