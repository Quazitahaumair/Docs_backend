// Load environment variables FIRST - before any other imports
const path = require('path');
const dotenvResult = require('dotenv').config({ path: path.join(__dirname, '.env') });
if (dotenvResult.error) {
  console.error('❌ Dotenv error:', dotenvResult.error);
} else {
  console.log('✅ Dotenv loaded from:', dotenvResult.parsed ? Object.keys(dotenvResult.parsed).length + ' vars' : 'unknown');
  // Debug: Check specific vars
  console.log('SENDGRID_API_KEY exists:', !!process.env.SENDGRID_API_KEY);
  console.log('EMAIL_FROM:', process.env.EMAIL_FROM);
}

const app = require('./app');
const http = require('http');
const { Server } = require('socket.io');
const connectDB = require('./config/database');
const socketHandler = require('./socket/socketHandler');
const logger = require('./utils/logger');

// Connect to Database
connectDB();

const PORT = process.env.PORT || 5000;

// Create HTTP server
const server = http.createServer(app);

// Setup Socket.io
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Make io accessible to routes
app.set('io', io);

// Handle Socket.io connections
socketHandler(io);

// Start server
server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Rejection:', err.message);
  server.close(() => process.exit(1));
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err.message);
  process.exit(1);
});
