const mongoose = require('mongoose');

const replySchema = new mongoose.Schema({
  content: {
    type: String,
    required: true,
    maxlength: 1000
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  isResolved: {
    type: Boolean,
    default: false
  }
}, { _id: true });

const commentSchema = new mongoose.Schema({
  document: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Document',
    required: true,
    index: true
  },
  content: {
    type: String,
    required: true,
    maxlength: 2000
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Position information for inline comments
  position: {
    from: {
      type: Number,
      default: null
    },
    to: {
      type: Number,
      default: null
    },
    // For quill delta or similar editors
    range: {
      index: Number,
      length: Number
    }
  },
  // For thread-style comments
  parentComment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment',
    default: null,
    index: true
  },
  replies: [replySchema],
  isResolved: {
    type: Boolean,
    default: false
  },
  resolvedAt: {
    type: Date,
    default: null
  },
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, {
  timestamps: true
});

// Indexes
commentSchema.index({ document: 1, createdAt: -1 });
commentSchema.index({ document: 1, isResolved: 1 });
commentSchema.index({ author: 1 });
commentSchema.index({ parentComment: 1 });

// Get comment thread
commentSchema.statics.getThread = function(commentId) {
  return this.findById(commentId)
    .populate('author', 'name email avatar')
    .populate('replies.author', 'name email avatar')
    .populate('resolvedBy', 'name email');
};

// Get all comments for a document
commentSchema.statics.getDocumentComments = function(documentId, options = {}) {
  const { includeResolved = false, parentOnly = true } = options;
  
  const query = { document: documentId };
  
  if (!includeResolved) {
    query.isResolved = false;
  }
  
  if (parentOnly) {
    query.parentComment = null;
  }
  
  return this.find(query)
    .populate('author', 'name email avatar')
    .populate('replies.author', 'name email avatar')
    .populate('resolvedBy', 'name email')
    .sort({ createdAt: -1 });
};

// Resolve comment
commentSchema.methods.resolve = function(userId) {
  this.isResolved = true;
  this.resolvedAt = new Date();
  this.resolvedBy = userId;
  return this.save();
};

// Unresolve comment
commentSchema.methods.unresolve = function() {
  this.isResolved = false;
  this.resolvedAt = null;
  this.resolvedBy = null;
  return this.save();
};

// Add reply
commentSchema.methods.addReply = function(content, authorId) {
  this.replies.push({
    content,
    author: authorId
  });
  return this.save();
};

module.exports = mongoose.model('Comment', commentSchema);
