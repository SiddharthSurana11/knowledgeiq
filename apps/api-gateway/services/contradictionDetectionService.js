const { getDB } = require('../utils/mongoClient.js');
const { index } = require('../utils/pineconeClient.js');
const { getLLMResponse } = require('../utils/llmClient.js');

class ContradictionDetectionService {
  static async detectContradictions({ fullTextVector, chunks, filename, category, documentId }) {
    const db = getDB();
    const normalizedCategory = category.toLowerCase();

    // Default structure to return
    const defaultResponse = {
      contradictionStatus: 'NO_CONTRADICTION',
      contradictionCount: 0,
      contradictionConfidence: 0,
      contradictionDetails: [],
      lastContradictionScan: new Date()
    };

    if (!fullTextVector || fullTextVector.length === 0 || !chunks || chunks.length === 0) {
      return defaultResponse;
    }

    try {
      // ---- STEP 1: Topic Candidate Retrieval ----
      const pineconeResult = await index.query({
        vector: fullTextVector,
        topK: 30, // Get a larger candidate list to filter
        includeMetadata: true
      });

      const matches = pineconeResult.matches || [];
      const scoreMap = {};

      for (const m of matches) {
        const mFile = m.metadata?.filename;
        const mCat = m.metadata?.category;
        const mScore = m.score || 0;

        // Skip same file name (case-insensitive) or matches from other categories
        if (mFile && mFile.toLowerCase() !== filename.toLowerCase() && mCat === normalizedCategory) {
          scoreMap[mFile] = Math.max(scoreMap[mFile] || 0, mScore);
        }
      }

      // Sort candidate filenames by highest similarity score and select Top 10
      const candidateFilenames = Object.keys(scoreMap)
        .sort((a, b) => scoreMap[b] - scoreMap[a])
        .slice(0, 10);

      if (candidateFilenames.length === 0) {
        return defaultResponse;
      }

      // Resolve documentId from MongoDB documents collection for candidate files
      const candidateDocs = await db.collection('documents').find({
        filename: { $in: candidateFilenames },
        category: normalizedCategory
      }).toArray();

      const filenameToDocId = {};
      candidateDocs.forEach(d => {
        filenameToDocId[d.filename] = d.documentId;
      });

      // ---- STEP 2: Chunk Pair Extraction ----
      const chunkPairs = [];

      for (const chunk of chunks) {
        const chunkResult = await index.query({
          vector: chunk.vector,
          topK: 15,
          includeMetadata: true
        });

        const chunkMatches = chunkResult.matches || [];
        for (const m of chunkMatches) {
          const matchScore = m.score || 0;
          const matchFile = m.metadata?.filename;
          const matchText = m.metadata?.text;

          // Check if similarity is > 0.85, belongs to our candidates, and is not same file
          if (
            matchScore > 0.85 &&
            matchFile &&
            candidateFilenames.includes(matchFile) &&
            matchFile.toLowerCase() !== filename.toLowerCase() &&
            matchText
          ) {
            chunkPairs.push({
              uploadedChunkText: chunk.text,
              matchedChunkText: matchText,
              matchedFilename: matchFile,
              matchedCategory: m.metadata?.category || normalizedCategory,
              matchScore
            });
          }
        }
      }

      // Sort chunk pairs by similarity descending and cap at Top 10 to protect LLM rate limits
      const selectedPairs = chunkPairs
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, 10);

      if (selectedPairs.length === 0) {
        return defaultResponse;
      }

      // ---- STEP 3: LLM Verification ----
      const contradictionDetails = [];
      let overallStatus = 'NO_CONTRADICTION';
      let maxConfidence = 0.0;

      for (const pair of selectedPairs) {
        const prompt = `You are a strict data compliance auditor. Compare these two documentation excerpts to determine if they contain factual contradictions.
They discuss the same topic or policy but might state conflicting facts, numbers, dates, or rules.
- A CONTRADICTION is when one excerpt claims X and the other claims Y (where X and Y are mutually exclusive, e.g. "15 days" vs "18 days").
- A POSSIBLE_CONTRADICTION is when they present slightly conflicting information that might be resolved with context but is suspicious.
- NO_CONTRADICTION is when they state consistent facts, cover different aspects, or are identical.

Respond ONLY with a structured JSON object (no Markdown blocks, no explanatory text):
{
  "classification": "CONTRADICTION" | "POSSIBLE_CONTRADICTION" | "NO_CONTRADICTION",
  "confidence": <float score between 0.0 and 1.0>,
  "reason": "<one sentence explanation of why they contradict or are consistent>"
}`;

        const retrievedContent = [
          { text: pair.uploadedChunkText, filename: filename, category: normalizedCategory, score: 1.0 },
          { text: pair.matchedChunkText, filename: pair.matchedFilename, category: pair.matchedCategory, score: pair.matchScore }
        ];

        try {
          const llmResult = await getLLMResponse({
            user_query: prompt,
            retrieved_content: retrievedContent
          });

          // Extract JSON block from output
          const jsonMatch = (llmResult.answer || "").match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            const classification = parsed.classification;
            const confidence = parsed.confidence || 0.0;
            const reason = parsed.reason || 'Factual semantic contradiction.';

            if (classification === 'CONTRADICTION' || classification === 'POSSIBLE_CONTRADICTION') {
              // Update overall status severity
              if (classification === 'CONTRADICTION') {
                overallStatus = 'CONTRADICTION';
              } else if (classification === 'POSSIBLE_CONTRADICTION' && overallStatus !== 'CONTRADICTION') {
                overallStatus = 'POSSIBLE_CONTRADICTION';
              }

              maxConfidence = Math.max(maxConfidence, confidence);

              const relatedDocId = filenameToDocId[pair.matchedFilename] || null;

              const conflictDetail = {
                relatedDocumentId: relatedDocId,
                relatedFilename: pair.matchedFilename,
                confidence: roundScore(confidence, 2),
                reason: reason,
                chunkReference: `Uploaded Chunk: "${pair.uploadedChunkText.substring(0, 85)}..." vs Existing Chunk in ${pair.matchedFilename}: "${pair.matchedChunkText.substring(0, 85)}..."`,
                detectedAt: new Date(),
                status: 'pending_review'
              };

              contradictionDetails.push(conflictDetail);

              // Log contradiction event as required
              console.log(`[Contradiction Engine] documentId: ${documentId} | relatedDocumentId: ${relatedDocId} | classification: ${classification} | confidence: ${confidence}`);
            }
          }
        } catch (llmErr) {
          console.error('⚠️ Failed LLM contradiction verification for pair:', llmErr.message);
        }
      }

      return {
        contradictionStatus: overallStatus,
        contradictionCount: contradictionDetails.length,
        contradictionConfidence: roundScore(maxConfidence, 2),
        contradictionDetails,
        lastContradictionScan: new Date()
      };

    } catch (err) {
      console.error('❌ Failed contradiction check pipeline:', err.message);
      return defaultResponse;
    }
  }
}

function roundScore(value, decimals) {
  return Number(Math.round(value + 'e' + decimals) + 'e-' + decimals);
}

module.exports = ContradictionDetectionService;
