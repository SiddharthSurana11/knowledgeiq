const { MongoClient } = require('mongodb');
require('dotenv').config();

let client = null;
let db = null;

async function connectToDB(retries = 5, delayMs = 3000) {
  if (!client) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('❌ MONGODB_URI not set!');
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        client = new MongoClient(uri);
        await client.connect();
        const dbName = process.env.MONGODB_DB || process.env.MONGO_DB_NAME;
        if (!dbName) throw new Error('❌ MongoDB database name not set!');
        db = client.db(dbName);
        console.log('✅ Connected to MongoDB');
        return db;
      } catch (err) {
        console.error(`❌ MongoDB connection attempt ${attempt} failed:`, err.message);
        if (attempt === retries) {
          throw new Error('Failed to connect to MongoDB after multiple attempts');
        }
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
  return db;
}

function getDB() {
  if (!db) throw new Error('❌ MongoDB not connected! Call connectToDB() first.');
  return db;
}

module.exports = { connectToDB, getDB };
