/**
 * Test setup and configuration
 */

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;

// Connect to in-memory database before tests
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  
  await mongoose.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });
});

// Clear all collections after each test
afterEach(async () => {
  const collections = mongoose.connection.collections;
  
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany({});
  }
});

// Disconnect and close MongoDB after all tests
afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  await mongod.stop();
});

// Global test utilities
global.createTestUser = async (User, overrides = {}) => {
  return User.create({
    email: 'test@example.com',
    password: 'Password123!',
    name: 'Test User',
    ...overrides
  });
};

global.createTestDocument = async (Document, userId, overrides = {}) => {
  return Document.create({
    title: 'Test Document',
    content: '<p>Test content</p>',
    owner: userId,
    lastModifiedBy: userId,
    ...overrides
  });
};
