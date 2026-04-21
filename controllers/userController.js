const { User, Document } = require('../models');
const { NotFoundError, BadRequestError, ForbiddenError } = require('../utils/errors');

/**
 * Get user profile by ID
 */
exports.getUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id).select('-password -refreshTokens');

    if (!user) {
      throw new NotFoundError('User not found');
    }

    res.json({
      status: 'success',
      data: { user }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Search users
 */
exports.searchUsers = async (req, res, next) => {
  try {
    const { query, limit = 10 } = req.query;

    if (!query || query.length < 2) {
      throw new BadRequestError('Query must be at least 2 characters');
    }

    const users = await User.find({
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } }
      ],
      isActive: true
    })
      .select('name email avatar')
      .limit(parseInt(limit));

    res.json({
      status: 'success',
      data: { users }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get user's public documents
 */
exports.getUserPublicDocuments = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const skip = (page - 1) * limit;

    const [documents, total] = await Promise.all([
      Document.find({
        owner: id,
        isPublic: true,
        isDeleted: false
      })
        .select('title excerpt shareId lastModified wordCount')
        .sort({ lastModified: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Document.countDocuments({
        owner: id,
        isPublic: true,
        isDeleted: false
      })
    ]);

    res.json({
      status: 'success',
      data: {
        documents,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update user settings
 */
exports.updateSettings = async (req, res, next) => {
  try {
    const { theme, notifications, language } = req.body;

    const user = await User.findByIdAndUpdate(
      req.userId,
      {
        $set: {
          'settings.theme': theme,
          'settings.notifications': notifications,
          'settings.language': language
        }
      },
      { new: true, runValidators: true }
    ).select('-password -refreshTokens');

    res.json({
      status: 'success',
      message: 'Settings updated',
      data: { user }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get dashboard stats
 */
exports.getStats = async (req, res, next) => {
  try {
    const userId = req.userId;

    const [
      totalDocuments,
      sharedWithMe,
      publicDocuments,
      recentDocuments,
      archivedDocuments
    ] = await Promise.all([
      Document.countDocuments({ owner: userId, isDeleted: false }),
      Document.countDocuments({ 'collaborators.user': userId, isDeleted: false }),
      Document.countDocuments({ owner: userId, isPublic: true, isDeleted: false }),
      Document.find({ owner: userId, isDeleted: false })
        .sort({ lastModified: -1 })
        .limit(5)
        .select('title lastModified excerpt'),
      Document.countDocuments({ owner: userId, isArchived: true, isDeleted: false })
    ]);

    res.json({
      status: 'success',
      data: {
        stats: {
          totalDocuments,
          sharedWithMe,
          publicDocuments,
          archivedDocuments
        },
        recentDocuments
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete account
 */
exports.deleteAccount = async (req, res, next) => {
  try {
    const { password } = req.body;

    // Verify password
    const user = await User.findById(req.userId).select('+password');
    const isValid = await user.comparePassword(password);

    if (!isValid) {
      throw new BadRequestError('Password is incorrect');
    }

    // Soft delete all user's documents
    await Document.updateMany(
      { owner: req.userId },
      { isDeleted: true, deletedAt: new Date() }
    );

    // Deactivate user
    user.isActive = false;
    await user.save();

    // Revoke all tokens
    const { RefreshToken } = require('../models');
    await RefreshToken.revokeAllUserTokens(req.userId);

    res.json({
      status: 'success',
      message: 'Account deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};
