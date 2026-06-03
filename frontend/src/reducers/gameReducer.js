import { ROUND_END_DELAY_SEC } from '../utils/gameUtils.js';

export const initialGameState = {
    players: [],
    messages: [],
    status: 'Connecting...',
    localPlayerName: '',
    localPlayerId: '',
    gamePhase: 'word-input',
    currentDrawer: null,
    currentWord: '',
    hideword: '',
    timer: 60,
    isDrawing: false,
    isGuessing: false,
    submittedCount: 0,
    totalPlayers: 0,
    hasSubmittedWord: false,
    isGameOver: false,
    prevScores: {},
    scoreDeltas: {},
    showRoundEndOverlay: false,
    roundEndCountdown: ROUND_END_DELAY_SEC
};

export function gameReducer(state, action) {
    switch (action.type) {
        case 'SET_STATUS':
            return { ...state, status: action.payload };

        case 'SET_LOCAL_PLAYER':
            return {
                ...state,
                localPlayerId: action.payload.id || state.localPlayerId,
                localPlayerName: action.payload.name || state.localPlayerName
            };

        case 'SET_PLAYERS':
            return {
                ...state,
                players: action.payload.players,
                totalPlayers: action.payload.players.length
            };

        case 'PLAYER_JOINED': {
            if (state.players.some(p => String(p.id) === String(action.payload.playerId))) {
                return state;
            }
            const updated = [
                ...state.players,
                { id: action.payload.playerId, name: action.payload.playerName, score: 0 }
            ];
            return { ...state, players: updated, totalPlayers: updated.length };
        }

        case 'PLAYER_LEFT': {
            const filtered = state.players.filter(p => String(p.id) !== String(action.payload));
            return { ...state, players: filtered, totalPlayers: filtered.length };
        }

        case 'ADD_MESSAGE':
            return { ...state, messages: [...state.messages, action.payload] };

        case 'SET_GUESSING_PHASE': {
            const myId = String(state.localPlayerId);
            const isDrawer = String(action.payload.drawer) === myId;
            return {
                ...state,
                currentDrawer: String(action.payload.drawer),
                currentWord: action.payload.word,
                hideword: action.payload.hiddenWord,
                gamePhase: 'guessing',
                timer: action.payload.duration || 60,
                isDrawing: isDrawer,
                isGuessing: !isDrawer,
                showRoundEndOverlay: false,
                hasSubmittedWord: false, // reset for next round in case
                submittedCount: 0,       // reset for next round
                roundEndCountdown: ROUND_END_DELAY_SEC
            };
        }

        case 'ROUND_START_EVENT': {
            const myId = String(state.localPlayerId);
            const isDrawer = String(action.payload.drawer) === myId;
            const scores = {};
            state.players.forEach(p => { scores[p.id] = p.score; });

            const sysMsg = {
                playerName: 'System',
                text: `Round started! ${action.payload.drawerName || action.payload.drawer} is drawing.`
            };

            return {
                ...state,
                currentDrawer: String(action.payload.drawer),
                currentWord: action.payload.word,
                hideword: action.payload.hiddenWord,
                gamePhase: 'guessing',
                timer: action.payload.roundDurationSec || 60,
                isDrawing: isDrawer,
                isGuessing: !isDrawer,
                hasSubmittedWord: false,
                submittedCount: 0,
                prevScores: scores,
                showRoundEndOverlay: false,
                roundEndCountdown: ROUND_END_DELAY_SEC,
                messages: [...state.messages, sysMsg]
            };
        }

        case 'SET_WORD_INPUT_PHASE':
            return {
                ...state,
                gamePhase: 'word-input',
                hasSubmittedWord: false,
                submittedCount: 0,
                showRoundEndOverlay: false
            };

        case 'BEGIN_ROUND_END': {
            const revealed = action.payload.revealedWord || '???';
            const deltas = {};
            state.players.forEach(p => {
                deltas[p.id] = p.score - (state.prevScores[p.id] || 0);
            });

            return {
                ...state,
                timer: 0,
                gamePhase: 'round-end',
                isDrawing: false,
                isGuessing: false,
                submittedCount: 0,
                hasSubmittedWord: false,
                currentWord: revealed,
                hideword: revealed,
                scoreDeltas: deltas,
                showRoundEndOverlay: true,
                roundEndCountdown: ROUND_END_DELAY_SEC,
                messages: [...state.messages, { playerName: 'System', text: `Round ended — word was: ${revealed}` }]
            };
        }

        case 'END_GAME': {
            let finalPlayers = state.players;
            if (action.payload.players) {
                finalPlayers = action.payload.players.map(p => ({
                    id: p.playerId || p.id,
                    name: p.playerName || p.name,
                    score: p.score || 0
                }));
            }
            return {
                ...state,
                isGameOver: true,
                players: finalPlayers,
                showRoundEndOverlay: false
            };
        }

        case 'WORD_SUBMITTED':
            return {
                ...state,
                submittedCount: action.payload.submittedCount,
                totalPlayers: action.payload.totalPlayers
            };

        case 'SET_HAS_SUBMITTED_WORD':
            return { ...state, hasSubmittedWord: action.payload };

        case 'TICK_TIMER':
            return { ...state, timer: Math.max(0, state.timer - 1) };

        case 'TICK_ROUND_END_COUNTDOWN':
            return { ...state, roundEndCountdown: Math.max(0, state.roundEndCountdown - 1) };

        case 'HIDE_ROUND_END_OVERLAY':
            return { ...state, showRoundEndOverlay: false };

        default:
            return state;
    }
}
