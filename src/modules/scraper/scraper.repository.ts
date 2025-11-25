/**
 * Scraper Repository
 * Data access layer for scrape jobs
 */

import { ScrapeJobModel } from './scraper.model';
import { IScrapeJob, ScrapeStatus } from './scraper.types';

export class ScrapeRepository {
  /**
   * Create a new scrape job
   */
  async create(jobData: Partial<IScrapeJob>): Promise<IScrapeJob> {
    const job = new ScrapeJobModel(jobData);
    return await job.save();
  }

  /**
   * Find job by ID
   */
  async findById(id: string): Promise<IScrapeJob | null> {
    return await ScrapeJobModel.findById(id);
  }

  /**
   * Find jobs by user ID
   */
  async findByUserId(
    userId: string,
    options: { page?: number; limit?: number; status?: ScrapeStatus } = {}
  ): Promise<{ jobs: IScrapeJob[]; total: number }> {
    const { page = 1, limit = 20, status } = options;
    const skip = (page - 1) * limit;

    const query: any = { userId };
    if (status) {
      query.status = status;
    }

    const [jobs, total] = await Promise.all([
      ScrapeJobModel.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      ScrapeJobModel.countDocuments(query),
    ]);

    return { jobs, total };
  }

  /**
   * Find jobs by session ID
   */
  async findBySessionId(sessionId: string): Promise<IScrapeJob[]> {
    return await ScrapeJobModel.find({ sessionId })
      .sort({ createdAt: -1 });
  }

  /**
   * Update job status
   */
  async updateStatus(
    id: string,
    status: ScrapeStatus,
    metadata?: Partial<IScrapeJob>
  ): Promise<IScrapeJob | null> {
    const update: any = { status };
    
    if (status === ScrapeStatus.RUNNING) {
      update.startedAt = new Date();
    } else if (status === ScrapeStatus.COMPLETED || status === ScrapeStatus.FAILED) {
      update.completedAt = new Date();
    }

    if (metadata) {
      Object.assign(update, metadata);
    }

    return await ScrapeJobModel.findByIdAndUpdate(
      id,
      update,
      { new: true }
    );
  }

  /**
   * Update job with scraped data
   */
  async updateScrapedData(
    id: string,
    data: Partial<IScrapeJob>
  ): Promise<IScrapeJob | null> {
    console.log(`Repository: Updating job ${id} with data keys:`, Object.keys(data));
    if (data.html) {
      console.log(`Repository: HTML length: ${data.html.length} bytes`);
    }
    if (data.text) {
      console.log(`Repository: Text length: ${data.text.length} chars`);
    }
    
    const updated = await ScrapeJobModel.findByIdAndUpdate(
      id,
      { $set: data },
      { new: true }
    );
    
    if (updated) {
      console.log(`Repository: Job ${id} updated. HTML in DB: ${updated.html?.length || 0} bytes, Text: ${updated.text?.length || 0} chars`);
    } else {
      console.error(`Repository: Failed to update job ${id} - job not found`);
    }
    
    return updated;
  }

  /**
   * Get recent jobs
   */
  async getRecent(limit: number = 10): Promise<IScrapeJob[]> {
    return await ScrapeJobModel.find()
      .sort({ createdAt: -1 })
      .limit(limit);
  }

  /**
   * Delete job
   */
  async delete(id: string): Promise<boolean> {
    const result = await ScrapeJobModel.findByIdAndDelete(id);
    return !!result;
  }

  /**
   * Get job statistics
   */
  async getStatistics(userId?: string): Promise<any> {
    const match: any = {};
    if (userId) {
      match.userId = userId;
    }

    const stats = await ScrapeJobModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          avgDuration: { $avg: '$metadata.duration' },
        },
      },
    ]);

    return stats.reduce((acc: any, stat: any) => {
      acc[stat._id] = {
        count: stat.count,
        avgDuration: Math.round(stat.avgDuration || 0),
      };
      return acc;
    }, {});
  }
}

export const scrapeRepository = new ScrapeRepository();

