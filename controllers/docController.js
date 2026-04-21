const { Document, Version } = require('../models');
const { NotFoundError, ForbiddenError, BadRequestError } = require('../utils/errors');
const logger = require('../utils/logger');
const emailService = require('../utils/emailService');

/**
 * List user's documents
 */
exports.listDocuments = async (req, res, next) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      sortBy = 'lastModified', 
      order = 'desc',
      search = '',
      includeArchived = false,
      folder = null,
      tag = null
    } = req.query;

    // Build query
    const query = {
      owner: req.userId,
      isDeleted: false
    };

    if (!includeArchived) {
      query.isArchived = false;
    }

    if (folder) {
      query.folder = folder;
    }

    if (tag) {
      query.tags = tag;
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { content: { $regex: search, $options: 'i' } }
      ];
    }

    // Sort options
    const sortOrder = order === 'asc' ? 1 : -1;
    const sortOptions = { [sortBy]: sortOrder };

    // Pagination
    const skip = (page - 1) * limit;

    // Get documents
    const [documents, total] = await Promise.all([
      Document.find(query)
        .populate('lastModifiedBy', 'name email')
        .sort(sortOptions)
        .skip(skip)
        .limit(parseInt(limit)),
      Document.countDocuments(query)
    ]);

    // Get shared documents
    const sharedDocuments = await Document.find({
      'collaborators.user': req.userId,
      isDeleted: false
    })
      .populate('owner', 'name email avatar')
      .populate('lastModifiedBy', 'name email')
      .sort({ lastModified: -1 });

    res.json({
      status: 'success',
      data: {
        documents,
        sharedDocuments,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
          hasMore: skip + documents.length < total
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create new document
 */
exports.createDocument = async (req, res, next) => {
  try {
    const { title, content = '', isPublic = false, folder = null, tags = [] } = req.body;

    const document = await Document.create({
      title: title || 'Untitled Document',
      content,
      owner: req.userId,
      isPublic,
      folder,
      tags,
      lastModifiedBy: req.userId
    });

    // Create initial version
    await Version.createFromDocument(document, 'auto-save', 'Initial version');

    // Populate and return
    await document.populate('owner', 'name email avatar');

    logger.info(`Document created: ${document._id} by ${req.userId}`);

    res.status(201).json({
      status: 'success',
      message: 'Document created',
      data: { document }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get single document
 */
exports.getDocument = async (req, res, next) => {
  try {
    const { id } = req.params;

    let document;

    if (req.document) {
      // If middleware already fetched the document
      document = req.document;
      await document.populate('owner', 'name email avatar');
      await document.populate('collaborators.user', 'name email avatar');
      await document.populate('lastModifiedBy', 'name email');
    } else {
      // Fetch fresh document
      document = await Document.findOne({
        _id: id,
        isDeleted: false
      })
        .populate('owner', 'name email avatar')
        .populate('collaborators.user', 'name email avatar')
        .populate('lastModifiedBy', 'name email');

      if (!document) {
        throw new NotFoundError('Document not found');
      }

      // Check access
      const canAccess = document.canAccess(req.userId);
      if (!canAccess) {
        throw new ForbiddenError('Access denied');
      }
    }

    res.json({
      status: 'success',
      data: {
        document,
        access: document.canAccess(req.userId),
        canEdit: document.canEdit(req.userId),
        canComment: document.canComment(req.userId)
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update document
 */
exports.updateDocument = async (req, res, next) => {
  try {
    const { title, content, isPublic, folder, tags } = req.body;
    const document = req.document || await Document.findById(req.params.id);

    if (!document) {
      throw new NotFoundError('Document not found');
    }

    // Check edit permission
    if (!document.canEdit(req.userId)) {
      throw new ForbiddenError('Edit access required');
    }

    // Update fields
    if (title !== undefined) document.title = title;
    if (content !== undefined) document.content = content;
    if (isPublic !== undefined) document.isPublic = isPublic;
    if (folder !== undefined) document.folder = folder;
    if (tags !== undefined) document.tags = tags;

    document.lastModifiedBy = req.userId;

    await document.save();

    // Create version every 5 saves or on significant changes
    const shouldCreateVersion = document.version % 5 === 0 || req.body.createVersion;
    if (shouldCreateVersion) {
      await Version.createFromDocument(document, 'auto-save');
    }

    // Notify collaborators via socket.io
    const io = req.app.get('io');
    io.to(document._id.toString()).emit('document-updated', {
      documentId: document._id,
      updatedBy: req.userId,
      version: document.version
    });

    res.json({
      status: 'success',
      message: 'Document updated',
      data: { document }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete document (soft delete)
 */
exports.deleteDocument = async (req, res, next) => {
  try {
    const document = req.document || await Document.findById(req.params.id);

    if (!document) {
      throw new NotFoundError('Document not found');
    }

    // Only owner can delete
    if (document.owner.toString() !== req.userId.toString()) {
      throw new ForbiddenError('Only owner can delete this document');
    }

    await document.softDelete();

    logger.info(`Document deleted: ${document._id}`);

    res.json({
      status: 'success',
      message: 'Document moved to trash'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Restore document from trash
 */
exports.restoreDocument = async (req, res, next) => {
  try {
    const document = await Document.findOne({
      _id: req.params.id,
      owner: req.userId,
      isDeleted: true
    });

    if (!document) {
      throw new NotFoundError('Document not found in trash');
    }

    await document.restore();

    res.json({
      status: 'success',
      message: 'Document restored',
      data: { document }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Permanently delete document
 */
exports.permanentDelete = async (req, res, next) => {
  try {
    const document = await Document.findOne({
      _id: req.params.id,
      owner: req.userId,
      isDeleted: true
    });

    if (!document) {
      throw new NotFoundError('Document not found in trash');
    }

    // Delete all versions first
    await Version.deleteMany({ document: document._id });

    // Permanently delete document
    await Document.findByIdAndDelete(document._id);

    res.json({
      status: 'success',
      message: 'Document permanently deleted'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Share document
 */
exports.shareDocument = async (req, res, next) => {
  try {
    const { email, permission } = req.body;
    const document = req.document;

    // Only owner can share
    if (document.owner.toString() !== req.userId.toString()) {
      throw new ForbiddenError('Only owner can share this document');
    }

    // Find user by email (case-insensitive, trimmed)
    const { User, PendingShare } = require('../models');
    const cleanEmail = email.toLowerCase().trim();
    const userToShare = await User.findOne({ email: cleanEmail });

    // Check if already shared
    const alreadyCollaborator = document.collaborators.some(
      c => c.user?.toString() === userToShare?._id?.toString()
    );
    
    if (alreadyCollaborator) {
      throw new BadRequestError('Document already shared with this user');
    }

    if (!userToShare) {
      // User not registered - create pending share
      const existingPending = await PendingShare.findOne({
        email: cleanEmail,
        document: document._id,
        status: 'pending'
      });

      if (existingPending) {
        throw new BadRequestError('Invitation already sent to this email');
      }

      const pendingShare = await PendingShare.create({
        email: cleanEmail,
        document: document._id,
        permission,
        invitedBy: req.userId
      });

      logger.info(`Pending share created for ${email} on document ${document._id}`);

      // Send invitation email
      const currentUser = await User.findById(req.userId);
      await emailService.sendInvitation(cleanEmail, document.title, currentUser?.name || 'Someone');

      res.json({
        status: 'success',
        message: 'Invitation sent! User will get access when they register.',
        data: {
          pendingShare: {
            email: pendingShare.email,
            permission: pendingShare.permission,
            invitedAt: pendingShare.invitedAt,
            expiresAt: pendingShare.expiresAt
          }
        }
      });
      return;
    }

    // Can't share with owner
    if (userToShare._id.toString() === req.userId.toString()) {
      throw new BadRequestError('Cannot share with yourself');
    }

    // Add collaborator
    await document.addCollaborator(userToShare._id, permission, req.userId);

    // Send notification email to existing user
    const currentUser = await User.findById(req.userId);
    await emailService.sendShareNotification(
      userToShare.email, 
      document.title, 
      currentUser?.name || 'Someone', 
      permission
    );

    // Add to user's shared documents
    const alreadyShared = userToShare.sharedDocuments.some(
      sd => sd.document?.toString() === document._id.toString()
    );

    if (!alreadyShared) {
      userToShare.sharedDocuments.push({
        document: document._id,
        permission
      });
      await userToShare.save();
    }

    // Reload document with populated collaborators
    const updatedDoc = await Document.findById(document._id)
      .populate('collaborators.user', 'name email avatar');

    logger.info(`Document ${document._id} shared with ${email}`);

    res.json({
      status: 'success',
      message: 'Document shared successfully',
      data: {
        sharedWith: {
          user: {
            id: userToShare._id,
            name: userToShare.name,
            email: userToShare.email,
            avatar: userToShare.avatar
          },
          permission
        },
        document: updatedDoc
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Remove collaborator
 */
exports.removeCollaborator = async (req, res, next) => {
  try {
    const { userId } = req.body;
    const document = req.document;

    // Only owner can remove collaborators
    if (document.owner.toString() !== req.userId.toString()) {
      throw new ForbiddenError('Only owner can remove collaborators');
    }

    await document.removeCollaborator(userId);

    // Remove from user's shared documents
    const { User } = require('../models');
    await User.findByIdAndUpdate(userId, {
      $pull: { sharedDocuments: { document: document._id } }
    });

    res.json({
      status: 'success',
      message: 'Collaborator removed'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update collaborator permission
 */
exports.updateCollaboratorPermission = async (req, res, next) => {
  try {
    const { userId, permission } = req.body;
    const document = req.document;

    // Only owner can change permissions
    if (document.owner.toString() !== req.userId.toString()) {
      throw new ForbiddenError('Only owner can change permissions');
    }

    await document.addCollaborator(userId, permission, req.userId);

    res.json({
      status: 'success',
      message: 'Permission updated'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Toggle public access
 */
exports.togglePublicAccess = async (req, res, next) => {
  try {
    const { isPublic, publicAccess } = req.body;
    const document = req.document;

    // Only owner can change public access
    if (document.owner.toString() !== req.userId.toString()) {
      throw new ForbiddenError('Only owner can change public access');
    }

    document.isPublic = isPublic;
    if (publicAccess) {
      document.publicAccess = publicAccess;
    }

    await document.save();

    res.json({
      status: 'success',
      message: isPublic ? 'Document is now public' : 'Document is now private',
      data: {
        isPublic: document.isPublic,
        shareId: document.shareId,
        publicAccess: document.publicAccess
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Archive/unarchive document
 */
exports.toggleArchive = async (req, res, next) => {
  try {
    const document = req.document;

    // Only owner can archive
    if (document.owner.toString() !== req.userId.toString()) {
      throw new ForbiddenError('Only owner can archive this document');
    }

    document.isArchived = !document.isArchived;
    await document.save();

    res.json({
      status: 'success',
      message: document.isArchived ? 'Document archived' : 'Document unarchived',
      data: { isArchived: document.isArchived }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get document by share ID (public access)
 */
exports.getPublicDocument = async (req, res, next) => {
  try {
    const { shareId } = req.params;

    const document = await Document.findByShareId(shareId);

    if (!document) {
      throw new NotFoundError('Document not found');
    }

    // Check public access level
    if (document.publicAccess === 'none') {
      throw new ForbiddenError('This document is not publicly accessible');
    }

    await document.populate('owner', 'name email avatar');

    res.json({
      status: 'success',
      data: {
        document: {
          _id: document._id,
          title: document.title,
          content: document.content,
          owner: document.owner,
          lastModified: document.lastModified,
          wordCount: document.wordCount,
          version: document.version
        },
        publicAccess: document.publicAccess,
        canEdit: document.publicAccess === 'edit'
      }
    });
  } catch (error) {
    next(error);
  }
};
