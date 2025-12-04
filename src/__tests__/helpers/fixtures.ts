/**
 * Test Fixtures
 * Reusable test data
 */

export const testHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>Test Page</title>
  <meta name="description" content="Test description">
</head>
<body>
  <h1>Test Heading</h1>
  <p>Test paragraph content.</p>
  <div class="main-content">
    <p>Main content area.</p>
  </div>
  <script>console.log('test');</script>
</body>
</html>
`;

export const testMarkdown = `# Test Heading

Test paragraph content.

Main content area.
`;

export const testText = 'Test Heading\n\nTest paragraph content.\n\nMain content area.';

export const testExtractionContext = {
  html: testHtml,
  markdown: testMarkdown,
  text: testText,
  url: 'https://example.com',
  taskDescription: 'Extract all information',
};

export const testEntities = [
  {
    type: 'text',
    value: 'Test Heading',
    confidence: 0.9,
    metadata: {},
  },
  {
    type: 'text',
    value: 'Test paragraph content.',
    confidence: 0.8,
    metadata: {},
  },
];


