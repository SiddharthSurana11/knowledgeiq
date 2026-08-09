class TrustScoreService {
  static calculateTrustScore(doc) {
    if (!doc) {
      return {
        trustScore: 0,
        breakdown: {
          duplicatePenalty: 0,
          contradictionPenalty: 0,
          reviewBonus: 0,
          agePenalty: 0,
          statusPenalty: 0
        },
        lastCalculated: new Date()
      };
    }

    // EXACT_DUPLICATE triggers 0 immediately
    if (doc.duplicateStatus === 'EXACT_DUPLICATE') {
      return {
        trustScore: 0,
        breakdown: {
          duplicatePenalty: 100,
          contradictionPenalty: 0,
          reviewBonus: 0,
          agePenalty: 0,
          statusPenalty: 0
        },
        lastCalculated: new Date()
      };
    }

    let score = 100;
    const breakdown = {
      duplicatePenalty: 0,
      contradictionPenalty: 0,
      reviewBonus: 0, // can be negative (penalty) or positive (bonus)
      agePenalty: 0, // can be negative (penalty) or positive (bonus)
      statusPenalty: 0
    };

    // 1. Duplicate Penalty
    if (doc.duplicateStatus === 'NEAR_DUPLICATE') {
      breakdown.duplicatePenalty = 25;
    } else if (doc.duplicateStatus === 'PARTIAL_DUPLICATE') {
      breakdown.duplicatePenalty = 15;
    }
    score -= breakdown.duplicatePenalty;

    // 2. Contradiction Penalty
    if (doc.contradictionStatus === 'CONTRADICTION') {
      breakdown.contradictionPenalty = 35;
    } else if (doc.contradictionStatus === 'POSSIBLE_CONTRADICTION') {
      breakdown.contradictionPenalty = 15;
    } else if (doc.contradictionStatus === 'PENDING') {
      breakdown.contradictionPenalty = 5;  // Provisional penalty while check is in-flight
    }
    score -= breakdown.contradictionPenalty;

    // 3. Review Status Bonus/Penalty
    const now = new Date();
    if (!doc.lastReviewed) {
      breakdown.reviewBonus = -10;
    } else {
      const reviewDate = new Date(doc.lastReviewed);
      const diffTime = Math.abs(now - reviewDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays <= 30) {
        breakdown.reviewBonus = 5;
      } else if (diffDays <= 90) {
        breakdown.reviewBonus = 0;
      } else {
        breakdown.reviewBonus = -5;
      }
    }
    score += breakdown.reviewBonus;

    // 4. Document Age Bonus/Penalty
    const uploadDate = doc.uploadedAt ? new Date(doc.uploadedAt) : now;
    const ageDiffTime = Math.abs(now - uploadDate);
    const ageDiffDays = Math.ceil(ageDiffTime / (1000 * 60 * 60 * 24));

    if (ageDiffDays <= 30) {
      breakdown.agePenalty = 5; // +5 bonus
    } else if (ageDiffDays <= 180) {
      breakdown.agePenalty = 0;
    } else {
      breakdown.agePenalty = -10; // -10 penalty
    }
    score += breakdown.agePenalty;

    // 5. Document Status Penalty
    if (doc.status && (doc.status.toLowerCase() === 'archived' || doc.status.toLowerCase() === 'superseded')) {
      breakdown.statusPenalty = 20;
    }
    score -= breakdown.statusPenalty;

    // Clamp score between 0 and 100
    const finalScore = Math.max(0, Math.min(100, score));

    return {
      trustScore: finalScore,
      breakdown,
      lastCalculated: new Date()
    };
  }
}

module.exports = TrustScoreService;
