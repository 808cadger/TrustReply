'use strict';

const API_URL = 'https://api.anthropic.com/v1/messages';
const STORAGE_KEY = 'trustreply_settings';
const MAX_TASK_CHARS = 6000;
const REQUEST_TIMEOUT_MS = 30000;

const DEFAULT_SETTINGS = {
  apiKey: '',
  model: 'claude-sonnet-4-6'
};

const SYSTEM_PROMPT = `You are TrustReply, a security-focused AI assistant and senior full-stack developer. Your primary objectives are user safety, privacy, and transparent provenance.

Always follow these rules:
- Refuse any request that facilitates harm, including malware, de-anonymization, credential theft, or bypassing security. Provide safe alternatives.
- Never emit secrets, private keys, or hardcoded credentials. Explain secure alternatives for key management.
- For any response that contains links, downloads, executable commands, or code, include a concise Risk: <Low|Medium|High> line with one-sentence justification and at least one recommended mitigation.
- Provide up to three verifiable Sources. If no external sources were used, write "Sources: none".
- Favor secure-by-default recommendations: input validation, parameterized queries, CSP, SameSite cookies, least privilege, and minimal telemetry.
- When asked to scan a URL, file, or email, describe the scanning method, list limitations, and return only scanner findings or clearly labeled placeholders when live checks are required. Do not fabricate live results.
- Default to local-first privacy. Assume minimal server telemetry and require explicit user consent before sharing PII or session data with third-party APIs.
- For code outputs include brief inline comments explaining security-relevant choices.
- If ambiguity has a security or privacy impact, ask a clarifying question before executing.
- Keep replies concise and structured.

Exact output structure:
Summary: (1-2 sentences) concise direct answer or result.
Risk: <Low|Medium|High> — one-line justification and at least one mitigation.
Actions: (2-4 bullets) actionable steps. For code or commands, wrap inline code or commands in triple backticks. Include at least one safer alternative when relevant.
Sources: (0-3 items) explicit URLs or API names used, or "none".
Notes: optional, 1-2 sentences with limitations, assumptions, or clarifying questions.

Additional behavior:
- If external checks are required, return placeholder steps with exact API endpoints and sample request bodies. Do not simulate results.
- For shopping, travel, or local queries include a one-sentence privacy note explaining what data will be shared with third parties and offer a local-only alternative.
- For PWA/UI code include security specifics: CSP header suggestion, Service Worker scope, and recommended storage: IndexedDB for app data, localStorage only for low-sensitivity preferences.
- Refuse security bypasses and malware; propose safe, legal alternatives.`;

const samples = {
  scan: 'Task: Scan this URL for phishing risk: https://example.com/login\nConstraints: Use the exact output structure above.',
  code: 'Task: Create minimal PWA UI code for a secure note-taking app.\nConstraints: Include CSP, Service Worker scope, and recommended storage.'
};

const els = {};

document.addEventListener('DOMContentLoaded', () => {
  els.task = document.getElementById('task-input');
  els.output = document.getElementById('result-output');
  els.status = document.getElementById('status-pill');
  els.dialog = document.getElementById('settings-dialog');
  els.apiKey = document.getElementById('api-key-input');
  els.model = document.getElementById('model-input');
  els.run = document.getElementById('run-button');
  els.consent = document.getElementById('third-party-consent');
  els.taskCount = document.getElementById('task-count');
  els.taskWarning = document.getElementById('task-warning');

  document.getElementById('settings-button').addEventListener('click', openSettings);
  document.getElementById('save-button').addEventListener('click', saveSettings);
  document.getElementById('clear-button').addEventListener('click', clearLocalData);
  document.getElementById('run-button').addEventListener('click', generateReply);
  document.getElementById('copy-button').addEventListener('click', copyResult);
  document.getElementById('sample-scan').addEventListener('click', () => setSample('scan'));
  document.getElementById('sample-code').addEventListener('click', () => setSample('code'));
  document.getElementById('clear-task').addEventListener('click', clearTask);
  els.task.addEventListener('input', updateTaskMeta);
  els.consent.addEventListener('change', updateTaskMeta);

  const settings = loadSettings();
  els.apiKey.value = settings.apiKey;
  els.model.value = settings.model;
  updateTaskMeta();

  if ('serviceWorker' in navigator) {
    // The scope is local to this app folder, preventing control of sibling apps.
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
  }
});

