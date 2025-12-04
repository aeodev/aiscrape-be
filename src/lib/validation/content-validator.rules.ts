/**
 * Content Validation Rules
 * Comprehensive validation rules for content quality assessment
 */

import { ValidationRule, ValidationContext, RuleValidationResult } from './content-validator.types';
import * as cheerio from 'cheerio';

/**
 * Create length validation rules
 */
export function createLengthRules(): ValidationRule[] {
  return [
    {
      name: 'minimum-content-length',
      type: 'heuristic',
      weight: 0.3,
      enabled: true,
      description: 'Check if content meets minimum length requirement',
      check: (context: ValidationContext): RuleValidationResult => {
        const minLength = parseInt(process.env.CONTENT_VALIDATION_MIN_LENGTH || '100', 10);
        const htmlLength = context.html.length;
        const textLength = context.text.length;

        const passed = htmlLength >= minLength || textLength >= minLength;
        const score = Math.min(1, Math.max(0, (htmlLength + textLength) / (minLength * 2)));

        return {
          passed,
          score,
          reason: passed
            ? `Content length sufficient (${htmlLength} HTML, ${textLength} text)`
            : `Content too short (${htmlLength} HTML, ${textLength} text, minimum ${minLength})`,
        };
      },
    },
    {
      name: 'minimum-word-count',
      type: 'heuristic',
      weight: 0.2,
      enabled: true,
      description: 'Check if text has minimum word count',
      check: (context: ValidationContext): RuleValidationResult => {
        const words = context.text.trim().split(/\s+/).filter((w) => w.length > 0);
        const wordCount = words.length;
        const minWords = 20;

        const passed = wordCount >= minWords;
        const score = Math.min(1, wordCount / minWords);

        return {
          passed,
          score,
          reason: passed
            ? `Word count sufficient (${wordCount} words)`
            : `Insufficient word count (${wordCount} words, minimum ${minWords})`,
        };
      },
    },
    {
      name: 'empty-content-ratio',
      type: 'heuristic',
      weight: 0.15,
      enabled: true,
      description: 'Check ratio of empty content',
      check: (context: ValidationContext): RuleValidationResult => {
        const $ = cheerio.load(context.html);
        const totalElements = $('*').length;
        const emptyElements = $('*')
          .filter((_, el) => {
            const $el = $(el);
            return $el.text().trim().length === 0 && !$el.children().length;
          }).length;

        const emptyRatio = totalElements > 0 ? emptyElements / totalElements : 0;
        const passed = emptyRatio < 0.5;
        const score = 1 - emptyRatio;

        return {
          passed,
          score,
          reason: `Empty content ratio: ${(emptyRatio * 100).toFixed(1)}%`,
        };
      },
    },
  ];
}

/**
 * Create structure validation rules
 */
export function createStructureRules(): ValidationRule[] {
  return [
    {
      name: 'semantic-html-presence',
      type: 'heuristic',
      weight: 0.2,
      enabled: true,
      description: 'Check for semantic HTML elements',
      check: (context: ValidationContext): RuleValidationResult => {
        const $ = cheerio.load(context.html);
        const semanticTags = ['article', 'main', 'section', 'header', 'footer', 'nav', 'aside'];
        const foundTags = semanticTags.filter((tag) => $(tag).length > 0);
        const score = foundTags.length / semanticTags.length;

        return {
          passed: score > 0.3,
          score,
          reason: `Found ${foundTags.length}/${semanticTags.length} semantic tags: ${foundTags.join(', ')}`,
        };
      },
    },
    {
      name: 'main-content-presence',
      type: 'heuristic',
      weight: 0.25,
      enabled: true,
      description: 'Check if main content area exists',
      check: (context: ValidationContext): RuleValidationResult => {
        const $ = cheerio.load(context.html);
        const mainSelectors = ['main', 'article', '[role="main"]', '.main-content', '#main-content'];
        let found = false;
        let selector = '';

        for (const sel of mainSelectors) {
          if ($(sel).length > 0) {
            found = true;
            selector = sel;
            break;
          }
        }

        return {
          passed: found,
          score: found ? 1 : 0.5,
          reason: found ? `Main content found (${selector})` : 'No main content area detected',
        };
      },
    },
    {
      name: 'navigation-content-ratio',
      type: 'heuristic',
      weight: 0.15,
      enabled: true,
      description: 'Check ratio of navigation vs content',
      check: (context: ValidationContext): RuleValidationResult => {
        const $ = cheerio.load(context.html);
        const navText = $('nav').text().length + $('header').text().length;
        const mainText = $('main, article, [role="main"]').text().length || context.text.length;
        const totalText = navText + mainText;

        if (totalText === 0) {
          return {
            passed: false,
            score: 0,
            reason: 'No content found',
          };
        }

        const navRatio = navText / totalText;
        const passed = navRatio < 0.4;
        const score = 1 - navRatio;

        return {
          passed,
          score,
          reason: `Navigation ratio: ${(navRatio * 100).toFixed(1)}%`,
        };
      },
    },
  ];
}

/**
 * Create dynamic content detection rules
 */
