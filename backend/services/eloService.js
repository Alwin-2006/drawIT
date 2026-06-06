/**
 * ELO service for ranked draw-IT games.
 *
 * Formula: standard Elo with K=32, adapted for FFA by comparing each
 * player against the average rating of their opponents (field average).
 *
 * Floor rule: a player's rating can never drop below 1200.
 */

const K = 32;
export const ELO_FLOOR = 1200;

/**
 * Expected score for a player against a single opponent.
 * @param {number} ratingA
 * @param {number} ratingB
 * @returns {number} expected score in [0,1]
 */
const expectedScore = (ratingA, ratingB) =>
  1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));

/**
 * Calculate new ratings for all players after a ranked FFA game.
 *
 * @param {Array<{playerId: string, rating: number, score: number}>} players
 *   `score` is the in-game point total used to determine placement.
 * @returns {Array<{playerId: string, oldRating: number, newRating: number, delta: number}>}
 */
export const calculateRankedElo = (players) => {
  if (!players || players.length === 0) return [];

  // Sort by score descending to determine placement (0-indexed rank)
  const sorted = [...players].sort((a, b) => b.score - a.score);

  // Assign actual scores: 1st = 1.0, last = 0.0, middle = interpolated
  // For N players: placement i (0-indexed) gets (N-1-i) / (N-1)
  const n = sorted.length;
  const actualScores = sorted.map((_, i) => (n === 1 ? 1 : (n - 1 - i) / (n - 1)));

  return sorted.map((player, i) => {
    const actual = actualScores[i];

    // Expected: average expected score vs all other players
    const opponents = sorted.filter((_, j) => j !== i);
    const avgExpected =
      opponents.length === 0
        ? 0.5
        : opponents.reduce((sum, opp) => sum + expectedScore(player.rating, opp.rating), 0) /
          opponents.length;

    const delta = Math.round(K * (actual - avgExpected));
    const rawNew = player.rating + delta;

    // Apply floor: never drop below ELO_FLOOR
    const newRating = Math.max(ELO_FLOOR, rawNew);
    const effectiveDelta = newRating - player.rating;

    return {
      playerId: player.playerId,
      oldRating: player.rating,
      newRating,
      delta: effectiveDelta,
    };
  });
};

/**
 * ELO penalty for abandoning a ranked game (disconnect forfeit).
 * Penalty is K/2 = 16 points, floored at ELO_FLOOR.
 *
 * @param {number} currentRating
 * @returns {{ newRating: number, delta: number }}
 */
export const calculateForfeitPenalty = (currentRating) => {
  const penalty = Math.round(K / 2); // 16
  const rawNew = currentRating - penalty;
  const newRating = Math.max(ELO_FLOOR, rawNew);
  const delta = newRating - currentRating;
  return { newRating, delta };
};
