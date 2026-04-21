const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const collaboratorSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  permission: {
    type: String,
    enum: ['read', 'write', 'comment'],
    default: 'read'
  },
  addedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  addedAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const documentSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  content: {
    type: String,
    default: ''
  },
  contentType: {
    type: String,
    enum: ['html', 'delta', 'markdown'],
    default: 'html'
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  collaborators: [collaboratorSchema],
  shareId: {
    type: String,
    unique: true,
    sparse: true,
    index: true
  },
  isPublic: {
    type: Boolean,
    default: false
  },
  publicAccess: {
    type: String,
    enum: ['none', 'view', 'comment', 'edit'],
    default: 'none'
  },
  lastModified: {
    type: Date,
    default: Date.now,
    index: true
  },
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  version: {
    type: Number,
    default: 1
  },
  wordCount: {
    type: Number,
    default: 0
  },
  folder: {
    type: String,
    default: null,
    index: true
  },
  tags: [{
    type: String,
    trim: true
  }],
  isArchived: {
    type: Boolean,
    default: false
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for faster queries
documentSchema.index({ owner: 1, lastModified: -1 });
documentSchema.index({ owner: 1, isArchived: 1 });
documentSchema.index({ owner: 1, isDeleted: 1 });
documentSchema.index({ 'collaborators.user': 1 });
documentSchema.index({ tags: 1 });
documentSchema.index({ title: 'text', content: 'text' }); // Text search

// Generate share ID before saving if document is public
documentSchema.pre('save', function(next) {
  if (this.isPublic && !this.shareId) {
    this.shareId = uuidv4().split('-')[0]; // Short unique ID
  }
  
  // Update lastModified
  if (this.isModified('content') || this.isModified('title')) {
    this.lastModified = new Date();
    this.version += 1;
  }
  
  // Calculate word count if content changed
  if (this.isModified('content')) {
    const text = this.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    this.wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
  }
  
  next();
});

// Virtual for excerpt (first 150 chars of content)
documentSchema.virtual('excerpt').get(function() {
  if (!this.content) return '';
  const text = this.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > 150 ? text.substring(0, 150) + '...' : text;
});

// Virtual for reading time (200 words per minute)
documentSchema.virtual('readingTime').get(function() {
  return Math.ceil(this.wordCount / 200) || 1;
});

// Method to check if user can access document
documentSchema.methods.canAccess = function(userId) {
  if (this.owner.toString() === userId.toString()) return 'owner';
  if (this.isPublic && this.publicAccess !== 'none') return this.publicAccess;
  
  const collaborator = this.collaborators.find(
    c => c.user.toString() === userId.toString()
  );
  
  return collaborator ? collaborator.permission : null;
};

// Method to check if user can edit
documentSchema.methods.canEdit = function(userId) {
  const access = this.canAccess(userId);
  return access === 'owner' || access === 'write' || (this.isPublic && this.publicAccess === 'edit');
};

// Method to check if user can comment
documentSchema.methods.canComment = function(userId) {
  const access = this.canAccess(userId);
  return access === 'owner' || access === 'write' || access === 'comment' || 
         (this.isPublic && (this.publicAccess === 'comment' || this.publicAccess === 'edit'));
};

// Method to add collaborator
documentSchema.methods.addCollaborator = async function(userId, permission, addedBy) {
  const existingIndex = this.collaborators.findIndex(
    c => c.user.toString() === userId.toString()
  );
  
  if (existingIndex >= 0) {
    this.collaborators[existingIndex].permission = permission;
  } else {
    this.collaborators.push({ 
      user: userId, 
      permission: permission || 'read', 
      addedBy: addedBy,
      addedAt: new Date()
    });
  }
  
  // Mark as modified and save
  this.markModified('collaborators');
  return await this.save();
};

// Method to remove collaborator
documentSchema.methods.removeCollaborator = async function(userId) {
  this.collaborators = this.collaborators.filter(
    c => c.user.toString() !== userId.toString()
  );
  this.markModified('collaborators');
  return await this.save();
};

// Method to soft delete
documentSchema.methods.softDelete = function() {
  this.isDeleted = true;
  this.deletedAt = new Date();
  return this.save();
};

// Method to restore
documentSchema.methods.restore = function() {
  this.isDeleted = false;
  this.deletedAt = null;
  return this.save();
};

// Static method to find by share ID
documentSchema.statics.findByShareId = function(shareId) {
  return this.findOne({ shareId, isPublic: true, isDeleted: false });
};

// Static method to get user's accessible documents
documentSchema.statics.findAccessibleByUser = function(userId, options = {}) {
  const { includeArchived = false, includeDeleted = false } = options;
  
  const query = {
    $or: [
      { owner: userId },
      { 'collaborators.user': userId }
    ]
  };
  
  if (!includeDeleted) {
    query.isDeleted = false;
  }
  
  if (!includeArchived) {
    query.isArchived = false;
  }
  
  return this.find(query)
    .populate('owner', 'name email avatar')
    .populate('collaborators.user', 'name email avatar')
    .populate('lastModifiedBy', 'name email')
    .sort({ lastModified: -1 });
};

module.exports = mongoose.model('Document', documentSchema);
