import redisClient from "../redis/redis.js";
import { getIo } from "../socket.js";
import { setRoomTimer } from "../services/gameService.js";
import { normalizeWord, ROUND_DURATION_MS } from "../utils/gameUtils.js";

// Get all players from leaderboard
const getLeaderboard = async (req, res) => {
    try {
        const leaderboard = await redisClient.zrevrange('game:leaderboard', 0, -1, 'WITHSCORES');
        res.json(leaderboard);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Update player score
const updateScore = async (req, res) => {
    try {
        const { playerId, score } = req.body;
        await redisClient.zincrby('game:leaderboard', score, playerId);
        res.json({ success: true, playerId, score });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Get player rank and score
const getPlayerStats = async (req, res) => {
    try {
        const { playerId } = req.params;
        const score = await redisClient.zscore('game:leaderboard', playerId);
        const rank = await redisClient.zrevrank('game:leaderboard', playerId);
        res.json({ playerId, score, rank: rank !== null ? rank + 1 : null });
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