# Schafkopf

Schafkopf fürs Handy (Android und iOS), gebaut mit Expo/React Native und TypeScript.
Erste Version: offline, du gegen drei Computergegner.

## Ausprobieren

```bash
npm install
npm start        # QR-Code mit der App "Expo Go" auf dem Handy scannen
npm run web      # oder im Browser spielen
npm test         # Tests der Spiellogik
```

## Online spielen

- **Web-Version:** wird bei jedem Push auf `main` automatisch auf GitHub Pages veröffentlicht
  (`.github/workflows/pages.yml`), Adresse: https://tillheyer.github.io/schafkopf/
  Am Handy über „Zum Home-Bildschirm“ wie eine App ablegen (Android und iPhone).
- **Server:** `server/` (Node.js + WebSocket). Lokal starten mit `npm run server` (Port 8787).
  Hosting über Render.com mit `render.yaml` (kostenloser Plan, schläft nach 15 Minuten ohne
  Nutzung ein; das erste Verbinden dauert dann bis zu einer Minute).
- **Tische:** Wer einen Tisch erstellt, bekommt einen 4-stelligen Code. Freie Plätze spielt der
  Computer, Mitspieler können jederzeit einen Computer-Platz übernehmen. Bei Verbindungsabbruch
  spielt der Computer weiter, bis man mit gleichem Namen zurückkommt.
- Der Server prüft jeden Zug mit derselben Spiellogik und schickt jedem nur seine eigenen Karten.

## Aufbau

```
src/engine/   Spiellogik ohne UI (reines TypeScript, JSON-serialisierbarer Zustand)
  cards.ts    Bayerisches Blatt, 32 Karten, Augen
  rules.ts    Spielarten, Trumpf-Reihenfolge, Stichauswertung
  game.ts     Zustand + Reducer: Reizen, erlaubte Karten, Stiche
  scoring.ts  Abrechnung: Tarif, Schneider, Schwarz, Laufende
  ai.ts       Computergegner (regelbasiert)
  redact.ts   Sicht eines Spielers (fremde Karten verdeckt)
src/net/      Protokoll und Server-Adresse für den Online-Modus
src/ui/       Oberfläche (React Native)
server/       Online-Server (Tische, Computer für freie Plätze)
```

Die Spiellogik ist bewusst ein reiner Reducer `applyAction(state, action)`.
Für den späteren Online-Modus kann ein Server (z.B. Node.js mit WebSockets) denselben Code
ausführen, Aktionen der Spieler prüfen und jedem Client nur seine eigene Hand schicken.

## Regeln in dieser Version

- Spielarten: Sauspiel, Wenz, Farbsolo.
- Sauspiel: Herz, Ober und Unter sind Trumpf. Gerufen werden kann eine Sau (Eichel, Gras,
  Schellen), von deren Farbe man eine Karte, aber nicht die Sau selbst hat.
  Wird die gerufene Farbe gesucht, muss die Sau zugegeben werden; die Sau darf nicht
  geschmiert werden; der Besitzer darf die Farbe nur mit der Sau anspielen, außer er hat
  vier oder mehr Karten davon (davonlaufen).
- Wenz: nur die vier Unter sind Trumpf, Ober zählen als Farbkarten.
- Gewonnen ab 61 Augen, Schneider bei höchstens 30 Augen, Schwarz ohne Stich.

### Annahmen (bitte prüfen)

- **Reizen vereinfacht:** Jeder sagt einmal reihum ab der Vorhand an. Spätere Spieler müssen
  ein höheres Spiel ansagen (Sauspiel < Wenz < Solo), bei gleichem Spiel hat der Vordere
  Vorrang. Kein Nachbieten.
- **Alle weiter:** Es wird neu gegeben (kein Ramsch).
- **Tarif:** Sauspiel 10 Cent, Solo/Wenz 50 Cent, Schneider +10, Schwarz +10,
  je Laufender +10. Laufende zählen beim Sauspiel/Solo ab 3, beim Wenz ab 2.
  Beim Solo/Wenz zahlen alle drei Gegner an den Spieler.
- **Kontra/Re:** Kontra darf jeder aus der Gegenpartei geben, solange er selbst noch keine Karte gespielt hat. Re darf die Spielerpartei nach einem Kontra geben, solange der erste Stich läuft. Beides verdoppelt jeweils den Spielwert.
- **Sonderregeln (im Menü unter „Spielregeln“ einzeln schaltbar):** Geier, Farbwenz, Farbgeier,
  Bettel und Bettel Brett, Tout, Sie, Ramsch (mit Durchmarsch), Hochzeit, Bockrunden, Muss-Spiel.
  Rangfolge beim Reizen: Sauspiel/Hochzeit < Bettel < Farbwenz/Farbgeier < Wenz/Geier < Solo <
  Bettel Brett < jedes Tout < Sie. Bettel kostet wie ein Solo (Brett doppelt), Tout und Sie doppelt.
  Ramsch: wer die meisten Augen hat, zahlt jedem den Sauspiel-Tarif. Bock nach Kontra, verlorenem
  Solo oder Zusammenwerfen für 4 Spiele (×2, überlappend ×4).
- Noch nicht enthalten: Klopfen, Schlachtbankrennen.

## Design

Die Karten sind im Stil des bayerischen Blatts selbst als SVG gezeichnet (`src/ui/CardFace.tsx`,
`src/ui/SuitSymbol.tsx`), keine Fremdgrafiken. Der dunkle Holztisch (`assets/images/holz.jpg`)
ist per Skript erzeugt. Im Browser zeigt `?karten` alle 32 Karten auf einen Blick.
