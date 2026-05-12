# TrustReply

**TrustReply is a security-first AI assistant that forces every answer into a concise, provenance-aware response format.**

It is built for people who want an AI helper that does not hand-wave safety. Every response is shaped around practical risk, safer actions, source transparency, and clear limitations.

![Platform](https://img.shields.io/badge/platform-Web%2FPWA-2d7d7b)
![Status](https://img.shields.io/badge/status-prototype-f4b740)
![Security](https://img.shields.io/badge/security-local--first-101820)
![License](https://img.shields.io/badge/license-Apache--2.0-blue)

## What It Does

TrustReply accepts a task and returns an answer in this exact structure:

```text
Summary: concise direct answer or result.
Risk: <Low|Medium|High> — one-line justification and mitigation.
Actions:
- Actionable next step.
- Safer alternative when relevant.
Sources: explicit URLs or API names used, or "none".
Notes: optional limitations, assumptions, or clarifying questions.
```

The goal is simple: make AI responses safer to act on, easier to audit, and harder to confuse with verified live checks.

## Why It Exists

Most assistant apps optimize for fluency. TrustReply optimizes for **decision safety**.

It is designed for tasks where a casual answer can create real risk:

- Checking suspicious links, emails, messages, or files
- Reviewing commands, scripts, downloads, and code snippets
- Drafting security-aware implementation advice
- Asking privacy-sensitive shopping, travel, or local-search questions
- Producing safe alternatives when a request crosses a line

## Core Guardrails

- Refuses malware, credential theft, de-anonymization, and security bypass requests.
- Adds a `Risk:` line when responses contain links, downloads, commands, or code.
- Requires explicit `Sources:` or `Sources: none`.
- Uses clearly labeled placeholders for live external checks instead of inventing results.
- Defaults to local-first privacy and minimal telemetry.
- Calls out residual risks, assumptions, and safer alternatives.
- Keeps examples short and avoids hardcoded secrets.

## Security Model

TrustReply is a static PWA prototype with a deliberately small attack surface.

| Area | Current behavior |
| --- | --- |
| Rendering | AI output is written with `textContent`, not `innerHTML`, to avoid script injection. |
| CSP | `index.html` includes a restrictive Content Security Policy. |
| Service Worker | Registered with `scope: './'` so it controls only this app folder. |
| API calls | Anthropic calls are made directly from the browser for prototype simplicity. |
| Caching | Provider API calls are never cached by the Service Worker. |
| Storage | Settings are stored locally in this browser. |
| Telemetry | No app telemetry is sent by this prototype. |

## Important Limitation

This prototype stores a user-provided Anthropic API key in browser storage and uses Anthropic's direct browser-call header. That is acceptable for local prototyping, but it is not the recommended production architecture.

For production, use a backend proxy that:

- Stores provider keys server-side
- Applies authentication and rate limits
- Enforces prompt and response size limits
- Filters or redacts sensitive data when appropriate
- Logs only consented, minimal telemetry
- Adds server-side security headers

## PWA Security Notes

Recommended production headers:

```http
Content-Security-Policy: default-src 'self'; connect-src 'self' https://api.anthropic.com; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; upgrade-insecure-requests
Referrer-Policy: no-referrer
Permissions-Policy: camera=(), microphone=(), geolocation=()
X-Content-Type-Options: nosniff
```

Recommended storage:

- Use **IndexedDB** for structured app data.
- Use **localStorage** only for low-sensitivity preferences.
- Avoid storing production API keys in browser storage.
- For sensitive data, prefer server-side storage with encryption, access control, and short retention.

Service Worker scope:

```js
navigator.serviceWorker.register('./sw.js', { scope: './' });
```

## Live Check Philosophy

TrustReply should not pretend to scan the internet when it cannot.

When a task requires live reputation, malware, price, flight, travel, or local data, the assistant should return placeholder steps with exact API endpoints and sample request bodies. It should never fabricate scan results.

Example placeholder pattern:

```text
Actions:
- Submit the URL to a reputation provider endpoint, for example ```POST https://www.virustotal.com/api/v3/urls```.
- Use a body containing the encoded URL only after user consent: ```{"url":"https://example.com"}```.
- Safer alternative: do not click the link until multiple independent checks pass.
Sources: VirusTotal API
Notes: No live lookup was performed in this session.
```

## Run Locally

```bash
npm start
```

Open:

```text
http://localhost:8091
```

Run syntax checks:

```bash
npm run check
```

## Project Structure

```text
TrustReply/
├── app.js          # UI behavior, Anthropic request, response skeleton enforcement
├── index.html      # App shell, CSP, settings dialog
├── manifest.json   # PWA metadata
├── package.json    # Local scripts
├── style.css       # Responsive app styling
└── sw.js           # Offline cache with API-call exclusion
```

## Suggested Roadmap

- Add backend proxy for provider calls.
- Add encrypted IndexedDB notes/history.
- Add configurable scanner integrations with explicit consent prompts.
- Add exportable audit history for generated responses.
- Add automated browser tests for CSP, Service Worker scope, and output rendering.
- Add app icons and install screenshots.

## Positioning

TrustReply is not a malware scanner, legal advisor, financial advisor, or source of live threat intelligence by itself. It is a safety-focused response layer that makes assistant output more transparent and harder to misuse.

## License

Apache License 2.0.
