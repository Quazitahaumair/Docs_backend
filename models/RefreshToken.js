const mongoose = require('mongoose');

const refreshTokenSchema = new mongoose.Schema({
  token: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  revokedAt: {
    type: Date,
    default: null
  },
  replacedByToken: {
    type: String,
    default: null
  },
  ipAddress: {
    type: String,
    default: null
  },
  userAgent: {
    type: String,
    default: null
  }
});

// Index for automatic expiration cleanup
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Check if token is expired
refreshTokenSchema.methods.isExpired = function() {
  return Date.now() >= this.expiresAt.getTime();
};

// Check if token is revoked
refreshTokenSchema.methods.isRevoked = function() {
  return !!this.revokedAt;
};

// Revoke token
refreshTokenSchema.methods.revoke = function(replacedByToken = null) {
  this.revokedAt = new Date();
  if (replacedByToken) {
    this.replacedByToken = replacedByToken;
  }
  return this.save();
};

// Static method to find valid token
refreshTokenSchema.statics.findValidToken = function(token) {
  return this.findOne({
    token,
    revokedAt: null,
    expiresAt: { $gt: new Date() }
  });
};

// Static method to revoke all user tokens
refreshTokenSchema.statics.revokeAllUserTokens = function(userId) {
  return this.updateMany(
    { user: userId, revokedAt: null },
    { revokedAt: new Date() }
  );
};

module.exports = mongoose.model('RefreshToken', refreshTokenSchema);
