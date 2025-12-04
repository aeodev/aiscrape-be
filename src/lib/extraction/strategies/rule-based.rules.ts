/**
 * Predefined Rule Sets
 * Common extraction rule sets for various entity types
 */

import { RuleSet, ExtractionRule } from './rule-based.types';
import { EntityType } from '../../../modules/scraper/scraper.types';

/**
 * Create email extraction rule set
 */
export function createEmailRuleSet(): RuleSet {
  return {
    name: 'email',
    description: 'Extract email addresses from content',
    priority: 10,
    enabled: true,
    rules: [
      {
        name: 'email-href',
        entityType: EntityType.CONTACT,
        selector: 'a[href^="mailto:"]',
        attribute: 'href',
        transform: 'parseEmail',
        confidence: 0.95,
        multiple: true,
      },
      {
        name: 'email-text',
        entityType: EntityType.CONTACT,
        regex: '[\\w.-]+@[\\w.-]+\\.\\w+',
        transform: 'parseEmail',
        confidence: 0.9,
        multiple: true,
      },
      {
        name: 'email-data-attr',
        entityType: EntityType.CONTACT,
        selector: '[data-email], [data-mail]',
        attribute: 'data-email',
        transform: 'parseEmail',
        confidence: 0.85,
        multiple: true,
      },
    ],
  };
}

/**
 * Create phone extraction rule set
 */
export function createPhoneRuleSet(): RuleSet {
  return {
    name: 'phone',
    description: 'Extract phone numbers from content',
    priority: 10,
    enabled: true,
    rules: [
      {
        name: 'phone-href',
        entityType: EntityType.CONTACT,
        selector: 'a[href^="tel:"]',
        attribute: 'href',
        transform: 'parsePhone',
        confidence: 0.95,
        multiple: true,
      },
      {
        name: 'phone-text',
        entityType: EntityType.CONTACT,
        regex: '(\\+?\\d{1,3}[-.\\s]?)?\\(?\\d{3}\\)?[-.\\s]?\\d{3}[-.\\s]?\\d{4}',
        transform: 'parsePhone',
        confidence: 0.9,
        multiple: true,
      },
      {
        name: 'phone-data-attr',
        entityType: EntityType.CONTACT,
        selector: '[data-phone], [data-tel], [data-telephone]',
        attribute: 'data-phone',
        transform: 'parsePhone',
        confidence: 0.85,
        multiple: true,
      },
    ],
  };
}

/**
 * Create URL extraction rule set
 */
export function createUrlRuleSet(): RuleSet {
  return {
    name: 'url',
    description: 'Extract URLs from content',
    priority: 10,
    enabled: true,
    rules: [
      {
        name: 'url-href',
        entityType: EntityType.CUSTOM,
        selector: 'a[href]',
        attribute: 'href',
        transform: 'parseUrl',
        confidence: 0.95,
        multiple: true,
      },
      {
        name: 'url-src',
        entityType: EntityType.CUSTOM,
        selector: 'img[src], iframe[src], video[src]',
        attribute: 'src',
        transform: 'parseUrl',
        confidence: 0.9,
        multiple: true,
      },
      {
        name: 'url-text',
        entityType: EntityType.CUSTOM,
        regex: 'https?://[^\\s<>"{}|\\\\^`\\[\\]]+',
        transform: 'parseUrl',
        confidence: 0.85,
        multiple: true,
      },
    ],
  };
}

/**
 * Create company extraction rule set
 */
export function createCompanyRuleSet(): RuleSet {
  return {
    name: 'company',
    description: 'Extract company information',
    priority: 5,
    enabled: true,
    rules: [
      {
        name: 'company-name-h1',
        entityType: EntityType.COMPANY,
        selector: 'h1.company-name, h1[class*="company"]',
        text: true,
        transform: 'trim',
        confidence: 0.9,
      },
      {
        name: 'company-name-title',
        entityType: EntityType.COMPANY,
        selector: '[itemtype*="Organization"] [itemprop="name"], .org-name',
        text: true,
        transform: 'trim',
        confidence: 0.85,
      },
      {
        name: 'company-name-meta',
        entityType: EntityType.COMPANY,
        selector: 'meta[property="og:site_name"], meta[name="application-name"]',
        attribute: 'content',
        transform: 'trim',
        confidence: 0.8,
      },
      {
        name: 'company-address',
        entityType: EntityType.COMPANY,
        selector: '[itemtype*="PostalAddress"], .address, [class*="address"]',
        text: true,
        transform: 'trim',
        confidence: 0.75,
        multiple: true,
      },
    ],
  };
}

