const rateLimit = require('express-rate-limit');

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    status: 'error',
    message: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip successful requests
  skipSuccessfulRequests: false
});

// Strict limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'development' ? 100 : 10, // 100 for dev, 10 for prod
  message: {
    status: 'error',
    message: 'Too many authentication attempts, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true // Don't count successful logins
});

// Limiter for document creation (prevent spam)
const createDocumentLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 documents per minute
  message: {
    status: 'error',
    message: 'Too many documents created, please slow down.'
  }
});

// Limiter for search operations
const searchLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 searches per minute
  message: {
    status: 'error',
    message: 'Too many search requests, please slow down.'
  }
});

// Socket.io connection limiter (per IP)
const socketLimiter = new Map();

const checkSocketLimit = (ip) => {
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  const maxConnections = 10;
  
  if (!socketLimiter.has(ip)) {
    socketLimiter.set(ip, []);
  }
  
  const connections = socketLimiter.get(ip);
  
  // Remove old connections outside the window
  const validConnections = connections.filter(time => now - time < windowMs);
  
  if (validConnections.length >= maxConnections) {
    return false;
  }
  
  validConnections.push(now);
  socketLimiter.set(ip, validConnections);
  return true;
};

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  const windowMs = 60 * 1000;
  
  for (const [ip, connections] of socketLimiter.entries()) {
    const validConnections = connections.filter(time => now - time < windowMs);
    if (validConnections.length === 0) {
      socketLimiter.delete(ip);
    } else {
      socketLimiter.set(ip, validConnections);
    }
  }
}, 5 * 60 * 1000); // Cleanup every 5 minutes

module.exports = {
  apiLimiter,
  authLimiter,
  createDocumentLimiter,
  searchLimiter,
  checkSocketLimit
};
