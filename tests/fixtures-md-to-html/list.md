## **Entry Points**

* **`package.json`**: Look at the `scripts` to understand how to run the dev server (`dev`), build (`build`), and test (`test`).  
* **`clipboard2markdown.js`**: Read the `paste` event handler to see the main orchestration logic.  
* **`src/platforms/index.js`**: Understand how platform-specific modules are aggregated and applied.  
* **`src/platforms/jira.js`**: See a concrete example of a platform-specific `sanitizer` and `ruleset`.