function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(event) {
  event.preventDefault();
  const apiKey = els.apiKey.value.trim();
  const model = els.model.value.trim() || DEFAULT_SETTINGS.model;

  if (apiKey && !apiKey.startsWith('sk-ant-')) {
    setStatus('Invalid key format', 'error');
    setOutput('Summary: The API key was not saved because it does not look like an Anthropic key.\nRisk: Medium — Saving malformed or copied secrets can cause failed requests or accidental exposure; mitigation is to verify the key source and use a restricted prototype key.\nActions:\n- Enter a key that starts with ```sk-ant-```.\n- Safer alternative: leave the key blank and test the UI without making provider calls.\nSources: none');
    return;
  }

  const next = {
    apiKey,
    model
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  els.dialog.close();
  setStatus('Saved locally', 'ready');
}

function clearLocalData() {
  if (!confirm('Clear TrustReply settings and local data from this browser?')) return;
  localStorage.removeItem(STORAGE_KEY);
  els.apiKey.value = '';
  els.model.value = DEFAULT_SETTINGS.model;
  setStatus('Local data cleared', 'ready');
}

function openSettings() {
  const settings = loadSettings();
  els.apiKey.value = settings.apiKey;
  els.model.value = settings.model;
  els.dialog.showModal();
}

function setSample(name) {
  els.task.value = samples[name];
  els.task.focus();
  updateTaskMeta();
}

function clearTask() {
  els.task.value = '';
  els.consent.checked = false;
  updateTaskMeta();
  setStatus('Task cleared', 'ready');
}

async function generateReply() {
  const task = els.task.value.trim();
  const settings = loadSettings();

  if (!task) {
    setStatus('Task needed', 'error');
    setOutput('Summary: Add a task before generating a response.\nRisk: Low — No external request was made; mitigation is to enter only the minimum details required.\nActions:\n- Enter a task in the Task description box.\n- Use a sample prompt to preview the required response format.\nSources: none');
    return;
  }

  if (task.length > MAX_TASK_CHARS) {
    setStatus('Task too long', 'error');
    setOutput(`Summary: The task is too long to send from this prototype.\nRisk: Medium — Oversized prompts are harder to review for private data; mitigation is to reduce the task to ${MAX_TASK_CHARS} characters or less.\nActions:\n- Remove unrelated text and sensitive details.\n- Safer alternative: summarize the document locally before asking TrustReply to format the response.\nSources: none`);
    return;
  }

  if (!els.consent.checked) {
    setStatus('Consent needed', 'error');
    setOutput('Summary: TrustReply needs your explicit consent before sending this task to Anthropic.\nRisk: Medium — The task may contain private or identifying data; mitigation is to review and minimize the text before sharing it with a third-party model provider.\nActions:\n- Remove secrets, credentials, and unnecessary personal details.\n- Check the consent box only when you are ready to send the task to Anthropic.\n- Safer alternative: use the app locally for format guidance without pressing Generate.\nSources: none');
    return;
  }

  if (!settings.apiKey.startsWith('sk-ant-')) {
    setStatus('API key needed', 'error');
    setOutput('Summary: TrustReply needs your Anthropic API key before it can generate a response.\nRisk: Medium — Browser-held API keys can be exposed by compromised devices or extensions; mitigation is to use a restricted key and rotate it regularly.\nActions:\n- Open Settings and enter your user-provided Anthropic key.\n- Safer alternative: route requests through a small backend proxy that stores provider keys server-side and applies rate limits.\nSources: none\nNotes: Do not paste shared, production, or privileged keys into a prototype.');
    return;
  }

  setStatus('Generating', 'busy');
  setBusy(true);
  let timeoutId;

  try {
    const controller = new AbortController();
    timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const response = await fetch(API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': settings.apiKey,
        'anthropic-version': '2023-06-01',
        // Required by Anthropic for direct browser prototypes; production apps should use a backend.
        'anthropic-dangerous-direct-browser-calls': 'true'
      },
      body: JSON.stringify({
        model: settings.model,
        max_tokens: 900,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserContent(task) }]
      })
    });
    window.clearTimeout(timeoutId);
    timeoutId = null;

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || `Request failed with HTTP ${response.status}`);
    }

    const reply = data.content?.[0]?.text || 'Summary: No model output was returned.\nRisk: Low — No result was produced; mitigation is to retry with a shorter task.\nActions:\n- Try again.\n- Check provider status if the issue persists.\nSources: none';
    setOutput(enforceSkeleton(reply));
    setStatus('Complete', 'ready');
  } catch (error) {
    setStatus('Error', 'error');
    const reason = error.name === 'AbortError' ? 'The request timed out after 30 seconds.' : error.message;
    setOutput(`Summary: The request could not be completed.\nRisk: Medium — The task may not have been analyzed; mitigation is to avoid acting on suspicious content until it is checked.\nActions:\n- Verify your API key and network connection.\n- Safer alternative: use offline heuristics and do not click links or run commands until live checks work.\nSources: none\nNotes: ${reason}`);
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId);
    setBusy(false);
  }
}

