require('dotenv').config();
const { MongoClient } = require('mongodb');
const { Minio } = require('minio');
const { Pinecone } = require('@pinecone-database/pinecone');

async function testConnections() {
    console.log("Starting connection tests...");

    // Test MongoDB
    try {
        console.log("Testing MongoDB...");
        const client = new MongoClient(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 5000
        });
        await client.connect();
        await client.db(process.env.MONGODB_DB).command({ ping: 1 });
        console.log("✅ MongoDB Connection Successful");
        await client.close();
    } catch (e) {
        console.error("❌ MongoDB Connection Failed:", e.message);
    }

    // Test MinIO
    try {
        console.log("Testing MinIO...");
        const minioClient = new Minio.Client({
            endPoint: process.env.MINIO_ENDPOINT || 'localhost',
            port: parseInt(process.env.MINIO_PORT || '9000'),
            useSSL: process.env.MINIO_USE_SSL === 'true',
            accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
            secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin'
        });
        
        const buckets = await minioClient.listBuckets();
        console.log("✅ MinIO Connection Successful. Buckets:", buckets.map(b => b.name).join(', '));
    } catch (e) {
        console.error("❌ MinIO Connection Failed:", e.message);
    }

    // Test Pinecone
    try {
        console.log("Testing Pinecone...");
        const pinecone = new Pinecone({
            apiKey: process.env.PINECONE_API_KEY
        });
        const indexes = await pinecone.listIndexes();
        console.log("✅ Pinecone Connection Successful. Indexes:", indexes.indexes.map(i => i.name).join(', '));
    } catch (e) {
        console.error("❌ Pinecone Connection Failed:", e.message);
    }
}

testConnections();
