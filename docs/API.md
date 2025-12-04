# AIScrape API Documentation

Complete API reference for the AIScrape web scraping platform.

## Base URL

```
http://localhost:5000/api/scrape
```

## Authentication

Currently, the API is public. Future versions may require authentication via JWT tokens.

### Headers

- `x-session-id` (optional): Session identifier for grouping jobs
- `Authorization` (optional): Bearer token for authenticated requests

## Rate Limiting

Rate limiting is configured via environment variables:
- `RATE_LIMIT_ENABLED`: Enable/disable rate limiting (default: true)
- `RATE_LIMIT_WINDOW_MS`: Time window in milliseconds (default: 60000)
- `RATE_LIMIT_MAX_REQUESTS`: Maximum requests per window (default: 100)

When rate limited, the API returns:
- Status Code: `429 Too Many Requests`
- Header: `Retry-After` (seconds until retry)

## Error Responses

All error responses follow this format:

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

### Common Error Codes

- `400`: Bad Request - Invalid input parameters
- `401`: Unauthorized - Authentication required
- `404`: Not Found - Resource not found
- `429`: Too Many Requests - Rate limit exceeded
- `500`: Internal Server Error - Server error

---

## Endpoints

### 1. Create Scrape Job

Create a new web scraping job.

**Endpoint:** `POST /api/scrape`

**Request Body:**

