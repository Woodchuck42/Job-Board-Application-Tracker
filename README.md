# Job Application Tracker

A Chrome extension that logs job applications to a Google Sheet in one click. Open any job posting, click the extension icon, review the auto-filled fields, and click **Log Application**.

The extension pulls the company, job title, IC vs. management, company description, location, salary, and benefits from the posting. It uses schema.org `JobPosting` data when the page has it, falls back to platform-specific selectors (Greenhouse, Lever, LinkedIn, Indeed, Workday, Ashby, SmartRecruiters, Jobvite), and then to text patterns.

If the posting's URL is already in your sheet, the popup loads that row so you can update it (for example, to change the Stage) instead of adding a duplicate.

## Setup

You need your own Google Sheet and your own Google Cloud OAuth client. Nothing is shared with the author of this extension; all data goes directly from your browser to your sheet.

### 1. Create the Google Sheet

1. Create a new Google Sheet.
2. Rename the tab (bottom-left) to exactly **`FTE Applications`**.
   To use a different tab name, change `SHEET_NAME` in `popup.js` to match.
3. In row 1, enter these headers:

   | Column | Header | Filled in by the extension |
   |---|---|---|
   | A | Company Name | Company name |
   | B | JD | Link to the job posting (used to detect duplicates) |
   | C | Job Title | Job title |
   | D | Management/IC | `IC` or `Management` |
   | E | Company Description | The posting's "About us" text |
   | F | Location/Remote | Location or remote status |
   | G | Salary | Salary range |
   | H | Benefits | Other benefits |
   | I | Date Applied | Date in M/D/YYYY format |
   | J | Stage | One of the Stage values below |
   | K | Notes | Not filled in; for your own notes |

4. Add the **Stage** dropdown:
   1. Select cells **J2** down to the bottom of the sheet (click **J2**, then press **Ctrl+Shift+↓** / **Cmd+Shift+↓**).
   2. Go to **Data → Data validation → Add rule**.
   3. Under **Criteria**, choose **Dropdown** and add these options, in this order:
      - Applied
      - First Round
      - Second Round
      - Project
      - Final
      - Disqualified
      - Decline
   4. Click **Done**.

   These options match the Stage dropdown in the extension's popup. If you change one, change the other in `popup.html` too.

5. Copy the sheet's ID from its URL. It's the part between `/d/` and `/edit`:

   ```
   https://docs.google.com/spreadsheets/d/<Google Sheet ID>/edit
   ```

6. Open `popup.js` and replace `<Google Sheet ID>` on line 2 with your ID:

   ```js
   const SPREADSHEET_ID = '<Google Sheet ID>';
   ```

The extension adds new rows below whatever is already in the sheet and never writes to column K, so your notes are safe when a row is updated.

### 2. Set up a Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create or select a project.
2. Enable the **Google Sheets API**: APIs & Services → Library → "Google Sheets API" → Enable.
3. Configure the OAuth consent screen: choose **External**, fill in the required app details, and add your own Google account as a **test user**. While the app is in testing mode, only test users can sign in.

### 3. Load the extension in Chrome

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select this project's folder.
4. Copy the **Extension ID** shown on the extension's card. You need it in the next step.

### 4. Create an OAuth client ID

1. In Google Cloud, go to APIs & Services → Credentials → **Create Credentials** → **OAuth client ID**.
2. Application type: **Chrome Extension**.
3. Paste the Extension ID from step 3 into the **Item ID** / **Application ID** field.
4. Click **Create** and copy the generated **Client ID**. It ends in `.apps.googleusercontent.com`.
5. Open `manifest.json` and replace `<OAuth Client ID>` with the full Client ID:

   ```json
   "oauth2": {
     "client_id": "<OAuth Client ID>",
     ...
   }
   ```

   For example: `"client_id": "1234567890-abc123.apps.googleusercontent.com"`

6. Go back to `chrome://extensions` and click the reload icon on the extension's card.

The Extension ID depends on the folder you loaded from. If you move the folder or load it on another computer, the ID changes and you'll need to update the OAuth client in Google Cloud.

## Usage

1. Open a job posting.
2. Click the extension icon. The first time, Google asks you to sign in and allow access to your sheets.
3. Review and edit the auto-filled fields. Company, Job Title, and the URL are required; everything else is optional.
4. Click **Log Application**.

To update an application later (for example, after a first-round interview), open the same posting and click the icon again. The popup shows an "Already logged" banner with the saved values; change the Stage or any other field and click **Update Application**.

## Permissions

| Permission | Why |
|---|---|
| `identity` | Sign in with Google to get an access token for the Sheets API |
| `activeTab`, `scripting` | Read the job posting on the current tab when you click the icon |
| `https://sheets.googleapis.com/*` | Read and write rows in your sheet |
| `spreadsheets` OAuth scope | Required by the Sheets API to read and write your sheet |

## License

[MIT](LICENSE)
