const mongoose = require('mongoose');

const pendingShareSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  document: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Document',
    required: true
  },
  permission: {
    type: String,
    enum: ['read', 'write', 'comment'],
    default: 'read'
  },
  invitedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected'],
    default: 'pending'
  },
  invitedAt: {
    type: Date,
    default: Date.now
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
  }
});

// Index for faster queries
pendingShareSchema.index({ email: 1, status: 1 });
pendingShareSchema.index({ document: 1, email: 1 });

// Static method to find pending shares for an email
pendingShareSchema.statics.findByEmail = async function(email) {
  return this.find({ 
    email: email.toLowerCase(), 
    status: 'pending',
    expiresAt: { $gt: new Date() }
  }).populate('document invitedBy');
};

// Static method to accept pending shares when user registers
pendingShareSchema.statics.acceptSharesForEmail = async function(email, userId) {
  const shares = await this.find({ 
    email: email.toLowerCase(), 
    status: 'pending',
    expiresAt: { $gt: new Date() }
  });

  for (const share of shares) {
    const { Document } = require('./Document');
    const doc = await Document.findById(share.document);
    
    if (doc) {
      // Add user as collaborator
      await doc.addCollaborator(userId, share.permission, doc.owner);
      share.status = 'accepted';
      await share.save();
    }
  }

  return shares.length;
};

const PendingShare = mongoose.model('PendingShare', pendingShareSchema);

module.exports = PendingShare;
