# AIScrape Usage Examples

Practical examples for using the AIScrape API in various scenarios.

## Table of Contents

- [Basic Scraping](#basic-scraping)
- [Advanced Scraping](#advanced-scraping)
- [Entity Extraction](#entity-extraction)
- [Real-time Updates](#real-time-updates)
- [LinkedIn Scraping](#linkedin-scraping)
- [Integration Examples](#integration-examples)

---

## Basic Scraping

### cURL Example

```bash
# Create a scrape job
curl -X POST http://localhost:5000/api/scrape \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "scraperType": "AUTO"
  }'

# Get job status
curl http://localhost:5000/api/scrape/job-id-123
```

### JavaScript (Node.js) Example

```javascript
const axios = require('axios');

async function scrapeUrl(url) {
  try {
    // Create scrape job
    const response = await axios.post('http://localhost:5000/api/scrape', {
      url: url,
      scraperType: 'AUTO'
    });
    
    const jobId = response.data.job.id;
    console.log('Job created:', jobId);
    
    // Poll for completion
    let job = null;
    do {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const statusResponse = await axios.get(`http://localhost:5000/api/scrape/${jobId}`);
      job = statusResponse.data.job;
      console.log('Status:', job.status);
    } while (job.status === 'QUEUED' || job.status === 'RUNNING');
    
    // Display results
    console.log('HTML:', job.html?.substring(0, 100));
    console.log('Markdown:', job.markdown?.substring(0, 100));
    console.log('Text:', job.text?.substring(0, 100));
    
    return job;
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

scrapeUrl('https://example.com');
```

### Python Example

```python
import requests
import time

def scrape_url(url):
    # Create scrape job
    response = requests.post('http://localhost:5000/api/scrape', json={
        'url': url,
        'scraperType': 'AUTO'
    })
    
    job_id = response.json()['job']['id']
    print(f'Job created: {job_id}')
    
    # Poll for completion
    while True:
        status_response = requests.get(f'http://localhost:5000/api/scrape/{job_id}')
        job = status_response.json()['job']
        
        print(f'Status: {job["status"]}')
        
        if job['status'] in ['COMPLETED', 'FAILED', 'CANCELLED']:
            break
        
        time.sleep(1)
    
    # Display results
    print(f'HTML: {job.get("html", "")[:100]}')
    print(f'Markdown: {job.get("markdown", "")[:100]}')
    print(f'Text: {job.get("text", "")[:100]}')
    
    return job

scrape_url('https://example.com')
```

---

## Advanced Scraping

### Using Different Scraper Types

```javascript
const axios = require('axios');

// HTTP scraper for static content
const httpJob = await axios.post('http://localhost:5000/api/scrape', {
  url: 'https://example.com',
  scraperType: 'HTTP'
});

// Playwright scraper for dynamic content
const playwrightJob = await axios.post('http://localhost:5000/api/scrape', {
  url: 'https://spa-example.com',
  scraperType: 'PLAYWRIGHT',
  includeScreenshots: true
});

// Smart Playwright with resource blocking
const smartJob = await axios.post('http://localhost:5000/api/scrape', {
  url: 'https://example.com',
  scraperType: 'PLAYWRIGHT_SMART',
  blockResources: true  // Block images/stylesheets for faster scraping
});

// AI Agent for complex multi-page crawling
const aiAgentJob = await axios.post('http://localhost:5000/api/scrape', {
  url: 'https://example.com',
  scraperType: 'AI_AGENT',
  taskDescription: 'Explore all pages and extract all product information'
});
```

### Scrape with Task Description

```javascript
const job = await axios.post('http://localhost:5000/api/scrape', {
  url: 'https://company-website.com',
  taskDescription: 'Extract all contact information including email, phone, and address',
  scraperType: 'AUTO'
});

// The extraction manager will use this task description
// to extract relevant entities
```

### Force Refresh (Bypass Cache)

```javascript
// Force a fresh scrape, bypassing cache
const job = await axios.post('http://localhost:5000/api/scrape/ask', {
  input: 'refresh https://example.com and get the latest content',
  forceRefresh: true
});
```

---

## Entity Extraction

### Extract Specific Entity Types

```javascript
const job = await axios.post('http://localhost:5000/api/scrape', {
  url: 'https://company-website.com',
  taskDescription: 'Extract company information and contact details',
  scraperType: 'AUTO'
});

// Wait for completion, then check extracted entities
const completedJob = await axios.get(`http://localhost:5000/api/scrape/${job.data.job.id}`);

completedJob.data.job.extractedEntities.forEach(entity => {
  console.log(`Type: ${entity.type}`);
  console.log(`Data:`, entity.data);
  console.log(`Confidence: ${entity.confidence}`);
});
```

### Using Unified Scrape-and-Answer Endpoint

```javascript
// Scrape and answer in one request
const result = await axios.post('http://localhost:5000/api/scrape/ask', {
  input: 'What is the contact email on https://example.com?'
});

console.log('Answer:', result.data.answer);
console.log('Extracted Entities:', result.data.extractedEntities);
```

---

## Real-time Updates

### JavaScript with Socket.IO

```javascript
const io = require('socket.io-client');
const axios = require('axios');

// Connect to Socket.IO server
const socket = io('http://localhost:5000');

socket.on('connect', async () => {
  console.log('Connected to server');
  
  // Create a scrape job
  const response = await axios.post('http://localhost:5000/api/scrape', {
    url: 'https://example.com'
  });
  
  const jobId = response.data.job.id;
  
  // Join job room to receive updates
  socket.emit('join-job', { jobId });
  
  // Listen for progress updates
  socket.on('scrape:progress', (data) => {
    if (data.jobId === jobId) {
      console.log(`Progress: ${data.progress}%`);
      console.log(`Status: ${data.status}`);
      console.log(`Message: ${data.message}`);
    }
  });
  
  // Listen for completion
  socket.on('scrape:complete', (data) => {
    if (data.jobId === jobId) {
      console.log('Job completed!');
      console.log('HTML length:', data.job.html?.length);
      console.log('Markdown length:', data.job.markdown?.length);
    }
  });
  
  // Listen for errors
  socket.on('scrape:error', (data) => {
    if (data.jobId === jobId) {
      console.error('Error:', data.error);
    }
  });
});
```

### React Frontend Integration

```typescript
import { useEffect, useState } from 'react';
import { useSocket } from '@/composables/useSocket';
import axios from 'axios';

function ScraperComponent() {
  const { socket, isConnected } = useSocket();
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('idle');
  
  const startScraping = async (url: string) => {
    // Create job
    const response = await axios.post('/api/scrape', { url });
    const jobId = response.data.job.id;
    
    // Join job room
    socket?.emit('join-job', { jobId });
    
    // Listen for updates
    socket?.on('scrape:progress', (data: any) => {
      if (data.jobId === jobId) {
        setProgress(data.progress);
        setStatus(data.status);
      }
    });
    
    socket?.on('scrape:complete', (data: any) => {
      if (data.jobId === jobId) {
        setStatus('completed');
        setProgress(100);
      }
    });
  };
  
  return (
    <div>
      <button onClick={() => startScraping('https://example.com')}>
        Start Scraping
      </button>
      <div>Status: {status}</div>
      <div>Progress: {progress}%</div>
    </div>
  );
}
```

---

## LinkedIn Scraping

### Get LinkedIn Cookie Instructions

```javascript
const instructions = await axios.get('http://localhost:5000/api/scrape/linkedin/instructions');
console.log(instructions.data.instructions);
console.log(instructions.data.example);
```

### Scrape LinkedIn with Authentication

```javascript
// First, extract cookies from your browser (see instructions endpoint)
const linkedinAuth = {
  cookies: [
    {
      name: 'li_at',
      value: 'YOUR_LI_AT_COOKIE_VALUE',
      domain: '.linkedin.com',
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'None'
    },
    {
      name: 'JSESSIONID',
      value: 'YOUR_JSESSIONID_VALUE',
      domain: '.linkedin.com',
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'None'
    }
  ]
};

// Scrape LinkedIn profile
const job = await axios.post('http://localhost:5000/api/scrape', {
  url: 'https://www.linkedin.com/in/profile-name',
  scraperType: 'LINKEDIN',
  scrapeOptions: {
    linkedinAuth: linkedinAuth
  }
});
```

---

## Integration Examples

### Express.js Backend Integration

```javascript
const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// Proxy endpoint that uses AIScrape
app.post('/api/proxy-scrape', async (req, res) => {
  try {
    const { url } = req.body;
    
    // Call AIScrape API
    const scrapeResponse = await axios.post('http://localhost:5000/api/scrape/ask', {
      input: `Scrape ${url} and extract all product information`
    });
    
    res.json({
      success: true,
      data: scrapeResponse.data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.listen(3001);
```

### Webhook Integration

```javascript
const axios = require('axios');

async function scrapeWithWebhook(url, webhookUrl) {
  // Create scrape job
  const job = await axios.post('http://localhost:5000/api/scrape', {
    url: url
  });
  
  const jobId = job.data.job.id;
  
  // Poll for completion
  const checkStatus = setInterval(async () => {
    const statusResponse = await axios.get(`http://localhost:5000/api/scrape/${jobId}`);
    const jobData = statusResponse.data.job;
    
    if (jobData.status === 'COMPLETED') {
      clearInterval(checkStatus);
      
      // Send webhook notification
      await axios.post(webhookUrl, {
        jobId: jobId,
        status: 'completed',
        data: {
          html: jobData.html,
          markdown: jobData.markdown,
          text: jobData.text,
          entities: jobData.extractedEntities
        }
      });
    } else if (jobData.status === 'FAILED') {
      clearInterval(checkStatus);
      
      // Send error webhook
      await axios.post(webhookUrl, {
        jobId: jobId,
        status: 'failed',
        error: jobData.metadata?.errorMessage
      });
    }
  }, 1000);
}
```

### Batch Scraping

```javascript
const axios = require('axios');

async function batchScrape(urls) {
  const jobs = [];
  
  // Create all jobs
  for (const url of urls) {
    const job = await axios.post('http://localhost:5000/api/scrape', {
      url: url,
      scraperType: 'AUTO'
    });
    jobs.push(job.data.job);
  }
  
  // Wait for all to complete
  const results = await Promise.all(
    jobs.map(async (job) => {
      while (true) {
        const statusResponse = await axios.get(`http://localhost:5000/api/scrape/${job.id}`);
        const jobData = statusResponse.data.job;
        
        if (jobData.status === 'COMPLETED') {
          return jobData;
        } else if (jobData.status === 'FAILED') {
          throw new Error(`Job ${job.id} failed`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    })
  );
  
  return results;
}

// Usage
batchScrape([
  'https://example.com',
  'https://example.org',
  'https://example.net'
]).then(results => {
  console.log(`Scraped ${results.length} URLs`);
});
```

### Chat with Scraped Content

```javascript
const axios = require('axios');

async function chatWithScrapedContent(url, question) {
  // First, scrape the URL
  const scrapeResponse = await axios.post('http://localhost:5000/api/scrape', {
    url: url
  });
  
  const jobId = scrapeResponse.data.job.id;
  
  // Wait for completion
  let job = null;
  do {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const statusResponse = await axios.get(`http://localhost:5000/api/scrape/${jobId}`);
    job = statusResponse.data.job;
  } while (job.status === 'QUEUED' || job.status === 'RUNNING');
  
  // Chat with the scraped content
  const chatResponse = await axios.post(`http://localhost:5000/api/scrape/${jobId}/chat`, {
    message: question
  });
  
  return chatResponse.data.response;
}

// Usage
chatWithScrapedContent(
  'https://example.com',
  'What is the main topic of this page?'
).then(answer => {
  console.log('Answer:', answer);
});
```

---

## Error Handling

### Comprehensive Error Handling Example

```javascript
const axios = require('axios');

async function scrapeWithErrorHandling(url) {
  try {
    // Create job
    const jobResponse = await axios.post('http://localhost:5000/api/scrape', {
      url: url
    });
    
    const jobId = jobResponse.data.job.id;
    
    // Poll with timeout
    const timeout = 60000; // 60 seconds
    const startTime = Date.now();
    
    while (true) {
      if (Date.now() - startTime > timeout) {
        throw new Error('Scraping timeout');
      }
      
      try {
        const statusResponse = await axios.get(`http://localhost:5000/api/scrape/${jobId}`);
        const job = statusResponse.data.job;
        
        if (job.status === 'COMPLETED') {
          return job;
        } else if (job.status === 'FAILED') {
          throw new Error(job.metadata?.errorMessage || 'Scraping failed');
        } else if (job.status === 'CANCELLED') {
          throw new Error('Job was cancelled');
        }
      } catch (error) {
        if (error.response?.status === 404) {
          throw new Error('Job not found');
        }
        throw error;
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  } catch (error) {
    if (error.response) {
      // API error
      console.error('API Error:', error.response.data);
    } else {
      // Network or other error
      console.error('Error:', error.message);
    }
    throw error;
  }
}
```

---

## Best Practices

1. **Use AUTO scraper type** unless you have specific requirements
2. **Set session IDs** to group related jobs: `headers: { 'x-session-id': 'session-123' }`
3. **Use Socket.IO** for real-time updates instead of polling
4. **Handle errors gracefully** with try-catch and proper error messages
5. **Respect rate limits** - implement exponential backoff for retries
6. **Use caching** - jobs are cached by default, use `forceRefresh` when needed
7. **Monitor job status** - set appropriate timeouts and handle edge cases
8. **Batch operations** - use Promise.all for parallel scraping when appropriate

---

## Additional Resources

- [API Documentation](./API.md) - Complete API reference
- [Architecture Documentation](../ARCHITECTURE.md) - System architecture details
- [Custom Strategy Guide](./CUSTOM_STRATEGY_GUIDE.md) - Creating custom extraction strategies


