import dotenv from 'dotenv';

dotenv.config();

export const env = {
  // Server
  PORT: parseInt(process.env.PORT || '3001', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  
  // Database
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/aiscrape',
  
  // Redis Cache
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  REDIS_PASSWORD: process.env.REDIS_PASSWORD,
  REDIS_DB: parseInt(process.env.REDIS_DB || '0', 10),
  CACHE_ENABLED: process.env.CACHE_ENABLED !== 'false',
  CACHE_TTL: parseInt(process.env.REDIS_TTL_SECONDS || process.env.CACHE_TTL || '3600', 10),
  CACHE_MODE: process.env.CACHE_MODE || 'enabled',
  
  // JWT
  JWT_SECRET: process.env.JWT_SECRET || 'your-secret-key',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  
  // CORS
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:5173',
  
  // AI Services
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
  
  // Scraping
  MAX_CONCURRENT_SCRAPES: parseInt(process.env.MAX_CONCURRENT_SCRAPES || '5', 10),
  SCRAPE_TIMEOUT: parseInt(process.env.SCRAPE_TIMEOUT || '15000', 10), // Reduced from 60s to 15s
  USER_AGENT: process.env.USER_AGENT || 'Mozilla/5.0 (compatible; AIScrape/1.0)',
  PROXY_URL: process.env.PROXY_URL,
  PROXY_URLS: process.env.PROXY_URLS || process.env.PROXY_URL, // Comma-separated proxy URLs
  PROXY_HEALTH_CHECK_INTERVAL: parseInt(process.env.PROXY_HEALTH_CHECK_INTERVAL || '300000', 10), // 5 minutes
  PROXY_HEALTH_CHECK_TIMEOUT: parseInt(process.env.PROXY_HEALTH_CHECK_TIMEOUT || '10000', 10), // 10 seconds
  PROXY_ROTATION_STRATEGY: process.env.PROXY_ROTATION_STRATEGY || 'round_robin',
  
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
  
  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10), // 1 minute
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10), // 100 requests per window
  RATE_LIMIT_ENABLED: process.env.RATE_LIMIT_ENABLED !== 'false', // Default true
  
  // Circuit Breaker
  CIRCUIT_BREAKER_TIMEOUT: parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT || '10000', 10), // 10 seconds
  CIRCUIT_BREAKER_ERROR_THRESHOLD: parseInt(process.env.CIRCUIT_BREAKER_ERROR_THRESHOLD || '50', 10), // 50%
  CIRCUIT_BREAKER_RESET_TIMEOUT: parseInt(process.env.CIRCUIT_BREAKER_RESET_TIMEOUT || '30000', 10), // 30 seconds
  CIRCUIT_BREAKER_MIN_REQUESTS: parseInt(process.env.CIRCUIT_BREAKER_MIN_REQUESTS || '5', 10), // Minimum 5 requests

  // Cosine Similarity Extraction
  COSINE_SIMILARITY_ENABLED: process.env.COSINE_SIMILARITY_ENABLED !== 'false', // Default true
  COSINE_SIMILARITY_THRESHOLD: parseFloat(process.env.COSINE_SIMILARITY_THRESHOLD || '0.3'), // 0.3 similarity threshold
  COSINE_SIMILARITY_MAX_ENTITIES: parseInt(process.env.COSINE_SIMILARITY_MAX_ENTITIES || '50', 10), // Max 50 entities
  COSINE_SIMILARITY_MIN_SEGMENT_LENGTH: parseInt(process.env.COSINE_SIMILARITY_MIN_SEGMENT_LENGTH || '20', 10), // Min 20 chars

  // Rule-Based Extraction
  RULE_BASED_ENABLED: process.env.RULE_BASED_ENABLED !== 'false', // Default true
  RULE_BASED_DEFAULT_CONFIDENCE: parseFloat(process.env.RULE_BASED_DEFAULT_CONFIDENCE || '0.8'), // Default 0.8 confidence
  RULE_BASED_STRICT_MODE: process.env.RULE_BASED_STRICT_MODE === 'true', // Default false

  // Content Validation
  CONTENT_VALIDATION_ENABLED: process.env.CONTENT_VALIDATION_ENABLED !== 'false', // Default true
  CONTENT_VALIDATION_STRATEGY: process.env.CONTENT_VALIDATION_STRATEGY || 'hybrid', // Default hybrid
  CONTENT_VALIDATION_CACHE_ENABLED: process.env.CONTENT_VALIDATION_CACHE_ENABLED !== 'false', // Default true
  CONTENT_VALIDATION_MIN_SCORE: parseFloat(process.env.CONTENT_VALIDATION_MIN_SCORE || '0.5'), // Default 0.5
  CONTENT_VALIDATION_MIN_LENGTH: parseInt(process.env.CONTENT_VALIDATION_MIN_LENGTH || '100', 10), // Default 100

  // Crawler Orchestration
  CRAWLER_ORCHESTRATION_STRATEGY: process.env.CRAWLER_ORCHESTRATION_STRATEGY || 'speed_first', // Default speed_first
  CRAWLER_ORCHESTRATION_ENABLED: process.env.CRAWLER_ORCHESTRATION_ENABLED !== 'false', // Default true
  CRAWLER_ADAPTIVE_LEARNING_ENABLED: process.env.CRAWLER_ADAPTIVE_LEARNING_ENABLED === 'true', // Default false

  // AI Agent Crawling
  AI_AGENT_MAX_PAGES: parseInt(process.env.AI_AGENT_MAX_PAGES || '10', 10), // Default 10
  AI_AGENT_MAX_DEPTH: parseInt(process.env.AI_AGENT_MAX_DEPTH || '3', 10), // Default 3
  AI_AGENT_MAX_AJAX_ENDPOINTS: parseInt(process.env.AI_AGENT_MAX_AJAX_ENDPOINTS || '10', 10), // Default 10
  AI_AGENT_FOLLOW_EXTERNAL_LINKS: process.env.AI_AGENT_FOLLOW_EXTERNAL_LINKS === 'true', // Default false
  AI_AGENT_DELAY_BETWEEN_REQUESTS: parseInt(process.env.AI_AGENT_DELAY_BETWEEN_REQUESTS || '0', 10), // Default 0ms
  AI_AGENT_TIMEOUT: parseInt(process.env.AI_AGENT_TIMEOUT || '5000', 10), // Default 5000ms
} as const;

export default env;

