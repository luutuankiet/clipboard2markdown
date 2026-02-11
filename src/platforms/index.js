// src/platforms/index.js
import jira from './jira.js';
import slack from './slack.js';
import common from './common.js';
import confluence from './confluence.js';
import googleSheets from './google-sheets.js';

// Add other platforms here as they are created
// import notion from './notion.js';

const allPlatforms = [
  googleSheets, // Must run early to flatten colspan before GFM table processing
  confluence,   // Must run before jira to clean up wrapper divs first
  jira,
  slack,
  common,
  // notion,
];

export function addAllRules(turndownService) {
  allPlatforms.forEach(platform => {
    if (platform.rules) {
      platform.rules.forEach(rule => {
        turndownService.addRule(rule.name, rule);
      });
    }
  });
}

export function sanitize(doc) {
  allPlatforms.forEach(platform => {
    if (platform.sanitizer) {
      platform.sanitizer(doc);
    }
  });
}