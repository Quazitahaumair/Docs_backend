const Joi = require('joi');

const schemas = {
  // Auth schemas
  register: Joi.object({
    email: Joi.string().email().required().trim().lowercase(),
    password: Joi.string().min(8).required()
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .messages({
        'string.pattern.base': 'Password must contain at least one uppercase, one lowercase, one number and one special character'
      }),
    name: Joi.string().min(2).max(50).required().trim(),
    avatar: Joi.string().uri().optional()
  }),

  login: Joi.object({
    email: Joi.string().email().required().trim().lowercase(),
    password: Joi.string().required()
  }),

  refreshToken: Joi.object({
    refreshToken: Joi.string().required()
  }),

  // Document schemas
  createDocument: Joi.object({
    title: Joi.string().min(1).max(200).required().trim(),
    content: Joi.string().allow('').default(''),
    isPublic: Joi.boolean().default(false)
  }),

  updateDocument: Joi.object({
    title: Joi.string().min(1).max(200).optional().trim(),
    content: Joi.string().optional(),
    isPublic: Joi.boolean().optional()
  }),

  shareDocument: Joi.object({
    email: Joi.string().email().required().trim().lowercase(),
    permission: Joi.string().valid('read', 'write', 'comment').default('read')
  }),

  // User schemas
  updateProfile: Joi.object({
    name: Joi.string().min(2).max(50).optional().trim(),
    avatar: Joi.string().uri().optional()
  }),

  changePassword: Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: Joi.string().min(8).required()
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
  }),

  // Query params schemas
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    sortBy: Joi.string().valid('createdAt', 'updatedAt', 'title', 'lastModified').default('lastModified'),
    order: Joi.string().valid('asc', 'desc').default('desc'),
    search: Joi.string().allow('').optional()
  })
};

const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path[0],
        message: detail.message
      }));

      return res.status(422).json({
        status: 'error',
        message: 'Validation failed',
        errors
      });
    }

    // Replace req.body with validated data
    req.body = value;
    next();
  };
};

const validateQuery = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path[0],
        message: detail.message
      }));

      return res.status(422).json({
        status: 'error',
        message: 'Query validation failed',
        errors
      });
    }

    req.query = value;
    next();
  };
};

module.exports = {
  schemas,
  validate,
  validateQuery
};
