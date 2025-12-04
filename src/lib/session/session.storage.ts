/**
 * File-based Session Storage
 * Persistent session storage using file system
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { ISessionStorage, SessionStorageConfig, SerializedSessionData } from './session.types';
import { SessionData } from '../scraping/session';

export class FileSessionStorage implements ISessionStorage {
  private config: SessionStorageConfig;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(config: Partial<SessionStorageConfig> = {}) {
    this.config = {
      storagePath: config.storagePath || path.join(process.cwd(), 'storage', 'sessions'),
      autoCleanup: config.autoCleanup !== false,
      cleanupInterval: config.cleanupInterval || 3600000, // 1 hour default
    };

    // Ensure storage directory exists
    this.ensureStorageDirectory();

    // Start auto cleanup if enabled
    if (this.config.autoCleanup) {
      this.startAutoCleanup();
    }
  }

  /**
   * Ensure storage directory exists
   */
  private async ensureStorageDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.config.storagePath, { recursive: true });
    } catch (error: any) {
      if (error.code !== 'EEXIST') {
        console.error('Failed to create session storage directory:', error.message);
      }
    }
  }

  /**
   * Get file path for a session key
   */
  private getSessionFilePath(key: string): string {
    // Sanitize key to be filesystem-safe
    const safeKey = key.replace(/[^a-zA-Z0-9._-]/g, '_');
    return path.join(this.config.storagePath, `${safeKey}.json`);
  }

  /**
   * Serialize session data for storage
   */
  private serialize(data: SessionData): SerializedSessionData {
    return {
      cookies: data.cookies,
      localStorage: data.localStorage,
      sessionStorage: data.sessionStorage,
      createdAt: data.createdAt.toISOString(),
      expiresAt: data.expiresAt?.toISOString(),
      domain: data.domain,
    };
  }

  /**
   * Deserialize session data from storage
   */
  private deserialize(data: SerializedSessionData): SessionData {
    return {
      cookies: data.cookies,
      localStorage: data.localStorage,
      sessionStorage: data.sessionStorage,
      createdAt: new Date(data.createdAt),
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
      domain: data.domain,
    };
  }

  /**
   * Save session data
   */
  async save(key: string, data: SessionData): Promise<void> {
    await this.ensureStorageDirectory();

    const filePath = this.getSessionFilePath(key);
    const serialized = this.serialize(data);

    try {
      // Write atomically using temporary file then rename
      const tempPath = `${filePath}.tmp`;
      await fs.writeFile(tempPath, JSON.stringify(serialized, null, 2), 'utf-8');
      await fs.rename(tempPath, filePath);
    } catch (error: any) {
      console.error(`Failed to save session ${key}:`, error.message);
      throw error;
    }
  }

  /**
   * Load session data
   */
  async load(key: string): Promise<SessionData | null> {
    const filePath = this.getSessionFilePath(key);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const serialized = JSON.parse(content) as SerializedSessionData;
      const session = this.deserialize(serialized);

      // Check if expired
      if (session.expiresAt && session.expiresAt < new Date()) {
        await this.delete(key);
        return null;
      }

      return session;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null; // File doesn't exist
      }
      console.error(`Failed to load session ${key}:`, error.message);
      return null;
    }
  }

  /**
   * Delete session data
   */
  async delete(key: string): Promise<void> {
    const filePath = this.getSessionFilePath(key);

    try {
      await fs.unlink(filePath);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        console.error(`Failed to delete session ${key}:`, error.message);
      }
    }
  }

  /**
   * Check if session exists
   */
  async exists(key: string): Promise<boolean> {
    const filePath = this.getSessionFilePath(key);

    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List all session keys
   */
  async listKeys(): Promise<string[]> {
    await this.ensureStorageDirectory();

    try {
      const files = await fs.readdir(this.config.storagePath);
      return files
        .filter(file => file.endsWith('.json'))
        .map(file => file.replace('.json', ''));
    } catch (error: any) {
      console.error('Failed to list session keys:', error.message);
      return [];
    }
  }

  /**
   * Clear all sessions
   */
  async clear(): Promise<void> {
    await this.ensureStorageDirectory();

    try {
      const files = await fs.readdir(this.config.storagePath);
      const jsonFiles = files.filter(file => file.endsWith('.json'));

      await Promise.all(
        jsonFiles.map(file => 
          fs.unlink(path.join(this.config.storagePath, file))
        )
      );
    } catch (error: any) {
      console.error('Failed to clear sessions:', error.message);
      throw error;
    }
  }

  /**
   * Clean expired sessions
   */
  async cleanExpired(): Promise<number> {
    await this.ensureStorageDirectory();

    try {
      const keys = await this.listKeys();
      let cleaned = 0;

      for (const key of keys) {
        const session = await this.load(key);
        if (!session) {
          // Session was expired and deleted by load()
          cleaned++;
        }
      }

      return cleaned;
    } catch (error: any) {
      console.error('Failed to clean expired sessions:', error.message);
      return 0;
    }
  }

  /**
   * Start automatic cleanup of expired sessions
   */
  private startAutoCleanup(): void {
    this.cleanupTimer = setInterval(async () => {
      try {
        const cleaned = await this.cleanExpired();
        if (cleaned > 0) {
          console.log(`Cleaned ${cleaned} expired session(s)`);
        }
      } catch (error: any) {
        console.error('Auto cleanup error:', error.message);
      }
    }, this.config.cleanupInterval);
  }

  /**
   * Stop automatic cleanup
   */
  stopAutoCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<{
    totalSessions: number;
    expiredSessions: number;
    storagePath: string;
  }> {
    const keys = await this.listKeys();
    let expiredCount = 0;

    for (const key of keys) {
      const session = await this.load(key);
      if (!session) {
        expiredCount++;
      }
    }

    return {
      totalSessions: keys.length,
      expiredSessions: expiredCount,
      storagePath: this.config.storagePath,
    };
  }
}




