// ─── Config ───────────────────────────────────────────────────────────────────
const SPREADSHEET_ID = '<Google Sheet ID>';
const SHEET_NAME     = 'FTE Applications';

// Column layout:
//   A – Company      B – URL         C – Title      D – IC/Management
//   E – About        F – Location    G – Salary     H – Benefits
//   I – Date Applied J – Stage       K – Notes (manual, never written)

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const companyInput  = document.getElementById('company');
const typeSelect    = document.getElementById('type');
const stageSelect   = document.getElementById('stage');
const titleInput    = document.getElementById('title');
const urlInput      = document.getElementById('url');
const aboutInput    = document.getElementById('about-us');
const locationInput = document.getElementById('location');
const dateInput     = document.getElementById('date-applied');
const salaryInput   = document.getElementById('salary');
const benefitsInput = document.getElementById('benefits');
const exportBtn     = document.getElementById('export-btn');
const statusEl      = document.getElementById('status');
const dupeBanner    = document.getElementById('dupe-banner');

// ─── State ────────────────────────────────────────────────────────────────────
let existingRowNum = null; // null = new entry; number = row to update

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  dateInput.value = todayIso();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  urlInput.value = tab.url || '';

  // Silent dupe check — only works if a token is already cached
  silentDupeCheck(tab.url);

  // Inject content script and extract job data
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
  } catch (_) {}

  try {
    const data = await getJobDataWithRetry(tab.id);
    if (data) {
      companyInput.value  = data.company    || '';
      titleInput.value    = data.title      || '';
      urlInput.value      = data.url        || tab.url;
      aboutInput.value    = data.aboutUs    || '';
      locationInput.value = data.location   || '';
      salaryInput.value   = data.salary     || '';
      benefitsInput.value = data.benefits   || '';
      if (data.type === 'Management') typeSelect.value = 'Management';
    }
  } catch (_) {}
});

async function silentDupeCheck(url) {
  try {
    const token = await getAuthToken(false); // non-interactive, returns null if not cached
    if (!token) return;
    const found = await findExistingRow(token, url);
    if (found) enterUpdateMode(found);
  } catch (_) {}
}

// ─── Export / Update ──────────────────────────────────────────────────────────
exportBtn.addEventListener('click', async () => {
  const company  = companyInput.value.trim();
  const url      = urlInput.value.trim();
  const title    = titleInput.value.trim();
  const type     = typeSelect.value;
  const stage    = stageSelect.value;
  const aboutUs  = aboutInput.value.trim();
  const location = locationInput.value.trim();
  const salary   = salaryInput.value.trim();
  const benefits = benefitsInput.value.trim();
  const dateApplied = dateInput.value || todayIso();

  if (!company) { setStatus('Please enter a company name.', 'error'); return; }
  if (!title)   { setStatus('Please enter a job title.', 'error'); return; }
  if (!url)     { setStatus('Please enter an application URL.', 'error'); return; }

  setStatus('Authenticating…', 'loading');
  exportBtn.disabled = true;

  let token;
  try {
    token = await getAuthToken(true);
  } catch (err) {
    setStatus('Auth failed: ' + err.message, 'error');
    exportBtn.disabled = false;
    return;
  }

  // If the silent check didn't run (no cached token at open time), check now
  if (existingRowNum === null) {
    try {
      const found = await findExistingRow(token, url);
      if (found) {
        enterUpdateMode(found);
        setStatus('Already logged — review and click Update to save.', 'loading');
        exportBtn.disabled = false;
        return;
      }
    } catch (_) {}
  }

  const row = [company, url, title, type, aboutUs, location, salary, benefits, dateApplied, stage];

  try {
    if (existingRowNum) {
      setStatus('Updating…', 'loading');
      await updateRow(token, existingRowNum, row);
      setStatus('Updated successfully!', 'success');
    } else {
      setStatus('Logging…', 'loading');
      await appendRow(token, row);
      setStatus('Logged successfully!', 'success');
    }
  } catch (err) {
    setStatus('Failed: ' + err.message, 'error');
  } finally {
    exportBtn.disabled = false;
  }
});

// ─── Update mode ──────────────────────────────────────────────────────────────
function enterUpdateMode(found) {
  existingRowNum = found.rowNum;

  dupeBanner.style.display = 'block';
  dupeBanner.textContent   = 'Already logged — edit any field and click Update to save changes.';

  exportBtn.textContent = 'Update Application';

  const d = found.data;
  companyInput.value  = d[0] || companyInput.value;
  // d[1] is URL — already set
  titleInput.value    = d[2] || titleInput.value;
  typeSelect.value    = d[3] || 'IC';
  aboutInput.value    = d[4] || aboutInput.value;
  locationInput.value = d[5] || locationInput.value;
  salaryInput.value   = d[6] || salaryInput.value;
  benefitsInput.value = d[7] || benefitsInput.value;
  if (d[8]) dateInput.value = isoFromSheet(d[8]);
  if (d[9]) stageSelect.value = d[9];
}

// ─── Retry helper ─────────────────────────────────────────────────────────────
async function getJobDataWithRetry(tabId, maxAttempts = 3) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const data = await chrome.tabs.sendMessage(tabId, { action: 'getJobData' });
      if (data && (data.title || data.company)) return data;
    } catch (_) {}
    if (i < maxAttempts - 1) await new Promise(r => setTimeout(r, 600));
  }
  return null;
}

// ─── Google OAuth ─────────────────────────────────────────────────────────────
function getAuthToken(interactive) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError || !token) {
        reject(new Error(chrome.runtime.lastError?.message || 'No token'));
      } else {
        resolve(token);
      }
    });
  });
}

// ─── Sheets API ───────────────────────────────────────────────────────────────
async function findExistingRow(token, url) {
  const range    = encodeURIComponent(`${SHEET_NAME}!A:J`);
  // Dates come back as serial numbers so they read correctly in any sheet locale
  const endpoint =
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}` +
    `?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`;

  const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;

  const { values = [] } = await res.json();
  for (let i = 0; i < values.length; i++) {
    if (values[i][1] === url) return { rowNum: i + 1, data: values[i] };
  }
  return null;
}

async function appendRow(token, row) {
  const range    = encodeURIComponent(`${SHEET_NAME}!A:J`);
  const endpoint =
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}:append` +
    `?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [row] })
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message || `HTTP ${res.status}`);
  }
  return res.json();
}

async function updateRow(token, rowNum, row) {
  const range    = encodeURIComponent(`${SHEET_NAME}!A${rowNum}:J${rowNum}`);
  const endpoint =
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}` +
    `?valueInputOption=USER_ENTERED`;

  const res = await fetch(endpoint, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [row] })
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message || `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
// Dates are written as YYYY-MM-DD, which Sheets parses the same way in every locale
function todayIso() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

// Sheets date value → YYYY-MM-DD for the date input.
// Real dates arrive as serial numbers (days since 1899-12-30); text dates are passed through if already ISO.
function isoFromSheet(value) {
  if (typeof value === 'number') {
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000).toISOString().split('T')[0];
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return todayIso();
}

function setStatus(msg, type) {
  statusEl.textContent = msg;
  statusEl.className   = type;
}
