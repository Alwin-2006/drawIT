import { useEffect } from 'react';
import {
    createSocket,
    subscribeToGameEvents,
    getSocket,
    disconnectSocket,
} from '../socket.js';
import useUserStore from '../store/userStore.js';

export const useGameSocket = ({ roomCode, resolvedPlayerId, resolvedPlayerName, dispatch }) => {
    const token = useUserStore((s) => s.token);
    // Read authPlayerId directly so the effect re-runs once Zustand rehydrates
    const authPlayerId = useUserStore((s) => s.playerId);
    const setRating = useUserStore((s) => s.setRating);

    // Use the auth store's playerId when available — it's the MongoDB _id that
    // the backend validates against the JWT. Fall back to whatever was resolved
    // from route state (for guests / direct URL visits).
    const effectivePlayerId = authPlayerId || resolvedPlayerId;

    useEffect(() => {
        // Don't attempt to join until we have a real player ID
        if (!effectivePlayerId) return;

        let cancelled = false;
        let unsubscribeGameEvents = () => { };

        const connect = () => {
            // Reuse the existing socket singleton — never create a new connection here.
            // If there is already a connected socket (from the matchmaking flow in Home.jsx),
            // we reuse it as-is so the socketId stays the same.
            // If we are landing here fresh (e.g. direct URL), create with token if available.
            const client = getSocket() || createSocket(token || undefined);

            if (!client.connected) {
                if (token) client.auth = { token };
                client.connect();
            }

            const doJoin = () => {
                if (cancelled) return;
                console.debug('[useGameSocket] emitting joinRoom', { room: roomCode, playerId: effectivePlayerId });
                dispatch({ type: 'SET_STATUS', payload: 'Connected' });
                client.emit('joinRoom', {
                    room: roomCode,
                    playerId: effectivePlayerId,
                    playerName: resolvedPlayerName,
                });
            };

            if (client.connected) {
                doJoin();
            } else {
                client.once('connect', doJoin);
            }

            unsubscribeGameEvents = subscribeToGameEvents({
                joinedRoom: (payload) => {
                    dispatch({ type: 'SET_LOCAL_PLAYER', payload: { id: payload.playerId, name: payload.playerName } });
                },
                joinRoomError: ({ message }) => {
                    console.error('[useGameSocket] joinRoomError:', message);
                    dispatch({ type: 'SET_STATUS', payload: `Join error: ${message}` });
                    dispatch({ type: 'ADD_MESSAGE', payload: { playerName: 'System', text: `Could not join room: ${message}` } });
                },
                playerJoined: (payload) => {
                    dispatch({ type: 'PLAYER_JOINED', payload });
                    dispatch({ type: 'ADD_MESSAGE', payload: { playerName: 'System', text: `${payload.playerName} joined the room.` } });
                },
                roomPlayers: (playersList) => {
                    if (!Array.isArray(playersList)) return;
                    const updated = playersList.map((p) => ({ id: p.playerId, name: p.playerName, score: p.score || 0 }));
                    dispatch({ type: 'SET_PLAYERS', payload: { players: updated } });
                },
                playerLeft: ({ playerId: leftId, playerName: leftName }) => {
                    dispatch({ type: 'PLAYER_LEFT', payload: leftId });
                    dispatch({ type: 'ADD_MESSAGE', payload: { playerName: 'System', text: `${leftName || leftId} left the room.` } });
                },
                guess: ({ playerName, guess }) => {
                    dispatch({ type: 'ADD_MESSAGE', payload: { playerName, text: guess } });
                },
                correctGuess: ({ playerId: correctId, playerName, points, elapsedSeconds }) => {
                    const timeLabel = elapsedSeconds != null ? ` in ${elapsedSeconds}s` : '';
                    dispatch({ type: 'ADD_MESSAGE', payload: { playerName: 'System', text: `${playerName || correctId} guessed correctly and earned ${points} points${timeLabel}.` } });
                },
                roundStart: (payload) => {
                    dispatch({ type: 'ROUND_START_EVENT', payload });
                },
                wordSubmitted: (payload) => {
                    dispatch({ type: 'WORD_SUBMITTED', payload });
                    dispatch({ type: 'ADD_MESSAGE', payload: { playerName: 'System', text: `${payload.playerName} submitted a word (${payload.submittedCount}/${payload.totalPlayers})` } });
                    if (payload.allSubmitted) {
                        dispatch({ type: 'ADD_MESSAGE', payload: { playerName: 'System', text: 'All players have submitted! Click "Start Round" to begin.' } });
                    }
                },
                endRound: ({ word: revealedWord } = {}) => {
                    dispatch({ type: 'BEGIN_ROUND_END', payload: { revealedWord } });
                },
                wordsPoolEmpty: () => {
                    dispatch({ type: 'SET_WORD_INPUT_PHASE' });
                    dispatch({ type: 'ADD_MESSAGE', payload: { playerName: 'System', text: 'All words used! Submit new words to start the next round.' } });
                },
                endGame: (payload) => {
                    // Update Zustand rating if this is a ranked game and the server
                    // sent back eloResults for this player
                    if (payload?.eloResults?.length && authPlayerId) {
                        const myResult = payload.eloResults.find(
                            (r) => r.playerId === authPlayerId
                        );
                        if (myResult) {
                            setRating(myResult.newRating);
                        }
                    }
                    setTimeout(() => {
                        dispatch({ type: 'END_GAME', payload });
                    }, 3500);
                },
            });
        };

        connect();

        return () => {
            cancelled = true;
            unsubscribeGameEvents();
        };
    }, [roomCode, effectivePlayerId, resolvedPlayerName, token, authPlayerId, setRating, dispatch]);

    useEffect(() => {
        return () => disconnectSocket();
    }, []);
};
