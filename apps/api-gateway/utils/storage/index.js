/**
 * Storage Factory — resolves the active StorageProvider from STORAGE_PROVIDER env var.
 *
 * Usage (anywhere in the application):
 *   const storage = require('./utils/storage');
 *   await storage.upload({ buffer, filename, mimetype, category });
 *
 * To add a new provider in the future:
 *   1. Create utils/storage/S3Provider.js extending StorageProvider
 *   2. Add a case here
 *   3. Set STORAGE_PROVIDER=s3 in .env
 *   No other code changes are required.
 */
require('dotenv').config();

const STORAGE_PROVIDER = (process.env.STORAGE_PROVIDER || 'minio').toLowerCase();

let instance = null;

function getProvider() {
  if (instance) return instance;

  switch (STORAGE_PROVIDER) {
    case 'minio':
      const MinIOProvider = require('./MinIOProvider');
      instance = new MinIOProvider();
      break;
    // case 's3':
    //   const S3Provider = require('./S3Provider');
    //   instance = new S3Provider();
    //   break;
    default:
      throw new Error(`Unsupported STORAGE_PROVIDER: "${STORAGE_PROVIDER}". Valid options: minio`);
  }

  return instance;
}

module.exports = getProvider();
