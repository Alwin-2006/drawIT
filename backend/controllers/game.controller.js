import redisClient from "../redis/redis.js";



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

module.exports = {
    getLeaderboard,
    updateScore,
    getPlayerStats,
};