function buildUserContent(task) {
  return `Task:\n${task}\n\nConstraints: Use the exact TrustReply output structure. Do not fabricate live external checks.`;
}

function enforceSkeleton(reply) {
  const sections = ['Summary:', 'Risk:', 'Actions:', 'Sources:'];
  const missing = sections.filter(section => !reply.includes(section));
  if (missing.length === 0) return reply.trim();

  return `Summary: The model returned a response that did not fully match the required structure.\nRisk: Medium — Missing sections can hide safety context; mitigation is to regenerate or manually review before using the answer.\nActions:\n- Regenerate the task and verify the output includes Summary, Risk, Actions, and Sources.\n- Safer alternative: treat the unstructured response as advisory only.\nSources: none\nNotes: Missing required sections: ${missing.join(', ')}`;
}

function setOutput(text) {
  // textContent prevents model output from becoming executable HTML.
  els.output.textContent = text;
}

async function copyResult() {
  try {
    await navigator.clipboard.writeText(els.output.textContent);
    setStatus('Copied', 'ready');
  } catch {
    setStatus('Copy failed', 'error');
  }
}

function setStatus(label, state) {
  els.status.textContent = label;
  els.status.classList.remove('busy', 'error');
  if (state === 'busy') els.status.classList.add('busy');
  if (state === 'error') els.status.classList.add('error');
}

function setBusy(isBusy) {
  els.run.disabled = isBusy;
  els.run.textContent = isBusy ? 'Generating...' : 'Generate';
}

function updateTaskMeta() {
  const text = els.task.value;
  els.taskCount.textContent = `${text.length} / ${MAX_TASK_CHARS}`;

  const warning = getPrivacyWarning(text);
  els.taskWarning.textContent = warning || 'Keep secrets and unnecessary personal data out of prompts.';
  els.taskWarning.classList.toggle('warning', Boolean(warning));
}

function getPrivacyWarning(text) {
  if (!text.trim()) return '';
  if (/sk-[a-z0-9_-]{8,}/i.test(text)) return 'Possible API key detected. Remove secrets before sending.';
  if (/\b\d{3}-\d{2}-\d{4}\b/.test(text)) return 'Possible SSN detected. Remove sensitive identifiers before sending.';
  if (/\b(?:\d[ -]*?){13,19}\b/.test(text)) return 'Possible payment card number detected. Remove financial data before sending.';
  if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(text)) return 'Email address detected. Share only if needed for the task.';
  if (/\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/.test(text)) return 'Phone number detected. Share only if needed for the task.';
  return '';
}
