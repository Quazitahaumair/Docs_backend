const express = require('express');
const router = express.Router();
const { docController } = require('../controllers');
const { authenticate, optionalAuth, checkDocumentAccess } = require('../middleware/auth');
const { validate, schemas, validateQuery } = require('../utils/validation');
const { createDocumentLimiter } = require('../middleware/rateLimiter');

// Public route for shared documents
router.get('/public/:shareId', optionalAuth, docController.getPublicDocument);

// All routes below require authentication
router.use(authenticate);

// Document listing and creation
router.get('/', validateQuery(schemas.pagination), docController.listDocuments);
router.post('/', createDocumentLimiter, validate(schemas.createDocument), docController.createDocument);

// Trash routes
router.get('/trash', (req, res, next) => {
  // Get deleted documents
  const { Document } = require('../models');
  Document.find({ owner: req.userId, isDeleted: true })
    .sort({ deletedAt: -1 })
    .then(documents => res.json({ status: 'success', data: { documents } }))
    .catch(next);
});

// Single document routes with access check middleware
router.get('/:id', checkDocumentAccess('read'), docController.getDocument);
router.put('/:id', checkDocumentAccess('write'), validate(schemas.updateDocument), docController.updateDocument);
router.delete('/:id', checkDocumentAccess('owner'), docController.deleteDocument);

// Restore from trash
router.post('/:id/restore', docController.restoreDocument);

// Permanent delete
router.delete('/:id/permanent', docController.permanentDelete);

// Share routes
router.post('/:id/share', checkDocumentAccess('owner'), validate(schemas.shareDocument), docController.shareDocument);
router.delete('/:id/share', checkDocumentAccess('owner'), docController.removeCollaborator);
router.put('/:id/share', checkDocumentAccess('owner'), docController.updateCollaboratorPermission);

// Public access toggle
router.put('/:id/public', checkDocumentAccess('owner'), docController.togglePublicAccess);

// Archive toggle
router.put('/:id/archive', checkDocumentAccess('owner'), docController.toggleArchive);

module.exports = router;
