import { sendGuess, sendSubmitWord, sendClearDrawing } from '../socket.js';

export const ROUND_END_DELAY_SEC = 7;
const API_BASE = `${import.meta.env.VITE_BACKEND_URL}/api/game`;

const fetchNextRound = async (roomCode, playerId) => {
  const res = await fetch(`${API_BASE}/next-round`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room: roomCode, playerId }),
  });
  return res.json();
};

export const handleRoundEnd = async ({ roomCode, playerId, dispatch }) => {
  dispatch({ type: 'HIDE_ROUND_END_OVERLAY' });
  sendClearDrawing({ room: roomCode });

  try {
    const data = await fetchNextRound(roomCode, playerId);
    if (data.success) {
      dispatch({ type: 'SET_GUESSING_PHASE', payload: { ...data, duration: 60 } });
    } else if (data.error?.includes('No words available')) {
      dispatch({ type: 'SET_WORD_INPUT_PHASE' });
      dispatch({ type: 'ADD_MESSAGE', payload: { playerName: 'System', text: 'All words used! Submit new words to start the next round.' } });
    }
  } catch (error) {
    console.error('Error fetching next round:', error);
    dispatch({ type: 'ADD_MESSAGE', payload: { playerName: 'System', text: 'Error starting next round.' } });
  }
};

export const handleStartRound = async ({ event, submittedCount, totalPlayers, roomCode, playerId, dispatch }) => {
  if (event) event.preventDefault();
  if (submittedCount !== totalPlayers) {
    alert('Not all players have submitted words yet!');
    return;
  }

  try {
    const data = await fetchNextRound(roomCode, playerId);
    if (data.success) {
      dispatch({ type: 'SET_GUESSING_PHASE', payload: { ...data, duration: 60 } });
    } else {
      alert(data.error);
    }
  } catch (error) {
    console.error('Error starting round:', error);
    alert('Error starting round');
  }
};

export const handleSendGuess = ({ event, guessValue, isDrawing, roomCode, playerName, playerId, setGuessValue }) => {
  event.preventDefault();
  if (!guessValue.trim() || isDrawing) return;
  if (!playerId) return;

  sendGuess({
    room: roomCode,
    playerName: playerName || 'Guest',
    playerId: String(playerId).trim(),
    guess: guessValue.trim(),
  });
  setGuessValue('');
};

export const handleSubmitWord = ({ event, wordValue, roomCode, playerId, playerName, dispatch, setWordValue }) => {
  event.preventDefault();
  if (!wordValue.trim()) return;

  sendSubmitWord({
    room: roomCode,
    playerId: playerId,
    playerName: playerName || 'Guest',
    word: wordValue.trim(),
  });
  setWordValue('');
  dispatch({ type: 'SET_HAS_SUBMITTED_WORD', payload: true });
  dispatch({ type: 'ADD_MESSAGE', payload: { playerName: 'System', text: `You submitted a word!` } });
};
