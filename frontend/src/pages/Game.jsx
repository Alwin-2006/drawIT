import React, { useState, useReducer } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import useUserStore from '../store/userStore.js';
import WhiteBoard from '../components/WhiteBoard.jsx';
import EndGameOverlay from '../components/EndGameOverlay.jsx';
import RoundEndOverlay from '../components/RoundEndOverlay.jsx';
import PlayersList from '../components/PlayersList.jsx';
import ChatPanel from '../components/ChatPanel.jsx';
import { handleSendGuess, handleSubmitWord, handleStartRound } from '../utils/gameUtils.js';
import { gameReducer, initialGameState } from '../reducers/gameReducer.js';
import { usePlayerResolution } from '../hooks/usePlayerResolution.js';
import { useGameSocket } from '../hooks/useGameSocket.js';
import { useGameTimers, useRoundTransition } from '../hooks/useGameTimers.js';

function Game() {
  const [state, dispatch] = useReducer(gameReducer, initialGameState);
  const [guessValue, setGuessValue] = useState('');
  const [wordValue, setWordValue] = useState('');

  const authPlayerName = useUserStore((s) => s.username);
  const authPlayerId = useUserStore((s) => s.playerId);
  const rating = useUserStore((s) => s.rating);

  const { roomId } = useParams();
  const location = useLocation();
  const routeState = location.state || {};
  const roomCode = roomId || 'party-0000000000';

  const [fallbackGuestId] = useState(
    () => `guest-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  );
  const resolvedPlayerId = authPlayerId || state.localPlayerId || routeState.playerId || fallbackGuestId;
  const resolvedPlayerName = authPlayerName || state.localPlayerName || routeState.playerName || 'Guest';

  usePlayerResolution(
    state.localPlayerId,
    (id) => dispatch({ type: 'SET_LOCAL_PLAYER', payload: { id } }),
    state.localPlayerName,
    (name) => dispatch({ type: 'SET_LOCAL_PLAYER', payload: { name } }),
    resolvedPlayerId,
    resolvedPlayerName,
  );

  useGameSocket({ roomCode, resolvedPlayerId, resolvedPlayerName, dispatch });
  useGameTimers(state, dispatch);
  useRoundTransition(state, dispatch, roomCode, authPlayerId);

  const onSubmitWord = (e) =>
    handleSubmitWord({
      event: e, wordValue, roomCode,
      playerId: state.localPlayerId || authPlayerId,
      playerName: state.localPlayerName || authPlayerName,
      dispatch, setWordValue,
    });

  const onStartRound = (e) =>
    handleStartRound({
      event: e, submittedCount: state.submittedCount,
      totalPlayers: state.totalPlayers, roomCode,
      playerId: state.localPlayerId || authPlayerId, dispatch,
    });

  const onSubmitGuess = (e) =>
    handleSendGuess({
      event: e, guessValue, isDrawing: state.isDrawing, roomCode,
      playerName: state.localPlayerName || authPlayerName,
      playerId: state.localPlayerId || authPlayerId,
      setGuessValue,
    });

  const displayName = state.localPlayerName || authPlayerName || 'Guest';

  // Word display: drawer sees actual word, guessers see underscores from server
  const wordDisplay = state.gamePhase === 'guessing' || state.gamePhase === 'round-end'
    ? (state.isDrawing ? state.currentWord : state.hideword)
    : '—';

  return (
    <div className="home-background flex flex-col overflow-hidden" style={{ height: 'calc(100dvh - var(--navbar-height))' }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b-4 border-[var(--color-primary)] bg-[var(--color-neutral)] font-mono text-sm">
        {/* Status */}
        <span className="text-[var(--color-text-muted)] w-24 truncate">{state.status}</span>

        {/* Room code */}
        <div className="border-2 border-[var(--color-primary)] px-2 py-1 text-xs">
          {roomCode}
        </div>

        {/* Word / blanks — centered */}
        <div className="flex-1 flex justify-center">
          <span className="text-xl font-bold tracking-[0.25em]">
            {wordDisplay}
          </span>
        </div>

        {/* Timer */}
        <div className="border-2 border-[var(--color-primary)] px-2 py-1 text-xs w-20 text-center">
          {state.gamePhase === 'guessing' ? `${state.timer}s` : state.gamePhase}
        </div>

        {/* Player identity */}
        <div className="flex flex-col items-end text-xs w-28">
          <span className="font-bold truncate">{displayName}</span>
          <span className="text-[var(--color-text-muted)]">{rating ?? 1200}</span>
        </div>
      </div>

      {/* Main area */}
      <div className="flex flex-1 gap-2 p-2 min-h-0">
        {/* Players sidebar */}
        <div className="font-mono bg-[var(--color-neutral)] border-4 border-[var(--color-primary)] p-3 w-44 flex flex-col gap-2 shrink-0">
          <span className="text-xs font-bold uppercase tracking-wide border-b-2 border-[var(--color-primary)] pb-1">
            Players
          </span>
          <PlayersList players={state.players} currentDrawer={state.currentDrawer} />
        </div>

        {/* Canvas */}
        <div className="font-mono bg-[var(--color-neutral)] border-4 border-[var(--color-primary)] flex-1 flex flex-col relative min-w-0">
          {state.isGameOver && <EndGameOverlay players={state.players} />}

          {state.gamePhase === 'word-input' ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 p-4">
              <p className="text-sm font-bold">Submit a word for others to draw</p>
              <p className="text-xs text-[var(--color-text-muted)]">
                {state.submittedCount}/{state.totalPlayers} submitted
              </p>
              <form onSubmit={onSubmitWord} className="flex gap-2 w-full max-w-xs">
                <input
                  value={wordValue}
                  onChange={(e) => setWordValue(e.target.value)}
                  placeholder="Your word…"
                  className="flex-1 border-2 border-[var(--color-primary)] bg-transparent p-2 text-sm outline-none"
                  disabled={state.hasSubmittedWord}
                />
                <button
                  type="submit"
                  disabled={state.hasSubmittedWord}
                  className="bg-[var(--color-primary)] text-[var(--color-neutral)] px-3 py-2 text-sm hover:bg-[var(--color-secondary)] hover:text-black disabled:opacity-40"
                >
                  {state.hasSubmittedWord ? '✓' : 'Submit'}
                </button>
              </form>
              {state.submittedCount === state.totalPlayers && state.totalPlayers > 0 && (
                <button
                  onClick={onStartRound}
                  className="bg-[var(--color-secondary)] text-black px-6 py-2 text-sm font-bold hover:opacity-80"
                >
                  Start Round
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col flex-1 relative min-h-0">
              <WhiteBoard room={roomCode} locked={!state.isDrawing} />
              {state.showRoundEndOverlay && (
                <RoundEndOverlay
                  currentWord={state.currentWord}
                  roundEndCountdown={state.roundEndCountdown}
                  players={state.players}
                  scoreDeltas={state.scoreDeltas}
                />
              )}
            </div>
          )}
        </div>

        {/* Chat */}
        <ChatPanel
          messages={state.messages}
          guessValue={guessValue}
          setGuessValue={setGuessValue}
          onSubmitGuess={onSubmitGuess}
          isDrawing={state.isDrawing}
          gamePhase={state.gamePhase}
        />
      </div>
    </div>
  );
}

export default Game;
