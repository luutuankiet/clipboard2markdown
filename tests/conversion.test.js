import { describe, it, expect } from 'vitest';
import { convert } from '../src/converter.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
      // Show context before first diff or after gap
      if (i - lastDiffIndex > contextAfter + contextBefore + 1) {
        if (diff.length > 0) {
          diff.push('...');
        }
        // Show context lines before diff
        for (let j = Math.max(0, i - contextBefore); j < i; j++) {
          diff.push(`  ${j + 1} | ${expectedLines[j] || ''}`);
        }
      }
      
      // Show the difference
      if (expLine !== undefined && actLine === undefined) {
        diff.push(`- ${i + 1} | ${expLine}`);
      } else if (expLine === undefined && actLine !== undefined) {
        diff.push(`+ ${i + 1} | ${actLine}`);
      } else {
        diff.push(`- ${i + 1} | ${expLine || '(empty line)'}`);
        diff.push(`+ ${i + 1} | ${actLine || '(empty line)'}`);
      }
      
      lastDiffIndex = i;
      
      // Show context after diff
      for (let j = i + 1; j <= Math.min(i + contextAfter, maxLines - 1); j++) {
        if (expectedLines[j] === actualLines[j]) {
          diff.push(`  ${j + 1} | ${expectedLines[j] || ''}`);
        } else {
          break; // Stop if we hit another diff
        }
      }
    }
  }
  
  return diff.length > 0 ? diff.join('\n') : 'No differences detected (whitespace issue?)';
}

function getFixtures(dir) {
  let fixtures = [];
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      fixtures = fixtures.concat(getFixtures(fullPath));
    } else if (file.endsWith('.html')) {
      const mdPath = fullPath.replace('.html', '.md');
      if (fs.existsSync(mdPath)) {
        fixtures.push({
          name: path.relative(path.join(__dirname, 'fixtures'), fullPath),
          html: fs.readFileSync(fullPath, 'utf8'),
          markdown: fs.readFileSync(mdPath, 'utf8')
        });
      }
    }
  });

  return fixtures;
}

const fixturesDir = path.join(__dirname, 'fixtures');
const fixtures = getFixtures(fixturesDir);

describe('Clipboard to Markdown Conversion', () => {
  if (fixtures.length === 0) {
    it('should find fixtures', () => {
      // This ensures the test suite doesn't silently pass with 0 tests
      expect(true).toBe(false, 'No fixtures found in tests/fixtures');
    });
  }

  fixtures.forEach(fixture => {
    it(`should convert ${fixture.name} correctly`, () => {
      const result = convert(fixture.html);
      // Normalize line endings for cross-platform consistency
      const normalizedResult = result.replace(/\r\n/g, '\n').trim();
      const normalizedExpected = fixture.markdown.replace(/\r\n/g, '\n').trim();
      
      try {
        expect(normalizedResult).toBe(normalizedExpected);
      } catch (error) {
        // Capture failure details for dump file
        failureLog.push({
          fixture: fixture.name,
          expected: normalizedExpected,
          actual: normalizedResult,
          diff: generateDiff(normalizedExpected, normalizedResult),
          error: error.message
        });
        throw error; // Re-throw to maintain test failure
      }
    });
  });

  // After all tests, write failures to ./test_md.txt
  it.skip('dump failures', () => {
    // This is a dummy test that won't run but triggers afterAll
  });
});

// Write failure dump after all tests complete
if (typeof afterAll !== 'undefined') {
  afterAll(() => {
    if (failureLog.length > 0) {
      const outputPath = path.join(process.cwd(), 'test_md.md');
      let output = `# Test Failures Report\n\n`;
      output += `Generated: ${new Date().toISOString()}\n`;
      output += `Total failures: ${failureLog.length}\n\n`;
      output += `${'='.repeat(80)}\n\n`;

      failureLog.forEach((failure, index) => {
        output += `## Failure ${index + 1}: ${failure.fixture}\n\n`;
        output += `### Error\n\`\`\`\n${failure.error}\n\`\`\`\n\n`;
        output += `### Line-by-Line Diff\n\`\`\`diff\n${failure.diff}\n\`\`\`\n\n`;
        output += `### Expected Output\n\`\`\`markdown\n${failure.expected}\n\`\`\`\n\n`;
        output += `### Actual Output\n\`\`\`markdown\n${failure.actual}\n\`\`\`\n\n`;
        output += `${'='.repeat(80)}\n\n`;
      });

      fs.writeFileSync(outputPath, output, 'utf8');
      console.log(`\n✍️  Failure details written to: ${outputPath}\n`);
    }
  });
}