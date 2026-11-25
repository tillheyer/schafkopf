/**
 * Optionale Sonderregeln. Alle sind standardmäßig aus und können im Menü
 * (offline) bzw. vom Gastgeber eines Online-Tisches eingeschaltet werden.
 */
export interface Rules {
  /** Geier: nur die Ober sind Trumpf. */
  geier: boolean;
  /** Farbwenz: Unter + eine Farbe sind Trumpf. */
  farbwenz: boolean;
  /** Farbgeier: Ober + eine Farbe sind Trumpf. */
  farbgeier: boolean;
  /** Bettel und Bettel Brett: Spieler darf keinen Stich machen. */
  bettel: boolean;
  /** Tout: Solospiele mit der Ansage, alle Stiche zu machen (doppelt). */
  tout: boolean;
  /** Sie: alle Ober und Unter auf der Hand gewinnen sofort. */
  sie: boolean;
  /** Ramsch statt Zusammenwerfen, wenn niemand spielt. */
  ramsch: boolean;
  /** Hochzeit: wer nur einen Trumpf hat, sucht sich einen Partner. */
  hochzeit: boolean;
  /** Bockrunden: nach Kontra, verlorenem Solo oder Zusammenwerfen 4 Spiele doppelt. */
  bock: boolean;
  /** Muss-Spiel: nach dem Zusammenwerfen muss, wer den Alten hat, spielen. */
  muss: boolean;
}

export const DEFAULT_RULES: Rules = {
  geier: false,
  farbwenz: false,
  farbgeier: false,
  bettel: false,
  tout: false,
  sie: false,
  ramsch: false,
  hochzeit: false,
  bock: false,
  muss: false,
};

export const RULE_LABELS: { key: keyof Rules; title: string; text: string }[] = [
  { key: 'geier', title: 'Geier', text: 'Nur die vier Ober sind Trumpf.' },
  { key: 'farbwenz', title: 'Farbwenz', text: 'Die Unter und eine Farbe sind Trumpf.' },
  { key: 'farbgeier', title: 'Farbgeier', text: 'Die Ober und eine Farbe sind Trumpf.' },
  { key: 'bettel', title: 'Bettel', text: 'Ohne Trumpf, der Spieler darf keinen Stich machen. Auch als Bettel Brett mit offenen Karten.' },
  { key: 'tout', title: 'Tout', text: 'Solo, Wenz oder Geier mit der Ansage, alle Stiche zu machen. Zählt doppelt.' },
  { key: 'sie', title: 'Sie', text: 'Wer alle Ober und Unter hat, gewinnt sofort (zählt wie ein Tout).' },
  { key: 'ramsch', title: 'Ramsch', text: 'Sagt keiner an, spielt jeder gegen jeden. Wer die meisten Augen hat, verliert. Durchmarsch gewinnt.' },
  { key: 'hochzeit', title: 'Hochzeit', text: 'Wer nur einen Trumpf hat, bietet ihn an. Wer ihn nimmt, gibt eine Karte zurück und spielt mit.' },
  { key: 'bock', title: 'Bockrunden', text: 'Nach Kontra, verlorenem Solo oder Zusammenwerfen zählen die nächsten 4 Spiele doppelt.' },
  { key: 'muss', title: 'Muss-Spiel', text: 'Nach dem Zusammenwerfen muss, wer den Eichel-Ober hat, ein Spiel ansagen.' },
];

/** Unbekannte oder fehlende Felder (z.B. von älteren Clients) auffüllen. */
export function normalizeRules(r: unknown): Rules {
  const out = { ...DEFAULT_RULES };
  if (r && typeof r === 'object') {
    for (const k of Object.keys(DEFAULT_RULES) as (keyof Rules)[]) out[k] = !!(r as Record<string, unknown>)[k];
  }
  return out;
}
