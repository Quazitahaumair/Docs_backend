/**
 * File Storage Service
 * Supports AWS S3, Cloudinary, or local storage
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

class FileStorageService {
  constructor() {
    this.provider = process.env.STORAGE_PROVIDER || 'local'; // 'local', 's3', 'cloudinary'
  }

  /**
   * Upload file
   * @param {Object} file - Multer file object
   * @param {string} folder - Folder/category
   * @returns {Promise<Object>} - File URL and metadata
   */
  async upload(file, folder = 'uploads') {
    switch (this.provider) {
      case 's3':
        return this.uploadToS3(file, folder);
      case 'cloudinary':
        return this.uploadToCloudinary(file, folder);
      case 'local':
      default:
        return this.uploadLocal(file, folder);
    }
  }

  /**
   * Delete file
   * @param {string} fileUrl - File URL or key
   */
  async delete(fileUrl) {
    switch (this.provider) {
      case 's3':
        return this.deleteFromS3(fileUrl);
      case 'cloudinary':
        return this.deleteFromCloudinary(fileUrl);
      case 'local':
      default:
        return this.deleteLocal(fileUrl);
    }
  }

  // Local storage implementation
  uploadLocal(file, folder) {
    const uploadDir = path.join(__dirname, '..', 'uploads', folder);
    
    // Ensure directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const filename = `${uuidv4()}${path.extname(file.originalname)}`;
    const filePath = path.join(uploadDir, filename);
    
    // Move file from temp to uploads
    fs.renameSync(file.path, filePath);

    const fileUrl = `/uploads/${folder}/${filename}`;

    return {
      url: fileUrl,
      key: filename,
      size: file.size,
      mimetype: file.mimetype,
      originalName: file.originalname
    };
  }

  deleteLocal(fileUrl) {
    const filePath = path.join(__dirname, '..', fileUrl.replace(/^\//, ''));
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return { success: true };
  }

  // AWS S3 implementation (placeholder)
  async uploadToS3(file, folder) {
    // const AWS = require('aws-sdk');
    // const s3 = new AWS.S3();
    // Implementation here
    
    logger.info('S3 upload would happen here');
    return this.uploadLocal(file, folder); // Fallback to local
  }

  async deleteFromS3(fileUrl) {
    logger.info('S3 delete would happen here');
    return { success: true };
  }

  // Cloudinary implementation (placeholder)
  async uploadToCloudinary(file, folder) {
    // const cloudinary = require('cloudinary').v2;
    // Implementation here
    
    logger.info('Cloudinary upload would happen here');
    return this.uploadLocal(file, folder); // Fallback to local
  }

  async deleteFromCloudinary(fileUrl) {
    logger.info('Cloudinary delete would happen here');
    return { success: true };
  }
}

module.exports = new FileStorageService();
