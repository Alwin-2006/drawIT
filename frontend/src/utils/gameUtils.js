import { sendGuess, sendSubmitWord, sendClearDrawing } from '../socket.js';

export const ROUND_END_DELAY_SEC = 7;

export const handleRoundEnd = async ({
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
}) => {
  if (setShowRoundEndOverlay) {
    setShowRoundEndOverlay(false);
  }
  sendClearDrawing({ room: roomCode });
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
    } else if (data.error?.includes('No words available')) {
      setGamePhase('word-input');
      setMessages((prev) => [
        ...prev,
        { playerName: 'System', text: 'All words used! Submit new words to start the next round.' },
      ]);
    }
  } catch (error) {
    console.error('Error fetching next round:', error);
    setMessages((prev) => [
      ...prev,
      { playerName: 'System', text: 'Error starting next round.' },
    ]);
  }
};

export const handleSendGuess = ({ event, guessValue, isDrawing, roomCode, localPlayerName, authPlayerName, localPlayerId, authPlayerId, setGuessValue }) => {
  event.preventDefault();
  if (!guessValue.trim() || isDrawing) return;

  const playerId = localPlayerId || authPlayerId;
  if (!playerId) return;

  sendGuess({
    room: roomCode,
    playerName: localPlayerName || authPlayerName || 'Guest',
    playerId: String(playerId).trim(),
    guess: guessValue.trim(),
  });
  setGuessValue('');
};

export const handleSubmitWord = ({ event, wordValue, roomCode, localPlayerId, authPlayerId, localPlayerName, authPlayerName, setWordValue, setHasSubmittedWord, setMessages }) => {
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

export const handleStartRound = async ({ event, submittedCount, totalPlayers, roomCode, localPlayerId, authPlayerId, setCurrentDrawer, setCurrentWord, setHideword, setGamePhase, setTimer, setIsDrawing, setIsGuessing }) => {
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
