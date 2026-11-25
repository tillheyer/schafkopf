import React, { useEffect, useState } from 'react';
import { GameState, applyAction, chooseAction, createRng, newGame, next } from '../engine';
import { GameTable } from './GameTable';

const ME = 0;
const AI_DELAY = 650;
const AFTER_TRICK_DELAY = 1800;

interface Match {
  game: GameState;
  totals: number[];
  gameNo: number;
}

/** Offline-Spiel: du gegen drei Computergegner. */
export function LocalGame({ name, onExit }: { name: string; onExit: () => void }) {
  const [match, setMatch] = useState<Match>(() => ({ game: newGame(3, createRng(Date.now())), totals: [0, 0, 0, 0], gameNo: 1 }));
  const game = match.game;
  const names = [name || 'Du', 'Sepp', 'Resi', 'Franz'];

  useEffect(() => {
    if (game.phase === 'finished' || game.turn === ME) return;
    const afterTrick = game.phase === 'playing' && game.tricks.length > 0 && game.current?.cards.length === 0;
    const t = setTimeout(
      () => setMatch((m) => ({ ...m, game: applyAction(m.game, chooseAction(m.game, m.game.turn)) })),
      afterTrick ? AFTER_TRICK_DELAY : AI_DELAY,
    );
    return () => clearTimeout(t);
  }, [game]);

  const nextGame = () =>
    setMatch((m) => {
      const payouts = m.game.result?.kind === 'played' ? m.game.result.payouts : [0, 0, 0, 0];
      return {
        totals: m.totals.map((t, i) => t + payouts[i]),
        gameNo: m.gameNo + 1,
        game: newGame(next(m.game.dealer), createRng(Date.now() + m.gameNo)),
      };
    });

  return (
    <GameTable
      game={game}
      me={ME}
      names={names}
      totals={match.totals}
      gameNo={match.gameNo}
      onAction={(a) => setMatch((m) => ({ ...m, game: applyAction(m.game, a) }))}
      onNext={nextGame}
      onExit={onExit}
    />
  );
}
