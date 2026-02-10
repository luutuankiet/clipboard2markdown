import { describe, it, expect } from 'vitest';
import { convert } from '../src/converter.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
      
      expect(normalizedResult).toBe(normalizedExpected);
    });
  });
});