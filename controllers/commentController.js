const { Comment, Document } = require('../models');
const { NotFoundError, ForbiddenError, BadRequestError } = require('../utils/errors');

/**
 * Get comments for a document
 */
exports.getComments = async (req, res, next) => {
  try {
    const { documentId } = req.params;
    const { includeResolved = false, parentId = null } = req.query;

    // Check document access
    const document = await Document.findById(documentId);
    if (!document) {
      throw new NotFoundError('Document not found');
    }

    if (!document.canAccess(req.userId)) {
      throw new ForbiddenError('Access denied');
    }

    const comments = await Comment.getDocumentComments(documentId, {
      includeResolved: includeResolved === 'true',
      parentOnly: !parentId
    });

    res.json({
      status: 'success',
      data: { comments }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a comment
 */
exports.createComment = async (req, res, next) => {
  try {
    const { documentId } = req.params;
    const { content, position, parentComment } = req.body;

    // Check document comment access
    const document = await Document.findById(documentId);
    if (!document) {
      throw new NotFoundError('Document not found');
    }

    if (!document.canComment(req.userId)) {
      throw new ForbiddenError('Comment access required');
    }

    const comment = await Comment.create({
      document: documentId,
      content,
      author: req.userId,
      position,
      parentComment
    });

    await comment.populate('author', 'name email avatar');

    // Notify via socket.io
    const io = req.app.get('io');
    io.to(documentId).emit('new-comment', {
      comment: {
        _id: comment._id,
        content: comment.content,
        author: comment.author,
        position: comment.position,
        createdAt: comment.createdAt
      }
    });

    res.status(201).json({
      status: 'success',
      message: 'Comment added',
      data: { comment }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update a comment
 */
exports.updateComment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { content } = req.body;

    const comment = await Comment.findById(id);

    if (!comment) {
      throw new NotFoundError('Comment not found');
    }

    // Only author can update
    if (comment.author.toString() !== req.userId.toString()) {
      throw new ForbiddenError('Only author can update this comment');
    }

    comment.content = content;
    await comment.save();

    await comment.populate('author', 'name email avatar');

    res.json({
      status: 'success',
      message: 'Comment updated',
      data: { comment }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a comment
 */
exports.deleteComment = async (req, res, next) => {
  try {
    const { id } = req.params;

    const comment = await Comment.findById(id);

    if (!comment) {
      throw new NotFoundError('Comment not found');
    }

    // Check permissions - author or document owner
    const document = await Document.findById(comment.document);
    const canDelete = comment.author.toString() === req.userId.toString() ||
                      document.owner.toString() === req.userId.toString();

    if (!canDelete) {
      throw new ForbiddenError('Permission denied');
    }

    await Comment.findByIdAndDelete(id);

    // Notify via socket.io
    const io = req.app.get('io');
    io.to(comment.document.toString()).emit('comment-deleted', { commentId: id });

    res.json({
      status: 'success',
      message: 'Comment deleted'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Resolve a comment
 */
exports.resolveComment = async (req, res, next) => {
  try {
    const { id } = req.params;

    const comment = await Comment.findById(id);

    if (!comment) {
      throw new NotFoundError('Comment not found');
    }

    // Check document access
    const document = await Document.findById(comment.document);
    if (!document.canAccess(req.userId)) {
      throw new ForbiddenError('Access denied');
    }

    await comment.resolve(req.userId);
    await comment.populate('resolvedBy', 'name email');

    res.json({
      status: 'success',
      message: 'Comment resolved',
      data: { comment }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Unresolve a comment
 */
exports.unresolveComment = async (req, res, next) => {
  try {
    const { id } = req.params;

    const comment = await Comment.findById(id);

    if (!comment) {
      throw new NotFoundError('Comment not found');
    }

    await comment.unresolve();

    res.json({
      status: 'success',
      message: 'Comment unresolved',
      data: { comment }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Add reply to comment
 */
exports.addReply = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { content } = req.body;

    const comment = await Comment.findById(id);

    if (!comment) {
      throw new NotFoundError('Comment not found');
    }

    // Check document comment access
    const document = await Document.findById(comment.document);
    if (!document.canComment(req.userId)) {
      throw new ForbiddenError('Comment access required');
    }

    await comment.addReply(content, req.userId);
    await comment.populate('replies.author', 'name email avatar');

    res.json({
      status: 'success',
      message: 'Reply added',
      data: { comment }
    });
  } catch (error) {
    next(error);
  }
};
