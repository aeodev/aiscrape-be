/**
 * Scraper MongoDB Model
 * Mongoose schema for scrape jobs
 */

import mongoose, { Schema } from 'mongoose';
import { IScrapeJob, ScrapeStatus, ScraperType, EntityType } from './scraper.types';

const ExtractedEntitySchema = new Schema({
  type: {
    type: String,
    enum: Object.values(EntityType),
    required: true,
  },
  data: {
    type: Schema.Types.Mixed,
    required: true,
  },
  confidence: {
    type: Number,
    min: 0,
    max: 1,
  },
  source: String,
}, { _id: false });

const ScrapeMetadataSchema = new Schema({
  finalUrl: String,
  statusCode: Number,
  contentType: String,
  pageTitle: String,
  pageDescription: String,
  duration: {
    type: Number,
    default: 0,
  },
  requestCount: {
    type: Number,
    default: 0,
  },
  dataSize: {
    type: Number,
    default: 0,
  },
  screenshotCount: {
    type: Number,
    default: 0,
  },
  errorMessage: String,
  retryCount: {
    type: Number,
    default: 0,
  },
  scraperUsed: {
    type: String,
    enum: Object.values(ScraperType),
  },
}, { _id: false });

const AIProcessingSchema = new Schema({
  model: {
    type: String,
    required: true,
  },
  prompt: {
    type: String,
    required: true,
  },
  response: String,
  tokensUsed: Number,
  processingTime: Number,
  success: {
    type: Boolean,
    required: true,
  },
  error: String,
}, { _id: false });

const ScrapeJobSchema = new Schema<IScrapeJob>(
  {
    url: {
      type: String,
      required: true,
      trim: true,
    },
    taskDescription: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: Object.values(ScrapeStatus),
      default: ScrapeStatus.QUEUED,
      index: true,
    },
    scraperType: {
      type: String,
      enum: Object.values(ScraperType),
      default: ScraperType.AUTO,
    },
    userId: {
      type: String,
      index: true,
    },
    sessionId: {
      type: String,
      index: true,
    },
    scrapeOptions: {
      useProxy: Boolean,
      blockResources: Boolean,
      includeScreenshots: Boolean,
    },
    html: String,
    markdown: String,
    text: String,
    screenshots: [String],
    extractedEntities: {
      type: [ExtractedEntitySchema],
      default: [],
    },
    metadata: {
      type: ScrapeMetadataSchema,
      default: () => ({
        duration: 0,
        requestCount: 0,
        dataSize: 0,
        screenshotCount: 0,
        retryCount: 0,
      }),
    },
    aiProcessing: AIProcessingSchema,
    startedAt: Date,
    completedAt: Date,
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret._id;
        delete (ret as any).__v;
        return ret;
      },
    },
  }
);

// Indexes for performance
ScrapeJobSchema.index({ createdAt: -1 });
ScrapeJobSchema.index({ userId: 1, createdAt: -1 });
ScrapeJobSchema.index({ status: 1, createdAt: -1 });

// Virtual for execution time
ScrapeJobSchema.virtual('executionTime').get(function () {
  if (this.startedAt && this.completedAt) {
    return this.completedAt.getTime() - this.startedAt.getTime();
  }
  return this.metadata.duration;
});

export const ScrapeJobModel = mongoose.model<IScrapeJob>('ScrapeJob', ScrapeJobSchema);


