import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import {
  connectGuest,
  disconnectSocket,
  joinAsGuest,
  getSocket,
  subscribeToGameEvents,
} from '../socket.js';
import WhiteBoard from '../components/WhiteBoard.jsx';
import useUserStore from '../store/userStore.js';
import {
  handleRoundEnd,
  handleSendGuess,
  handleSubmitWord,
  handleStartRound,
  ROUND_END_DELAY_SEC,
} from '../utils/gameUtils.js';

const RoundEndOverlay = ({ currentWord, roundEndCountdown, players, scoreDeltas }) => (
  <div className='absolute inset-0 bg-black bg-opacity-70 flex flex-col items-center justify-center rounded z-40'>
    <div className='bg-[var(--color-neutral)] border-4 border-[var(--color-primary)] p-6 rounded-lg flex flex-col items-center gap-4 max-w-md w-full'>
      <h3 className='text-2xl font-bold text-[var(--color-primary)]'>Round Summary</h3>
      <div className='text-lg text-[var(--color-primary)]'>
        Word: <span className='font-bold text-xl'>{currentWord}</span>
      </div>
      <div className='max-h-40 text-white overflow-y-auto w-full'>
        {players.map((p) => (
          <div
            key={p.id}
            className='flex justify-between items-center bg-[var(--color-primary)] bg-opacity-10 p-2 rounded mb-2'
          >
            <span className='text-sm'>{p.name}</span>
            <div className='flex gap-2'>
              <span className='text-sm'>Score: {p.score}</span>
              {scoreDeltas[p.id] > 0 && (
                <span className='text-green-400 font-bold text-sm'>+{scoreDeltas[p.id]}</span>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className='text-sm text-gray-400'>
        Next drawer in {roundEndCountdown}s…
      </div>
    </div>
  </div>
);

const PlayersList = ({ players }) => {
  return (
    <div className='flex flex-col justify-between gap-2'>
      {players.map((player) => (
        <div key={player.id} className='flex justify-between'>
          <span>{player.name}</span>
          <span>{player.score}</span>
        </div>
      ))}
    </div>
  );
};

const MessageItem = ({ message }) => {
  return (
    <div className='border-b border-[var(--color-primary)] py-2'>
      <span className='font-bold'>{message.playerName}:</span> {message.text}
    </div>
  );
};
function Game() {
  const [players, setPlayers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [guessValue, setGuessValue] = useState('');
  const [wordValue, setWordValue] = useState('');
  const [status, setStatus] = useState('Connecting...');
  const authPlayerName = useUserStore((state) => state.username);
  const authPlayerId = useUserStore((state) => state.playerId);
  const rating = useUserStore((state) => state.rating);
  const [localPlayerName, setLocalPlayerName] = useState('');
  const [localPlayerId, setLocalPlayerId] = useState('');
  const { roomId } = useParams();
  const location = useLocation();

  // Game state
  const [gamePhase, setGamePhase] = useState('word-input'); // 'word-input', 'guessing', 'round-end'
  const [currentDrawer, setCurrentDrawer] = useState(null);
  const [currentWord, setCurrentWord] = useState('');
  const [hideword, setHideword] = useState('');
  const [timer, setTimer] = useState(60);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isGuessing, setIsGuessing] = useState(false);

  // Submission tracking
  const [submittedCount, setSubmittedCount] = useState(0);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const [hasSubmittedWord, setHasSubmittedWord] = useState(false);

  // Round-end summary state
  const [prevScores, setPrevScores] = useState({});
  const [scoreDeltas, setScoreDeltas] = useState({});
  const [showRoundEndOverlay, setShowRoundEndOverlay] = useState(false);
  const [roundEndCountdown, setRoundEndCountdown] = useState(ROUND_END_DELAY_SEC);
  const roundEndActiveRef = useRef(false);
  const advancingRoundRef = useRef(false);
  const guestIdRef = useRef(null);
  const playersRef = useRef(players);
  const prevScoresRef = useRef(prevScores);
  const beginRoundEndSummaryRef = useRef(null);
  const playerIdRef = useRef('');

  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  useEffect(() => {
    prevScoresRef.current = prevScores;
  }, [prevScores]);

  const beginRoundEndSummary = useCallback((revealedWord) => {
    if (roundEndActiveRef.current) return;
    roundEndActiveRef.current = true;

    const revealed = revealedWord || '???';
    setTimer(0);
    setGamePhase('round-end');
    setIsDrawing(false);
    setIsGuessing(false);
    setSubmittedCount(0);
    setHasSubmittedWord(false);
    setCurrentWord(revealed);
    setHideword(revealed);

    const deltas = {};
    playersRef.current.forEach((p) => {
      deltas[p.id] = p.score - (prevScoresRef.current[p.id] || 0);
    });
    setScoreDeltas(deltas);
    setShowRoundEndOverlay(true);
    setRoundEndCountdown(ROUND_END_DELAY_SEC);

    setMessages((prev) => [
      ...prev,
      { playerName: 'System', text: `Round ended — word was: ${revealed}` },
    ]);
  }, []);

  beginRoundEndSummaryRef.current = beginRoundEndSummary;

  const routeState = location.state || {};
  const roomCode = roomId || 'party-6767676767';
  const resolvedPlayerId =
    authPlayerId ||
    localPlayerId ||
    routeState.playerId ||
    guestIdRef.current ||
    (guestIdRef.current = `guest-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  const resolvedPlayerName =
    authPlayerName || localPlayerName || routeState.playerName || 'Guest';

  playerIdRef.current = resolvedPlayerId;

  useEffect(() => {
    if (!localPlayerId && resolvedPlayerId) setLocalPlayerId(resolvedPlayerId);
    if (!localPlayerName && resolvedPlayerName) setLocalPlayerName(resolvedPlayerName);
  }, [localPlayerId, localPlayerName, resolvedPlayerId, resolvedPlayerName]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribeGameEvents = () => { };

    const onCasualQueued = (payload) => {
      setMessages((prev) => [
        ...prev,
        { playerName: 'System', text: `Queued for casual match (job ${payload.jobId}).` },
      ]);
    };
    const onCasualError = (err) => {
      setMessages((prev) => [
        ...prev,
        { playerName: 'System', text: `Queue error: ${err?.message || err}` },
      ]);
    };
    const onMatched = (data) => {
      setMessages((prev) => [
        ...prev,
        { playerName: 'System', text: `Matched with ${data?.opponent?.name || 'unknown'}` },
      ]);
    };

    const connect = async () => {
      const playerId = resolvedPlayerId;
      const playerName = resolvedPlayerName;
      if (!playerId) return;

      const client = await connectGuest();
      if (cancelled) return;

      const join = () => {
        setStatus('Connected');
        joinAsGuest({ room: roomCode, playerId, playerName });
      };
      if (client.connected) join();
      else client.once('connect', join);

      client.on('playCasualQueued', onCasualQueued);
      client.on('playCasualError', onCasualError);
      client.on('matched', onMatched);

      unsubscribeGameEvents = subscribeToGameEvents({
        joinedRoom: (payload) => {
          if (payload?.playerName) setLocalPlayerName(payload.playerName);
          if (payload?.playerId) setLocalPlayerId(payload.playerId);
        },
        playerJoined: (payload) => {
          setPlayers((prev) => {
            if (prev.some((player) => String(player.id) === String(payload.playerId))) return prev;
            return [...prev, { id: payload.playerId, name: payload.playerName, score: 0 }];
          });
          setMessages((prev) => [
            ...prev,
            { playerName: 'System', text: `${payload.playerName} joined the room.` },
          ]);
        },
        roomPlayers: (playersList) => {
          if (!Array.isArray(playersList)) return;
          const updatedPlayers = playersList.map((p) => ({
            id: p.playerId,
            name: p.playerName,
            score: p.score || 0,
          }));
          setPlayers(updatedPlayers);
          setTotalPlayers(updatedPlayers.length);
        },
        playerLeft: ({ playerId: leftId, playerName: leftName }) => {
          setPlayers((prev) => prev.filter((p) => String(p.id) !== String(leftId)));
          setMessages((prev) => [
            ...prev,
            { playerName: 'System', text: `${leftName || leftId} left the room.` },
          ]);
        },
        guess: ({ playerName, guess }) => {
          setMessages((prev) => [...prev, { playerName, text: guess }]);
        },
        correctGuess: ({ playerId: correctId, playerName, points, elapsedSeconds }) => {
          setPlayers((prev) =>
            prev.map((player) =>
              String(player.id) === String(correctId)
                ? { ...player, score: (player.score || 0) + points }
                : player,
            ),
          );
          const timeLabel =
            elapsedSeconds != null ? ` in ${elapsedSeconds}s` : '';
          setMessages((prev) => [
            ...prev,
            {
              playerName: 'System',
              text: `${playerName || correctId} guessed correctly and earned ${points} points${timeLabel}.`,
            },
          ]);
        },
        roundStart: ({ drawer, word, hiddenWord, roundDurationSec = 60 }) => {
          const myId = String(playerIdRef.current);
          const drawerId = String(drawer);
          roundEndActiveRef.current = false;
          advancingRoundRef.current = false;
          setShowRoundEndOverlay(false);
          setCurrentDrawer(drawerId);
          setCurrentWord(word);
          setHideword(hiddenWord);
          setGamePhase('guessing');
          setTimer(roundDurationSec);
          setIsDrawing(drawerId === myId);
          setIsGuessing(drawerId !== myId);
          setHasSubmittedWord(false);
          setSubmittedCount(0);

          setPlayers((currentPlayers) => {
            const scores = {};
            currentPlayers.forEach((p) => {
              scores[p.id] = p.score;
            });
            setPrevScores(scores);
            return currentPlayers;
          });

          setMessages((prev) => [
            ...prev,
            { playerName: 'System', text: `Round started! ${drawerId} is drawing.` },
          ]);
        },
        wordSubmitted: ({ playerName, submittedCount: newSubmittedCount, totalPlayers: totalP, allSubmitted }) => {
          setSubmittedCount(newSubmittedCount);
          setTotalPlayers(totalP);
          setMessages((prev) => [
            ...prev,
            { playerName: 'System', text: `${playerName} submitted a word (${newSubmittedCount}/${totalP})` },
          ]);
          if (allSubmitted) {
            setMessages((prev) => [
              ...prev,
              { playerName: 'System', text: 'All players have submitted! Click "Start Round" to begin.' },
            ]);
          }
        },
        endRound: ({ word: revealedWord } = {}) => {
          beginRoundEndSummaryRef.current?.(revealedWord);
        },
        wordsPoolEmpty: () => {
          roundEndActiveRef.current = false;
          setShowRoundEndOverlay(false);
          setGamePhase('word-input');
          setHasSubmittedWord(false);
          setSubmittedCount(0);
          setMessages((prev) => [
            ...prev,
            { playerName: 'System', text: 'All words used! Submit new words to start the next round.' },
          ]);
        },
      });
    };

    connect();

    return () => {
      cancelled = true;
      unsubscribeGameEvents();
      const client = getSocket();
      if (client) {
        client.off('playCasualQueued', onCasualQueued);
        client.off('playCasualError', onCasualError);
        client.off('matched', onMatched);
      }
    };
  }, [roomCode, resolvedPlayerId, resolvedPlayerName]);

  useEffect(() => () => disconnectSocket(), []);

  // Guessing-phase timer
  useEffect(() => {
    if (gamePhase !== 'guessing' || timer <= 0) return;

    const interval = setInterval(() => {
      setTimer((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, [gamePhase, timer]);

  // Round-end overlay countdown, then advance to next drawer
  useEffect(() => {
    if (!showRoundEndOverlay) return;

    const interval = setInterval(() => {
      setRoundEndCountdown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, [showRoundEndOverlay]);

  useEffect(() => {
    if (!showRoundEndOverlay || roundEndCountdown > 0) return;

    const advancerId = currentDrawer || playersRef.current[0]?.id;
    const myId = playerIdRef.current;
    const isAdvancer = myId && advancerId && String(myId) === String(advancerId);

    if (!isAdvancer || advancingRoundRef.current) return;

    advancingRoundRef.current = true;
    handleRoundEnd({
      roomCode,
      localPlayerId,
      authPlayerId,
      setGamePhase,
      setCurrentDrawer,
      setCurrentWord,
      setHideword,
      setTimer,
      setIsDrawing,
      setIsGuessing,
      setMessages,
      setShowRoundEndOverlay,
    }).finally(() => {
      advancingRoundRef.current = false;
    });
  }, [
    showRoundEndOverlay,
    roundEndCountdown,
    currentDrawer,
    roomCode,
    localPlayerId,
    authPlayerId,
  ]);


  return (
    <div className='home-background flex flex-col'>
      <div className='flex items-center justify-between gap-3 p-2'>
        <span className='font-mono p-2 gap-10 text-2xl w-1/5'>{status}</span>
        <div className='font-mono text-sm text-[var(--color-primary)] bg-[var(--color-neutral)] border-4 border-[var(--color-primary)] p-2 rounded w-1/5 flex flex-col items-center justify-center'>
          <span className='font-bold'>Room</span>
          <span>{roomCode}</span>
        </div>
        <span className='font-mono bg-[var(--color-neutral)] text-[var(--color-primary)] border-4 border-[var(--color-primary)] p-2 flex flex-col items-center justify-center gap-10 text-2xl w-1/4'>{isDrawing ? currentWord : hideword || '???'}</span>
        <div className='font-mono bg-[var(--color-neutral)] text-[var(--color-primary)] border-4 border-[var(--color-primary)] p-2 flex flex-col items-center justify-center gap-2 text-sm w-1/4'>
          <span>Timer: {timer}s</span>
          <span className='text-xs'>Phase: {gamePhase}</span>
        </div>
        <span className='font-display bg-[var(--color-secondary)] text-[var(--color-primary)] border-[var(--color-primary)] p-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col items-center justify-center gap-2 text-sm w-1/5'>
          <span>{localPlayerName || authPlayerName || 'Guest'}</span>
          <span className='text-xs'>Rating: {rating}</span>
        </span>
      </div>

      <div className='home-background flex flex-row p-3 gap-3 h-screen'>
        <div className='font-display bg-[var(--color-neutral)] text-[var(--color-primary)] border-4 border-[var(--color-primary)] p-3 w-1/5 h-5/7 gap-10 text-2xl'>
          <div>
            <span>Players:</span>
          </div>
          <div className='flex flex-col justify-between text-lg'>
            <PlayersList players={players} />
          </div>
        </div>
        <div className='font-mono bg-[var(--color-neutral)] text-[var(--color-primary)] border-4 border-[var(--color-primary)] p-2 w-full h-5/7 flex flex-col gap-4 text-2xl'>
          {gamePhase === 'word-input' ? (
            <div className='flex items-center justify-center h-full'>
              <div className='flex flex-col gap-4 items-center'>
                <h2 className='text-2xl font-bold'>Submit a word to draw!</h2>
                <div className='text-lg mb-4'>
                  <span className={submittedCount === totalPlayers ? 'text-green-500' : 'text-[var(--color-primary)]'}>
                    {submittedCount}/{totalPlayers} players ready
                  </span>
                </div>
                <form onSubmit={(e) => handleSubmitWord({ event: e, wordValue, roomCode, localPlayerId, authPlayerId, localPlayerName, authPlayerName, setWordValue, setHasSubmittedWord, setMessages })} className='flex flex-col gap-4 items-center'>
                  <input
                    value={wordValue}
                    onChange={(e) => setWordValue(e.target.value)}
                    placeholder='Type a word...'
                    className='w-64 rounded bg-[var(--color-neutral)] p-3 text-black border-2 border-[var(--color-primary)] text-lg'
                    disabled={hasSubmittedWord || gamePhase !== 'word-input'}
                  />
                  <button
                    type='submit'
                    className='rounded bg-[var(--color-primary)] px-6 py-3 text-[var(--color-neutral)] hover:bg-[var(--color-secondary)] font-bold text-lg disabled:opacity-50'
                    disabled={hasSubmittedWord || gamePhase !== 'word-input'}
                  >
                    {hasSubmittedWord ? 'Word Submitted!' : 'Submit Word'}
                  </button>
                </form>
                {submittedCount === totalPlayers && (
                  <button
                    onClick={(e) => handleStartRound({ event: e, submittedCount, totalPlayers, roomCode, localPlayerId, authPlayerId, setCurrentDrawer, setCurrentWord, setHideword, setGamePhase, setTimer, setIsDrawing, setIsGuessing })}
                    className='rounded bg-green-500 px-8 py-3 text-white font-bold text-lg hover:bg-green-600 mt-4'
                  >
                    Start Round!
                  </button>
                )}
              </div>
            </div>
          ) : isDrawing ? (
            <div className='flex flex-col h-full relative'>
              <WhiteBoard room={roomCode} />
              {showRoundEndOverlay && (
                <RoundEndOverlay
                  currentWord={currentWord}
                  roundEndCountdown={roundEndCountdown}
                  players={players}
                  scoreDeltas={scoreDeltas}
                />
              )}
            </div>
          ) : (
            <div className='flex flex-col h-full relative'>
              <WhiteBoard room={roomCode} locked={true} />
              {showRoundEndOverlay && (
                <RoundEndOverlay
                  currentWord={currentWord}
                  roundEndCountdown={roundEndCountdown}
                  players={players}
                  scoreDeltas={scoreDeltas}
                />
              )}
            </div>
          )}
        </div>
        <div className='font-mono bg-[var(--color-neutral)] text-[var(--color-primary)] border-4 border-[var(--color-primary)] p-2 w-2/5 h-5/7 flex flex-col items-center justify-center gap-10 text-2xl'>
          <div className='flex items-center justify-center'>Chat</div>
          <div className='h-full rounded  text-lg p-4 overflow-y-auto w-full'>
            {messages.length === 0 ? (
              <div className='text-sm text-[var(--color-primary)]'>No messages yet.</div>
            ) : (
              messages.map((message, index) => <MessageItem key={index} message={message} />)
            )}
          </div>
          <form onSubmit={(e) => handleSendGuess({ event: e, guessValue, isDrawing, roomCode, localPlayerName, authPlayerName, localPlayerId, authPlayerId, setGuessValue })} className='flex text-sm gap-2 w-full'>
            <input
              value={guessValue}
              onChange={(e) => setGuessValue(e.target.value)}
              placeholder={isDrawing ? 'You are drawing...' : 'Type your guess...'}
              className='w-full rounded  bg-[var(--color-neutral)] p-2 text-black'
              disabled={gamePhase !== 'guessing' || isDrawing}
            />
            <button type='submit' className='rounded bg-[var(--color-primary)] px-4 py-2 text-[var(--color-neutral)] hover:bg-[var(--color-secondary)] disabled:opacity-50' disabled={gamePhase !== 'guessing' || isDrawing}>Send</button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default Game; 