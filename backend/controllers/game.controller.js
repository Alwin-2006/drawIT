import redisClient from "../redis/redis.js";
import { getIo, setRoomTimer, ROUND_DURATION_MS } from "../socket.js";

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

        const playersRaw = await redisClient.hgetall(playersKey);
        const totalPlayers = Object.keys(playersRaw).length;
        const submittedCount = await redisClient.scard(submittedPlayersKey);

        // Get all words from Redis list
        const wordsRaw = await redisClient.lrange(wordsKey, 0, -1);
        const words = wordsRaw.map(w => JSON.parse(w));

        if (!words || words.length === 0) {
            const io = getIo();
            if (io) {
                io.to(room).emit('wordsPoolEmpty');
            }
            return res.status(400).json({ error: 'No words available', success: false });
        }

        if (submittedCount !== totalPlayers) {
            return res.status(400).json({
                error: `Not all players have submitted words. ${submittedCount}/${totalPlayers}`,
                success: false,
                submittedCount,
                totalPlayers,
            });
        }

        // Pick a random word
        const randomIndex = Math.floor(Math.random() * words.length);
        const selectedWordObj = words[randomIndex];
        const selectedWord = String(selectedWordObj.word ?? '').trim();
        if (!selectedWord) {
            return res.status(400).json({ error: 'Invalid word', success: false });
        }
        
        // Remove the selected word from the list
        await redisClient.lrem(wordsKey, 1, JSON.stringify(selectedWordObj));

        // Get all players
        const players = Object.keys(playersRaw).map(key => ({ id: key, ...JSON.parse(playersRaw[key]) }));

        if (players.length === 0) {
            return res.status(400).json({ error: 'No players in room', success: false });
        }

        const lastDrawerKey = `room:${room}:lastDrawer`;
        const lastDrawer = await redisClient.get(lastDrawerKey);
        const playerIds = players.map((p) => p.id).sort();
        let selectedDrawer;
        if (lastDrawer && playerIds.includes(lastDrawer)) {
            const nextIndex = (playerIds.indexOf(lastDrawer) + 1) % playerIds.length;
            selectedDrawer = players.find((p) => p.id === playerIds[nextIndex]);
        } else {
            const randomPlayerIndex = Math.floor(Math.random() * players.length);
            selectedDrawer = players[randomPlayerIndex];
        }

        const drawerId = String(selectedDrawer.playerId || selectedDrawer.id);
        await redisClient.set(lastDrawerKey, drawerId);

        // Create hidden word (replace letters with underscores)
        const hiddenWord = selectedWord.split('').map(() => '_').join('');

        // Store current word and current drawer with 60s TTL and clear submitted players for next round
        const currentWordKey = `room:${room}:currentWord`;
        const currentDrawerKey = `room:${room}:currentDrawer`;
        const guessedPlayersKey = `room:${room}:guessedPlayers`;

        const normalizedWord = selectedWord.toLowerCase().trim().replace(/\s+/g, ' ');
        await redisClient.set(currentWordKey, normalizedWord);
        await redisClient.set(currentDrawerKey, drawerId);

        await redisClient.del(guessedPlayersKey);

        const remainingWords = await redisClient.llen(wordsKey);
        if (remainingWords === 0) {
            await redisClient.del(submittedPlayersKey);
        }

        const io = getIo();
        if (io) {
            // Emit hidden word to entire room (so non-drawers don't see the real word)
            const roundDurationSec = ROUND_DURATION_MS / 1000;
            io.to(room).emit('roundStart', {
                drawer: drawerId,
                hiddenWord: hiddenWord,
                drawerName: selectedDrawer.playerName,
                roundDurationSec,
            });

            // Try to send the plaintext word only to the drawer's socket
            const drawerSocketId = selectedDrawer.socketId;
            if (drawerSocketId) {
                io.to(drawerSocketId).emit('roundStart', {
                    drawer: drawerId,
                    word: selectedWord,
                    hiddenWord: hiddenWord,
                    drawerName: selectedDrawer.playerName,
                    roundDurationSec,
                });
            } else {
                // Fallback: attempt to find a socket by matching socket.data.playerId
                let found = null;
                for (const s of io.sockets.sockets.values()) {
                    if (String(s.data?.playerId ?? '').trim() === drawerId) {
                        found = s;
                        break;
                    }
                }
                if (found) {
                    found.emit('roundStart', {
                        drawer: drawerId,
                        word: selectedWord,
                        hiddenWord: hiddenWord,
                        drawerName: selectedDrawer.playerName,
                        roundDurationSec,
                    });
                } else {
                    console.warn('Could not find drawer socket to send plaintext word for room', room, 'drawer', drawerId);
                }
            }
            const duration = parseInt(process.env.ROUND_DURATION_MS, 10) || ROUND_DURATION_MS;
            setRoomTimer(room, duration);
        }

        res.json({
            success: true,
            drawer: drawerId,
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