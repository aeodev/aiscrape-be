# Production Deployment Checklist

Comprehensive checklist for deploying AIScrape to production.

## Pre-Deployment Checklist

### Environment Configuration

- [ ] **Environment Variables**
  - [ ] `MONGODB_URI` - Production MongoDB connection string
  - [ ] `REDIS_URL` - Production Redis connection string
  - [ ] `JWT_SECRET` - Strong, randomly generated secret (use `openssl rand -hex 32`)
  - [ ] `NODE_ENV=production`
  - [ ] `PORT` - Server port (default: 5000)
  - [ ] `CLIENT_URL` - Frontend URL
  - [ ] `GEMINI_API_KEY` - Google Gemini API key (if using LLM extraction)
  - [ ] `JINA_API_KEY` - Jina API key (if using Jina scraper)
  - [ ] `RATE_LIMIT_ENABLED=true`
  - [ ] `RATE_LIMIT_WINDOW_MS` - Rate limit window (default: 60000)
  - [ ] `RATE_LIMIT_MAX_REQUESTS` - Max requests per window (default: 100)

- [ ] **Database Setup**
  - [ ] MongoDB database created and accessible
  - [ ] Database user created with appropriate permissions
  - [ ] Connection string tested
  - [ ] Database backups configured
  - [ ] Indexes created (if needed)

- [ ] **Redis Setup**
  - [ ] Redis server deployed and accessible
  - [ ] Redis persistence configured (`appendonly yes`)
  - [ ] Memory limits configured (`maxmemory`, `maxmemory-policy`)
  - [ ] Connection string tested
  - [ ] Redis backups configured

- [ ] **Security**
  - [ ] All secrets stored securely (environment variables, secrets manager)
  - [ ] CORS configured for production domain
  - [ ] Rate limiting enabled and configured
  - [ ] HTTPS/SSL certificates configured
  - [ ] Firewall rules configured
  - [ ] Security headers configured (Helmet)

### Code & Build

- [ ] **Code Quality**
  - [ ] All tests passing (`npm test`)
  - [ ] Code linted and formatted
  - [ ] No security vulnerabilities (`npm audit`)
  - [ ] TypeScript compilation successful (`npm run build`)

- [ ] **Docker Images**
  - [ ] Docker images built successfully
  - [ ] Images tagged with version numbers
  - [ ] Images pushed to container registry (if using)
  - [ ] Multi-stage build optimized for size

### Infrastructure

- [ ] **Server Requirements**
  - [ ] Node.js 18+ installed
  - [ ] Sufficient memory (minimum 2GB recommended)
  - [ ] Sufficient disk space
  - [ ] Network connectivity verified

- [ ] **Monitoring**
  - [ ] Application monitoring configured (e.g., PM2, systemd)
  - [ ] Log aggregation configured
  - [ ] Error tracking configured (e.g., Sentry)
  - [ ] Performance monitoring configured
  - [ ] Health check endpoints accessible

---

## Deployment Steps

### 1. Initial Setup

```bash
# Run setup script
./scripts/setup.sh

# Review and update .env file
nano .env
```

### 2. Build and Test

```bash
# Run tests
cd backend && npm test

# Build application
npm run build

# Verify build
ls -la dist/
```

### 3. Docker Deployment

```bash
# Build Docker images
docker-compose build

# Start services
docker-compose up -d

# Check logs
docker-compose logs -f
```

### 4. Health Checks

```bash
# Run health check script
./scripts/health-check.sh

# Or manually check
curl http://localhost:5000/health
curl http://localhost:5000/api/scrape/stats
```

---

## Post-Deployment Verification

### Service Health

- [ ] **Backend Service**
  - [ ] Health endpoint responding (`/health`)
  - [ ] API endpoints responding (`/api/scrape/stats`)
  - [ ] No errors in logs
  - [ ] Memory usage within limits
  - [ ] CPU usage normal

- [ ] **Frontend Service**
  - [ ] Frontend accessible
  - [ ] API calls working
  - [ ] Socket.IO connections working
  - [ ] No console errors

- [ ] **Database Connectivity**
  - [ ] MongoDB connection successful
  - [ ] Can read/write data
  - [ ] Indexes working correctly
  - [ ] Connection pool healthy

- [ ] **Redis Connectivity**
  - [ ] Redis connection successful
  - [ ] Cache operations working
  - [ ] Memory usage within limits
  - [ ] Persistence working

### Functionality Tests

- [ ] **Scraping Functionality**
  - [ ] Create scrape job endpoint working
  - [ ] Job execution successful
  - [ ] Results returned correctly
  - [ ] Cache working (check Redis)

- [ ] **Real-time Updates**
  - [ ] Socket.IO connections working
  - [ ] Progress updates received
  - [ ] Completion events received
  - [ ] Error events received

- [ ] **Entity Extraction**
  - [ ] Extraction strategies working
  - [ ] Entities extracted correctly
  - [ ] Fallback chains working

- [ ] **Rate Limiting**
  - [ ] Rate limits enforced
  - [ ] Rate limit headers present
  - [ ] 429 responses correct

---

## Monitoring & Maintenance

### Monitoring

- [ ] **Application Metrics**
  - [ ] Request rate monitoring
  - [ ] Response time monitoring
  - [ ] Error rate monitoring
  - [ ] Memory usage monitoring
  - [ ] CPU usage monitoring

