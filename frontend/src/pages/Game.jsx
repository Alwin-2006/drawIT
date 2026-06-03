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
import { useGameTimers, useRoundTransition } from '../hooks/useGameTimers.js'; // Note: Both exported from useGameTimers.js now to save files

function Game() {
  // ── Central Game State ────────────────────────────────────────────────
  const [state, dispatch] = useReducer(gameReducer, initialGameState);

  // ── Local Input State ─────────────────────────────────────────────────
  // These stay as useState because they update on every keystroke
  const [guessValue, setGuessValue] = useState('');
  const [wordValue, setWordValue] = useState('');

  // ── Auth & Identity ───────────────────────────────────────────────────
  const authPlayerName = useUserStore((s) => s.username);
  const authPlayerId = useUserStore((s) => s.playerId);
  const rating = useUserStore((s) => s.rating);

  const { roomId } = useParams();
  const location = useLocation();
  const routeState = location.state || {};
  const roomCode = roomId || 'party-6767676767';

  const [fallbackGuestId] = useState(() => `guest-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  const resolvedPlayerId = authPlayerId || state.localPlayerId || routeState.playerId || fallbackGuestId;
  const resolvedPlayerName = authPlayerName || state.localPlayerName || routeState.playerName || 'Guest';

  // ── Hooks ────────────────────────────────────────────────────────────
  usePlayerResolution(
    state.localPlayerId,
    (id) => dispatch({ type: 'SET_LOCAL_PLAYER', payload: { id } }),
    state.localPlayerName,
    (name) => dispatch({ type: 'SET_LOCAL_PLAYER', payload: { name } }),
    resolvedPlayerId,
    resolvedPlayerName,
  );

  useGameSocket({
    roomCode,
    resolvedPlayerId,
    resolvedPlayerName,
    dispatch,
  });

  useGameTimers(state, dispatch);

  useRoundTransition(state, dispatch, roomCode, authPlayerId);

  // ── Event handlers ───────────────────────────────────────────────────
  const onSubmitWord = (e) =>
    handleSubmitWord({
      event: e,
      wordValue,
      roomCode,
      playerId: state.localPlayerId || authPlayerId,
      playerName: state.localPlayerName || authPlayerName,
      dispatch,
      setWordValue
    });

  const onStartRound = (e) =>
    handleStartRound({
      event: e,
      submittedCount: state.submittedCount,
      totalPlayers: state.totalPlayers,
      roomCode,
      playerId: state.localPlayerId || authPlayerId,
      dispatch
    });

  const onSubmitGuess = (e) =>
    handleSendGuess({
      event: e,
      guessValue,
      isDrawing: state.isDrawing,
      roomCode,
      playerName: state.localPlayerName || authPlayerName,
      playerId: state.localPlayerId || authPlayerId,
      setGuessValue
    });

  // ── Render ───────────────────────────────────────────────────────────
  const displayName = state.localPlayerName || authPlayerName || 'Guest';

  return (
    <div className='home-background flex flex-col'>
      {/* ── Header Bar ─────────────────────────────────────────────── */}
      <div className='flex items-center justify-between gap-3 p-2'>
        <span className='font-mono p-2 text-2xl w-1/5'>{state.status}</span>
        <div className='font-mono text-sm text-[var(--color-primary)] bg-[var(--color-neutral)] border-4 border-[var(--color-primary)] p-2 rounded w-1/5 flex flex-col items-center'>
          <span className='font-bold'>Room</span>
          <span>{roomCode}</span>
        </div>
        <span className='font-mono bg-[var(--color-neutral)] text-[var(--color-primary)] border-4 border-[var(--color-primary)] p-2 flex flex-col items-center text-2xl w-1/4'>
          {state.isDrawing ? state.currentWord : state.hideword || '???'}
        </span>
        <div className='font-mono bg-[var(--color-neutral)] text-[var(--color-primary)] border-4 border-[var(--color-primary)] p-2 flex flex-col items-center gap-2 text-sm w-1/4'>
          <span>Timer: {state.timer}s</span>
          <span className='text-xs'>Phase: {state.gamePhase}</span>
        </div>
        <span className='font-display bg-[var(--color-secondary)] text-[var(--color-primary)] border-[var(--color-primary)] p-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col items-center gap-2 text-sm w-1/5'>
          <span>{displayName}</span>
          <span className='text-xs'>Rating: {rating}</span>
        </span>
      </div>

      {/* ── Main Content ───────────────────────────────────────────── */}
      <div className='home-background flex flex-row p-3 gap-3 h-screen'>
        {/* Sidebar: Players */}
        <div className='font-display bg-[var(--color-neutral)] text-[var(--color-primary)] border-4 border-[var(--color-primary)] p-3 w-1/5 h-5/7 text-2xl'>
          <div><span>Players:</span></div>
          <div className='flex flex-col justify-between text-lg'>
            <PlayersList players={state.players} />
          </div>
        </div>

        {/* Center: Board */}
        <div className='font-mono bg-[var(--color-neutral)] text-[var(--color-primary)] border-4 border-[var(--color-primary)] p-2 w-full h-5/7 flex flex-col gap-4 text-2xl relative'>
          {state.isGameOver && <EndGameOverlay className='text-white' players={state.players} />}

          {state.gamePhase === 'word-input' ? (
            <div className='flex items-center justify-center h-full'>
              <div className='flex flex-col gap-4 items-center'>
                <h2 className='text-2xl font-bold'>Submit a word to draw!</h2>
                <div className='text-lg mb-4'>
                  <span className={state.submittedCount === state.totalPlayers && state.totalPlayers > 0 ? 'text-green-500' : 'text-[var(--color-primary)]'}>
                    {state.submittedCount}/{state.totalPlayers} players ready
                  </span>
                </div>
                <form onSubmit={onSubmitWord} className='flex flex-col gap-4 items-center'>
                  <input
                    value={wordValue}
                    onChange={(e) => setWordValue(e.target.value)}
                    placeholder='Type a word...'
                    className='w-64 rounded bg-[var(--color-neutral)] p-3 text-black border-2 border-[var(--color-primary)] text-lg'
                    disabled={state.hasSubmittedWord}
                  />
                  <button type='submit' className='rounded bg-[var(--color-primary)] px-6 py-3 text-[var(--color-neutral)] hover:bg-[var(--color-secondary)] font-bold text-lg disabled:opacity-50' disabled={state.hasSubmittedWord}>
                    {state.hasSubmittedWord ? 'Word Submitted!' : 'Submit Word'}
                  </button>
                </form>
                {state.submittedCount === state.totalPlayers && state.totalPlayers > 0 && (
                  <button onClick={onStartRound} className='rounded bg-green-500 px-8 py-3 text-white font-bold text-lg hover:bg-green-600 mt-4'>
                    Start Round!
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className='flex flex-col h-full relative'>
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

        {/* Right: Chat */}
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