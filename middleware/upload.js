const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { BadRequestError } = require('../utils/errors');

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  // Allowed file types
  const allowedTypes = {
    'image': /jpeg|jpg|png|gif|webp|svg/,
    'document': /pdf|doc|docx|txt|rtf/,
    'spreadsheet': /xls|xlsx|csv/,
    'presentation': /ppt|pptx/
  };
  
  const extname = path.extname(file.originalname).toLowerCase();
  
  // Check if extension is allowed
  const isAllowed = Object.values(allowedTypes).some(regex => regex.test(extname));
  
  if (isAllowed) {
    return cb(null, true);
  }
  
  cb(new BadRequestError(`File type ${extname} is not allowed`));
};

// Multer configurations for different upload types
const upload = {
  // Single image upload
  image: multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
      const allowed = /jpeg|jpg|png|gif|webp|svg/;
      const extname = allowed.test(path.extname(file.originalname).toLowerCase());
      const mimetype = allowed.test(file.mimetype);
      
      if (extname && mimetype) {
        return cb(null, true);
      }
      cb(new BadRequestError('Only image files are allowed'));
    }
  }),

  // Avatar upload
  avatar: multer({
    storage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
    fileFilter: (req, file, cb) => {
      const allowed = /jpeg|jpg|png|webp/;
      const extname = allowed.test(path.extname(file.originalname).toLowerCase());
      const mimetype = allowed.test(file.mimetype);
      
      if (extname && mimetype) {
        return cb(null, true);
      }
      cb(new BadRequestError('Only JPEG, PNG, and WEBP images are allowed for avatars'));
    }
  }),

  // Document file upload
  document: multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    fileFilter: (req, file, cb) => {
      const allowed = /pdf|doc|docx|txt|rtf|xls|xlsx|ppt|pptx/;
      const extname = allowed.test(path.extname(file.originalname).toLowerCase());
      
      if (extname) {
        return cb(null, true);
      }
      cb(new BadRequestError('Invalid file type for document upload'));
    }
  }),

  // Multiple files upload
  multiple: multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per file
    fileFilter
  })
};

// Error handling wrapper for multer
const handleUploadError = (uploadMiddleware) => {
  return (req, res, next) => {
    uploadMiddleware(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(new BadRequestError('File too large'));
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return next(new BadRequestError('Too many files'));
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return next(new BadRequestError('Unexpected field name'));
        }
        return next(new BadRequestError(err.message));
      }
      if (err) {
        return next(err);
      }
      next();
    });
  };
};

module.exports = { upload, handleUploadError };