- [ ] **Service Metrics**
  - [ ] MongoDB connection pool monitoring
  - [ ] Redis memory usage monitoring
  - [ ] Cache hit rate monitoring
  - [ ] Scraper success rate monitoring

- [ ] **Alerts**
  - [ ] High error rate alerts
  - [ ] Service down alerts
  - [ ] High memory usage alerts
  - [ ] Database connection failure alerts

### Logging

- [ ] **Log Configuration**
  - [ ] Log levels configured appropriately
  - [ ] Log rotation configured
  - [ ] Log aggregation working
  - [ ] Error logs captured

- [ ] **Log Review**
  - [ ] Review application logs regularly
  - [ ] Monitor error patterns
  - [ ] Track performance issues

### Backup & Recovery

- [ ] **Database Backups**
  - [ ] MongoDB backups scheduled
  - [ ] Backup retention policy configured
  - [ ] Backup restoration tested

- [ ] **Redis Backups**
  - [ ] Redis persistence enabled
  - [ ] Backup strategy configured
  - [ ] Backup restoration tested

- [ ] **Disaster Recovery**
  - [ ] Recovery procedures documented
  - [ ] Recovery tested
  - [ ] RTO/RPO defined

---

## Performance Optimization

### Cache Optimization

- [ ] **Cache Configuration**
  - [ ] Cache TTL optimized
  - [ ] Cache mode appropriate (ENABLED, READ_ONLY, etc.)
  - [ ] Redis memory limits configured
  - [ ] Cache eviction policy appropriate

### Resource Optimization

- [ ] **Memory**
  - [ ] Node.js memory limits configured
  - [ ] Garbage collection optimized
  - [ ] Memory leaks monitored

- [ ] **CPU**
  - [ ] CPU limits configured (Docker)
  - [ ] Process clustering considered (if needed)
  - [ ] CPU usage optimized

### Scaling

- [ ] **Horizontal Scaling**
  - [ ] Load balancer configured
  - [ ] Multiple backend instances (if needed)
  - [ ] Session affinity configured (if needed)

- [ ] **Vertical Scaling**
  - [ ] Resource limits appropriate
  - [ ] Auto-scaling configured (if using cloud)

---

## Security Checklist

- [ ] **Authentication & Authorization**
  - [ ] JWT secrets strong and rotated regularly
  - [ ] Token expiration configured
  - [ ] Authentication middleware working

- [ ] **Input Validation**
  - [ ] URL validation working
  - [ ] Request size limits configured
  - [ ] SQL injection prevention (N/A for MongoDB)
  - [ ] XSS prevention

- [ ] **Network Security**
  - [ ] HTTPS enabled
  - [ ] SSL certificates valid
  - [ ] Firewall rules configured
  - [ ] DDoS protection configured

- [ ] **Dependencies**
  - [ ] Dependencies up to date
  - [ ] Security vulnerabilities patched
  - [ ] Regular dependency audits

---

## Troubleshooting

### Common Issues

1. **Service Not Starting**
   - Check logs: `docker-compose logs backend`
   - Verify environment variables
   - Check port availability
   - Verify dependencies installed

2. **Database Connection Issues**
   - Verify connection string
   - Check network connectivity
   - Verify credentials
   - Check firewall rules

3. **Redis Connection Issues**
   - Verify Redis URL
   - Check Redis server status
   - Verify network connectivity
   - Check Redis memory limits

4. **High Memory Usage**
   - Check for memory leaks
   - Review cache configuration
   - Optimize processing pipeline
   - Consider increasing memory limits

5. **Slow Performance**
   - Check database indexes
   - Review cache hit rates
   - Optimize scraper selection
   - Review resource limits

### Support Contacts

- **Documentation**: See [API.md](./API.md) and [USAGE_EXAMPLES.md](./USAGE_EXAMPLES.md)
- **Architecture**: See [ARCHITECTURE.md](../../ARCHITECTURE.md)
- **Logs**: Check application logs and Docker logs

---

## Rollback Procedure

If deployment fails:

1. **Stop Services**
   ```bash
   docker-compose down
   ```

2. **Restore Previous Version**
   ```bash
   git checkout <previous-version>
   docker-compose build
   docker-compose up -d
   ```

3. **Verify Rollback**
   ```bash
   ./scripts/health-check.sh
   ```

4. **Review Logs**
   ```bash
   docker-compose logs backend
   ```

---

## Success Criteria

Deployment is successful when:

- ✅ All health checks pass
- ✅ All services running and healthy
- ✅ API endpoints responding correctly
- ✅ Database connectivity verified
- ✅ Redis connectivity verified
- ✅ Scraping functionality working
- ✅ Real-time updates working
- ✅ No critical errors in logs
- ✅ Performance metrics within acceptable ranges

---

## Maintenance Schedule

### Daily

- [ ] Review error logs
- [ ] Check service health
- [ ] Monitor resource usage

### Weekly

- [ ] Review performance metrics
- [ ] Check backup status
- [ ] Review security logs

### Monthly

- [ ] Update dependencies
- [ ] Review and optimize configuration
- [ ] Test disaster recovery procedures
- [ ] Review and update documentation

---

**Last Updated**: 2024-01-27
**Version**: 1.0.0


