import redisClient from "../redis/redis.js";
import { getIo } from "../socket.js";

// Get all players from leaderboard
const getLeaderboard = async (req, res) => {
    try {
        const leaderboard = await redisClient.zRevRangeWithScores('game:leaderboard', 0, -1);
        res.json(leaderboard);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Update player score
const updateScore = async (req, res) => {
    try {
        const { playerId, score } = req.body;
        await redisClient.zIncrBy('game:leaderboard', score, playerId);
        res.json({ success: true, playerId, score });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Get player rank and score
const getPlayerStats = async (req, res) => {
    try {
        const { playerId } = req.params;
        const score = await redisClient.zScore('game:leaderboard', playerId);
        const rank = await redisClient.zRevRank('game:leaderboard', playerId);
        res.json({ playerId, score, rank: rank + 1 });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Start next round - pick random player and word
const nextRound = async (req, res) => {
    try {
        const { room, playerId } = req.body;
        if (!room) {
            return res.status(400).json({ error: 'Room is required' });
        }

        const wordsKey = `room:${room}:words`;
        const submittedPlayersKey = `room:${room}:submittedPlayers`;
        const playersKey = `room:${room}:players`;

        // Check if all players have submitted
        const playersRaw = await redisClient.hgetall(playersKey);
        const totalPlayers = Object.keys(playersRaw).length;
        const submittedCount = await redisClient.scard(submittedPlayersKey);

        if (submittedCount !== totalPlayers) {
            return res.status(400).json({ 
                error: `Not all players have submitted words. ${submittedCount}/${totalPlayers}`, 
                success: false,
                submittedCount,
                totalPlayers,
            });
        }

        // Get all words from Redis list
        const wordsRaw = await redisClient.lrange(wordsKey, 0, -1);
        const words = wordsRaw.map(w => JSON.parse(w));

        if (!words || words.length === 0) {
            return res.status(400).json({ error: 'No words available', success: false });
        }

        // Pick a random word
        const randomIndex = Math.floor(Math.random() * words.length);
        const selectedWordObj = words[randomIndex];
        const selectedWord = selectedWordObj.word;
        
        // Remove the selected word from the list
        await redisClient.lrem(wordsKey, 1, JSON.stringify(selectedWordObj));

        // Get all players
        const players = Object.keys(playersRaw).map(key => ({ id: key, ...JSON.parse(playersRaw[key]) }));

        if (players.length === 0) {
            return res.status(400).json({ error: 'No players in room', success: false });
        }

        // Pick a random player to draw
        const randomPlayerIndex = Math.floor(Math.random() * players.length);
        const selectedDrawer = players[randomPlayerIndex];

        // Create hidden word (replace letters with underscores)
        const hiddenWord = selectedWord.split('').map(() => '_').join('');

        // Clear submitted players for next round
        await redisClient.del(submittedPlayersKey);

        const io = getIo();
        if (io) {
            io.to(room).emit('roundStart', {
                drawer: selectedDrawer.id,
                word: selectedWord,
                hiddenWord: hiddenWord,
                drawerName: selectedDrawer.playerName,
            });
        }

        res.json({
            success: true,
            drawer: selectedDrawer.id,
            drawerName: selectedDrawer.playerName,
            word: selectedWord,
            hiddenWord: hiddenWord,
        });
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