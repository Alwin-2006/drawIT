import { useEffect, useRef } from 'react';
import { handleRoundEnd } from '../utils/gameUtils.js';

export const useGameTimers = (state, dispatch) => {
    // Guessing-phase timer
    useEffect(() => {
        if (state.gamePhase !== 'guessing' || state.timer <= 0) return;

        const interval = setInterval(() => {
            dispatch({ type: 'TICK_TIMER' });
        }, 1000);

        return () => clearInterval(interval);
    }, [state.gamePhase, state.timer, dispatch]);

    // Round-end overlay countdown
    useEffect(() => {
        if (!state.showRoundEndOverlay || state.roundEndCountdown <= 0) return;

        const interval = setInterval(() => {
            dispatch({ type: 'TICK_ROUND_END_COUNTDOWN' });
        }, 1000);

        return () => clearInterval(interval);
    }, [state.showRoundEndOverlay, state.roundEndCountdown, dispatch]);
};

export const useRoundTransition = (state, dispatch, roomCode, authPlayerId) => {
    const advancingRoundRef = useRef(false);

    useEffect(() => {
        if (!state.showRoundEndOverlay || state.roundEndCountdown > 0 || state.isGameOver) return;

        const advancerId = state.currentDrawer || state.players[0]?.id;
        const myId = state.localPlayerId || authPlayerId;
        const isAdvancer = myId && advancerId && String(myId) === String(advancerId);

        if (!isAdvancer || advancingRoundRef.current) return;

        advancingRoundRef.current = true;

        handleRoundEnd({
            roomCode,
            playerId: myId,
            dispatch
        }).finally(() => {
            advancingRoundRef.current = false;
        });
    }, [
        state.showRoundEndOverlay,
        state.roundEndCountdown,
        state.isGameOver,
        state.currentDrawer,
        state.players,
        state.localPlayerId,
        roomCode,
        authPlayerId,
        dispatch
    ]);
};
