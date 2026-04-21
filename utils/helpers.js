const crypto = require('crypto');

/**
 * Generate a random string
 * @param {number} length - Length of the string
 * @returns {string}
 */
const generateRandomString = (length = 32) => {
  return crypto.randomBytes(length).toString('hex');
};

/**
 * Generate a unique document ID (shorter for sharing)
 * @returns {string}
 */
const generateShareId = () => {
  return crypto.randomBytes(6).toString('base64url');
};

/**
 * Sanitize HTML content (basic sanitization)
 * @param {string} html
 * @returns {string}
 */
const sanitizeHtml = (html) => {
  if (!html) return '';
  
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '');
};

/**
 * Truncate text to specified length
 * @param {string} text
 * @param {number} length
 * @returns {string}
 */
const truncateText = (text, length = 100) => {
  if (!text || text.length <= length) return text;
  return text.substring(0, length).trim() + '...';
};

/**
 * Extract plain text from HTML
 * @param {string} html
 * @returns {string}
 */
const extractTextFromHtml = (html) => {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
};

/**
 * Format date to readable string
 * @param {Date} date
 * @returns {string}
 */
const formatDate = (date) => {
  if (!date) return '';
  return new Date(date).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

/**
 * Calculate reading time
 * @param {string} content
 * @returns {number} - Minutes to read
 */
const calculateReadingTime = (content) => {
  const text = extractTextFromHtml(content);
  const wordsPerMinute = 200;
  const words = text.split(/\s+/).length;
  return Math.ceil(words / wordsPerMinute);
};

/**
 * Deep clone an object
 * @param {object} obj
 * @returns {object}
 */
const deepClone = (obj) => {
  return JSON.parse(JSON.stringify(obj));
};

/**
 * Pick specific keys from an object
 * @param {object} obj
 * @param {string[]} keys
 * @returns {object}
 */
const pick = (obj, keys) => {
  return keys.reduce((acc, key) => {
    if (obj.hasOwnProperty(key)) {
      acc[key] = obj[key];
    }
    return acc;
  }, {});
};

/**
 * Omit specific keys from an object
 * @param {object} obj
 * @param {string[]} keys
 * @returns {object}
 */
const omit = (obj, keys) => {
  const result = { ...obj };
  keys.forEach(key => delete result[key]);
  return result;
};

/**
 * Debounce function
 * @param {Function} func
 * @param {number} wait
 * @returns {Function}
 */
const debounce = (func, wait = 300) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

/**
 * Generate a color for user avatar based on name
 * @param {string} name
 * @returns {string}
 */
const generateUserColor = (name) => {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
    '#F8C471', '#82E0AA', '#F1948A', '#85C1E9', '#F7DC6F'
  ];
  
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  return colors[Math.abs(hash) % colors.length];
};

module.exports = {
  generateRandomString,
  generateShareId,
  sanitizeHtml,
  truncateText,
  extractTextFromHtml,
  formatDate,
  calculateReadingTime,
  deepClone,
  pick,
  omit,
  debounce,
  generateUserColor
};