/**
 * Create product extraction rule set
 */
export function createProductRuleSet(): RuleSet {
  return {
    name: 'product',
    description: 'Extract product information',
    priority: 5,
    enabled: true,
    rules: [
      {
        name: 'product-name',
        entityType: EntityType.PRODUCT,
        selector: 'h1.product-title, [itemtype*="Product"] [itemprop="name"], .product-name',
        text: true,
        transform: 'trim',
        confidence: 0.9,
      },
      {
        name: 'product-price',
        entityType: EntityType.PRICING,
        selector: '[itemtype*="Product"] [itemprop="price"], .price, [class*="price"]',
        text: true,
        transform: 'parseNumber',
        confidence: 0.85,
      },
      {
        name: 'product-price-currency',
        entityType: EntityType.PRICING,
        selector: '[itemtype*="Product"] [itemprop="priceCurrency"]',
        attribute: 'content',
        transform: 'trim',
        confidence: 0.8,
      },
      {
        name: 'product-description',
        entityType: EntityType.PRODUCT,
        selector: '[itemtype*="Product"] [itemprop="description"], .product-description',
        text: true,
        transform: 'removeHtml',
        confidence: 0.75,
      },
    ],
  };
}

/**
 * Create article extraction rule set
 */
export function createArticleRuleSet(): RuleSet {
  return {
    name: 'article',
    description: 'Extract article metadata',
    priority: 5,
    enabled: true,
    rules: [
      {
        name: 'article-title',
        entityType: EntityType.ARTICLE,
        selector: 'h1, [itemtype*="Article"] [itemprop="headline"], article h1, .article-title',
        text: true,
        transform: 'trim',
        confidence: 0.9,
      },
      {
        name: 'article-author',
        entityType: EntityType.PERSON,
        selector: '[itemtype*="Article"] [itemprop="author"], .author, [rel="author"]',
        text: true,
        transform: 'trim',
        confidence: 0.85,
        multiple: true,
      },
      {
        name: 'article-date',
        entityType: EntityType.ARTICLE,
        selector: '[itemtype*="Article"] [itemprop="datePublished"], time[datetime], .date, [class*="date"]',
        attribute: 'datetime',
        transform: 'parseDate',
        confidence: 0.8,
      },
      {
        name: 'article-date-content',
        entityType: EntityType.ARTICLE,
        selector: 'time[datetime]',
        attribute: 'datetime',
        transform: 'parseDate',
        confidence: 0.75,
      },
      {
        name: 'article-description',
        entityType: EntityType.ARTICLE,
        selector: 'meta[property="og:description"], meta[name="description"]',
        attribute: 'content',
        transform: 'trim',
        confidence: 0.7,
      },
    ],
  };
}

/**
 * Create contact extraction rule set
 */
export function createContactRuleSet(): RuleSet {
  return {
    name: 'contact',
    description: 'Extract contact information',
    priority: 8,
    enabled: true,
    rules: [
      {
        name: 'contact-email',
        entityType: EntityType.CONTACT,
        selector: '.contact-email, [class*="contact"] a[href^="mailto:"]',
        attribute: 'href',
        transform: 'parseEmail',
        confidence: 0.9,
        multiple: true,
      },
      {
        name: 'contact-phone',
        entityType: EntityType.CONTACT,
        selector: '.contact-phone, [class*="contact"] a[href^="tel:"]',
        attribute: 'href',
        transform: 'parsePhone',
        confidence: 0.9,
        multiple: true,
      },
      {
        name: 'contact-form',
        entityType: EntityType.CONTACT,
        selector: 'form.contact-form, form[action*="contact"]',
        text: true,
        transform: 'trim',
        confidence: 0.7,
      },
    ],
  };
}

/**
 * Get all default rule sets
 */
export function getDefaultRuleSets(): RuleSet[] {
  return [
    createEmailRuleSet(),
    createPhoneRuleSet(),
    createUrlRuleSet(),
    createCompanyRuleSet(),
    createProductRuleSet(),
    createArticleRuleSet(),
    createContactRuleSet(),
  ];
}


