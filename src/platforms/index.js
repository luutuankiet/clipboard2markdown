// src/platforms/index.js
import jira from './jira.js';
import slack from './slack.js';
import common from './common.js';

// Add other platforms here as they are created
// import confluence from './confluence.js';
// import notion from './notion.js';

const allPlatforms = [
  jira,
  slack,
  common,
  // confluence,
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