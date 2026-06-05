import { io } from 'socket.io-client';

const env = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {};
const SOCKET_URL = env.VITE_BACKEND_URL || 'http://localhost:3000';

let socket;

const createSocket = (token) => {
  if (socket) {
    if (token && socket.auth?.token !== token) {
      socket.auth = { token };
    }
    return socket;
  }

  const options = {
    autoConnect: false,
    transports: ['websocket'],
  };

  if (token) {
    options.auth = { token };
  }

  socket = io(SOCKET_URL, options);

  socket.on('connect', () => {
    console.debug('[socket] connected', socket.id);
  });

  socket.on('disconnect', (reason) => {
    console.debug('[socket] disconnected', reason);
  });

  socket.on('connect_error', (error) => {
    console.error('[socket] connect_error', error.message || error);
  });

  return socket;
};

const waitForConnection = (client) => {
  return new Promise((resolve, reject) => {
    if (client.connected) {
      return resolve(client);
    }

    const onConnect = () => {
      cleanup();
      resolve(client);
    };

    const onConnectError = (error) => {
      cleanup();
      reject(error);
    };

    const cleanup = () => {
      client.off('connect', onConnect);
      client.off('connect_error', onConnectError);
    };

    client.once('connect', onConnect);
    client.once('connect_error', onConnectError);
    if (!client.connected) {
      client.connect();
    }
  });
};

const connectSocket = async (token) => {
  const client = createSocket(token);

  if (token) {
    client.auth = { token };
    // If already connected but without auth (e.g. from a prior guest session),
    // we need to reconnect so the server middleware sees the token.
    if (client.connected && !client.auth?.token) {
      client.disconnect();
    }
    // If connected with a different token, also reconnect.
    if (client.connected && client.auth?.token !== token) {
      client.disconnect();
    }
  } else {
    client.auth = {};
  }

  return waitForConnection(client);
};

const connectGuest = () => connectSocket();

const joinAsGuest = async ({ room, playerId, playerName }) => {
  const client = await connectGuest();
  const join = () => joinRoom({ room, playerId, playerName });
  if (client.connected) {
    join();
  } else {
    client.once('connect', join);
  }
};

const getSocket = () => socket;

const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

const joinRoom = ({ room, playerId, playerName }) => {
  const client = createSocket();
  if (!client.connected) client.connect();
  client.emit('joinRoom', { room, playerId, playerName });
};

const sendDrawing = (data) => {
  const client = createSocket();
  if (!client.connected) client.connect();
  client.emit('drawing', data);
};

const sendGuess = ({ room, playerName, playerId, guess }) => {
  const client = createSocket();
  if (!client.connected) client.connect();
  client.emit('guess', {
    room,
    playerName,
    playerId: playerId == null ? '' : String(playerId).trim(),
    guess,
  });
};

const sendCorrectGuess = ({ room, playerId, points }) => {
  const client = createSocket();
  if (!client.connected) client.connect();
  client.emit('correctGuess', { room, playerId, points });
};

const sendClearDrawing = ({ room }) => {
  const client = createSocket();
  if (!client.connected) client.connect();
  client.emit('clearDrawing', { room });
};

const sendPlayCasual = ({ playerId, playerName, mode,preferences } = {}) => {
  console.log(playerId,playerName);
  const client = createSocket();
  if (!client.connected) client.connect();
  console.log(playerId,playerName,mode,preferences);
  client.emit('playCasual', { playerId, playerName, mode,preferences });
};

const sendPlayRanked = (token) => {
  const client = createSocket(token);
  if (token) client.auth = { token };
  if (!client.connected) client.connect();
  client.emit('playRanked');
};

const sendSubmitWord = ({ room, playerId, playerName, word }) => {
  const client = createSocket();
  if (!client.connected) client.connect();
  client.emit('submitWord', { room, playerId, playerName, word });
};

const onPlayCasualQueued = (handler) => {
  const client = createSocket();
  client.on('playCasualQueued', handler);
};

const onPlayCasualError = (handler) => {
  const client = createSocket();
  client.on('playCasualError', handler);
};

const onMatched = (handler) => {
  const client = createSocket();
  client.on('matched', handler);
};

const onPlayRankedQueued = (handler) => {
  const client = createSocket();
  client.on('playRankedQueued', handler);
};

const onPlayRankedError = (handler) => {
  const client = createSocket();
  client.on('playRankedError', handler);
};

const onRankedReconnect = (handler) => {
  const client = createSocket();
  client.on('rankedReconnect', handler);
};

