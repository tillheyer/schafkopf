import json, sys, math
xs = [json.loads(l)['diff'] for f in sys.argv[1:] for l in open(f) if l.startswith('{')]
n = len(xs); m = sum(xs) / n
sd = math.sqrt(sum((x - m) ** 2 for x in xs) / (n - 1))
print(f'{n} Verteilungen ({2*n} Spiele): A − B = {m:+.2f} Cent pro Spieler und Spiel, ±{1.96*sd/math.sqrt(n):.2f} (95 %)')
