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

## Aufbau

```
src/engine/   Spiellogik ohne UI (reines TypeScript, JSON-serialisierbarer Zustand)
  cards.ts    Bayerisches Blatt, 32 Karten, Augen
  rules.ts    Spielarten, Trumpf-Reihenfolge, Stichauswertung
  game.ts     Zustand + Reducer: Reizen, erlaubte Karten, Stiche
  scoring.ts  Abrechnung: Tarif, Schneider, Schwarz, Laufende
  ai.ts       Computergegner (regelbasiert)
src/ui/       Oberfläche (React Native)
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
- Noch nicht enthalten: Klopfen, Kontra/Re, Tout, Sie, Hochzeit, Geier, Farbwenz, Ramsch.
