/**
 * Document Controller Tests
 */

const request = require('supertest');
const app = require('../app');
const { User, Document } = require('../models');

describe('Documents API', () => {
  let token;
  let user;

  beforeEach(async () => {
    user = await createTestUser(User);
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'Password123!'
      });
    token = loginRes.body.data.tokens.accessToken;
  });

  describe('GET /api/documents', () => {
    it('should list user documents', async () => {
      await createTestDocument(Document, user._id);

      const res = await request(app)
        .get('/api/documents')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.documents).toHaveLength(1);
    });
  });

  describe('POST /api/documents', () => {
    it('should create a new document', async () => {
      const res = await request(app)
        .post('/api/documents')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'My New Document',
          content: '<p>Hello World</p>'
        });

      expect(res.status).toBe(201);
      expect(res.body.data.document.title).toBe('My New Document');
    });

    it('should create document with default title', async () => {
      const res = await request(app)
        .post('/api/documents')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(201);
      expect(res.body.data.document.title).toBe('Untitled Document');
    });
  });

  describe('GET /api/documents/:id', () => {
    let document;

    beforeEach(async () => {
      document = await createTestDocument(Document, user._id);
    });

    it('should get document by id', async () => {
      const res = await request(app)
        .get(`/api/documents/${document._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.document._id.toString()).toBe(document._id.toString());
    });

    it('should return 404 for non-existent document', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const res = await request(app)
        .get(`/api/documents/${fakeId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/documents/:id', () => {
    let document;

    beforeEach(async () => {
      document = await createTestDocument(Document, user._id);
    });

    it('should update document', async () => {
      const res = await request(app)
        .put(`/api/documents/${document._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Updated Title',
          content: '<p>Updated content</p>'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.document.title).toBe('Updated Title');
    });
  });

  describe('DELETE /api/documents/:id', () => {
    let document;

    beforeEach(async () => {
      document = await createTestDocument(Document, user._id);
    });

    it('should soft delete document', async () => {
      const res = await request(app)
        .delete(`/api/documents/${document._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);

      // Verify document is soft deleted
      const deletedDoc = await Document.findById(document._id);
      expect(deletedDoc.isDeleted).toBe(true);
    });
  });
});
