const express = require('express');
const router = express.Router();
const { authController } = require('../controllers');
const { authenticate } = require('../middleware/auth');
const { validate, schemas } = require('../utils/validation');
const { authLimiter } = require('../middleware/rateLimiter');

// Public routes with rate limiting
router.post('/register', authLimiter, validate(schemas.register), authController.register);
router.post('/login', authLimiter, validate(schemas.login), authController.login);
router.post('/refresh', validate(schemas.refreshToken), authController.refresh);

// Protected routes
router.use(authenticate);

router.get('/me', authController.getMe);
router.post('/logout', authController.logout);
router.post('/logout-all', authController.logoutAll);
router.put('/profile', validate(schemas.updateProfile), authController.updateProfile);
router.put('/change-password', validate(schemas.changePassword), authController.changePassword);

module.exports = router;
