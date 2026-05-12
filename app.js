'use strict';

const API_URL = 'https://api.anthropic.com/v1/messages';
const STORAGE_KEY = 'trustreply_settings';

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

  document.getElementById('settings-button').addEventListener('click', openSettings);
  document.getElementById('save-button').addEventListener('click', saveSettings);
  document.getElementById('clear-button').addEventListener('click', clearLocalData);
  document.getElementById('run-button').addEventListener('click', generateReply);
  document.getElementById('copy-button').addEventListener('click', copyResult);
  document.getElementById('sample-scan').addEventListener('click', () => setSample('scan'));
  document.getElementById('sample-code').addEventListener('click', () => setSample('code'));

  const settings = loadSettings();
  els.apiKey.value = settings.apiKey;
  els.model.value = settings.model;

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
  const next = {
    apiKey: els.apiKey.value.trim(),
    model: els.model.value.trim() || DEFAULT_SETTINGS.model
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
}

async function generateReply() {
  const task = els.task.value.trim();
  const settings = loadSettings();

  if (!task) {
    setOutput('Summary: Add a task before generating a response.\nRisk: Low — No external request was made; mitigation is to enter only the minimum details required.\nActions:\n- Enter a task in the Task description box.\n- Use a sample prompt to preview the required response format.\nSources: none');
    return;
  }

  if (!settings.apiKey.startsWith('sk-ant-')) {
    setStatus('API key needed', 'error');
    setOutput('Summary: TrustReply needs your Anthropic API key before it can generate a response.\nRisk: Medium — Browser-held API keys can be exposed by compromised devices or extensions; mitigation is to use a restricted key and rotate it regularly.\nActions:\n- Open Settings and enter your user-provided Anthropic key.\n- Safer alternative: route requests through a small backend proxy that stores provider keys server-side and applies rate limits.\nSources: none\nNotes: Do not paste shared, production, or privileged keys into a prototype.');
    return;
  }

  setStatus('Generating', 'busy');

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
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
        messages: [{ role: 'user', content: task }]
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || `Request failed with HTTP ${response.status}`);
    }

    const reply = data.content?.[0]?.text || 'Summary: No model output was returned.\nRisk: Low — No result was produced; mitigation is to retry with a shorter task.\nActions:\n- Try again.\n- Check provider status if the issue persists.\nSources: none';
    setOutput(enforceSkeleton(reply));
    setStatus('Complete', 'ready');
  } catch (error) {
    setStatus('Error', 'error');
    setOutput(`Summary: The request could not be completed.\nRisk: Medium — The task may not have been analyzed; mitigation is to avoid acting on suspicious content until it is checked.\nActions:\n- Verify your API key and network connection.\n- Safer alternative: use offline heuristics and do not click links or run commands until live checks work.\nSources: none\nNotes: ${error.message}`);
  }
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
