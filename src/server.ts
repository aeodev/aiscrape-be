/**
 * Server Entry Point
 * Initializes Express server, MongoDB, and Socket.IO
 */

import { createServer } from 'http';
import { createApp } from './app';
import { connectDB } from './lib/mongo';
import { initializeSocket } from './lib/socket';
import { registerScraperSocketHandlers } from './modules/scraper/scraper.socket';
import { env } from './config/env';

const startServer = async (): Promise<void> => {
  try {
    // Connect to MongoDB
    await connectDB();

    // Create Express app
    const app = createApp();

    // Create HTTP server
    const httpServer = createServer(app);

    // Initialize Socket.IO
    const io = initializeSocket(httpServer);

    // Register Socket.IO handlers
    io.on('connection', (socket) => {
      console.log(`✅ Socket connected: ${socket.id}`);

      // Register scraper socket handlers
      registerScraperSocketHandlers(socket);

      socket.on('disconnect', () => {
        console.log(`❌ Socket disconnected: ${socket.id}`);
      });
    });

    // Start server
    httpServer.listen(env.PORT, () => {
      console.log('');
      console.log('🚀 ═══════════════════════════════════════════════════════');
      console.log(`🚀 AIScrape Server is running`);
      console.log(`🚀 Environment: ${env.NODE_ENV}`);
      console.log(`🚀 Port: ${env.PORT}`);
      console.log(`🚀 API: http://localhost:${env.PORT}/health`);
      console.log(`🚀 Socket.IO: ws://localhost:${env.PORT}`);
      console.log('🚀 ═══════════════════════════════════════════════════════');
      console.log('');
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('SIGTERM signal received: closing HTTP server');
      httpServer.close(() => {
        console.log('HTTP server closed');
      });
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer();


