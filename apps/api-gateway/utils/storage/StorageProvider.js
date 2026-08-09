/**
 * StorageProvider — Abstract base class for all object storage providers.
 *
 * All concrete providers (MinIO, S3, R2, Azure Blob, GCS) must extend this class
 * and implement the three methods below.
 *
 * No upload, download, or delete logic in the application should ever reference
 * a concrete provider directly. All calls go through this interface.
 */
class StorageProvider {
  /**
   * Initialize the provider and ensure the configured bucket/container exists.
   * Called once during application startup — NOT on each upload.
   *
   * @returns {Promise<void>}
   */
  async init() {
    throw new Error('StorageProvider.init() must be implemented by a concrete provider.');
  }

  /**
   * Upload a file to object storage.
   *
   * @param {Object} params
   * @param {Buffer}  params.buffer       - Raw file bytes
   * @param {string}  params.filename     - Original file name (used to derive the storage key)
   * @param {string}  params.mimetype     - MIME type of the file
   * @param {string}  params.category     - Logical category (used as a key prefix)
   * @returns {Promise<{storageKey: string, bucket: string, provider: string}>}
   */
  async upload({ buffer, filename, mimetype, category }) {
    throw new Error('StorageProvider.upload() must be implemented by a concrete provider.');
  }

  /**
   * Download a file from object storage.
   *
   * @param {string} storageKey - The key returned by upload()
   * @returns {Promise<Buffer>}
   */
  async download(storageKey) {
    throw new Error('StorageProvider.download() must be implemented by a concrete provider.');
  }

  /**
   * Delete a file from object storage.
   *
   * @param {string} storageKey - The key returned by upload()
   * @returns {Promise<void>}
   */
  async delete(storageKey) {
    throw new Error('StorageProvider.delete() must be implemented by a concrete provider.');
  }
}

module.exports = StorageProvider;
