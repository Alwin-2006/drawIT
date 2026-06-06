import redisClient from "../redis/redis.js";
import { normalizePlayerId, MAX_ROUNDS } from "../utils/gameUtils.js";
import { calculateRankedElo } from "./eloService.js";
import { Player } from "../models/player.model.js";

// In-memory timers and start times (kept here or passed as state)
const roomTimers = new Map();
const roundStartTimes = new Map();

export const clearRoomTimer = (room) => {
    const t = roomTimers.get(room);
    if (t) {
        clearTimeout(t);
        roomTimers.delete(room);
    }
};

export const markRoundStarted = async (room) => {
    const now = Date.now();
    roundStartTimes.set(room, now);
    try {
        await redisClient.set(`room:${room}:roundStartedAt`, String(now));
    } catch (e) {
        console.error('Failed to persist round start time:', e.message || e);
    }
};

export const clearRoundStartTime = async (room) => {
    roundStartTimes.delete(room);
    try {
        await redisClient.del(`room:${room}:roundStartedAt`);
    } catch (e) { /* ignore */ }
};

export const getRoundElapsedSeconds = async (room) => {
    let startedAt = roundStartTimes.get(room);
    if (!startedAt) {
        const saved = await redisClient.get(`room:${room}:roundStartedAt`);
        if (saved) {
            startedAt = parseInt(saved, 10);
            roundStartTimes.set(room, startedAt);
        }
    }
    if (!startedAt) return 0;
    return Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
};

export const checkAllNonDrawersGuessed = async (room, drawerId, playersRaw) => {
    const guessedPlayersKey = `room:${room}:guessedPlayers`;
    const allPlayerIds = Object.keys(playersRaw);
    const normalizedDrawerId = normalizePlayerId(drawerId);

    const nonDrawerIds = normalizedDrawerId
        ? allPlayerIds.filter((id) => normalizePlayerId(id) !== normalizedDrawerId)
        : allPlayerIds;

    if (nonDrawerIds.length === 0) return false;

    const guessedIds = await redisClient.smembers(guessedPlayersKey);
    const guessedSet = new Set(guessedIds.map(normalizePlayerId));

    return nonDrawerIds.every((id) => guessedSet.has(normalizePlayerId(id)));
};

export const endGameForRoom = async (room, io) => {
    if (!room) return false;

    const scoresKey = `room:${room}:scores`;
    const playersKey = `room:${room}:players`;
    const lastDrawerKey = `room:${room}:lastDrawer`;
    const wordsKey = `room:${room}:words`;
    const submittedPlayersKey = `room:${room}:submittedPlayers`;
    const turnsInRoundKey = `room:${room}:turnsInRound`;
    const roundsRemainingKey = `room:${room}:roundsRemaining`;
    const membersKey = `room:${room}:members`;
    const casualMembersKey = `casual:room:${room}:members`;
    const rankedMembersKey = `ranked:room:${room}:members`;
    const rankedRoomDataKey = `ranked:room:${room}:data`;

    const scores = await redisClient.zrange(scoresKey, 0, -1, 'WITHSCORES');
    const playersRaw = await redisClient.hgetall(playersKey);
    const players = Object.values(playersRaw || {}).map(v => JSON.parse(v));

    // ── Ranked: compute and persist ELO updates ──────────────────────────────
    const rankedFlag = await redisClient.hget(rankedRoomDataKey, 'isRanked');
    let eloResults = [];

    if (rankedFlag === '1' && players.length > 0) {
        console.log('ended ranked game');
        try {
            // Build input for ELO calculation: fetch current ratings from DB
            const playerDocs = await Player.find({
                _id: { $in: players.map(p => p.playerId) }
            }).select('_id rating');

            const ratingMap = new Map(playerDocs.map(d => [d._id.toString(), d.rating]));

            const eloInput = players.map(p => ({
                playerId: p.playerId,
                rating: ratingMap.get(p.playerId) ?? 1200,
                score: p.score || 0,
            }));

            eloResults = calculateRankedElo(eloInput);

            // Persist updated ratings to MongoDB and clear player→room mapping
            await Promise.all(
                eloResults.map(async ({ playerId, newRating }) => {
                    await Player.findByIdAndUpdate(playerId, { rating: newRating });
                    await redisClient.del(`ranked:player:${playerId}:room`);
                })
            );

            console.log('[gameService] ELO updates after ranked game in room', room, eloResults);
        } catch (e) {
            console.error('[gameService] Failed to update ELO ratings:', e.message || e);
        }
    }

    // ── Cleanup Redis keys ────────────────────────────────────────────────────
    try {
        await redisClient.del(
            scoresKey, playersKey, lastDrawerKey, wordsKey,
            submittedPlayersKey, turnsInRoundKey, roundsRemainingKey,
            membersKey, casualMembersKey, rankedMembersKey, rankedRoomDataKey,
            `room:${room}:data`,
        );
    } catch (e) {
        console.error('[gameService] Failed to cleanup game keys:', e.message || e);
    }

    if (io) {
        io.to(room).emit('endGame', { room, scores, players, eloResults });
    }
    return true;
};

export const endRoundForRoom = async (room, reason, io) => {
    if (!room) return false;

    clearRoomTimer(room);
    await clearRoundStartTime(room);

    const currentWordKey = `room:${room}:currentWord`;
    const currentDrawerKey = `room:${room}:currentDrawer`;
    const guessedPlayersKey = `room:${room}:guessedPlayers`;

    const currentWord = await redisClient.get(currentWordKey);
    if (!currentWord) return false;

    try {
        await redisClient.del(currentWordKey, currentDrawerKey, guessedPlayersKey);
    } catch (e) {
        console.error('Failed to cleanup round keys:', e.message || e);
    }

    if (io) {
        io.to(room).emit('endRound', { room, reason, word: currentWord });
    }

    // Round counting logic
    try {
        const turnsInRoundKey = `room:${room}:turnsInRound`;
        const roundsRemainingKey = `room:${room}:roundsRemaining`;
        const playersKey = `room:${room}:players`;

        const turn = await redisClient.incr(turnsInRoundKey);
        const playersRaw = await redisClient.hgetall(playersKey);
        const totalPlayersCount = Object.keys(playersRaw || {}).length || 1;

        if (turn >= totalPlayersCount) {
            await redisClient.set(turnsInRoundKey, '0');
            let remainingRaw = await redisClient.get(roundsRemainingKey);
            let remaining = remainingRaw === null ? MAX_ROUNDS : parseInt(remainingRaw, 10);
            remaining -= 1;
            await redisClient.set(roundsRemainingKey, remaining);

            if (remaining <= 0) {
                await endGameForRoom(room, io);
            }
        }
    } catch (e) {
        console.error('Error in round counting logic:', e.message || e);
    }

    return true;
};

export const setRoomTimer = (room, io, duration = 60000) => {
    clearRoomTimer(room);
    markRoundStarted(room);

    const t = setTimeout(async () => {
        try {
            await endRoundForRoom(room, 'timeout', io);
        } catch (err) {
            console.error('Error in room timer handler:', err.message || err);
        } finally {
            roomTimers.delete(room);
        }
    }, duration);

    roomTimers.set(room, t);
};
