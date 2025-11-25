/**
 * Form Handling Utilities
 * CSRF tokens, hidden fields, and form submission
 */

import * as cheerio from 'cheerio';
import { Page } from 'playwright';

export interface FormField {
  name: string;
  value: string;
  type: string;
  required?: boolean;
}

export interface FormData {
  action: string;
  method: string;
  fields: FormField[];
  hiddenFields: FormField[];
  csrfToken?: string;
  csrfFieldName?: string;
}

// Common CSRF token field names
const CSRF_FIELD_NAMES = [
  'csrf_token',
  'csrftoken',
  'csrf',
  '_csrf',
  '_token',
  'authenticity_token', // Rails
  '__RequestVerificationToken', // ASP.NET
  'csrfmiddlewaretoken', // Django
  '_xsrf', // Tornado
  'XSRF-TOKEN',
  'X-CSRF-TOKEN',
  'nonce',
  '_wpnonce', // WordPress
  'form_token', // Drupal
];

// Common CSRF meta tag names
const CSRF_META_NAMES = [
  'csrf-token',
  'csrf_token',
  'csrftoken',
  '_csrf',
  'X-CSRF-TOKEN',
];

/**
 * Extract all form data from HTML
 */
export function extractFormData(html: string, formSelector?: string): FormData | null {
  const $ = cheerio.load(html);
  const form = formSelector ? $(formSelector) : $('form').first();

  if (!form.length) {
    return null;
  }

  const action = form.attr('action') || '';
  const method = (form.attr('method') || 'GET').toUpperCase();

  const fields: FormField[] = [];
  const hiddenFields: FormField[] = [];
  let csrfToken: string | undefined;
  let csrfFieldName: string | undefined;

  // Extract all input fields
  form.find('input, select, textarea').each((_, el) => {
    const $el = $(el);
    const name = $el.attr('name');
    const type = $el.attr('type') || 'text';
    const value = $el.val() as string || '';
    const required = $el.attr('required') !== undefined;

    if (!name) return;

    const field: FormField = { name, value, type, required };

    if (type === 'hidden') {
      hiddenFields.push(field);

      // Check if this is a CSRF token
      if (CSRF_FIELD_NAMES.some(n => name.toLowerCase().includes(n.toLowerCase()))) {
        csrfToken = value;
        csrfFieldName = name;
      }
    } else {
      fields.push(field);
    }
  });

  return {
    action,
    method,
    fields,
    hiddenFields,
    csrfToken,
    csrfFieldName,
  };
}

/**
 * Extract CSRF token from HTML (form fields or meta tags)
 */
export function extractCsrfToken(html: string): { token: string; fieldName: string } | null {
  const $ = cheerio.load(html);

  // Check meta tags first
  for (const metaName of CSRF_META_NAMES) {
    const meta = $(`meta[name="${metaName}"]`);
    if (meta.length) {
      const token = meta.attr('content');
      if (token) {
        return { token, fieldName: metaName };
      }
    }
  }

  // Check form fields
  for (const fieldName of CSRF_FIELD_NAMES) {
    const input = $(`input[name="${fieldName}"], input[name*="${fieldName}" i]`);
    if (input.length) {
      const token = input.val() as string;
      if (token) {
        return { token, fieldName: input.attr('name') || fieldName };
      }
    }
  }

  return null;
}

/**
 * Extract all hidden fields from a form
 */
export function extractHiddenFields(html: string, formSelector?: string): Record<string, string> {
  const $ = cheerio.load(html);
  const form = formSelector ? $(formSelector) : $('form').first();
  const hiddenFields: Record<string, string> = {};

  form.find('input[type="hidden"]').each((_, el) => {
    const $el = $(el);
    const name = $el.attr('name');
    const value = $el.val() as string || '';
    if (name) {
      hiddenFields[name] = value;
    }
  });

  return hiddenFields;
}

/**
 * Build form data for submission
 */
export function buildFormData(
  formData: FormData,
  userValues: Record<string, string>
): Record<string, string> {
  const result: Record<string, string> = {};

  // Add all hidden fields first
  for (const field of formData.hiddenFields) {
    result[field.name] = field.value;
  }

  // Add user-provided values
  for (const [key, value] of Object.entries(userValues)) {
    result[key] = value;
  }

  return result;
}

/**
 * URL encode form data
 */
export function urlEncodeFormData(data: Record<string, string>): string {
  return Object.entries(data)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

/**
 * Playwright helpers for form interaction
 */
export class PlaywrightFormHelper {
  constructor(private page: Page) {}

  /**
   * Extract form data from current page
   */
  async getFormData(formSelector?: string): Promise<FormData | null> {
    const html = await this.page.content();
    return extractFormData(html, formSelector);
  }

  /**
   * Extract CSRF token from current page
   */
  async getCsrfToken(): Promise<{ token: string; fieldName: string } | null> {
    const html = await this.page.content();
    return extractCsrfToken(html);
  }

  /**
   * Get all hidden fields from a form
   */
  async getHiddenFields(formSelector?: string): Promise<Record<string, string>> {
    const html = await this.page.content();
    return extractHiddenFields(html, formSelector);
  }

  /**
   * Fill and submit a form
   */
  async fillAndSubmit(
    formSelector: string,
    fields: Record<string, string>,
    options?: {
      waitForNavigation?: boolean;
      submitButton?: string;
    }
  ): Promise<void> {
    const form = this.page.locator(formSelector);

    // Fill each field
    for (const [name, value] of Object.entries(fields)) {
      const input = form.locator(`[name="${name}"]`);
      const tagName = await input.evaluate(el => el.tagName.toLowerCase());
      const inputType = await input.getAttribute('type');

      if (tagName === 'select') {
        await input.selectOption(value);
      } else if (inputType === 'checkbox' || inputType === 'radio') {
        if (value === 'true' || value === '1') {
          await input.check();
        }
      } else {
        await input.fill(value);
      }
    }

    // Submit
    if (options?.waitForNavigation !== false) {
      const submitPromise = this.page.waitForNavigation();

      if (options?.submitButton) {
        await form.locator(options.submitButton).click();
      } else {
        await form.locator('button[type="submit"], input[type="submit"]').first().click();
      }

      await submitPromise;
    } else {
      if (options?.submitButton) {
        await form.locator(options.submitButton).click();
      } else {
        await form.locator('button[type="submit"], input[type="submit"]').first().click();
      }
    }
  }
}