export function createDynamicContentRules(): ValidationRule[] {
  return [
    {
      name: 'ajax-indicators',
      type: 'pattern',
      weight: 0.3,
      enabled: true,
      description: 'Detect AJAX loading indicators',
      check: (context: ValidationContext): RuleValidationResult => {
        const indicators = [
          /data-load/i,
          /onclick.*load/i,
          /ajax.*true/i,
          /fetch\(/i,
          /XMLHttpRequest/i,
          /\.load\(/i,
        ];

        const htmlLower = context.html.toLowerCase();
        const textLower = context.text.toLowerCase();
        const found = indicators.some((pattern) => pattern.test(htmlLower) || pattern.test(textLower));

        return {
          passed: !found,
          score: found ? 0.3 : 1,
          reason: found ? 'AJAX loading indicators detected' : 'No AJAX indicators found',
        };
      },
    },
    {
      name: 'empty-data-containers',
      type: 'pattern',
      weight: 0.25,
      enabled: true,
      description: 'Detect empty data containers',
      check: (context: ValidationContext): RuleValidationResult => {
        const $ = cheerio.load(context.html);
        const emptyContainers = [
          $('table tbody:empty').length,
          $('ul:empty, ol:empty').length,
          $('[class*="data"]:empty, [id*="data"]:empty').length,
          $('[class*="list"]:empty, [id*="list"]:empty').length,
        ].reduce((sum, count) => sum + count, 0);

        const score = emptyContainers === 0 ? 1 : Math.max(0, 1 - emptyContainers / 10);

        return {
          passed: emptyContainers === 0,
          score,
          reason: emptyContainers === 0 ? 'No empty data containers' : `${emptyContainers} empty data containers found`,
        };
      },
    },
    {
      name: 'loading-placeholders',
      type: 'pattern',
      weight: 0.2,
      enabled: true,
      description: 'Detect loading placeholders',
      check: (context: ValidationContext): RuleValidationResult => {
        const placeholders = [
          /loading/i,
          /please wait/i,
          /click to view/i,
          /select to load/i,
          /choose.*to view/i,
          /load more/i,
        ];

        const textLower = context.text.toLowerCase();
        const found = placeholders.some((pattern) => pattern.test(textLower));

        return {
          passed: !found,
          score: found ? 0.4 : 1,
          reason: found ? 'Loading placeholders detected' : 'No loading placeholders',
        };
      },
    },
    {
      name: 'interactive-elements',
      type: 'pattern',
      weight: 0.15,
      enabled: true,
      description: 'Detect interactive elements requiring user action',
      check: (context: ValidationContext): RuleValidationResult => {
        const $ = cheerio.load(context.html);
        const interactiveCount =
          $('button, [onclick], [data-toggle], [data-target], select, input[type="button"]').length;

        const score = interactiveCount > 5 ? 0.6 : 1;

        return {
          passed: interactiveCount <= 5,
          score,
          reason: `${interactiveCount} interactive elements found`,
        };
      },
    },
  ];
}

/**
 * Create quality validation rules
 */
export function createQualityRules(): ValidationRule[] {
  return [
    {
      name: 'noise-ratio',
      type: 'heuristic',
      weight: 0.2,
      enabled: true,
      description: 'Check noise ratio (ads, navigation vs main content)',
      check: (context: ValidationContext): RuleValidationResult => {
        const $ = cheerio.load(context.html);
        const noiseSelectors = [
          'nav',
          'header',
          'footer',
          '[class*="ad"]',
          '[class*="sidebar"]',
          '[class*="widget"]',
          'script',
          'style',
        ];

        let noiseText = 0;
        noiseSelectors.forEach((sel) => {
          $(sel).each((_, el) => {
            noiseText += $(el).text().length;
          });
        });

        const mainText = $('main, article, [role="main"]').text().length || context.text.length;
        const totalText = noiseText + mainText;

        if (totalText === 0) {
          return {
            passed: false,
            score: 0,
            reason: 'No content found',
          };
        }

        const noiseRatio = noiseText / totalText;
        const passed = noiseRatio < 0.5;
        const score = 1 - noiseRatio;

        return {
          passed,
          score,
          reason: `Noise ratio: ${(noiseRatio * 100).toFixed(1)}%`,
        };
      },
    },
    {
      name: 'text-density',
      type: 'heuristic',
      weight: 0.15,
      enabled: true,
      description: 'Check text density (text vs HTML ratio)',
      check: (context: ValidationContext): RuleValidationResult => {
        const htmlLength = context.html.length;
        const textLength = context.text.length;
        const density = htmlLength > 0 ? textLength / htmlLength : 0;

        const passed = density > 0.1;
        const score = Math.min(1, density * 10);

        return {
          passed,
          score,
          reason: `Text density: ${(density * 100).toFixed(1)}%`,
        };
      },
    },
    {
      name: 'link-density',
      type: 'heuristic',
      weight: 0.1,
      enabled: true,
      description: 'Check link density',
      check: (context: ValidationContext): RuleValidationResult => {
        const $ = cheerio.load(context.html);
        const linkCount = $('a').length;
        const textWords = context.text.split(/\s+/).filter((w) => w.length > 0).length;
        const linkDensity = textWords > 0 ? linkCount / textWords : 0;

        // Optimal link density is between 0.05 and 0.2
        const score = linkDensity < 0.05 ? linkDensity * 20 : linkDensity > 0.2 ? 0.5 : 1;

        return {
          passed: linkDensity > 0.05 && linkDensity < 0.3,
          score,
          reason: `Link density: ${(linkDensity * 100).toFixed(2)}% (${linkCount} links, ${textWords} words)`,
        };
      },
    },
  ];
}

/**
 * Create relevance validation rules
 */
export function createRelevanceRules(): ValidationRule[] {
  return [
    {
      name: 'keyword-matching',
      type: 'heuristic',
      weight: 0.3,
      enabled: true,
      description: 'Check keyword matching with task description',
      check: (context: ValidationContext): RuleValidationResult => {
        if (!context.taskDescription || context.taskDescription.trim().length === 0) {
          return {
            passed: true,
            score: 0.5,
            reason: 'No task description provided',
          };
        }

        const taskWords = context.taskDescription
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 3);
        const contentLower = context.text.toLowerCase();

        const matches = taskWords.filter((word) => contentLower.includes(word)).length;
        const score = taskWords.length > 0 ? matches / taskWords.length : 0.5;

        return {
          passed: score > 0.3,
          score,
          reason: `Keyword match: ${matches}/${taskWords.length} (${(score * 100).toFixed(1)}%)`,
        };
      },
    },
    {
      name: 'title-relevance',
      type: 'heuristic',
      weight: 0.2,
      enabled: true,
      description: 'Check if page title is relevant to task',
      check: (context: ValidationContext): RuleValidationResult => {
        if (!context.taskDescription || !context.pageTitle) {
          return {
            passed: true,
            score: 0.5,
            reason: 'Missing task description or page title',
          };
        }

        const taskWords = context.taskDescription
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 3);
        const titleLower = context.pageTitle.toLowerCase();

        const matches = taskWords.filter((word) => titleLower.includes(word)).length;
        const score = taskWords.length > 0 ? matches / taskWords.length : 0.5;

        return {
          passed: score > 0.2,
          score,
          reason: `Title relevance: ${matches}/${taskWords.length} matches`,
        };
      },
    },
  ];
}

