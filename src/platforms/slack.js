// src/platforms/slack.js

export default {
  rules: [
    {
      name: 'slackImages',
      filter: function (node) {
        return node.nodeName === 'IMG' && 
               node.getAttribute('src') && 
               node.getAttribute('src').includes('a.slack-edge.com');
      },
      replacement: function () {
        return '';
      }
    }
  ],
  sanitizer: function (doc) {
    // Slack-specific sanitization if needed
  }
};