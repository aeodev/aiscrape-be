/**
 * Session Storage Types
 * Type definitions for persistent session storage
 */

import { SessionData } from '../scraping/session';

/**
 * Session storage interface
 */
export interface ISessionStorage {
  /**
   * Save session data
   */
  save(key: string, data: SessionData): Promise<void>;

  /**
   * Load session data
   */
  load(key: string): Promise<SessionData | null>;

  /**
   * Delete session data
   */
  delete(key: string): Promise<void>;

  /**
   * Check if session exists
   */
  exists(key: string): Promise<boolean>;

  /**
   * List all session keys
   */
  listKeys(): Promise<string[]>;

  /**
   * Clear all sessions
   */
  clear(): Promise<void>;

  /**
   * Clean expired sessions
   */
  cleanExpired(): Promise<number>;
}

/**
 * Session storage configuration
 */
export interface SessionStorageConfig {
  storagePath: string;
  autoCleanup: boolean;
  cleanupInterval: number; // milliseconds
}

/**
 * Serialized session data for storage
 */
export interface SerializedSessionData {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None';
  }>;
  localStorage?: Record<string, string>;
  sessionStorage?: Record<string, string>;
  createdAt: string; // ISO string
  expiresAt?: string; // ISO string
  domain: string;
}




