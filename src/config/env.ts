import dotenv from 'dotenv';

dotenv.config();

export const env = {
  // Server
  PORT: parseInt(process.env.PORT || '3001', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  
  // Database
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/aiscrape',
  
  // JWT
  JWT_SECRET: process.env.JWT_SECRET || 'your-secret-key',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  
  // CORS
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:5173',
  
  // AI Services
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  
  // Scraping
  MAX_CONCURRENT_SCRAPES: parseInt(process.env.MAX_CONCURRENT_SCRAPES || '5', 10),
  SCRAPE_TIMEOUT: parseInt(process.env.SCRAPE_TIMEOUT || '15000', 10), // Reduced from 60s to 15s
  USER_AGENT: process.env.USER_AGENT || 'Mozilla/5.0 (compatible; AIScrape/1.0)',
  PROXY_URL: process.env.PROXY_URL,
  
  // Tier-specific timeouts (cascade: HTTP → Jina → Playwright)
  HTTP_TIMEOUT: parseInt(process.env.HTTP_TIMEOUT || '10000', 10),    // 10s for HTTP scraper
  JINA_TIMEOUT: parseInt(process.env.JINA_TIMEOUT || '15000', 10),    // 15s for Jina Reader API
  PLAYWRIGHT_TIMEOUT: parseInt(process.env.PLAYWRIGHT_TIMEOUT || '15000', 10), // 15s for Playwright
  
  // Minimum content length to consider a scrape successful
  MIN_CONTENT_LENGTH: parseInt(process.env.MIN_CONTENT_LENGTH || '200', 10),
  
  // Performance Optimizations
  BLOCK_RESOURCES: process.env.BLOCK_RESOURCES !== 'false', // Default true
  REUSE_BROWSER: process.env.REUSE_BROWSER !== 'false', // Default true
  SCREENSHOT_ENABLED: process.env.SCREENSHOT_ENABLED !== 'false', // Default true
  SCREENSHOT_FULL_PAGE: process.env.SCREENSHOT_FULL_PAGE === 'true', // Default false
  SCREENSHOT_STORAGE_PATH: process.env.SCREENSHOT_STORAGE_PATH || 'uploads/screenshots',
  
  // Anti-Bot
  ROTATE_USER_AGENTS: process.env.ROTATE_USER_AGENTS !== 'false', // Default true
  REQUEST_DELAY_MIN: parseInt(process.env.REQUEST_DELAY_MIN || '1000', 10),
  REQUEST_DELAY_MAX: parseInt(process.env.REQUEST_DELAY_MAX || '3000', 10),
  
  // Resilience
  MAX_RETRIES: parseInt(process.env.MAX_RETRIES || '3', 10),
  RETRY_BACKOFF_BASE: parseInt(process.env.RETRY_BACKOFF_BASE || '1000', 10),
} as const;

export default env;

