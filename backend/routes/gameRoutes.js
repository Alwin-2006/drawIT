import express from "express";
import { getLeaderboard,
    updateScore,
    getPlayerStats, } from "../controllers/game.controller.js";

const router = express.Router();

router.post("/get-leaderboard", getLeaderboard);
router.post("/update-score", updateScore);
router.post("/get-player-stats", getPlayerStats);

export default router;