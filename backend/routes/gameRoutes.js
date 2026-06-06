import express from "express";
import {
    getLeaderboard,
    updateScore,
    getPlayerStats,
    nextRound,
} from "../controllers/game.controller.js";

const router = express.Router();

router.get("/leaderboard", getLeaderboard);          // GET  /api/game/leaderboard
router.get("/player-stats/:playerId", getPlayerStats); // GET  /api/game/player-stats/:playerId
router.post("/update-score", updateScore);
router.post("/next-round", nextRound);

export default router;
