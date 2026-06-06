import redisClient from "../redis/redis.js";
import { getIo } from "../socket.js";
import { setRoomTimer } from "../services/gameService.js";
import { normalizeWord, ROUND_DURATION_MS } from "../utils/gameUtils.js";
import { Player } from "../models/player.model.js";

const LEADERBOARD_KEY = 'player:leaderboard';       // sorted set: score=rating, member=playerId
const LEADERBOARD_NAMES_KEY = 'player:leaderboard:names'; // hash: playerId → username
const LEADERBOARD_TTL = 60 * 5; // 5 minutes cache

// ── Leaderboard ───────────────────────────────────────────────────────────────

/**
 * Rebuild the Redis leaderboard cache from MongoDB.
 * Called when the cache is cold or after a ranked game ends.
 */
export const rebuildLeaderboardCache = async () => {
    const players = await Player.find({})
        .select('_id username rating')
        .sort({ rating: -1 })
        .limit(100)
        .lean();

    if (players.length === 0) return;

    //create a pipeline to batch Redis commands for efficiency
    const pipeline = redisClient.pipeline();

    //now the following commands will be executed atomically and together when we call pipeline.exec()
    pipeline.del(LEADERBOARD_KEY);
    for (const p of players) {
        pipeline.zadd(LEADERBOARD_KEY, p.rating, p._id.toString());
    }

    // Rebuild names hash
    pipeline.del(LEADERBOARD_NAMES_KEY);
    for (const p of players) {
        pipeline.hset(LEADERBOARD_NAMES_KEY, p._id.toString(), p.username);
    }

    // Set TTL on the sorted set
    pipeline.expire(LEADERBOARD_KEY, LEADERBOARD_TTL);
    pipeline.expire(LEADERBOARD_NAMES_KEY, LEADERBOARD_TTL);

    await pipeline.exec();
};

const getLeaderboard = async (req, res) => {
    try {
        const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
        const limit = Math.min(20, Math.max(1, parseInt(req.query.limit, 10) || 5));

        // Check if cache exists
        const cacheExists = await redisClient.exists(LEADERBOARD_KEY);
        if (!cacheExists) {
            await rebuildLeaderboardCache();
        }

        // Total entries in the sorted set
        const total = await redisClient.zcard(LEADERBOARD_KEY);

        // zrevrange with scores for the requested page
        const raw = await redisClient.zrevrange(LEADERBOARD_KEY, offset, offset + limit - 1, 'WITHSCORES');

        const entries = [];
        for (let i = 0; i < raw.length; i += 2) {
            const playerId = raw[i];
            const rating = parseInt(raw[i + 1], 10);
            entries.push({ playerId, rating });
        }

        // Batch fetch usernames from hash
        if (entries.length > 0) {
            const ids = entries.map(e => e.playerId);
            const names = await redisClient.hmget(LEADERBOARD_NAMES_KEY, ...ids);
            entries.forEach((e, i) => {
                e.username = names[i] || e.playerId;
                e.rank = offset + i + 1;
            });
        }

        res.json({ entries, total, offset, limit });
    } catch (error) {
        console.error('[leaderboard] getLeaderboard error:', error);
        res.status(500).json({ error: error.message });
    }
};

