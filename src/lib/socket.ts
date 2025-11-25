/**
 * Socket.IO initialization
 * Connection handling is done in server.ts
 */

import { Server as HTTPServer } from 'http';
import { Server } from 'socket.io';
import { env } from '../config/env';

let io: Server | null = null;

export const initializeSocket = (httpServer: HTTPServer): Server => {
  io = new Server(httpServer, {
    cors: {
      origin: env.CLIENT_URL,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  return io;
};

export const getIO = (): Server => {
  if (!io) {
    throw new Error('Socket.io not initialized! Call initializeSocket first.');
  }
  return io;
};
