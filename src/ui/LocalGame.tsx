import React, { useEffect, useState } from 'react';
import { GameState, MatchInfo, Rules, applyAction, chooseAction, createRng, dealGame, finishGame, newMatch } from '../engine';
import { GameTable } from './GameTable';

const ME = 0;
const AI_DELAY = 650;
const AFTER_TRICK_DELAY = 1800;

interface State {
  match: MatchInfo;
  game: GameState;
}

/** Offline-Spiel: du gegen drei Computergegner. */
export function LocalGame({ name, rules, onExit }: { name: string; rules: Rules; onExit: () => void }) {
  const [st, setSt] = useState<State>(() => {
    const match = newMatch(rules);
    return { match, game: dealGame(match, createRng(Date.now())) };
  });
  const game = st.game;
  const names = [name || 'Du', 'Sepp', 'Resi', 'Franz'];

  useEffect(() => {
    if (game.phase === 'finished' || game.turn === ME) return;
    const afterTrick = game.phase === 'playing' && game.tricks.length > 0 && game.current?.cards.length === 0;
    const t = setTimeout(
      () => setSt((m) => ({ ...m, game: applyAction(m.game, chooseAction(m.game, m.game.turn)) })),
      afterTrick ? AFTER_TRICK_DELAY : AI_DELAY,
    );
    return () => clearTimeout(t);
  }, [game]);

  const nextGame = () =>
    setSt((m) => {
      const match = finishGame(m.match, m.game);
      return { match, game: dealGame(match, createRng(Date.now() + match.gameNo)) };
    });

  return (
    <GameTable
      game={game}
      me={ME}
      names={names}
      totals={st.match.totals}
      gameNo={st.match.gameNo}
      onAction={(a) => setSt((m) => ({ ...m, game: applyAction(m.game, a) }))}
      onNext={nextGame}
      onExit={onExit}
    />
  );
}
