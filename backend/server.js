import express from "express";
import http from "http";
import cors from "cors";
import dotenv from "dotenv";
import connectToMongoDB from "./db/connectToMongoDB.js";
import authRoutes from "./routes/authRoutes.js";
import redisClient from "./redis/redis.js";
import initSocket from "./socket.js";

dotenv.config();

const app = express();

// CORS configuration
app.use((req, res, next) => {
    const origin = "*";
    if (origin) {
        res.setHeader("Access-Control-Allow-Origin", origin);
    }
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");

    if (req.method === "OPTIONS") {
        return res.sendStatus(204);
    }

    next();
});
app.use(express.json()); // to parse req.body

app.use("/api/auth", authRoutes);

const server = http.createServer(app);

// initialize socket.io with the HTTP server
initSocket(server);
app.get("/",async (req,res)=>{
    res.send("hi");
})
app.get("/redis", async (req, res) => {
    try {
        const reply = await redisClient.ping();
        res.send(reply);
    } catch (error) {
        res.status(500).send("Redis error: " + error.message);
    }
});
server.listen(3000, () => {
    connectToMongoDB();
    console.log("Server started on port 3000");
});

