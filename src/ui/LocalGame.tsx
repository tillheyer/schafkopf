import React, { useEffect, useState } from 'react';
import { BotLevel, GameState, MatchInfo, Rules, applyAction, chooseBotAction, createRng, dealGame, finishGame, newMatch } from '../engine';
import { GameTable } from './GameTable';

const ME = 0;
const AI_DELAY = 650;
const STRONG_DELAY = 150;
const AFTER_TRICK_DELAY = 1800;

interface State {
  match: MatchInfo;
  game: GameState;
}

/** Offline-Spiel: du gegen drei Computergegner. */
export function LocalGame({ name, rules, level, onExit }: { name: string; rules: Rules; level: BotLevel; onExit: () => void }) {
  const [st, setSt] = useState<State>(() => {
    const match = newMatch(rules);
    return { match, game: dealGame(match, createRng(Date.now())) };
  });
  const game = st.game;
  const names = [name || 'Du', 'Sepp', 'Resi', 'Franz'];

  useEffect(() => {
    if (game.phase === 'finished' || game.turn === ME) return;
    const afterTrick = game.phase === 'playing' && game.tricks.length > 0 && game.current?.cards.length === 0;
    // Der starke Computer rechnet selbst ein paar hundert Millisekunden, darum kürzer warten.
    const delay = afterTrick ? AFTER_TRICK_DELAY : level === 'strong' ? STRONG_DELAY : AI_DELAY;
    const t = setTimeout(
      () => setSt((m) => ({ ...m, game: applyAction(m.game, chooseBotAction(m.game, m.game.turn, level)) })),
      delay,
    );
    return () => clearTimeout(t);
  }, [game, level]);

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
