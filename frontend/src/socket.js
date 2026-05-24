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

const connectSocket = async (token) => {
  const client = createSocket(token);
  if (!client.connected) {
    if (token) {
      client.auth = { token };
    } else {
      client.auth = {};
    }
    client.connect();
  }
  return client;
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
  client.emit('guess', { room, playerName, playerId, guess });
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

const offAll = () => {
  if (!socket) return;
  socket.off('playerJoined');
  socket.off('drawing');
  socket.off('clearDrawing');
  socket.off('drawingHistory');
  socket.off('roomPlayers');
  socket.off('playerLeft');
  socket.off('guess');
  socket.off('correctGuess');
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
  sendClearDrawing,
  onPlayerJoined,
  onDrawing,
  onGuess,
  onCorrectGuess,
  onDrawingHistory,
  onClearDrawing,
  onRoomPlayers,
  onPlayerLeft,
  offAll,
};
