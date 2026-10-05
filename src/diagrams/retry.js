// Retry policy for scene downloads, used by the CLI paths only. The page calls
// loadScene with a plain fetch and never loads this file.
//
// Each attempt gets its own timeout. A timeout, a network error, HTTP 429 and
// HTTP 5xx are retried; anything else (404, other 4xx) is handed back at once,
// and decrypt / decompress failures happen after fetch so are never retried.

export const RETRY_POLICY = { attemptTimeoutMs: 3000, delaysMs: [250, 750], deadlineMs: 6000 };

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function failure(message, reason) {
  var err = new Error(message);
  err.reason = reason;
  return err;
}

function attempt(fetchImpl, url, init, timeoutMs) {
  var controller = typeof AbortController === 'function' ? new AbortController() : null;
  var timer;
  // Raced rather than trusted to the signal: a fetch that ignores abort must
  // still lose to the clock.
  var timeout = new Promise(function (_, reject) {
    timer = setTimeout(function () {
      if (controller) controller.abort();
      reject(failure('timed out after ' + timeoutMs + 'ms', 'timeout'));
    }, timeoutMs);
  });
  var request = Promise.resolve()
    .then(function () { return fetchImpl(url, Object.assign({}, init, controller ? { signal: controller.signal } : {})); })
    .catch(function (err) { throw err && err.reason ? err : failure('network error: ' + (err && err.message ? err.message : err), 'network'); });
  return Promise.race([request, timeout]).finally(function () { clearTimeout(timer); });
}

const retryable = (status) => status === 429 || status >= 500;

// A fetch with the same signature that retries temporary failures.
export function retryingFetch(fetchImpl, policy) {
  var p = Object.assign({}, RETRY_POLICY, policy);
  return async function (url, init) {
    var last;
    for (var i = 0; i <= p.delaysMs.length; i++) {
      if (i > 0) await wait(p.delaysMs[i - 1]);
      try {
        var res = await attempt(fetchImpl, url, init, p.attemptTimeoutMs);
        if (!retryable(res.status)) return res;
        last = res;
      } catch (err) {
        last = err;
      }
    }
    if (last instanceof Error) throw last;
    return last;
  };
}

// Short reason for a failed download, for the one-line notice.
export function failureReason(err) {
  if (err && err.reason) return err.reason;
  var status = err && err.status;
  if (status === 404) return '404';
  if (status >= 500) return '5xx';
  if (status) return String(status);
  return 'error';
}