```json
{
  "url": "https://example.com",
  "taskDescription": "Extract contact information",
  "scraperType": "AUTO",
  "useProxy": false,
  "blockResources": false,
  "includeScreenshots": false
}
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | Yes | URL to scrape |
| `taskDescription` | string | No | Description of what to extract |
| `scraperType` | string | No | Scraper type: `AUTO`, `HTTP`, `CHEERIO`, `PLAYWRIGHT`, `PLAYWRIGHT_SMART`, `JINA`, `AI_AGENT`, `LINKEDIN` |
| `useProxy` | boolean | No | Use proxy for scraping (default: false) |
| `blockResources` | boolean | No | Block images/stylesheets for faster scraping (default: false) |
| `includeScreenshots` | boolean | No | Capture screenshots (default: false) |

**Response:** `201 Created`

```json
{
  "success": true,
  "job": {
    "id": "job-id-123",
    "url": "https://example.com",
    "status": "QUEUED",
    "taskDescription": "Extract contact information",
    "scraperType": "AUTO",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

**Error Responses:**

- `400`: URL is required or invalid URL format

---

### 2. Get Scrape Job

Get a specific scrape job by ID.

**Endpoint:** `GET /api/scrape/:id`

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Job ID |

**Response:** `200 OK`

```json
{
  "success": true,
  "job": {
    "id": "job-id-123",
    "url": "https://example.com",
    "status": "COMPLETED",
    "html": "<html>...</html>",
    "markdown": "# Example",
    "text": "Example content",
    "extractedEntities": [],
    "metadata": {
      "finalUrl": "https://example.com",
      "statusCode": 200,
      "duration": 1234,
      "requestCount": 1
    },
    "createdAt": "2024-01-01T00:00:00.000Z",
    "completedAt": "2024-01-01T00:00:01.234Z"
  }
}
```

**Error Responses:**

- `404`: Scrape job not found

---

### 3. List Scrape Jobs

Get a list of scrape jobs with pagination and filtering.

**Endpoint:** `GET /api/scrape`

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `page` | number | No | Page number (default: 1) |
| `limit` | number | No | Items per page (default: 20) |
| `status` | string | No | Filter by status: `QUEUED`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED` |
| `sessionId` | string | No | Filter by session ID |

**Response:** `200 OK`

```json
{
  "success": true,
  "jobs": [
    {
      "id": "job-id-123",
      "url": "https://example.com",
      "status": "COMPLETED",
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "total": 100,
  "page": 1,
  "limit": 20
}
```

**Error Responses:**

- `401`: Authentication required (when filtering by user)

---

### 4. Delete Scrape Job

Delete a scrape job.

**Endpoint:** `DELETE /api/scrape/:id`

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Job ID |

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Job deleted successfully"
}
```

**Error Responses:**

- `404`: Scrape job not found

---

### 5. Cancel Scrape Job

Cancel a running or queued scrape job.

**Endpoint:** `POST /api/scrape/:id/cancel`

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Job ID |

**Response:** `200 OK`

```json
{
  "success": true,
  "job": {
    "id": "job-id-123",
    "status": "CANCELLED",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

**Error Responses:**

- `404`: Scrape job not found

---

### 6. Chat with Job

Chat with a completed scrape job using AI.

**Endpoint:** `POST /api/scrape/:id/chat`

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Job ID |

**Request Body:**

```json
{
  "message": "What is the main topic of this page?"
}
```

**Response:** `200 OK`

```json
{
  "success": true,
  "response": "The main topic is...",
  "model": "gemini-pro",
  "tokensUsed": 150
}
```

**Error Responses:**

- `400`: Message is required
- `404`: Scrape job not found

---

### 7. Scrape and Answer (Unified Endpoint)

Scrape a URL and answer a question in one request.

**Endpoint:** `POST /api/scrape/ask`

**Request Body:**

```json
{
  "input": "What is the contact email on https://example.com?",
  "scraperType": "AUTO",
  "useProxy": false,
  "blockResources": false,
  "includeScreenshots": false,
  "forceRefresh": false,
  "linkedinAuth": {
    "cookies": []
  }
}
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `input` | string | Yes | Question or URL to scrape. Can include keywords like "refresh" or "rescrape" to force fresh scrape |
| `scraperType` | string | No | Scraper type (default: AUTO) |
| `useProxy` | boolean | No | Use proxy (default: false) |
| `blockResources` | boolean | No | Block resources (default: false) |
| `includeScreenshots` | boolean | No | Include screenshots (default: false) |
| `forceRefresh` | boolean | No | Force fresh scrape, bypass cache |
| `linkedinAuth` | object | No | LinkedIn authentication cookies (for LinkedIn URLs) |

**Special Input Keywords:**

- `refresh`, `rescrape`, `force`, `new scrape`: Forces a fresh scrape, bypassing cache
- `all details`, `explore`, `deep scrape`, `click`, `visit all`, `follow links`, `learn more`, `ai agent`: Auto-detects AI Agent mode for complex tasks

**Response:** `200 OK`

```json
{
  "success": true,
  "answer": "The contact email is contact@example.com",
  "job": {
    "id": "job-id-123",
    "url": "https://example.com",
    "status": "COMPLETED"
  },
  "extractedEntities": [
    {
      "type": "CONTACT",
      "data": {
        "email": "contact@example.com"
      },
      "confidence": 0.95
    }
  ]
}
```

**Error Responses:**

- `400`: Input is required

---

### 8. Get Statistics

Get scraping statistics.

**Endpoint:** `GET /api/scrape/stats`

**Response:** `200 OK`

```json
{
  "success": true,
  "stats": {
    "totalJobs": 1000,
    "completedJobs": 850,
    "failedJobs": 50,
    "runningJobs": 10,
    "queuedJobs": 5,
    "averageDuration": 1234,
    "successRate": 0.94
  }
}
```

---

### 9. Get LinkedIn Instructions

Get instructions for extracting LinkedIn cookies for authentication.

**Endpoint:** `GET /api/scrape/linkedin/instructions`

**Response:** `200 OK`

```json
{
  "success": true,
  "instructions": "To scrape LinkedIn pages, you need to extract cookies from your browser...",
  "example": {
    "linkedinAuth": {
      "cookies": [
        {
          "name": "li_at",
          "value": "YOUR_LI_AT_COOKIE_VALUE",
          "domain": ".linkedin.com",
          "path": "/",
          "secure": true,
          "httpOnly": true,
          "sameSite": "None"
        },
        {
          "name": "JSESSIONID",
          "value": "YOUR_JSESSIONID_VALUE",
          "domain": ".linkedin.com",
          "path": "/",
          "secure": true,
          "httpOnly": true,
          "sameSite": "None"
        }
      ]
    }
  }
}
```

---

## Scraper Types

### AUTO
Automatically selects the best scraper based on URL and content.

### HTTP
Fast HTTP-based scraper for static content.

### CHEERIO
Cheerio-based scraper for HTML parsing.

### PLAYWRIGHT
Full browser automation with Playwright for dynamic content.

### PLAYWRIGHT_SMART
Smart Playwright scraper with optimizations.

### JINA
Jina AI-powered scraper for enhanced extraction.

### AI_AGENT
AI agent scraper for complex multi-page crawling.

### LINKEDIN
LinkedIn-specific scraper with authentication support.

---

## Job Status

- `QUEUED`: Job is queued and waiting to start
- `RUNNING`: Job is currently running
- `COMPLETED`: Job completed successfully
- `FAILED`: Job failed with an error
- `CANCELLED`: Job was cancelled

---

## Real-time Updates (Socket.IO)

Jobs emit real-time progress updates via Socket.IO.

### Connect to Socket.IO

```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:5000');

socket.on('connect', () => {
  console.log('Connected to server');
});
```

### Join Job Room

```javascript
socket.emit('join-job', { jobId: 'job-id-123' });
```

### Listen for Progress Updates

```javascript
socket.on('scrape:progress', (data) => {
  console.log('Progress:', data.progress, '%');
  console.log('Status:', data.status);
  console.log('Message:', data.message);
});
```

### Listen for Completion

```javascript
socket.on('scrape:complete', (data) => {
  console.log('Job completed:', data.job);
});
```

### Listen for Errors

```javascript
socket.on('scrape:error', (data) => {
  console.error('Error:', data.error);
});
```

---

## Entity Types

Extracted entities can be of the following types:

- `COMPANY`: Company information
- `PERSON`: Person information
- `PRODUCT`: Product information
- `ARTICLE`: Article/blog post
- `CONTACT`: Contact information (email, phone, etc.)
- `PRICING`: Pricing information
- `CUSTOM`: Custom entity type

---

## Examples

### Basic Scraping

```bash
curl -X POST http://localhost:5000/api/scrape \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "scraperType": "AUTO"
  }'
```

### Scrape and Answer

```bash
curl -X POST http://localhost:5000/api/scrape/ask \
  -H "Content-Type: application/json" \
  -d '{
    "input": "What is the main heading on https://example.com?"
  }'
```

### Get Job Status

```bash
curl http://localhost:5000/api/scrape/job-id-123
```

### Cancel Job

```bash
curl -X POST http://localhost:5000/api/scrape/job-id-123/cancel
```

---

## Best Practices

1. **Use AUTO scraper type** unless you have specific requirements
2. **Set session IDs** to group related jobs
3. **Use Socket.IO** for real-time progress updates
4. **Handle errors gracefully** - check status codes and error messages
5. **Respect rate limits** - implement retry logic with exponential backoff
6. **Use caching** - jobs are cached by default, use `forceRefresh` when needed
7. **Monitor job status** - poll or use Socket.IO to track job completion

---

## Support

For issues, questions, or contributions, please refer to the main project documentation.


