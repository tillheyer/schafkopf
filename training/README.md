# Training des MEGA-Netzes

Nur für Entwickler – nichts davon kommt in die App. Die fertigen Gewichte liegen in
`src/engine/mega/weights.ts`.

1. **Daten** (der starke Computer spielt gegen sich selbst):
   `esbuild training/gen.ts --bundle --platform=node --outfile=gen.js`
   `node gen.js <seed> <spiele> daten.bin` (mehrere Prozesse parallel, ~6 Spiele/s auf 4 Kernen)
2. **Netz trainieren** (PyTorch): `python3 training/train.py netz.json daten*.bin`
   (`--h1 128 --h2 128` für das kleine Netz zum Durchspielen)
3. **Selbstspiel**: `SAMPLES=32 node gen.js <seed> <spiele> runde1.bin megar:netz.json:0.5:klein.json`,
   dann mit `--init netz.pt` auf alten + neuen Daten weitertrainieren.
4. **Vergleich mit gleichen Karten**: `node eval.js app strong <erste> <anzahl> default`,
   Auswertung mit `python3 training/stats.py ausgabe*`.
5. Gewichte nach `src/engine/mega/weights.ts` übernehmen (`MEGA_WEIGHTS`, `MEGA_ROLLOUT_WEIGHTS`).
