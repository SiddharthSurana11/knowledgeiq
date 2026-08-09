/**
 * rrfFusion.js — Reciprocal Rank Fusion for combining two ranked lists.
 *
 * RRF is a rank-level fusion technique that doesn't depend on score
 * normalization.  Given two ranked lists of the same candidate set,
 * it produces a single fused ranking.
 *
 * Formula:  rrf_score(d) = 1/(k + rank_A(d)) + 1/(k + rank_B(d))
 * where k=60 is the standard smoothing constant (Cormack et al., 2009).
 */

/**
 * Fuse two ranked lists using Reciprocal Rank Fusion.
 *
 * @param {{ id: string, score: number }[]} vectorRanked  — Candidates sorted by vector similarity (descending).
 * @param {{ id: string, score: number }[]} bm25Ranked    — Candidates sorted by BM25 score (descending).
 * @param {number} [k=60]  — RRF smoothing constant.
 * @returns {{ id: string, rrfScore: number }[]}  Fused ranking sorted descending by rrfScore.
 */
function fuseRankings(vectorRanked, bm25Ranked, k = 60) {
  const rrfScores = {};

  // Assign rank-based RRF contribution from vector ranking (rank is 1-indexed)
  vectorRanked.forEach((item, idx) => {
    const rank = idx + 1;
    rrfScores[item.id] = (rrfScores[item.id] || 0) + 1 / (k + rank);
  });

  // Add rank-based RRF contribution from BM25 ranking
  bm25Ranked.forEach((item, idx) => {
    const rank = idx + 1;
    rrfScores[item.id] = (rrfScores[item.id] || 0) + 1 / (k + rank);
  });

  // Build and sort result array
  const fused = Object.entries(rrfScores).map(([id, rrfScore]) => ({ id, rrfScore }));
  fused.sort((a, b) => b.rrfScore - a.rrfScore);

  return fused;
}

module.exports = { fuseRankings };
