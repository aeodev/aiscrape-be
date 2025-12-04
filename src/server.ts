/**
 * Server Entry Point
 * Initializes Express server, MongoDB, and Socket.IO
 */

import { createServer } from 'http';
import { createApp } from './app';
import { connectDB } from './lib/mongo';
import { initializeSocket } from './lib/socket';
import { registerScraperSocketHandlers } from './modules/scraper/scraper.socket';
import { redisConnection } from './lib/cache/redis.connection';
import { sessionManager } from './lib/scraping/session';
import { registerAllStrategies } from './lib/extraction';
import { env } from './config/env';

const startServer = async (): Promise<void> => {
  try {
    // Connect to MongoDB
    await connectDB();

    // Initialize Redis connection
    console.log('📦 Initializing Redis connection...');
    const redisClient = redisConnection.getClient();
    if (redisClient) {
      // Wait a moment for connection to establish
      await new Promise(resolve => setTimeout(resolve, 500));
      const isHealthy = await redisConnection.healthCheck();
      if (isHealthy) {
        console.log('✅ Redis connected and ready');
      } else {
        console.log('⚠️  Redis connection established but health check failed, using in-memory fallback');
      }
    } else {
      console.log('⚠️  Redis not available, using in-memory cache fallback');
    }

    // Initialize session storage
    console.log('💾 Initializing session storage...');
    try {
      const sessionStats = await sessionManager.getStats();
      console.log(`✅ Session storage ready (${sessionStats.memorySessions} session(s) loaded)`);
    } catch (error: any) {
      console.log(`⚠️  Session storage initialization warning: ${error.message}`);
    }

    // Register all extraction strategies
    console.log('🤖 Registering extraction strategies...');
    registerAllStrategies();

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
    httpServer.listen(env.PORT, async () => {
      // Check Redis status one more time for startup log
      const redisStatus = redisConnection.isAvailable() ? '✅ Connected' : '⚠️  In-Memory Fallback';
      
      console.log('');
      console.log('🚀 ═══════════════════════════════════════════════════════');
      console.log(`🚀 AIScrape Server is running`);
      console.log(`🚀 Environment: ${env.NODE_ENV}`);
      console.log(`🚀 Port: ${env.PORT}`);
      console.log(`🚀 Redis Cache: ${redisStatus}`);
      console.log(`🚀 API: http://localhost:${env.PORT}/health`);
      console.log(`🚀 Socket.IO: ws://localhost:${env.PORT}`);
      console.log('🚀 ═══════════════════════════════════════════════════════');
      console.log('');
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('SIGTERM signal received: closing HTTP server');
      httpServer.close(async () => {
        console.log('HTTP server closed');
        // Disconnect Redis
        await redisConnection.disconnect();
        console.log('Redis disconnected');
        process.exit(0);
      });
    });

    process.on('SIGINT', async () => {
      console.log('SIGINT signal received: closing HTTP server');
      httpServer.close(async () => {
        console.log('HTTP server closed');
        // Disconnect Redis
        await redisConnection.disconnect();
        console.log('Redis disconnected');
        process.exit(0);
      });
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer();


