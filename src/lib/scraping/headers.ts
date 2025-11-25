/**
 * Header Spoofing Utilities
 * Make requests appear as real browser traffic
 */

export interface BrowserFingerprint {
  userAgent: string;
  acceptLanguage: string;
  acceptEncoding: string;
  accept: string;
  connection: string;
  secFetchDest?: string;
  secFetchMode?: string;
  secFetchSite?: string;
  secChUa?: string;
  secChUaPlatform?: string;
  secChUaMobile?: string;
}

// Realistic browser fingerprints
const BROWSER_FINGERPRINTS: BrowserFingerprint[] = [
  // Chrome on Windows
  {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    acceptLanguage: 'en-US,en;q=0.9',
    acceptEncoding: 'gzip, deflate, br',
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    connection: 'keep-alive',
    secFetchDest: 'document',
    secFetchMode: 'navigate',
    secFetchSite: 'none',
    secChUa: '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    secChUaPlatform: '"Windows"',
    secChUaMobile: '?0',
  },
  // Chrome on Mac
  {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    acceptLanguage: 'en-US,en;q=0.9',
    acceptEncoding: 'gzip, deflate, br',
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    connection: 'keep-alive',
    secFetchDest: 'document',
    secFetchMode: 'navigate',
    secFetchSite: 'none',
    secChUa: '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    secChUaPlatform: '"macOS"',
    secChUaMobile: '?0',
  },
  // Firefox on Windows
  {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    acceptLanguage: 'en-US,en;q=0.5',
    acceptEncoding: 'gzip, deflate, br',
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    connection: 'keep-alive',
  },
  // Safari on Mac
  {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
    acceptLanguage: 'en-US,en;q=0.9',
    acceptEncoding: 'gzip, deflate, br',
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    connection: 'keep-alive',
  },
  // Edge on Windows
  {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
    acceptLanguage: 'en-US,en;q=0.9',
    acceptEncoding: 'gzip, deflate, br',
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
    connection: 'keep-alive',
    secFetchDest: 'document',
    secFetchMode: 'navigate',
    secFetchSite: 'none',
    secChUa: '"Not_A Brand";v="8", "Chromium";v="120", "Microsoft Edge";v="120"',
    secChUaPlatform: '"Windows"',
    secChUaMobile: '?0',
  },
];

/**
 * Get a random browser fingerprint
 */
export function getRandomFingerprint(): BrowserFingerprint {
  return BROWSER_FINGERPRINTS[Math.floor(Math.random() * BROWSER_FINGERPRINTS.length)];
}

/**
 * Build headers object from fingerprint
 */
export function buildHeaders(fingerprint: BrowserFingerprint, customHeaders?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': fingerprint.userAgent,
    'Accept-Language': fingerprint.acceptLanguage,
    'Accept-Encoding': fingerprint.acceptEncoding,
    'Accept': fingerprint.accept,
    'Connection': fingerprint.connection,
  };

  // Add Sec-* headers if present (Chrome/Edge)
  if (fingerprint.secFetchDest) headers['Sec-Fetch-Dest'] = fingerprint.secFetchDest;
  if (fingerprint.secFetchMode) headers['Sec-Fetch-Mode'] = fingerprint.secFetchMode;
  if (fingerprint.secFetchSite) headers['Sec-Fetch-Site'] = fingerprint.secFetchSite;
  if (fingerprint.secChUa) headers['Sec-Ch-Ua'] = fingerprint.secChUa;
  if (fingerprint.secChUaPlatform) headers['Sec-Ch-Ua-Platform'] = fingerprint.secChUaPlatform;
  if (fingerprint.secChUaMobile) headers['Sec-Ch-Ua-Mobile'] = fingerprint.secChUaMobile;

  // Merge custom headers
  if (customHeaders) {
    Object.assign(headers, customHeaders);
  }

  return headers;
}

/**
 * Get random headers for a request
 */
export function getRandomHeaders(customHeaders?: Record<string, string>): Record<string, string> {
  return buildHeaders(getRandomFingerprint(), customHeaders);
}

/**
 * Add referer header to simulate navigation
 */
export function withReferer(headers: Record<string, string>, referer: string): Record<string, string> {
  return {
    ...headers,
    'Referer': referer,
    'Sec-Fetch-Site': 'same-origin',
  };
}

/**
 * Add origin header for POST requests
 */
export function withOrigin(headers: Record<string, string>, origin: string): Record<string, string> {
  return {
    ...headers,
    'Origin': origin,
  };
}

/**
 * Headers for form submission
 */
export function getFormHeaders(baseHeaders: Record<string, string>): Record<string, string> {
  return {
    ...baseHeaders,
    'Content-Type': 'application/x-www-form-urlencoded',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-User': '?1',
  };
}

/**
 * Headers for AJAX/XHR requests
 */
export function getAjaxHeaders(baseHeaders: Record<string, string>): Record<string, string> {
  return {
    ...baseHeaders,
    'X-Requested-With': 'XMLHttpRequest',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
  };
}

