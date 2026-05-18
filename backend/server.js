import express from "express";
import http from "http";
import dotenv from "dotenv";
import connectToMongoDB from "./db/connectToMongoDB.js";
import authRoutes from "./routes/authRoutes.js";

dotenv.config();

const app = express();

app.use(express.json()); // to parse req.body

app.use("/api/auth", authRoutes);

const server = http.createServer(app);

server.listen(3000, () => {
    connectToMongoDB();
    console.log("Server started on port 3000");
});