import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Player } from "../models/player.model.js";

// Generate JWT Token
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: "30d",
    });
};

export const signup = async (req, res) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ error: "Please provide all required fields" });
        }

        const existingPlayer = await Player.findOne({ $or: [{ username }, { email }] });
        if (existingPlayer) {
            return res.status(400).json({ error: "Username or email already exists" });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newPlayer = new Player({
            username,
            email,
            password: hashedPassword,
        });

        if (newPlayer) {
            await newPlayer.save();
            const token = generateToken(newPlayer._id);
            res.status(201).json({
                _id: newPlayer._id,
                username: newPlayer.username,
                email: newPlayer.email,
                rating: newPlayer.rating,
                token
            });
        } else {
            res.status(400).json({ error: "Invalid player data" });
        }
    } catch (error) {
        console.log("Error in signup controller:", error.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

export const login = async (req, res) => {
    try {
        const { username, password } = req.body;

        const player = await Player.findOne({ username });
        const isPasswordCorrect = await bcrypt.compare(password, player?.password || "");

        if (!player || !isPasswordCorrect) {
            return res.status(400).json({ error: "Invalid username or password" });
        }

        const token = generateToken(player._id);

        res.status(200).json({
            _id: player._id,
            username: player.username,
            email: player.email,
            rating: player.rating,
            token
        });
    } catch (error) {
        console.log("Error in login controller:", error.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

export const logout = (req, res) => {
    try {
        // Since we are using standard JWT tokens, the client handles logout by removing the token.
        // If we were using cookies, we would clear the cookie here.
        res.status(200).json({ message: "Logged out successfully" });
    } catch (error) {
        console.log("Error in logout controller:", error.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
};
