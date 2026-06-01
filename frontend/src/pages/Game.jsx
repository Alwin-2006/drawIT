import React, { useEffect, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import {
  connectGuest,
  disconnectSocket,
  joinAsGuest,
  offAll,
  onJoinedRoom,
  onPlayerJoined,
  onRoomPlayers,
  onPlayerLeft,
  onGuess,
  onCorrectGuess,
  sendGuess,
  sendPlayCasual,
  sendSubmitWord,
  onRoundStart,
  onWordSubmitted,
} from '../socket.js';
import WhiteBoard from '../components/WhiteBoard.jsx';
import useUserStore from '../store/userStore.js';

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

  useEffect(() => {
    const routeState = location.state || {};

    if (authPlayerName) {
      setLocalPlayerName(authPlayerName);
    } else if (routeState.playerName) {
      setLocalPlayerName(routeState.playerName);
    }

    if (authPlayerId) {
      setLocalPlayerId(authPlayerId);
    } else if (routeState.playerId) {
      setLocalPlayerId(routeState.playerId);
    }
  }, [authPlayerName, authPlayerId, location.state]);

  const roomCode = roomId || 'party-6767676767';

  useEffect(() => {
    const setup = async () => {
      const routeState = location.state || {};
      const currentPlayerName = localPlayerName || authPlayerName || routeState.playerName || 'Guest';
      let currentPlayerId = localPlayerId || authPlayerId || routeState.playerId;

      if (!currentPlayerId) {
        currentPlayerId = `guest-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        setLocalPlayerId(currentPlayerId);
      }

      setLocalPlayerName(currentPlayerName);

      const client = await connectGuest();
      const joinRoom = () => {
        setStatus('Connected');
        joinAsGuest({ room: roomCode, playerId: currentPlayerId, playerName: currentPlayerName });
      };
      if (client.connected) {
        joinRoom();
      } else {
        client.once('connect', joinRoom);
      }

      // Listen for casual queue events
      client.on('playCasualQueued', (payload) => {
        setMessages((prev) => [
          ...prev,
          { playerName: 'System', text: `Queued for casual match (job ${payload.jobId}).` },
        ]);
      });

      client.on('playCasualError', (err) => {
        setMessages((prev) => [
          ...prev,
          { playerName: 'System', text: `Queue error: ${err?.message || err}` },
        ]);
      });

      client.on('matched', (data) => {
        setMessages((prev) => [
          ...prev,
          { playerName: 'System', text: `Matched with ${data?.opponent?.name || 'unknown'}` },
        ]);
      });
    };

    setup();

    onJoinedRoom((payload) => {
      if (payload?.playerName) {
        setLocalPlayerName(payload.playerName);
      }
      if (payload?.playerId) {
        setLocalPlayerId(payload.playerId);
      }
    });

    onPlayerJoined((payload) => {
      setPlayers((prev) => {
        if (prev.some((player) => player.id === payload.playerId)) return prev;
        return [...prev, { id: payload.playerId, name: payload.playerName, score: 0 }];
      });
      setMessages((prev) => [
        ...prev,
        { playerName: 'System', text: `${payload.playerName} joined the room.` },
      ]);
    });

    onRoomPlayers((playersList) => {
      if (!Array.isArray(playersList)) return;
      const updatedPlayers = playersList.map((p) => ({ id: p.playerId, name: p.playerName, score: p.score || 0 }));
      setPlayers(updatedPlayers);
      setTotalPlayers(updatedPlayers.length);
    });

    onPlayerLeft(({ playerId: leftId, playerName: leftName }) => {
      setPlayers((prev) => prev.filter((p) => p.id !== leftId));
      setMessages((prev) => [
        ...prev,
        { playerName: 'System', text: `${leftName || leftId} left the room.` },
      ]);
    });

    onGuess(({ playerName, guess }) => {
      setMessages((prev) => [
        ...prev,
        { playerName: `${playerName}`, text: guess },
      ]);
    });

    onCorrectGuess(({ playerId: correctId, points }) => {
      setPlayers((prev) =>
        prev.map((player) =>
          player.id === correctId ? { ...player, score: player.score + points } : player,
        ),
      );
      setMessages((prev) => [
        ...prev,
        { playerName: 'System', text: `${correctId} guessed correctly and earned ${points} points.` },
      ]);
    });

    onRoundStart(({ drawer, word, hiddenWord }) => {
      setCurrentDrawer(drawer);
      setCurrentWord(word);
      setHideword(hiddenWord);
      setGamePhase('guessing');
      setTimer(60);
      setIsDrawing(drawer === (localPlayerId || authPlayerId));
      setIsGuessing(drawer !== (localPlayerId || authPlayerId));
      setHasSubmittedWord(false);
      setSubmittedCount(0);
      setMessages((prev) => [
        ...prev,
        { playerName: 'System', text: `Round started! ${drawer} is drawing.` },
      ]);
    });

    onWordSubmitted(({ playerName, submittedCount: newSubmittedCount, totalPlayers: totalP, allSubmitted }) => {
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
    });

    return () => {
      offAll();
      disconnectSocket();
    };
  }, [authPlayerId, authPlayerName, localPlayerId, localPlayerName, location.state, roomCode]);

  // Timer effect
  useEffect(() => {
    if (gamePhase !== 'guessing' || timer <= 0) return;

    const interval = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          // End the round - call API to start next round
          handleRoundEnd();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [gamePhase, timer]);

  const handleRoundEnd = async () => {
    setGamePhase('round-end');
    try {
      const response = await fetch('http://localhost:3000/api/game/next-round', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room: roomCode, playerId: localPlayerId || authPlayerId }),
      });
      const data = await response.json();
      if (data.success) {
        setCurrentDrawer(data.drawer);
        setCurrentWord(data.word);
        setHideword(data.hiddenWord);
        setGamePhase('guessing');
        setTimer(60);
        setIsDrawing(data.drawer === (localPlayerId || authPlayerId));
        setIsGuessing(data.drawer !== (localPlayerId || authPlayerId));
      }
    } catch (error) {
      console.error('Error fetching next round:', error);
      setMessages((prev) => [
        ...prev,
        { playerName: 'System', text: 'Error starting next round.' },
      ]);
    }
  };

  const handleSendGuess = (event) => {
    event.preventDefault();
    if (!guessValue.trim() || isDrawing) return;

    sendGuess({ room: roomCode, playerName: localPlayerName || authPlayerName || 'Guest', playerId: localPlayerId || authPlayerId, guess: guessValue.trim() });
    
    setGuessValue('');
  };

  const handleSubmitWord = (event) => {
    event.preventDefault();
    if (!wordValue.trim()) return;

    sendSubmitWord({ room: roomCode, playerId: localPlayerId || authPlayerId, playerName: localPlayerName || authPlayerName || 'Guest', word: wordValue.trim() });
    setWordValue('');
    setHasSubmittedWord(true);
    setMessages((prev) => [
      ...prev,
      { playerName: 'System', text: `${localPlayerName || authPlayerName || 'Guest'} submitted a word!` },
    ]);
  };

  const handleStartRound = async (event) => {
    if (event) event.preventDefault();
    if (submittedCount !== totalPlayers) {
      alert('Not all players have submitted words yet!');
      return;
    }
    
    try {
      const response = await fetch('http://localhost:3000/api/game/next-round', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room: roomCode, playerId: localPlayerId || authPlayerId }),
      });
      const data = await response.json();
      if (data.success) {
        setCurrentDrawer(data.drawer);
        setCurrentWord(data.word);
        setHideword(data.hiddenWord);
        setGamePhase('guessing');
        setTimer(60);
        setIsDrawing(data.drawer === (localPlayerId || authPlayerId));
        setIsGuessing(data.drawer !== (localPlayerId || authPlayerId));
      } else {
        alert(data.error);
      }
    } catch (error) {
      console.error('Error starting round:', error);
      alert('Error starting round');
    }
  };

  return (
    <div className='home-background flex flex-col'>
      <div className='flex items-center justify-between gap-3 p-2'>
        <span className='font-mono p-2 gap-10 text-2xl w-1/5'>{status}</span>
        <div className='font-mono text-sm text-[var(--color-primary)] bg-[var(--color-neutral)] border-4 border-[var(--color-primary)] p-2 rounded w-1/5 flex flex-col items-center justify-center'>
          <span className='font-bold'>Room</span>
          <span>{roomCode}</span>
        </div>
        <span className='font-mono bg-[var(--color-neutral)] text-[var(--color-primary)] border-4 border-[var(--color-primary)] p-2 flex flex-col items-center justify-center gap-10 text-2xl w-1/4'>{hideword || '???'}</span>
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
                <form onSubmit={handleSubmitWord} className='flex flex-col gap-4 items-center'>
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
                    onClick={handleStartRound}
                    className='rounded bg-green-500 px-8 py-3 text-white font-bold text-lg hover:bg-green-600 mt-4'
                  >
                    Start Round!
                  </button>
                )}
              </div>
            </div>
          ) : isDrawing ? (
            <div className='flex flex-col h-full'>
              <div className='text-sm mb-2'>You are drawing! Everyone else is guessing.</div>
              <WhiteBoard room={roomCode} />
            </div>
          ) : (
            <div className='flex flex-col h-full'>
              <div className='text-sm mb-2'>Guess the word being drawn!</div>
              <WhiteBoard room={roomCode} locked={true} />
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
          <form onSubmit={handleSendGuess} className='flex text-sm gap-2 w-full'>
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