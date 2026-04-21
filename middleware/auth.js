const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { UnauthorizedError, ForbiddenError, NotFoundError } = require('../utils/errors');

/**
 * Verify JWT token and attach user to request
 */
const authenticate = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Access token is required');
    }
    
    const token = authHeader.split(' ')[1];
    
    if (!token) {
      throw new UnauthorizedError('Access token is required');
    }
    
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if user still exists
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      throw new UnauthorizedError('User no longer exists');
    }
    
    // Check if user is active
    if (!user.isActive) {
      throw new UnauthorizedError('Account has been deactivated');
    }
    
    // Check if user changed password after token was issued
    if (user.changedPasswordAfter(decoded.iat)) {
      throw new UnauthorizedError('Password recently changed. Please log in again.');
    }
    
    // Attach user to request
    req.user = user;
    req.userId = user._id;
    req.token = token;
    
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return next(new UnauthorizedError('Invalid token'));
    }
    if (error.name === 'TokenExpiredError') {
      return next(new UnauthorizedError('Token has expired'));
    }
    next(error);
  }
};

/**
 * Optional authentication - doesn't fail if no token provided
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }
    
    const token = authHeader.split(' ')[1];
    
    if (!token) {
      return next();
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    
    if (user && user.isActive) {
      req.user = user;
      req.userId = user._id;
    }
    
    next();
  } catch (error) {
    // Don't fail on optional auth errors
    next();
  }
};

/**
 * Check if user has admin role
 */
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return next(new ForbiddenError('Admin access required'));
  }
  next();
};

/**
 * Check document access permissions
 */
const checkDocumentAccess = (permission = 'read') => {
  return async (req, res, next) => {
    try {
      const { Document } = require('../models');
      const documentId = req.params.id;
      
      // Find document including soft-deleted ones for better error messages
      const document = await Document.findOne({ 
        _id: documentId,
        isDeleted: false 
      });
      
      if (!document) {
        // Check if document exists but is deleted
        const deletedDoc = await Document.findOne({
          _id: documentId,
          isDeleted: true
        });
        
        if (deletedDoc) {
          return next(new NotFoundError('Document has been moved to trash'));
        }
        
        return next(new NotFoundError('Document not found'));
      }
      
      // If no user is authenticated, check if document is public
      if (!req.user) {
        if (document.isPublic && document.publicAccess !== 'none') {
          if (permission === 'write' && document.publicAccess !== 'edit') {
            return next(new ForbiddenError('Edit access required'));
          }
          req.document = document;
          return next();
        }
        return next(new UnauthorizedError('Authentication required'));
      }
      
      const userAccess = document.canAccess(req.userId);
      
      if (!userAccess) {
        return next(new ForbiddenError('Access denied'));
      }
      
      // Check specific permission requirements
      if (permission === 'write' && !document.canEdit(req.userId)) {
        return next(new ForbiddenError('Edit access required'));
      }
      
      if (permission === 'comment' && !document.canComment(req.userId)) {
        return next(new ForbiddenError('Comment access required'));
      }
      
      if (permission === 'owner' && userAccess !== 'owner') {
        return next(new ForbiddenError('Owner access required'));
      }
      
      req.document = document;
      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Generate JWT tokens
 */
const generateTokens = (userId) => {
  const accessToken = jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
  
  const refreshToken = jwt.sign(
    { userId, type: 'refresh' },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }
  );
  
  return { accessToken, refreshToken };
};

/**
 * Verify refresh token
 */
const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  } catch (error) {
    throw new UnauthorizedError('Invalid refresh token');
  }
};

module.exports = {
  authenticate,
  optionalAuth,
  requireAdmin,
  checkDocumentAccess,
  generateTokens,
  verifyRefreshToken
};
