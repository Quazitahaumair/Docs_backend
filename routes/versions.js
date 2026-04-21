const express = require('express');
const router = express.Router();
const { versionController } = require('../controllers');
const { authenticate, checkDocumentAccess } = require('../middleware/auth');

router.use(authenticate);

// Version history for a document
router.get('/document/:id', checkDocumentAccess('read'), versionController.getVersionHistory);

// Get specific version
router.get('/document/:id/:versionNum', checkDocumentAccess('read'), versionController.getVersion);

// Create manual version
router.post('/document/:id', checkDocumentAccess('write'), versionController.createVersion);

// Compare versions
router.get('/document/:id/compare', checkDocumentAccess('read'), versionController.compareVersions);

// Restore version
router.post('/document/:id/restore', checkDocumentAccess('write'), versionController.restoreVersion);

// Delete version (owner only)
router.delete('/document/:id/:versionNum', checkDocumentAccess('owner'), versionController.deleteVersion);

module.exports = router;
