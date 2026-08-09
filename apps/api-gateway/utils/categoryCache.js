const { connectToDB } = require('./mongoClient');

let categoriesCache = null;
let lastCacheTime = 0;
const CACHE_TTL = 30000; // 30 seconds

async function getCachedCategories() {
  const now = Date.now();
  if (!categoriesCache || (now - lastCacheTime) > CACHE_TTL) {
    const db = await connectToDB();
    categoriesCache = await db.collection('categories').find({}).toArray();
    lastCacheTime = now;
  }
  return categoriesCache;
}

module.exports = {
  getCachedCategories
};
