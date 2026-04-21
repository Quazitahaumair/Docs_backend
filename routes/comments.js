const express = require('express');
const router = express.Router();
const { commentController } = require('../controllers');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// Document comments
router.get('/document/:documentId', commentController.getComments);
router.post('/document/:documentId', commentController.createComment);

// Single comment operations
router.put('/:id', commentController.updateComment);
router.delete('/:id', commentController.deleteComment);

// Resolve/unresolve
router.post('/:id/resolve', commentController.resolveComment);
router.post('/:id/unresolve', commentController.unresolveComment);

// Replies
router.post('/:id/reply', commentController.addReply);

module.exports = router;
