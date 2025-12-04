/**
 * Test Database Helper
 * Utilities for setting up and tearing down test database
 */

import mongoose from 'mongoose';

const TEST_DB_URI = process.env.MONGODB_TEST_URI || process.env.MONGODB_URI?.replace(/\/[^/]+$/, '/aiscrape-test') || 'mongodb://localhost:27017/aiscrape-test';

let isConnected = false;

/**
 * Setup test database connection
 */
export async function setupTestDatabase(): Promise<void> {
  if (mongoose.connection.readyState === 0 || !isConnected) {
    try {
      await mongoose.connect(TEST_DB_URI);
      isConnected = true;
      console.log('✅ Test database connected');
    } catch (error) {
      console.error('❌ Test database connection error:', error);
      throw error;
    }
  }
}

/**
 * Teardown test database (drop database and close connection)
 */
export async function teardownTestDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    try {
      await mongoose.connection.db.dropDatabase();
      await mongoose.connection.close();
      isConnected = false;
      console.log('✅ Test database dropped and closed');
    } catch (error) {
      console.error('❌ Test database teardown error:', error);
      throw error;
    }
  }
}

/**
 * Clear all collections in test database
 */
export async function clearTestDatabase(): Promise<void> {
  if (mongoose.connection.readyState === 0) {
    await setupTestDatabase();
  }

  try {
    if (mongoose.connection.db) {
      const collections = mongoose.connection.collections;
      for (const key in collections) {
        await collections[key].deleteMany({});
      }
    }
  } catch (error) {
    console.error('❌ Error clearing test database:', error);
    throw error;
  }
}

/**
 * Get test database URI
 */
export function getTestDatabaseUri(): string {
  return TEST_DB_URI;
}

