# Automated Tutorial Drafts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a server-integrated job that selects one verifiable tool workflow every 48 hours and saves an 800–1500-character tutorial as a review-only draft.

**Architecture:** Extract the existing Responses API call into a focused shared client, then add a separate tutorial publisher with its own candidate selection, validation, persistent schedule state, and draft-only output. The existing news publisher keeps its six-hour behavior and uses the same client without sharing tutorial state.

**Tech Stack:** Node.js 22 ESM, native `fetch`, native `node:test`, `node:sqlite`, existing content-admin/database modules, systemd-hosted application process.

## Global Constraints

- Tutorials run every 2880 minutes by default and never more frequently than every 60 minutes.
- Each run creates at most one `kind=tutorial`, `status=draft` article.
- An existing pending auto-generated tutorial draft blocks the next generation run.
- Tutorial body length is 800–1500 Chinese characters and must contain all seven required sections.
- At least one HTTPS official source is required; unsupported product claims must not be invented.
- HTTP 403/502/524, timeouts, invalid JSON, HTML responses, or replacement character `�` must not write an article.
- API keys, full prompts, and management tokens must never be logged.
- Existing news scheduling and all current tests must remain unchanged in behavior.
- No new runtime dependencies.

## File Map

- Create `backend/ai-responses-client.mjs`: shared Responses endpoint construction, structured request, fallback parsing, timeout, and safe errors.
- Create `backend/tutorial-publisher.mjs`: tutorial candidates, source collection, prompt, validation, one-run orchestration, and 48-hour scheduling.
- Create `backend/migrations/014_tutorial_automation.sql`: singleton persistent scheduling state.
- Modify `backend/database.mjs`: register migration 14 and expose focused tutorial automation queries/state helpers.
- Modify `backend/news-publisher.mjs`: consume the shared Responses client while preserving news behavior.
- Modify `server.mjs`: start and stop the tutorial scheduler alongside the news scheduler.
- Modify `.env.example` and `README.md`: document the tutorial switch and interval.
- Create `tests/ai-responses-client.test.mjs`: shared provider contract and failure behavior.
- Create `tests/tutorial-publisher.test.mjs`: selection, validation, draft creation, persistence, and scheduling behavior.
- Modify `tests/news-publisher.test.mjs`: retain provider-option regression coverage through the extracted client.

---

### Task 1: Extract the shared Responses API client

**Files:**
- Create: `backend/ai-responses-client.mjs`
- Create: `tests/ai-responses-client.test.mjs`
- Modify: `backend/news-publisher.mjs:101-164`
- Modify: `tests/news-publisher.test.mjs:50-123`

**Interfaces:**
- Produces: `requestStructuredResponse(options): Promise<Record<string, unknown>>`
- `options` fields: `{ apiKey, model, baseUrl, apiPath, reasoningEffort, disableResponseStorage, systemText, input, schemaName, schema, timeoutMs? }`
- Throws safe `Error` messages containing status and at most 300 response characters, never the API key.
- News publisher consumes this function and continues returning the same `runNewsPublisherOnce` result shape.

- [ ] **Step 1: Write failing client tests**

Add tests that intercept `globalThis.fetch` and assert endpoint joining, bearer authentication, JSON schema request shape, `store=false`, configured reasoning effort, and a default 120-second abort signal. Add cases for `output_text`, nested `output[].content[]`, HTML error responses, missing output, and replacement character rejection.

