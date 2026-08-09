/**
 * bm25.js — Self-contained BM25 scoring for reranking a small candidate set.
 *
 * Scores each candidate document's text against a query string using the
 * Okapi BM25 formula.  Designed for ≤30 candidates (post-Pinecone ANN),
 * NOT for indexing an entire corpus.
 *
 * IDF is computed over the candidate set itself (local IDF), which is the
 * correct approach when reranking a pre-filtered result set.
 */

const STOPWORDS = new Set([
  'a','an','the','is','are','was','were','be','been','being',
  'have','has','had','do','does','did','will','would','shall','should',
  'may','might','must','can','could','of','in','to','for','with',
  'on','at','by','from','as','into','through','during','before',
  'after','above','below','between','out','off','over','under','again',
  'further','then','once','here','there','when','where','why','how',
  'all','each','every','both','few','more','most','other','some','such',
  'no','nor','not','only','own','same','so','than','too','very',
  'and','but','or','if','while','about','against','it','its','this',
  'that','these','those','i','me','my','we','our','you','your',
  'he','him','his','she','her','they','them','their','what','which','who'
]);

/**
 * Tokenize text into lowercased word tokens, stripping punctuation and stopwords.
 * @param {string} text
 * @returns {string[]}
 */
function tokenize(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOPWORDS.has(w));
}

/**
 * Score a list of candidate documents against a query using BM25.
 *
 * @param {string}   query      — The user query string.
 * @param {string[]} documents  — Array of candidate document texts.
 * @param {object}   [options]  — Optional BM25 parameters.
 * @param {number}   [options.k1=1.2]  — Term frequency saturation parameter.
 * @param {number}   [options.b=0.75]  — Length normalization parameter.
 * @returns {{ index: number, score: number }[]}  Sorted descending by score.
 */
function scoreBM25(query, documents, { k1 = 1.2, b = 0.75 } = {}) {
  const N = documents.length;
  if (N === 0) return [];

  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) {
    // No meaningful query tokens — return all with score 0
    return documents.map((_, i) => ({ index: i, score: 0 }));
  }

  // Tokenize all documents
  const docTokenArrays = documents.map(tokenize);

  // Average document length
  const avgDl = docTokenArrays.reduce((sum, tokens) => sum + tokens.length, 0) / N;

  // Document frequency for each query term (how many docs contain it)
  const df = {};
  for (const term of queryTokens) {
    if (df[term] !== undefined) continue;
    let count = 0;
    for (const tokens of docTokenArrays) {
      if (tokens.includes(term)) count++;
    }
    df[term] = count;
  }

  // IDF using the standard BM25 log formula
  const idf = {};
  for (const term of queryTokens) {
    // IDF = ln((N - df + 0.5) / (df + 0.5) + 1)
    idf[term] = Math.log((N - df[term] + 0.5) / (df[term] + 0.5) + 1);
  }

  // Score each document
  const scores = docTokenArrays.map((tokens, idx) => {
    const dl = tokens.length;
    let score = 0;

    // Build term frequency map for this doc
    const tf = {};
    for (const t of tokens) {
      tf[t] = (tf[t] || 0) + 1;
    }

    for (const term of queryTokens) {
      const termFreq = tf[term] || 0;
      if (termFreq === 0) continue;

      // BM25 TF component
      const tfNorm = (termFreq * (k1 + 1)) / (termFreq + k1 * (1 - b + b * (dl / avgDl)));
      score += idf[term] * tfNorm;
    }

    return { index: idx, score };
  });

  // Sort descending by score
  scores.sort((a, b) => b.score - a.score);
  return scores;
}

module.exports = { scoreBM25, tokenize };
