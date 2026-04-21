const { Document, Version } = require('../models');
const { NotFoundError, ForbiddenError, BadRequestError } = require('../utils/errors');

/**
 * Get version history for a document
 */
exports.getVersionHistory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    // Check document access
    const document = req.document || await Document.findById(id);
    
    if (!document) {
      throw new NotFoundError('Document not found');
    }

    // Must have at least read access
    const access = document.canAccess(req.userId);
    if (!access) {
      throw new ForbiddenError('Access denied');
    }

    // Get versions
    const versions = await Version.getHistory(id, parseInt(limit));

    res.json({
      status: 'success',
      data: {
        versions,
        currentVersion: document.version,
        totalVersions: versions.length
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get specific version
 */
exports.getVersion = async (req, res, next) => {
  try {
    const { id, versionNum } = req.params;

    // Check document access
    const document = req.document || await Document.findById(id);
    
    if (!document) {
      throw new NotFoundError('Document not found');
    }

    const access = document.canAccess(req.userId);
    if (!access) {
      throw new ForbiddenError('Access denied');
    }

    // Get specific version
    const version = await Version.findOne({
      document: id,
      version: parseInt(versionNum)
    }).populate('createdBy', 'name email avatar');

    if (!version) {
      throw new NotFoundError('Version not found');
    }

    res.json({
      status: 'success',
      data: { version }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create manual version (snapshot)
 */
exports.createVersion = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { description } = req.body;

    // Check document edit access
    const document = req.document || await Document.findById(id);
    
    if (!document) {
      throw new NotFoundError('Document not found');
    }

    if (!document.canEdit(req.userId)) {
      throw new ForbiddenError('Edit access required');
    }

    // Create manual version
    const version = await Version.createFromDocument(
      document,
      'manual-save',
      description || 'Manual save'
    );

    await version.populate('createdBy', 'name email avatar');

    res.status(201).json({
      status: 'success',
      message: 'Version created',
      data: { version }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Compare two versions
 */
exports.compareVersions = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { v1, v2 } = req.query;

    if (!v1 || !v2) {
      throw new BadRequestError('Both version numbers are required');
    }

    // Check document access
    const document = req.document || await Document.findById(id);
    
    if (!document) {
      throw new NotFoundError('Document not found');
    }

    const access = document.canAccess(req.userId);
    if (!access) {
      throw new ForbiddenError('Access denied');
    }

    // Get both versions
    const [version1, version2] = await Promise.all([
      Version.findOne({ document: id, version: parseInt(v1) }),
      Version.findOne({ document: id, version: parseInt(v2) })
    ]);

    if (!version1 || !version2) {
      throw new NotFoundError('One or both versions not found');
    }

    // Simple text diff (could be enhanced with diff library)
    const diff = {
      title: {
        from: version1.title,
        to: version2.title,
        changed: version1.title !== version2.title
      },
      content: {
        wordCount: {
          from: version1.wordCount,
          to: version2.wordCount,
          difference: version2.wordCount - version1.wordCount
        }
      },
      createdAt: {
        from: version1.createdAt,
        to: version2.createdAt
      }
    };

    res.json({
      status: 'success',
      data: {
        version1: {
          version: version1.version,
          createdAt: version1.createdAt,
          createdBy: version1.createdBy
        },
        version2: {
          version: version2.version,
          createdAt: version2.createdAt,
          createdBy: version2.createdBy
        },
        diff
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Restore a version
 */
exports.restoreVersion = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { versionNum } = req.body;

    // Check document edit access
    const document = req.document || await Document.findById(id);
    
    if (!document) {
      throw new NotFoundError('Document not found');
    }

    if (!document.canEdit(req.userId)) {
      throw new ForbiddenError('Edit access required');
    }

    // Restore the version
    const restoredDocument = await Version.restoreVersion(id, parseInt(versionNum));

    res.json({
      status: 'success',
      message: `Restored to version ${versionNum}`,
      data: { document: restoredDocument }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a version
 */
exports.deleteVersion = async (req, res, next) => {
  try {
    const { id, versionNum } = req.params;

    // Only document owner can delete versions
    const document = req.document || await Document.findById(id);
    
    if (!document) {
      throw new NotFoundError('Document not found');
    }

    if (document.owner.toString() !== req.userId.toString()) {
      throw new ForbiddenError('Only owner can delete versions');
    }

    // Don't allow deleting current version
    if (parseInt(versionNum) === document.version) {
      throw new BadRequestError('Cannot delete current version');
    }

    const result = await Version.deleteOne({
      document: id,
      version: parseInt(versionNum)
    });

    if (result.deletedCount === 0) {
      throw new NotFoundError('Version not found');
    }

    res.json({
      status: 'success',
      message: 'Version deleted'
    });
  } catch (error) {
    next(error);
  }
};
