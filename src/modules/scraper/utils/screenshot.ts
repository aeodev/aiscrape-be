/**
 * Screenshot handling utilities
 */

import * as fs from 'fs';
import * as path from 'path';
import { env } from '../../../config/env';

/**
 * Save screenshot to file system
 */
export async function saveScreenshot(buffer: Buffer, jobId: string): Promise<string> {
  const filename = `screenshot-${jobId}-${Date.now()}.jpg`;
  const filepath = path.join(process.cwd(), env.SCREENSHOT_STORAGE_PATH, filename);

  // Ensure directory exists
  await fs.promises.mkdir(path.dirname(filepath), { recursive: true });

  await fs.promises.writeFile(filepath, buffer);
  return `/uploads/screenshots/${filename}`; // Return relative path for serving
}








