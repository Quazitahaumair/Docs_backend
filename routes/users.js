const express = require('express');
const router = express.Router();
const { userController } = require('../controllers');
const { authenticate, optionalAuth } = require('../middleware/auth');

// Public user routes
router.get('/public/:id', userController.getUser);
router.get('/public/:id/documents', userController.getUserPublicDocuments);

// Protected routes
router.use(authenticate);

router.get('/search', userController.searchUsers);
router.get('/stats', userController.getStats);
router.put('/settings', userController.updateSettings);
router.delete('/account', userController.deleteAccount);

module.exports = router;