// Update player score — kept for backward compat, now updates leaderboard cache too
const updateScore = async (req, res) => {
    try {
        const { playerId, score } = req.body;
        await redisClient.zincrby('game:leaderboard', score, playerId);
        res.json({ success: true, playerId, score });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Get player rank from the leaderboard cache
const getPlayerStats = async (req, res) => {
    try {
        const { playerId } = req.params;
        const cacheExists = await redisClient.exists(LEADERBOARD_KEY);
        if (!cacheExists) await rebuildLeaderboardCache();

        const rating = await redisClient.zscore(LEADERBOARD_KEY, playerId);
        const rank = await redisClient.zrevrank(LEADERBOARD_KEY, playerId);
        res.json({ playerId, rating: rating ? parseInt(rating, 10) : null, rank: rank !== null ? rank + 1 : null });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Start next round - pick random player and word
const nextRound = async (req, res) => {
    try {
        const { room } = req.body;
        if (!room) return res.status(400).json({ error: 'Room is required' });

        const wordsKey = `room:${room}:words`;
        const submittedPlayersKey = `room:${room}:submittedPlayers`;
        const playersKey = `room:${room}:players`;

        const playersRaw = await redisClient.hgetall(playersKey);
        const totalPlayers = Object.keys(playersRaw).length;
        const submittedCount = await redisClient.scard(submittedPlayersKey);

        const wordsRaw = await redisClient.lrange(wordsKey, 0, -1);
        if (!wordsRaw || wordsRaw.length === 0) {
            const io = getIo();
            if (io) io.to(room).emit('wordsPoolEmpty');
            return res.status(400).json({ error: 'No words available', success: false });
        }

        if (submittedCount < totalPlayers && totalPlayers > 1) {
            // Optional: allow starting if at least one word exists? 
            // But the rule was "all must submit"
            return res.status(400).json({
                error: `Waiting for everyone to submit words. ${submittedCount}/${totalPlayers}`,
                success: false,
            });
        }

        // Pick a random word
        const words = wordsRaw.map(w => JSON.parse(w));
        const randomIndex = Math.floor(Math.random() * words.length);
        const selectedWordObj = words[randomIndex];
        const selectedWord = String(selectedWordObj.word ?? '').trim();

        await redisClient.lrem(wordsKey, 1, JSON.stringify(selectedWordObj));

        // Rotation logic
        const players = Object.keys(playersRaw).map(key => ({ id: key, ...JSON.parse(playersRaw[key]) }));
        const lastDrawerKey = `room:${room}:lastDrawer`;
        const lastDrawer = await redisClient.get(lastDrawerKey);
        const playerIds = players.map(p => p.id).sort();

        let selectedDrawer;
        if (lastDrawer && playerIds.includes(lastDrawer)) {
            const nextIndex = (playerIds.indexOf(lastDrawer) + 1) % playerIds.length;
            selectedDrawer = players.find(p => p.id === playerIds[nextIndex]);
        } else {
            selectedDrawer = players[Math.floor(Math.random() * players.length)];
        }

        const drawerId = String(selectedDrawer.playerId || selectedDrawer.id);
        await redisClient.set(lastDrawerKey, drawerId);

        const hiddenWord = selectedWord.split('').map(() => '_').join('');
        const normalizedWord = normalizeWord(selectedWord);

        await redisClient.set(`room:${room}:currentWord`, normalizedWord);
        await redisClient.set(`room:${room}:currentDrawer`, drawerId);
        await redisClient.del(`room:${room}:guessedPlayers`);

        const remainingWords = await redisClient.llen(wordsKey);
        if (remainingWords === 0) await redisClient.del(submittedPlayersKey);

        const io = getIo();
        if (io) {
            const roundDurationSec = ROUND_DURATION_MS / 1000;
            io.to(room).emit('roundStart', {
                drawer: drawerId,
                hiddenWord,
                drawerName: selectedDrawer.playerName,
                roundDurationSec,
            });

            // Send full word to drawer
            const drawerSocket = io.sockets.sockets.get(selectedDrawer.socketId);
            if (drawerSocket) {
                drawerSocket.emit('roundStart', {
                    drawer: drawerId,
                    word: selectedWord,
                    hiddenWord,
                    drawerName: selectedDrawer.playerName,
                    roundDurationSec,
                });
            }

            setRoomTimer(room, io, ROUND_DURATION_MS);
        }

        res.json({ success: true, drawer: drawerId, word: selectedWord });
    } catch (error) {
        console.error('Error in nextRound:', error);
        res.status(500).json({ error: error.message, success: false });
    }
};

export {
    getLeaderboard,
    updateScore,
    getPlayerStats,
    nextRound,
};