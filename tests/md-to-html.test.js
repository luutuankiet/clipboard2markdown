import { describe, it, expect, afterAll } from 'vitest';
import { JSDOM } from 'jsdom';
import { convertMdToHtml } from '../src/md-to-html.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Set up jsdom globals for DOMParser and NodeFilter
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.DOMParser = dom.window.DOMParser;
global.NodeFilter = dom.window.NodeFilter;

// Capture failures for debugging
let failureLog = [];

// Simple line-based diff generator
function generateDiff(expected, actual) {
  const expectedLines = expected.split('\n');
  const actualLines = actual.split('\n');
  const maxLines = Math.max(expectedLines.length, actualLines.length);
  
  let diff = [];
  let contextBefore = 3;
  let contextAfter = 3;
  let lastDiffIndex = -10;
  
  for (let i = 0; i < maxLines; i++) {
    const expLine = expectedLines[i];
    const actLine = actualLines[i];
    
    if (expLine !== actLine) {
      if (i - lastDiffIndex > contextAfter + contextBefore + 1) {
        if (diff.length > 0) {
          diff.push('...');
        }
        for (let j = Math.max(0, i - contextBefore); j < i; j++) {
          diff.push(`  ${j + 1} | ${expectedLines[j] || ''}`);
        }
      }
      
      if (expLine !== undefined && actLine === undefined) {
        diff.push(`- ${i + 1} | ${expLine}`);
      } else if (expLine === undefined && actLine !== undefined) {
        diff.push(`+ ${i + 1} | ${actLine}`);
      } else {
        diff.push(`- ${i + 1} | ${expLine || '(empty line)'}`);
        diff.push(`+ ${i + 1} | ${actLine || '(empty line)'}`);
      }
      
      lastDiffIndex = i;
      
      for (let j = i + 1; j <= Math.min(i + contextAfter, maxLines - 1); j++) {
        if (expectedLines[j] === actualLines[j]) {
          diff.push(`  ${j + 1} | ${expectedLines[j] || ''}`);
        } else {
          break;
        }
      }
    }
  }
  
  return diff.length > 0 ? diff.join('\n') : 'No differences detected (whitespace issue?)';
}

/**
 * Recursively find all .md files in fixtures-md-to-html directory
 * and pair them with their expected .html output files.
 */
function getFixtures(dir) {
  let fixtures = [];
  
  if (!fs.existsSync(dir)) {
    return fixtures;
  }
  
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      fixtures = fixtures.concat(getFixtures(fullPath));
    } else if (file.endsWith('.md')) {
      const htmlPath = fullPath.replace('.md', '.html');
      if (fs.existsSync(htmlPath)) {
        fixtures.push({
          name: path.relative(path.join(__dirname, 'fixtures-md-to-html'), fullPath),
          markdown: fs.readFileSync(fullPath, 'utf8'),
          expectedHtml: fs.readFileSync(htmlPath, 'utf8')
        });
      }
    }
  });

  return fixtures;
}

const fixturesDir = path.join(__dirname, 'fixtures-md-to-html');
const fixtures = getFixtures(fixturesDir);

describe('Markdown to HTML Conversion (Google Docs ready)', () => {
  if (fixtures.length === 0) {
    it('should find fixtures (add .md/.html pairs to tests/fixtures-md-to-html/)', () => {
      // This is informational - not a failure if no fixtures exist yet
      console.log('\n📁 No fixtures found in tests/fixtures-md-to-html/');
      console.log('   Add .md (input) and .html (expected output) file pairs to create tests.\n');
      expect(true).toBe(true);
    });
  }

  fixtures.forEach(fixture => {
    it(`should convert ${fixture.name} correctly`, () => {
      const result = convertMdToHtml(fixture.markdown);
      
      // Normalize: trim, collapse multiple spaces, normalize line endings
      const normalizeHtml = (html) => {
        return html
          .replace(/\r\n/g, '\n')
          .replace(/>\s+</g, '><')  // Remove whitespace between tags
          .trim();
      };
      
      const normalizedResult = normalizeHtml(result);
      const normalizedExpected = normalizeHtml(fixture.expectedHtml);
      
      try {
        expect(normalizedResult).toBe(normalizedExpected);
      } catch (error) {
        failureLog.push({
          fixture: fixture.name,
          expected: normalizedExpected,
          actual: normalizedResult,
          diff: generateDiff(normalizedExpected, normalizedResult),
          error: error.message
        });
        throw error;
      }
    });
  });
});

// Write failure dump after all tests complete
afterAll(() => {
  if (failureLog.length > 0) {
    const outputPath = path.join(process.cwd(), 'test_md_to_html.md');
    let output = `# MD → HTML Test Failures Report\n\n`;
    output += `Generated: ${new Date().toISOString()}\n`;
    output += `Total failures: ${failureLog.length}\n\n`;
    output += `${'='.repeat(80)}\n\n`;

    failureLog.forEach((failure, index) => {
      output += `## Failure ${index + 1}: ${failure.fixture}\n\n`;
      output += `### Error\n\`\`\`\n${failure.error}\n\`\`\`\n\n`;
      output += `### Line-by-Line Diff\n\`\`\`diff\n${failure.diff}\n\`\`\`\n\n`;
      output += `### Expected HTML\n\`\`\`html\n${failure.expected}\n\`\`\`\n\n`;
      output += `### Actual HTML\n\`\`\`html\n${failure.actual}\n\`\`\`\n\n`;
      output += `${'='.repeat(80)}\n\n`;
    });

    fs.writeFileSync(outputPath, output, 'utf8');
    console.log(`\n✍️  Failure details written to: ${outputPath}\n`);
  }
});