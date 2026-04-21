const mongoose = require('mongoose');

const versionSchema = new mongoose.Schema({
  document: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Document',
    required: true,
    index: true
  },
  version: {
    type: Number,
    required: true
  },
  title: {
    type: String,
    required: true
  },
  content: {
    type: String,
    default: ''
  },
  wordCount: {
    type: Number,
    default: 0
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  changeDescription: {
    type: String,
    default: ''
  },
  changeType: {
    type: String,
    enum: ['auto-save', 'manual-save', 'edit', 'merge'],
    default: 'auto-save'
  },
  parentVersion: {
    type: Number,
    default: null
  }
}, {
  timestamps: true
});

// Compound index for efficient version lookups
versionSchema.index({ document: 1, version: -1 });
versionSchema.index({ createdAt: -1 });

// Static method to get version history
versionSchema.statics.getHistory = function(documentId, limit = 50) {
  return this.find({ document: documentId })
    .populate('createdBy', 'name email avatar')
    .sort({ version: -1 })
    .limit(limit);
};

// Static method to create version from document
versionSchema.statics.createFromDocument = async function(document, changeType = 'auto-save', description = '') {
  return this.create({
    document: document._id,
    version: document.version,
    title: document.title,
    content: document.content,
    wordCount: document.wordCount,
    createdBy: document.lastModifiedBy || document.owner,
    changeDescription: description,
    changeType,
    parentVersion: document.version - 1
  });
};

// Static method to restore a version
versionSchema.statics.restoreVersion = async function(documentId, targetVersion) {
  const version = await this.findOne({ document: documentId, version: targetVersion });
  
  if (!version) {
    throw new Error('Version not found');
  }
  
  const Document = mongoose.model('Document');
  const document = await Document.findById(documentId);
  
  if (!document) {
    throw new Error('Document not found');
  }
  
  // Save current state as new version before restoring
  await this.createFromDocument(document, 'manual-save', 'Pre-restore backup');
  
  // Restore the target version
  document.title = version.title;
  document.content = version.content;
  document.wordCount = version.wordCount;
  document.version += 1;
  document.lastModifiedBy = document.owner;
  
  await document.save();
  
  return document;
};

module.exports = mongoose.model('Version', versionSchema);
