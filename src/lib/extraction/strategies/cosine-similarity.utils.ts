/**
 * Cosine Similarity Utilities
 * Text preprocessing, TF-IDF vectorization, and cosine similarity calculations
 */

import * as natural from 'natural';

/**
 * Preprocess text: tokenize, normalize, remove stopwords, stem
 */
export function preprocessText(text: string): string[] {
  // Tokenize and normalize
  const tokenizer = new natural.WordTokenizer();
  const tokens = tokenizer.tokenize(text.toLowerCase()) || [];

  // Remove stopwords
  const stopwords = natural.stopwords;
  const filteredTokens = tokens.filter(
    (token) => !stopwords.includes(token) && token.length > 2
  );

  // Stem tokens
  const stemmer = natural.PorterStemmer;
  return filteredTokens.map((token) => stemmer.stem(token));
}

/**
 * Build vocabulary from multiple texts
 */
export function buildVocabulary(texts: string[][]): Map<string, number> {
  const vocab = new Map<string, number>();
  let index = 0;

  for (const tokens of texts) {
    for (const token of tokens) {
      if (!vocab.has(token)) {
        vocab.set(token, index++);
      }
    }
  }

  return vocab;
}

/**
 * Calculate term frequency vector
 */
export function calculateTermFrequency(
  tokens: string[],
  vocabulary: Map<string, number>
): number[] {
  const vector = new Array(vocabulary.size).fill(0);
  const tokenCounts = new Map<string, number>();

  // Count tokens
  for (const token of tokens) {
    tokenCounts.set(token, (tokenCounts.get(token) || 0) + 1);
  }

  // Build vector
  for (const [token, count] of tokenCounts) {
    const index = vocabulary.get(token);
    if (index !== undefined) {
      vector[index] = count / tokens.length; // Normalize by document length
    }
  }

  return vector;
}

/**
 * Calculate inverse document frequency
 */
export function calculateIDF(
  term: string,
  documents: string[][]
): number {
  let docCount = 0;
  for (const doc of documents) {
    if (doc.includes(term)) {
      docCount++;
    }
  }

  if (docCount === 0) {
    return 0;
  }

  return Math.log(documents.length / docCount);
}

/**
 * Build TF-IDF vector for a document
 */
export function buildTFIDFVector(
  tokens: string[],
  vocabulary: Map<string, number>,
  allDocuments: string[][]
): number[] {
  const tfVector = calculateTermFrequency(tokens, vocabulary);
  const tfidfVector = new Array(vocabulary.size).fill(0);

  for (const [term, index] of vocabulary) {
    const tf = tfVector[index];
    const idf = calculateIDF(term, allDocuments);
    tfidfVector[index] = tf * idf;
  }

  return tfidfVector;
}

/**
 * Calculate dot product of two vectors
 */
export function dotProduct(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }

  return sum;
}

/**
 * Calculate magnitude (norm) of a vector
 */
export function magnitude(vector: number[]): number {
  let sum = 0;
  for (const value of vector) {
    sum += value * value;
  }
  return Math.sqrt(sum);
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

  const dot = dotProduct(a, b);
  const magA = magnitude(a);
  const magB = magnitude(b);

  if (magA === 0 || magB === 0) {
    return 0;
  }

  return dot / (magA * magB);
}

/**
 * Split text into sentences
 */
export function splitIntoSentences(text: string): string[] {
  // SentenceTokenizer requires abbreviations array (can be empty)
  const tokenizer = new natural.SentenceTokenizer([]);
  return tokenizer.tokenize(text) || [];
}

/**
 * Split text into paragraphs
 */
export function splitIntoParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/**
 * Entity pattern matching regexes
 */
export const EntityPatterns = {
  email: /[\w.-]+@[\w.-]+\.\w+/gi,
  phone: /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
  url: /https?:\/\/[^\s]+/gi,
  // Support multiple currencies: USD ($), PHP (₱), EUR (€), GBP (£), JPY (¥), INR (₹), etc.
  price: /[\$₱€£¥₹]\s*[\d,]+\.?\d*|[\d,]+\.?\d*\s*[\$₱€£¥₹]|[\d,]+\.?\d*\s*(?:USD|PHP|EUR|GBP|JPY|INR|peso|dollar|euro|pound|yen)/gi,
  date: /\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}/g,
  company: /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s+(?:Inc|LLC|Ltd|Corp|Corporation|Company|Co))?\.?\b/g,
};

/**
 * Extract entities from text using patterns
 */
export function extractEntitiesByPattern(text: string): {
  emails: string[];
  phones: string[];
  urls: string[];
  prices: string[];
  dates: string[];
  companies: string[];
} {
  return {
    emails: Array.from(new Set(text.match(EntityPatterns.email) || [])),
    phones: Array.from(new Set(text.match(EntityPatterns.phone) || [])),
    urls: Array.from(new Set(text.match(EntityPatterns.url) || [])),
    prices: Array.from(new Set(text.match(EntityPatterns.price) || [])),
    dates: Array.from(new Set(text.match(EntityPatterns.date) || [])),
    companies: Array.from(new Set(text.match(EntityPatterns.company) || [])),
  };
}

/**
 * Calculate similarity score for a text segment against a query
 */
export function calculateSegmentSimilarity(
  segment: string,
  query: string,
  vocabulary: Map<string, number>,
  allDocuments: string[][]
): number {
  const segmentTokens = preprocessText(segment);
  const queryTokens = preprocessText(query);

  if (segmentTokens.length === 0 || queryTokens.length === 0) {
    return 0;
  }

  const segmentVector = buildTFIDFVector(segmentTokens, vocabulary, allDocuments);
  const queryVector = buildTFIDFVector(queryTokens, vocabulary, allDocuments);

  return cosineSimilarity(segmentVector, queryVector);
}


