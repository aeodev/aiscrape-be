/**
 * URL Normalization Utilities
 * Functions for normalizing and validating URLs
 */

import { CrawlingConfig } from './crawling.types';

/**
 * Normalize a URL by removing fragments, sorting query params, etc.
 */
export function normalizeUrl(url: string, baseUrl?: string): string {
  try {
    // Handle relative URLs
    let absoluteUrl = url;
    if (baseUrl && !url.startsWith('http://') && !url.startsWith('https://')) {
      try {
        absoluteUrl = new URL(url, baseUrl).href;
      } catch {
        return url; // Invalid URL, return as-is
      }
    }

    const urlObj = new URL(absoluteUrl);

    // Remove fragment
    urlObj.hash = '';

    // Sort query parameters
    const sortedParams = Array.from(urlObj.searchParams.entries()).sort(([a], [b]) =>
      a.localeCompare(b)
    );
    urlObj.search = '';
    sortedParams.forEach(([key, value]) => {
      urlObj.searchParams.append(key, value);
    });

    // Normalize protocol (prefer https)
    if (urlObj.protocol === 'http:' && urlObj.hostname !== 'localhost') {
      // Keep http for localhost, but could normalize to https for others
      // For now, keep original protocol
    }

    // Remove trailing slash (except for root)
    let pathname = urlObj.pathname;
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
      urlObj.pathname = pathname;
    }

    // Normalize hostname (lowercase)
    urlObj.hostname = urlObj.hostname.toLowerCase();

    return urlObj.href;
  } catch (error) {
    // If URL parsing fails, return original
    return url;
  }
}

/**
 * Check if two URLs are from the same domain
 */
export function isSameDomain(url1: string, url2: string): boolean {
  try {
    const domain1 = extractDomain(url1);
    const domain2 = extractDomain(url2);
    return domain1 === domain2;
  } catch {
    return false;
  }
}

/**
 * Check if a link is external (different domain)
 */
export function isExternalLink(url: string, baseUrl: string): boolean {
  try {
    return !isSameDomain(url, baseUrl);
  } catch {
    return true; // If we can't determine, assume external
  }
}

/**
 * Determine if a link should be followed based on config
 */
export function shouldFollowLink(url: string, baseUrl: string, config: CrawlingConfig): boolean {
  try {
    const normalizedUrl = normalizeUrl(url, baseUrl);
    const urlObj = new URL(normalizedUrl);

    // Check blocked patterns
    for (const pattern of config.blockedPatterns) {
      try {
        const regex = new RegExp(pattern);
        if (regex.test(normalizedUrl)) {
          return false;
        }
      } catch {
        // Invalid regex, skip
      }
    }

    // Check external links
    if (!config.followExternalLinks && isExternalLink(normalizedUrl, baseUrl)) {
      return false;
    }

    // Check allowed domains
    if (config.allowedDomains.length > 0) {
      const domain = extractDomain(normalizedUrl);
      const isAllowed = config.allowedDomains.some((allowedDomain) => {
        return domain === allowedDomain || domain.endsWith(`.${allowedDomain}`);
      });
      if (!isAllowed) {
        return false;
      }
    } else {
      // If no allowed domains specified, only allow same domain
      if (!isSameDomain(normalizedUrl, baseUrl)) {
        return false;
      }
    }

    // Block common non-content URLs
    const blockedExtensions = ['.pdf', '.zip', '.jpg', '.jpeg', '.png', '.gif', '.svg', '.css', '.js', '.xml'];
    const pathname = urlObj.pathname.toLowerCase();
    if (blockedExtensions.some((ext) => pathname.endsWith(ext))) {
      return false;
    }

    // Block common non-content paths
    const blockedPaths = ['/api/', '/ajax/', '/json/', '/xml/', '/rss/', '/feed/'];
    if (blockedPaths.some((path) => pathname.includes(path))) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Extract domain from URL
 */
export function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    // Remove www. prefix for comparison
    let hostname = urlObj.hostname.toLowerCase();
    if (hostname.startsWith('www.')) {
      hostname = hostname.substring(4);
    }
    return hostname;
  } catch {
    return '';
  }
}

/**
 * Validate URL format
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    // Try with base URL
    try {
      new URL(url, 'http://example.com');
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Resolve relative URL to absolute
 */
export function resolveUrl(url: string, baseUrl: string): string {
  try {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    return new URL(url, baseUrl).href;
  } catch {
    return url;
  }
}