/**
 * Create completeness validation rules
 */
export function createCompletenessRules(): ValidationRule[] {
  return [
    {
      name: 'placeholder-detection',
      type: 'pattern',
      weight: 0.25,
      enabled: true,
      description: 'Detect placeholder text',
      check: (context: ValidationContext): RuleValidationResult => {
        const placeholders = [
          /lorem ipsum/i,
          /placeholder/i,
          /sample text/i,
          /coming soon/i,
          /under construction/i,
          /no data/i,
          /no content/i,
        ];

        const found = placeholders.some((pattern) => pattern.test(context.text));

        return {
          passed: !found,
          score: found ? 0.2 : 1,
          reason: found ? 'Placeholder text detected' : 'No placeholder text',
        };
      },
    },
    {
      name: 'incomplete-table-detection',
      type: 'pattern',
      weight: 0.2,
      enabled: true,
      description: 'Detect incomplete tables',
      check: (context: ValidationContext): RuleValidationResult => {
        const $ = cheerio.load(context.html);
        const tables = $('table');
        let incompleteCount = 0;

        tables.each((_, table) => {
          const $table = $(table);
          const rowCount = $table.find('tr').length;
          const cellCount = $table.find('td, th').length;

          // Table with rows but no cells, or very few cells
          if (rowCount > 0 && (cellCount === 0 || cellCount < rowCount)) {
            incompleteCount++;
          }
        });

        const score = incompleteCount === 0 ? 1 : Math.max(0, 1 - incompleteCount / tables.length);

        return {
          passed: incompleteCount === 0,
          score,
          reason:
            incompleteCount === 0
              ? 'All tables appear complete'
              : `${incompleteCount}/${tables.length} tables appear incomplete`,
        };
      },
    },
    {
      name: 'truncated-content-detection',
      type: 'pattern',
      weight: 0.15,
      enabled: true,
      description: 'Detect truncated content indicators',
      check: (context: ValidationContext): RuleValidationResult => {
        const indicators = [
          /\.\.\.$/,
          /more\.\.\./i,
          /read more/i,
          /show more/i,
          /continue reading/i,
        ];

        const found = indicators.some((pattern) => pattern.test(context.text));

        return {
          passed: !found,
          score: found ? 0.7 : 1,
          reason: found ? 'Truncation indicators found' : 'No truncation indicators',
        };
      },
    },
  ];
}

/**
 * Get all validation rules
 */
export function getAllRules(): ValidationRule[] {
  return [
    ...createLengthRules(),
    ...createStructureRules(),
    ...createDynamicContentRules(),
    ...createQualityRules(),
    ...createRelevanceRules(),
    ...createCompletenessRules(),
  ];
}

