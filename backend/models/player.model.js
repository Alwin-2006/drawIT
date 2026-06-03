import mongoose from 'mongoose';

const playerSchema = new mongoose.Schema({
  isAdmin: {
    type: Boolean,
    default: false,
  },
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  rating: {
    type: Number,
    default: 1200, // Default rating
  },
  password: {
    type: String,
    required: true, // This will store the hashed password
  }
}, {
  timestamps: true // This will automatically add createdAt and updatedAt
});

playerSchema.index({ rating: -1 });

export const Player = mongoose.model('Player', playerSchema);
