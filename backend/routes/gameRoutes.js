import express from "express";
import { getLeaderboard,
    updateScore,
    getPlayerStats,
    nextRound, } from "../controllers/game.controller.js";

const router = express.Router();

router.post("/get-leaderboard", getLeaderboard);
router.post("/update-score", updateScore);
router.post("/get-player-stats", getPlayerStats);
router.post("/next-round", nextRound);

export default router;