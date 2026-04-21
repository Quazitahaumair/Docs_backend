const { User, RefreshToken } = require('../models');
const { generateTokens, verifyRefreshToken } = require('../middleware/auth');
const { generateRandomString, generateUserColor } = require('../utils/helpers');
const { BadRequestError, UnauthorizedError, ConflictError } = require('../utils/errors');
const logger = require('../utils/logger');

/**
 * Register new user
 */
exports.register = async (req, res, next) => {
  try {
    const { email, password, name, avatar } = req.body;

    // Check if user exists
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      throw new ConflictError('Email already registered');
    }

    // Create user
    const user = await User.create({
      email,
      password,
      name,
      avatar,
      color: generateUserColor(name || email)
    });

    // Accept any pending shares for this email
    const { PendingShare } = require('../models');
    const acceptedShares = await PendingShare.acceptSharesForEmail(email, user._id);
    
    if (acceptedShares > 0) {
      logger.info(`Accepted ${acceptedShares} pending shares for ${email}`);
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user._id);

    // Store refresh token
    await RefreshToken.create({
      token: refreshToken,
      user: user._id,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    // Remove password from response
    const userResponse = user.toObject();
    delete userResponse.password;

    logger.info(`New user registered: ${email}`);

    res.status(201).json({
      status: 'success',
      message: acceptedShares > 0 
        ? `Registration successful! You now have access to ${acceptedShares} shared document(s).`
        : 'Registration successful',
      data: {
        user: userResponse,
        tokens: {
          accessToken,
          refreshToken,
          expiresIn: process.env.JWT_EXPIRES_IN || '7d'
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Login user
 */
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Find user with password
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user) {
      throw new UnauthorizedError('Invalid credentials');
    }

    // Check if account is active
    if (!user.isActive) {
      throw new UnauthorizedError('Account has been deactivated');
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      throw new UnauthorizedError('Invalid credentials');
    }

    // Update last login
    await user.updateLastLogin();

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user._id);

    // Store refresh token
    await RefreshToken.create({
      token: refreshToken,
      user: user._id,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    // Remove password from response
    const userResponse = user.toObject();
    delete userResponse.password;

    logger.info(`User logged in: ${email}`);

    res.json({
      status: 'success',
      message: 'Login successful',
      data: {
        user: userResponse,
        tokens: {
          accessToken,
          refreshToken,
          expiresIn: process.env.JWT_EXPIRES_IN || '7d'
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Logout user
 */
exports.logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    // Revoke refresh token if provided
    if (refreshToken) {
      const token = await RefreshToken.findOne({ token: refreshToken });
      if (token) {
        await token.revoke();
      }
    }

    // Revoke all tokens for current session if user is authenticated
    if (req.user) {
      logger.info(`User logged out: ${req.user.email}`);
    }

    res.json({
      status: 'success',
      message: 'Logout successful'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Logout from all devices
 */
exports.logoutAll = async (req, res, next) => {
  try {
    // Revoke all refresh tokens for this user
    await RefreshToken.revokeAllUserTokens(req.userId);

    logger.info(`User logged out from all devices: ${req.user.email}`);

    res.json({
      status: 'success',
      message: 'Logged out from all devices'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Refresh access token
 */
exports.refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new BadRequestError('Refresh token is required');
    }

    // Verify refresh token exists and is valid
    const storedToken = await RefreshToken.findValidToken(refreshToken);
    if (!storedToken) {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    // Verify JWT signature
    const decoded = verifyRefreshToken(refreshToken);

    // Generate new tokens
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(decoded.userId);

    // Revoke old refresh token
    await storedToken.revoke(newRefreshToken);

    // Store new refresh token
    await RefreshToken.create({
      token: newRefreshToken,
      user: decoded.userId,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({
      status: 'success',
      data: {
        tokens: {
          accessToken,
          refreshToken: newRefreshToken,
          expiresIn: process.env.JWT_EXPIRES_IN || '7d'
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get current user
 */
exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId)
      .populate('documents', 'title lastModified isArchived')
      .populate('sharedDocuments.document', 'title owner lastModified');

    res.json({
      status: 'success',
      data: { user }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update profile
 */
exports.updateProfile = async (req, res, next) => {
  try {
    const { name, avatar } = req.body;

    const user = await User.findByIdAndUpdate(
      req.userId,
      { name, avatar },
      { new: true, runValidators: true }
    );

    res.json({
      status: 'success',
      message: 'Profile updated',
      data: { user }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Change password
 */
exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Get user with password
    const user = await User.findById(req.userId).select('+password');

    // Verify current password
    const isValid = await user.comparePassword(currentPassword);
    if (!isValid) {
      throw new BadRequestError('Current password is incorrect');
    }

    // Update password
    user.password = newPassword;
    await user.save();

    // Revoke all refresh tokens
    await RefreshToken.revokeAllUserTokens(req.userId);

    logger.info(`Password changed for user: ${user.email}`);

    res.json({
      status: 'success',
      message: 'Password changed successfully. Please log in again.'
    });
  } catch (error) {
    next(error);
  }
};