const onRoundStart = (handler) => {
  const client = createSocket();
  client.on('roundStart', handler);
};

const onWordSubmitted = (handler) => {
  const client = createSocket();
  client.on('wordSubmitted', handler);
};

const onEndRound = (handler) => {
  const client = createSocket();
  client.on('endRound', handler);
};

const onWordsPoolEmpty = (handler) => {
  const client = createSocket();
  client.on('wordsPoolEmpty', handler);
};

const onPlayerJoined = (handler) => {
  const client = createSocket();
  client.on('playerJoined', handler);
};

const onDrawing = (handler) => {
  const client = createSocket();
  client.on('drawing', handler);
};

const onGuess = (handler) => {
  const client = createSocket();
  client.on('guess', handler);
};

const onCorrectGuess = (handler) => {
  const client = createSocket();
  client.on('correctGuess', handler);
};

const onDrawingHistory = (handler) => {
  const client = createSocket();
  client.on('drawingHistory', handler);
};

const onClearDrawing = (handler) => {
  const client = createSocket();
  client.on('clearDrawing', handler);
};

const onRoomPlayers = (handler) => {
  const client = createSocket();
  client.on('roomPlayers', handler);
};

const onPlayerLeft = (handler) => {
  const client = createSocket();
  client.on('playerLeft', handler);
};

const onJoinedRoom = (handler) => {
  const client = createSocket();
  client.on('joinedRoom', handler);
};

/** Register game event handlers; returns unsubscribe that removes only those handlers. */
const subscribeToGameEvents = (handlers) => {
  const client = getSocket() || createSocket();
  const entries = Object.entries(handlers).filter(([, handler]) => typeof handler === 'function');

  for (const [event, handler] of entries) {
    client.on(event, handler);
  }

  return () => {
    for (const [event, handler] of entries) {
      client.off(event, handler);
    }
  };
};

const offAll = () => {
  if (!socket) return;
  socket.off('playerJoined');
  socket.off('drawing');
  socket.off('clearDrawing');
  socket.off('drawingHistory');
  socket.off('roomPlayers');
  socket.off('playerLeft');
  socket.off('joinedRoom');
  socket.off('guess');
  socket.off('correctGuess');
  socket.off('playCasualQueued');
  socket.off('playCasualError');
  socket.off('matched');
  socket.off('playRankedQueued');
  socket.off('playRankedError');
  socket.off('rankedReconnect');
  socket.off('roundStart');
  socket.off('wordSubmitted');
  socket.off('endRound');
  socket.off('wordsPoolEmpty');
  socket.off('connect');
  socket.off('disconnect');
  socket.off('connect_error');
};

export {
  createSocket,
  connectSocket,
  disconnectSocket,
  joinRoom,
  sendDrawing,
  sendGuess,
  sendCorrectGuess,
  sendPlayCasual,
  sendPlayRanked,
  sendSubmitWord,
  connectGuest,
  joinAsGuest,
  getSocket,
  onPlayerJoined,
  sendClearDrawing,
  onDrawing,
  onGuess,
  onCorrectGuess,
  onDrawingHistory,
  onClearDrawing,
  onRoomPlayers,
  onPlayerLeft,
  onJoinedRoom,
  onPlayCasualQueued,
  onPlayCasualError,
  onMatched,
  onPlayRankedQueued,
  onPlayRankedError,
  onRankedReconnect,
  onRoundStart,
  onWordSubmitted,
  onEndRound,
  onWordsPoolEmpty,
  subscribeToGameEvents,
  offAll,
};

export default {
  createSocket,
  connectSocket,
  connectGuest,
  joinAsGuest,
  getSocket,
  disconnectSocket,
  joinRoom,
  sendDrawing,
  sendGuess,
  sendCorrectGuess,
  sendPlayCasual,
  sendPlayRanked,
  sendSubmitWord,
  sendClearDrawing,
  onPlayerJoined,
  onDrawing,
  onGuess,
  onCorrectGuess,
  onDrawingHistory,
  onClearDrawing,
  onRoomPlayers,
  onPlayerLeft,
  onJoinedRoom,
  onPlayCasualQueued,
  onPlayCasualError,
  onMatched,
  onPlayRankedQueued,
  onPlayRankedError,
  onRankedReconnect,
  onRoundStart,
  onWordSubmitted,
  onEndRound,
  onWordsPoolEmpty,
  subscribeToGameEvents,
  offAll,
};