```js
test("structured client sends configured Responses options", async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(String(url), "https://provider.example/v1/responses");
    assert.equal(options.headers.Authorization, "Bearer test-key");
    const body = JSON.parse(options.body);
    assert.equal(body.model, "gpt-5.5");
    assert.deepEqual(body.reasoning, { effort: "low" });
    assert.equal(body.store, false);
    assert.equal(body.text.format.name, "tutorial_article");
    return Response.json({ output_text: "{\"title\":\"Valid\"}" });
  };
  const result = await requestStructuredResponse(fixtureOptions());
  assert.equal(result.title, "Valid");
});

test("structured client rejects replacement characters", async () => {
  globalThis.fetch = async () => Response.json({ output_text: "{\"title\":\"bad � text\"}" });
  await assert.rejects(() => requestStructuredResponse(fixtureOptions()), /invalid_response_encoding/);
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `node --test tests/ai-responses-client.test.mjs`

Expected: FAIL because `backend/ai-responses-client.mjs` does not exist.

- [ ] **Step 3: Implement the minimal shared client**

Implement endpoint normalization, an `AbortController`, a structured Responses body, safe non-2xx handling, output extraction, JSON fence removal, `JSON.parse`, and recursive string validation for `�`. Keep provider-specific browser headers out of the generic contract except for the current compatibility `User-Agent` already required by the deployed provider.

```js
export async function requestStructuredResponse({
  apiKey, model, baseUrl, apiPath = "/v1/responses", reasoningEffort = "low",
  disableResponseStorage = true, systemText, input, schemaName, schema,
  timeoutMs = 120_000
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(responseEndpoint(baseUrl, apiPath), {
      method: "POST",
      signal: controller.signal,
      headers: providerHeaders(apiKey),
      body: JSON.stringify(buildRequestBody({ model, reasoningEffort, disableResponseStorage, systemText, input, schemaName, schema }))
    });
    if (!response.ok) throw await safeProviderError(response);
    return parseStructuredOutput(await response.json());
  } finally {
    clearTimeout(timeout);
  }
}
```

- [ ] **Step 4: Replace news publisher’s private request code**

Import `requestStructuredResponse` into `backend/news-publisher.mjs`. Preserve the existing article schema, prompts, default model, base URL, API path, reasoning effort, response storage flag, and compatibility fallback semantics. Do not change feed selection or publishing behavior.

- [ ] **Step 5: Run client and news tests**

Run: `node --test tests/ai-responses-client.test.mjs tests/news-publisher.test.mjs`

Expected: all tests PASS with no warnings.

- [ ] **Step 6: Commit**

```bash
git add backend/ai-responses-client.mjs backend/news-publisher.mjs tests/ai-responses-client.test.mjs tests/news-publisher.test.mjs
git commit -m "refactor: share structured AI response client"
```

---

### Task 2: Add persistent tutorial automation state and candidate queries

**Files:**
- Create: `backend/migrations/014_tutorial_automation.sql`
- Modify: `backend/database.mjs:8-25`
- Modify: `backend/database.mjs` near article query helpers
- Create: `tests/tutorial-publisher.test.mjs`

**Interfaces:**
- Produces: `getTutorialAutomationState(db): { lastSuccessfulAt: string | null, updatedAt: string }`
- Produces: `markTutorialAutomationSuccess(db, timestamp: string): void`
- Produces: `hasPendingAutoTutorialDraft(db): boolean`
- Produces: `listTutorialCandidates(db, limit?: number): Array<{ id, slug, name, officialUrl, summary, description, categoryId, quality, updated }>`
- Produces: `listTutorialDeduplicationData(db): Array<{ id, title, sourceUrl, source }>`

- [ ] **Step 1: Write failing database behavior tests**

Use a temporary SQLite database and assert that the singleton state starts with no success time, can be updated, survives reopening, and that a draft with source name `AI自动采编 · 待人工审核` blocks generation while a human draft does not.

```js
test("tutorial automation state persists and recognizes only auto drafts", () => {
  const db = openDatabase(tempDbPath());
  assert.equal(getTutorialAutomationState(db).lastSuccessfulAt, null);
  markTutorialAutomationSuccess(db, "2026-08-24T00:00:00.000Z");
  assert.equal(getTutorialAutomationState(db).lastSuccessfulAt, "2026-08-24T00:00:00.000Z");
  insertArticle(db, { kind: "tutorial", status: "draft", source: "AI自动采编 · 待人工审核" });
  assert.equal(hasPendingAutoTutorialDraft(db), true);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/tutorial-publisher.test.mjs`

Expected: FAIL because migration 14 and helper exports do not exist.

- [ ] **Step 3: Add migration 14**

Create a singleton table instead of overloading `content_state`:

```sql
CREATE TABLE tutorial_automation_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_successful_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
INSERT INTO tutorial_automation_state (id, last_successful_at) VALUES (1, NULL);
PRAGMA user_version = 14;
```

Register version 14 in `backend/database.mjs`.

- [ ] **Step 4: Implement focused database helpers**

Candidate SQL must require `status='published'`, `data_quality_status IN ('enriched','verified')`, a non-empty HTTPS official URL, and must order verified before enriched, then editor score/popularity/update date. Deduplication data includes all non-archived tutorials.

- [ ] **Step 5: Run tutorial database tests**

Run: `node --test tests/tutorial-publisher.test.mjs`

Expected: state, pending-draft, candidate ordering, and persistence tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/migrations/014_tutorial_automation.sql backend/database.mjs tests/tutorial-publisher.test.mjs
git commit -m "feat: persist tutorial automation state"
```

---

### Task 3: Implement tutorial selection, generation, and validation

**Files:**
- Create: `backend/tutorial-publisher.mjs`
- Modify: `tests/tutorial-publisher.test.mjs`

**Interfaces:**
- Produces: `validateTutorialDraft(article): { valid: true } | { valid: false, reason: string }`
- Produces: `selectTutorialCandidate({ tools, recentNews, existingTutorials }): Candidate | null`
- Produces: `runTutorialPublisherOnce(options): Promise<{ created?: boolean, skipped?: boolean, reason?: string, article?: object, candidateId?: string }>`
- Consumes: database helpers from Task 2 and `requestStructuredResponse` from Task 1.

- [ ] **Step 1: Write failing selection and validation tests**

Cover verified-before-enriched ordering, hot-news relevance boost, identical source rejection, normalized title similarity rejection, seven-section validation, 800/1500 boundaries, HTTPS source requirement, replacement character rejection, and forced draft status.

```js
test("tutorial validator requires every section and draft status", () => {
  const article = validTutorialFixture();
  assert.deepEqual(validateTutorialDraft(article), { valid: true });
  delete article.bodySections.commonProblems;
  assert.deepEqual(validateTutorialDraft(article), { valid: false, reason: "missing_common_problems" });
});

test("candidate selection rejects an existing tool-task pair", () => {
  const selected = selectTutorialCandidate({
    tools: [verifiedTool("chatgpt")],
    recentNews: [],
    existingTutorials: [{ sourceUrl: "https://openai.com/chatgpt", title: "用 ChatGPT 整理会议纪要" }]
  });
  assert.equal(selected, null);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/tutorial-publisher.test.mjs`

Expected: FAIL because tutorial publisher exports do not exist.

- [ ] **Step 3: Implement deterministic candidate selection**

Normalize titles by lowercasing, removing punctuation/whitespace, and comparing character bigram Jaccard similarity. Reject similarity `>= 0.72`. Build a stable task key from `tool.id` and the chosen task label. Hot-news boosting may reorder eligible candidates but cannot make a `basic` tool eligible.

- [ ] **Step 4: Implement official-source collection**

Fetch only HTTPS public URLs, follow the project’s private-network URL protections, enforce a 12-second timeout, require an HTML response under 500 KB, and extract title, meta description, and visible text capped at 30,000 characters. Never send raw scripts, styles, cookies, or response headers to the model.

- [ ] **Step 5: Implement the tutorial schema and prompt**

Require structured fields for `topic`, `title`, `excerpt`, `body`, and `readTime`. The prompt must require all seven named headings, concrete steps, source-bounded claims, a verification date, and 800–1500 Chinese characters. It must explicitly forbid inventing prices, quotas, versions, UI labels, and capabilities.

- [ ] **Step 6: Implement validation before persistence**

Count Unicode code points after removing Markdown heading markers. Validate required headings, HTTPS `sourceUrl`, no `�`, no HTML error page markers, and `status='draft'`. Return a reason rather than partially fixing invalid model output.

- [ ] **Step 7: Implement one-run orchestration**

Order of operations: check API key → check pending auto draft → select candidate → fetch official source → call AI → validate → repeat dedupe check → `createAdminContent(db, "articles", body, { actor: "auto-tutorial-publisher", requestId })` → mark success. Do not mark success for skipped or failed runs.

```js
const body = {
  id: tutorialId(candidate.id, taskKey),
  kind: "tutorial",
  topic: generated.topic,
  title: generated.title,
  excerpt: generated.excerpt,
  body: generated.body,
  cover: candidate.logoUrl || "",
  date: now.toISOString().slice(0, 10),
  readTime: generated.readTime,
  source: "AI自动采编 · 待人工审核",
  sourceUrl: candidate.officialUrl,
  status: "draft"
};
```

- [ ] **Step 8: Run tutorial publisher tests**

Run: `node --test tests/tutorial-publisher.test.mjs`

Expected: all selection, source, AI failure, validation, no-write, and successful-draft tests PASS.

- [ ] **Step 9: Commit**

```bash
git add backend/tutorial-publisher.mjs tests/tutorial-publisher.test.mjs
git commit -m "feat: generate review-only tutorial drafts"
```

---

### Task 4: Add persistent 48-hour scheduling and application lifecycle integration

**Files:**
- Modify: `backend/tutorial-publisher.mjs`
- Modify: `server.mjs:1-10, 994-1007, 1740-1750`
- Modify: `tests/tutorial-publisher.test.mjs`
- Modify: `tests/api.test.mjs`

**Interfaces:**
- Produces: `scheduleTutorialPublisher({ db, environment, logger, env, now?, setTimer?, clearTimer? })`
- Returns: `{ enabled, timer, startupTimer, intervalMs, nextRunAt? }`
- Server lifecycle clears both tutorial timers during `application.close()`.

- [ ] **Step 1: Write failing scheduler tests**

Test default disabled, missing-key disabled, default 2880 minutes, minimum 60 minutes, startup delay of 30 seconds, persisted-success deferral, due-state execution, pending-draft skip, and timer cleanup.

```js
test("tutorial scheduler defers until 48 hours after persisted success", () => {
  markTutorialAutomationSuccess(db, "2026-08-24T00:00:00.000Z");
  const scheduled = scheduleTutorialPublisher({
    db,
    environment: "production",
    env: enabledEnv(),
    now: () => new Date("2026-08-24T12:00:00.000Z"),
    setTimer: fakeSetTimer
  });
  assert.equal(scheduled.nextRunAt, "2026-08-26T00:00:00.000Z");
});
```

- [ ] **Step 2: Run scheduler tests and verify RED**

Run: `node --test tests/tutorial-publisher.test.mjs`

Expected: FAIL because `scheduleTutorialPublisher` is missing.

- [ ] **Step 3: Implement due-time scheduling**

At startup, wait 30 seconds, then check whether `lastSuccessfulAt + intervalMs <= now`. Use the regular interval only as a due-time checker; always consult persisted state before generation. Clamp configured interval to at least 60 minutes. Unref timers.

- [ ] **Step 4: Integrate with server startup and shutdown**

Import and start `scheduleTutorialPublisher` immediately after `scheduleNewsPublisher`. During close, clear `tutorialPublisher.timer` and `tutorialPublisher.startupTimer` independently. Do not change news timer handling.

- [ ] **Step 5: Run tutorial and API tests**

Run: `node --test tests/tutorial-publisher.test.mjs tests/api.test.mjs`

Expected: all tests PASS; application shutdown leaves no active tutorial timer.

- [ ] **Step 6: Commit**

```bash
git add backend/tutorial-publisher.mjs server.mjs tests/tutorial-publisher.test.mjs tests/api.test.mjs
git commit -m "feat: schedule tutorial drafts every 48 hours"
```

---

### Task 5: Document, verify, and perform controlled runtime checks

**Files:**
- Modify: `.env.example:19-30`
- Modify: `README.md:233-239`
- Modify: `tests/tutorial-publisher.test.mjs`

**Interfaces:**
- Documents exact deployment variables and safe-failure behavior.
- Does not enable tutorial automation in the committed `.env.example`.

- [ ] **Step 1: Add configuration documentation**

Add:

```env
NIKE_AUTO_TUTORIALS=false
NIKE_TUTORIAL_INTERVAL_MINUTES=2880
```

Document that tutorials reuse the configured Responses provider, save drafts only, pause while an auto-generated draft is pending, and fail closed when the provider is unavailable or returns corrupted Chinese.

- [ ] **Step 2: Run formatting and placeholder checks**

Run:

```bash
git diff --check
rg -n "T[B]D|T[O]DO|implement lat[e]r|fill in" backend tests README.md .env.example
```

Expected: `git diff --check` exits 0; no new placeholders are found.

- [ ] **Step 3: Run the complete test suite**

Run: `npm test`

Expected: exit 0, all old and new tests pass, zero failures.

- [ ] **Step 4: Run a controlled successful draft check**

Use a temporary SQLite database, a local fixture official page, and a mocked successful Responses payload. Run `runTutorialPublisherOnce`; verify exactly one draft exists with all required fields and `source_name='AI自动采编 · 待人工审核'`.

Run: `node --test tests/tutorial-publisher.test.mjs --test-name-pattern="creates exactly one validated tutorial draft"`

Expected: PASS.

- [ ] **Step 5: Run a controlled provider-failure check**

Use a mocked 524/HTML response and verify article count does not change.

Run: `node --test tests/tutorial-publisher.test.mjs --test-name-pattern="provider failure never writes a tutorial"`

Expected: PASS.

- [ ] **Step 6: Commit documentation and final verification adjustments**

```bash
git add .env.example README.md tests/tutorial-publisher.test.mjs
git commit -m "docs: describe automated tutorial drafts"
```

- [ ] **Step 7: Review final scope and deployment readiness**

Run:

```bash
git status --short
git log -5 --oneline
```

Expected: only the user-owned `C盘清理扫描/` directory remains untracked; the feature commits are present. Do not deploy or enable `NIKE_AUTO_TUTORIALS` until the configured provider can pass a server-side structured Chinese response test.
