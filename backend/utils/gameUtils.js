export const MAX_ROOM_PLAYERS = 4;
export const ROUND_DURATION_MS = 60000;
export const MAX_ROUNDS = 1;
export const GUESS_POINTS_MAX = 500;
export const GUESS_POINTS_MIN = 50;
export const GUESS_POINTS_DECAY_PER_SEC = 10;

/** Points for a correct guess: max(50, 500 - elapsedSeconds * 10) */
export const calculateGuessPoints = (elapsedSeconds) => {
    const elapsed = Math.max(0, Math.floor(elapsedSeconds));
    return Math.max(GUESS_POINTS_MIN, GUESS_POINTS_MAX - elapsed * GUESS_POINTS_DECAY_PER_SEC);
};

export const normalizePlayerId = (id) => (id == null ? '' : String(id).trim());

export const normalizeWord = (word) =>
    String(word ?? '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ');
