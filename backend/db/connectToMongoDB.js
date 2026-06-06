import mongoose from "mongoose";
import { rebuildLeaderboardCache } from "../controllers/game.controller.js";

const connectToMongoDB = async () => {
	try {
		await mongoose.connect(process.env.MONGODB_URI);
		console.log("Connected to MongoDB");
		// Seed top-100 players into the Redis leaderboard sorted set
		await rebuildLeaderboardCache();
		console.log("Leaderboard cache seeded into Redis");
	} catch (error) {
		console.log("Error connecting to MongoDB", error.message);
	}
};

export default connectToMongoDB;
