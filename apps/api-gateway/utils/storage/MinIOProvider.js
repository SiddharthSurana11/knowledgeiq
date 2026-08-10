const { Client } = require('minio');
const StorageProvider = require('./StorageProvider');
require('dotenv').config();

/**
 * MinIOProvider — Concrete S3-compatible storage provider backed by MinIO.
 *
 * Configuration is read exclusively from environment variables.
 * To switch to AWS S3 or Cloudflare R2, add a new provider file
 * and update STORAGE_PROVIDER in .env — no upload logic needs to change.
 */
class MinIOProvider extends StorageProvider {
  constructor() {
    super();
    this._bucket = process.env.MINIO_BUCKET;
    const rawEndpoint = process.env.MINIO_ENDPOINT || 'localhost';
    const hasPort = rawEndpoint.includes(':');
    const endpointHost = hasPort ? rawEndpoint.split(':')[0] : rawEndpoint;
    const endpointPort = hasPort ? parseInt(rawEndpoint.split(':')[1], 10) : parseInt(process.env.MINIO_PORT || '9000', 10);

    this._client = new Client({
      endPoint:  endpointHost,
      port:      endpointPort,
      useSSL:    process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
      secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
    });
  }

  /**
   * Called once at application startup.
   * Verifies connectivity and ensures the bucket exists.
   * Upload operations assume the bucket is already present.
   */
  async init() {
    try {
      const exists = await this._client.bucketExists(this._bucket);
      if (!exists) {
        await this._client.makeBucket(this._bucket);
        console.log(`[MinIOProvider] Bucket "${this._bucket}" created.`);
      } else {
        console.log(`[MinIOProvider] Bucket "${this._bucket}" verified.`);
      }
    } catch (err) {
      console.warn(`[MinIOProvider] MinIO initialization skipped (${err.message}) — upload operations will require MinIO connection.`);
    }
  }

  /**
   * Upload a file to MinIO.
   * Storage key is prefixed by category for logical organisation.
   *
   * @param {Object} params
   * @param {Buffer}  params.buffer
   * @param {string}  params.filename
   * @param {string}  params.mimetype
   * @param {string}  params.category
   * @returns {Promise<{storageKey: string, bucket: string, provider: string}>}
   */
  async upload({ buffer, filename, mimetype, category }) {
    const timestamp = Date.now();
    const storageKey = `${category}/${timestamp}_${filename}`;
    const metadata = { 'Content-Type': mimetype };

    await this._client.putObject(this._bucket, storageKey, buffer, buffer.length, metadata);

    return {
      storageKey,
      bucket: this._bucket,
      provider: 'minio',
    };
  }

  /**
   * Download a file from MinIO and return it as a Buffer.
   *
   * @param {string} storageKey
   * @returns {Promise<Buffer>}
   */
  async download(storageKey) {
    const stream = await this._client.getObject(this._bucket, storageKey);
    return new Promise((resolve, reject) => {
      const chunks = [];
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }

  /**
   * Delete a file from MinIO.
   *
   * @param {string} storageKey
   * @returns {Promise<void>}
   */
  async delete(storageKey) {
    await this._client.removeObject(this._bucket, storageKey);
  }
}

module.exports = MinIOProvider;
