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

// Note: Mongoose automatically adds an '_id' field to act as the primary key.
// If you need a virtual 'id' field that maps to '_id', you can use:
// playerSchema.virtual('id').get(function() { return this._id.toHexString(); });
// playerSchema.set('toJSON', { virtuals: true });

export const Player = mongoose.model('Player', playerSchema);
