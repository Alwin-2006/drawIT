import { useEffect } from 'react';
import {
    connectGuest,
    joinAsGuest,
    subscribeToGameEvents,
    getSocket,
    disconnectSocket,
} from '../socket.js';

export const useGameSocket = ({ roomCode, resolvedPlayerId, resolvedPlayerName, dispatch }) => {
    useEffect(() => {
        let cancelled = false;
        let unsubscribeGameEvents = () => { };

        const onCasualQueued = (payload) => {
            dispatch({ type: 'ADD_MESSAGE', payload: { playerName: 'System', text: `Queued for casual match (job ${payload.jobId}).` } });
        };
        const onCasualError = (err) => {
            dispatch({ type: 'ADD_MESSAGE', payload: { playerName: 'System', text: `Queue error: ${err?.message || err}` } });
        };
        const onMatched = (data) => {
            dispatch({ type: 'ADD_MESSAGE', payload: { playerName: 'System', text: `Matched with ${data?.opponent?.name || 'unknown'}` } });
        };

        const connect = async () => {
            const playerId = resolvedPlayerId;
            const playerName = resolvedPlayerName;
            if (!playerId) return;

            const client = await connectGuest();
            if (cancelled) return;

            const join = () => {
                dispatch({ type: 'SET_STATUS', payload: 'Connected' });
                joinAsGuest({ room: roomCode, playerId, playerName });
            };
            if (client.connected) join();
            else client.once('connect', join);

            client.on('playCasualQueued', onCasualQueued);
            client.on('playCasualError', onCasualError);
            client.on('matched', onMatched);

            unsubscribeGameEvents = subscribeToGameEvents({
                joinedRoom: (payload) => {
                    dispatch({ type: 'SET_LOCAL_PLAYER', payload: { id: payload.playerId, name: payload.playerName } });
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
            const client = getSocket();
            if (client) {
                client.off('playCasualQueued', onCasualQueued);
                client.off('playCasualError', onCasualError);
                client.off('matched', onMatched);
            }
        };
    }, [roomCode, resolvedPlayerId, resolvedPlayerName, dispatch]);

    useEffect(() => {
        return () => disconnectSocket();
    }, []);
};
