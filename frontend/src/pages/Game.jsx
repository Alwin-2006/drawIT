import React, { useEffect, useState } from 'react';
import {
  connectGuest,
  disconnectSocket,
  joinAsGuest,
  offAll,
  onPlayerJoined,
  onRoomPlayers,
  onPlayerLeft,
  onGuess,
  onCorrectGuess,
  sendGuess,
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
const sampleword = 'Nice';
function Game() {
  const [players, setPlayers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [guessValue, setGuessValue] = useState('');
  const [status, setStatus] = useState('Connecting...');
  const playerName = useUserStore((state) => state.username);
  const setUsername = useUserStore((state) => state.setUsername);
  const rating = useUserStore((state) => state.rating);
  const [playerId] = useState(() => `guest-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);

  useEffect(() => {
    if (!playerName) {
      setUsername(`Guest-${Math.floor(1000 + Math.random() * 9000)}`);
    }
  }, [playerName, setUsername]);
  const [word, setWord]= useState(sampleword);
  const [hideword,setHideword]=  useState('');
  const roomCode = 'party-6767676767';

  useEffect(() => {
    if (!playerName) return;

    const setup = async () => {
      const client = await connectGuest();
      const joinRoom = () => {
        setStatus('Connected');
        joinAsGuest({ room: roomCode, playerId, playerName });
      };
      if (client.connected) {
        joinRoom();
      } else {
        client.once('connect', joinRoom);
      }
    };

    setup();

    onPlayerJoined((payload) => {
      setHideword("_".repeat(word.length));
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
      setPlayers(playersList.map((p) => ({ id: p.playerId, name: p.playerName, score: p.score || 0 })));
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

    return () => {
      offAll();
      disconnectSocket();
    };
  }, [playerId, playerName, roomCode]);

  const handleSendGuess = (event) => {
    event.preventDefault();
    if (!guessValue.trim()) return;

    sendGuess({ room: roomCode,playerName, playerId, guess: guessValue.trim() });
    
    setGuessValue('');
  };

  return (
    <div className='home-background flex flex-col'>
      <div className='flex items-center justify-between gap-3 p-2'>
        <span className='font-mono p-2 gap-10 text-2xl w-1/5'>{status}</span>
        <span className='font-mono bg-[var(--color-neutral)] text-[var(--color-primary)] border-4 border-[var(--color-primary)] p-2 flex flex-col items-center justify-center gap-10 text-2xl w-1/2'>{hideword}</span>
        <span className='font-display bg-[var(--color-secondary)] text-[var(--color-primary)] border-[var(--color-primary)] p-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col items-center justify-center gap-2 text-sm w-1/5'>
          <span>{playerName || 'Guest'}</span>
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
          <WhiteBoard room={roomCode} />
        </div>
        <div className='font-mono bg-[var(--color-neutral)] text-[var(--color-primary)] border-4 border-[var(--color-primary)] p-2 w-2/5 h-5/7 flex flex-col items-center justify-center gap-10 text-2xl'>
          <div className='flex items-center justify-center'>Chat</div>
          <div className='h-full rounded  text-lg p-4 overflow-y-auto'>
            {messages.length === 0 ? (
              <div className='text-sm text-[var(--color-primary)]'>No messages yet.</div>
            ) : (
              messages.map((message, index) => <MessageItem key={index} message={message} />)
            )}
          </div>
          <form onSubmit={handleSendGuess} className='flex text-sm gap-2'>
            <input
              value={guessValue}
              onChange={(e) => setGuessValue(e.target.value)}
              placeholder='Type your guess...'
              className='w-full rounded  bg-[var(--color-neutral)] p-2 text-black'
            />
            <button type='submit' className='rounded bg-[var(--color-primary)] px-4 py-2 text-[var(--color-neutral)] hover:bg-[var(--color-secondary)]'>Send</button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default Game; 