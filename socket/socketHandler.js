const jwt = require('jsonwebtoken');
const { User, Document } = require('../models');
const logger = require('../utils/logger');
const { checkSocketLimit } = require('../middleware/rateLimiter');

// Store active connections per document
const activeDocuments = new Map(); // docId -> Set of socket IDs
const userSockets = new Map(); // socketId -> { userId, docId }

module.exports = (io) => {
  // Authentication middleware for socket.io
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.query.token;
      
      if (!token) {
        return next(new Error('Authentication required'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId);

      if (!user || !user.isActive) {
        return next(new Error('User not found or inactive'));
      }

      socket.userId = user._id.toString();
      socket.userName = user.name;
      socket.userEmail = user.email;
      socket.userColor = user.color || '#4ECDC4';
      
      next();
    } catch (error) {
      logger.error('Socket authentication failed:', error.message);
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    const clientIp = socket.handshake.address;
    
    // Rate limiting check
    if (!checkSocketLimit(clientIp)) {
      socket.emit('error', { message: 'Too many connections' });
      socket.disconnect();
      return;
    }

    logger.info(`User connected: ${socket.userName} (${socket.userId})`);

    // Join document room
    socket.on('join-document', async (docId) => {
      try {
        // Check document access
        const document = await Document.findById(docId);
        
        if (!document) {
          socket.emit('error', { message: 'Document not found' });
          return;
        }

        const canAccess = document.canAccess(socket.userId);
        if (!canAccess) {
          socket.emit('error', { message: 'Access denied' });
          return;
        }

        // Leave previous document if any
        if (socket.currentDocId) {
          socket.leave(socket.currentDocId);
          removeFromActive(socket.currentDocId, socket.id);
          socket.to(socket.currentDocId).emit('user-left', {
            userId: socket.userId,
            userName: socket.userName
          });
        }

        // Join new document
        socket.join(docId);
        socket.currentDocId = docId;

        // Track active users
        addToActive(docId, {
          socketId: socket.id,
          userId: socket.userId,
          userName: socket.userName,
          userColor: socket.userColor
        });

        // Notify other users
        socket.to(docId).emit('user-joined', {
          userId: socket.userId,
          userName: socket.userName,
          userColor: socket.userColor
        });

        // Send current active users to the joining user
        const activeUsers = getActiveUsers(docId);
        socket.emit('active-users', activeUsers);

        // Send document data
        socket.emit('document-joined', {
          docId,
          access: canAccess,
          canEdit: document.canEdit(socket.userId)
        });

        logger.debug(`${socket.userName} joined document ${docId}`);
      } catch (error) {
        logger.error('Join document error:', error);
        socket.emit('error', { message: 'Failed to join document' });
      }
    });

    // Leave document
    socket.on('leave-document', (docId) => {
      if (docId && socket.currentDocId === docId) {
        socket.leave(docId);
        removeFromActive(docId, socket.id);
        socket.to(docId).emit('user-left', {
          userId: socket.userId,
          userName: socket.userName
        });
        socket.currentDocId = null;
        logger.debug(`${socket.userName} left document ${docId}`);
      }
    });

    // Handle document changes
    socket.on('document-change', async (data) => {
      try {
        const { docId, changes, version } = data;
        
        if (!socket.currentDocId || socket.currentDocId !== docId) {
          return;
        }

        // Verify edit permissions
        const document = await Document.findById(docId);
        if (!document || !document.canEdit(socket.userId)) {
          socket.emit('error', { message: 'Edit permission required' });
          return;
        }

        // Broadcast changes to other users in the same document
        socket.to(docId).emit('receive-changes', {
          userId: socket.userId,
          userName: socket.userName,
          changes,
          version,
          timestamp: Date.now()
        });
      } catch (error) {
        logger.error('Document change error:', error);
      }
    });

    // Handle cursor position updates
    socket.on('cursor-move', (data) => {
      const { docId, position, selection } = data;
      
      if (socket.currentDocId !== docId) return;

      socket.to(docId).emit('cursor-update', {
        userId: socket.userId,
        userName: socket.userName,
        userColor: socket.userColor,
        position,
        selection
      });
    });

    // Handle user typing indicator
    socket.on('typing', (data) => {
      const { docId, isTyping } = data;
      
      if (socket.currentDocId !== docId) return;

      socket.to(docId).emit('user-typing', {
        userId: socket.userId,
        userName: socket.userName,
        isTyping
      });
    });

    // Handle title changes
    socket.on('title-change', async (data) => {
      try {
        const { docId, title } = data;
        
        if (!socket.currentDocId || socket.currentDocId !== docId) return;

        const document = await Document.findById(docId);
        if (!document || !document.canEdit(socket.userId)) return;

        socket.to(docId).emit('title-updated', { title });
      } catch (error) {
        logger.error('Title change error:', error);
      }
    });

    // Handle save request from client
    socket.on('request-save', async (data) => {
      try {
        const { docId, content } = data;
        
        if (!socket.currentDocId || socket.currentDocId !== docId) return;

        const document = await Document.findById(docId);
        if (!document || !document.canEdit(socket.userId)) {
          socket.emit('save-error', { message: 'Permission denied' });
          return;
        }

        // Update document
        document.content = content;
        document.lastModifiedBy = socket.userId;
        await document.save();

        // Notify all users in document
        io.to(docId).emit('document-saved', {
          version: document.version,
          lastModified: document.lastModified,
          savedBy: socket.userName
        });
      } catch (error) {
        logger.error('Save error:', error);
        socket.emit('save-error', { message: 'Save failed' });
      }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      if (socket.currentDocId) {
        removeFromActive(socket.currentDocId, socket.id);
        socket.to(socket.currentDocId).emit('user-left', {
          userId: socket.userId,
          userName: socket.userName
        });
      }
      logger.info(`User disconnected: ${socket.userName}`);
    });
  });
};

// Helper functions for tracking active users
function addToActive(docId, userInfo) {
  if (!activeDocuments.has(docId)) {
    activeDocuments.set(docId, new Map());
  }
  activeDocuments.get(docId).set(userInfo.socketId, userInfo);
}

function removeFromActive(docId, socketId) {
  if (activeDocuments.has(docId)) {
    activeDocuments.get(docId).delete(socketId);
    if (activeDocuments.get(docId).size === 0) {
      activeDocuments.delete(docId);
    }
  }
}

function getActiveUsers(docId) {
  if (!activeDocuments.has(docId)) return [];
  return Array.from(activeDocuments.get(docId).values());
}
