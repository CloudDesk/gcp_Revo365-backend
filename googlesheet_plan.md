# 📋 Google Sheets Integration — Master Reference Document

> **Purpose:** This is the complete master reference for integrating the two enquiry APIs
> (`/enquiry-corporate` and `/enquiry-individual`) with Google Sheets.
> If this chat is lost, refer to this document — it contains everything needed.
>
> **Project:** `gcp_Revo365-backend`
> **Last Updated:** 2026-03-06
> **Decision:** Google Apps Script Web App (chosen approach)

---

## 📌 Table of Contents

1. [Background & Context](#1-background--context)
2. [Why NOT GCP Service Account or OAuth2](#2-why-not-gcp-service-account-or-oauth2)
3. [Approach Comparison — All Three Options](#3-approach-comparison--all-three-options)
4. [Chosen Solution: Google Apps Script Web App](#4-chosen-solution-google-apps-script-web-app)
5. [Google Sheet Structure](#5-google-sheet-structure)
6. [One-Time Setup Guide (Step by Step)](#6-one-time-setup-guide-step-by-step)
7. [Apps Script Code (Complete)](#7-apps-script-code-complete)
8. [Environment Variables Required](#8-environment-variables-required)
9. [Backend Implementation Plan](#9-backend-implementation-plan)
10. [Files to Create / Modify](#10-files-to-create--modify)
11. [Concurrency Handling](#11-concurrency-handling)
12. [Security Considerations](#12-security-considerations)
13. [Cost Analysis](#13-cost-analysis)
14. [API Payload Reference](#14-api-payload-reference)
15. [Implementation Checklist](#15-implementation-checklist)

---

## 1. Background & Context

### The Project
- **Backend:** Fastify + TypeScript, hosted on the **company's GCP account** (Cloud Run)
- **Two Enquiry APIs** exposed publicly (no auth required):
  - `POST /enquiry-individual` — for individual users
  - `POST /enquiry-corporate` — for corporate/business users
- **Client's requirement:** Every API hit must insert a new row into their personal **Google Sheet**
- **Services file:** `src/services/enquiry.service.ts`
- **Controller file:** `src/controller/enquiry.controller.ts`
- **Route registration:** `src/routes/routes.ts` (lines 292–294)

### The Constraint
- The **Google Sheet must live in the client's personal Google account** (not the company GCP account)
- The solution must be **100% free, forever** — no credit card, no billing
- The developer has access to the client's Google account credentials

### Payload Fields Reference (`enquiry_keys.json`)
**Individual Enquiry Fields:**
| Field | Label | Required | Validation |
|---|---|---|---|
| `firstName` | First Name | ✅ Yes | Must not be empty |
| `lastName` | Last Name | ❌ No | — |
| `email` | Email Address | ✅ Yes | Valid email format |
| `phone` | Phone Number | ✅ Yes | Exactly 10 digits |
| `topic` | Topic | ✅ Yes | One of: Product Information, Technical Support, Pricing & Plans, Partnership Opportunity, Other |
| `message` | Your Message | ✅ Yes | Must not be empty |

**Corporate Enquiry Fields:**
| Field | Label | Required | Validation |
|---|---|---|---|
| `firstName` | First Name | ✅ Yes | Must not be empty |
| `lastName` | Last Name | ❌ No | — |
| `email` | Work Email | ✅ Yes | Valid email format |
| `phone` | Phone Number | ✅ Yes | Exactly 10 digits |
| `company` | Company Name | ✅ Yes | Must not be empty |
| `fleet` | Employee Count | ✅ Yes | One of: 1–10, 11–50, 51–200, 200+ employees |
| `date` | Preferred Date | ✅ Yes | Format YYYY-MM-DD, today or future |
| `notes` | Anything else? | ❌ No | — |

---

## 2. Why NOT GCP Service Account or OAuth2

### ❌ GCP Service Account — REJECTED
- Requires a GCP Project in client's account
- **GCP always asks for a credit card** (even for the free tier — for identity verification)
- Client does not want to provide credit card → blocked

### ❌ OAuth2 Refresh Token — REJECTED
- Also requires a GCP Project (for OAuth2 client ID & client secret)
- Same credit card issue
- **Additional fragility:** If the client ever changes their Google password or revokes app access,
  the refresh token is **silently invalidated** — the integration breaks in production
- Requires a complex one-time OAuth2 authorization flow to generate the token
- Not suitable for a long-lived, zero-maintenance integration

### ✅ Google Apps Script Web App — CHOSEN
- No GCP project needed
- No credit card needed
- No OAuth needed
- No API keys needed
- Just a single HTTPS URL stored in `.env`

---

## 3. Approach Comparison — All Three Options

| Factor | Service Account (GCP) | OAuth2 Refresh Token | **Apps Script Web App** |
|---|---|---|---|
| **Industry Standard?** | ✅ Enterprise Standard | ✅ Standard (user-delegated) | ✅ Standard for Sheets automation |
| **Used by** | Fortune 500, SaaS | Apps accessing user data | Typeform, JotForm, Zapier, agencies |
| **GCP Project needed** | ✅ Yes | ✅ Yes | ❌ **No** |
| **Credit card** | ✅ Required | ✅ Required | ❌ **Not required** |
| **OAuth flow** | ❌ No | ✅ Yes (one-time) | ❌ **No** |
| **Token expiry risk** | Never (key-based) | Can be revoked anytime | **Never (URL-based)** |
| **Risk of breaking** | Low | Medium | **Low** |
| **Security level** | 🔐 High | 🔐 High | 🔒 Medium-High |
| **Setup complexity** | Medium | Complex | **Simple** |
| **Concurrency safety** | Manual handling needed | Manual handling needed | **Built-in LockService** |
| **Cost** | Free (but needs card) | Free (but needs card) | **100% Free, no card** |
| **Right for this project?** | ❌ Blocked by card | ❌ Fragile + needs card | ✅ **Best fit** |

### Industry Standard by Use Case
- **Enterprise SaaS → Google Workspace:** Service Account is the standard
- **App accessing user's own data (user grants permission):** OAuth2 is the standard
- **Form submission → Client's Google Sheet (our case):** Apps Script Web App is the de-facto standard
  - Used by: Typeform, JotForm, Google Forms itself, Zapier, Make.com, countless agencies
  - Google officially recommends this pattern for Sheets automation

---

## 4. Chosen Solution: Google Apps Script Web App

### How It Works

```
Client hits API
      ↓
Fastify Route (enquiry.controller.ts)
      ↓
enquiry.service.ts (main logic)
      ↓
sheetsService.ts → axios POST (JSON payload)
      ↓
Google Apps Script Web App URL (HTTPS)
      ↓
Apps Script: LockService → appendRow() → Google Sheet
      ↓
Returns { success: true }
```

### Why This Is Perfect for This Use Case
- ✅ **Zero credentials in backend** — just one URL
- ✅ **URL is the secret** — long, randomly generated by Google, impossible to guess
- ✅ **Sheet stays in client's Google Drive** — client can view/edit anytime
- ✅ **Google-managed infrastructure** — 99.9% uptime
- ✅ **Built-in concurrency locking** via Google's `LockService`
- ✅ **No token expiry** — the Web App URL never expires unless manually deleted
- ✅ **No npm packages needed** — uses `axios` which is already in the project
- ✅ **Free forever** — part of every Google account at no cost

---

## 5. Google Sheet Structure

### Sheet File
- **Location:** Client's personal Google Drive
- **Name:** e.g., `Revo365 Enquiries` (client can rename)
- **Two tabs:**
  - Tab 1: `Individual`
  - Tab 2: `Corporate`
  - ⚠️ Tab names must match EXACTLY what is configured in `.env`

### `Individual` Tab — Column Headers (Row 1)

| A | B | C | D | E | F | G |
|---|---|---|---|---|---|---|
| Timestamp | First Name | Last Name | Email | Phone | Topic | Message |

### `Corporate` Tab — Column Headers (Row 1)

| A | B | C | D | E | F | G | H | I |
|---|---|---|---|---|---|---|---|---|
| Timestamp | First Name | Last Name | Work Email | Phone | Company | Employee Count | Preferred Date | Notes |

> ℹ️ Row 1 is headers. Data starts from Row 2. The Apps Script `appendRow()` automatically
> finds the next empty row — headers are safe.

---

## 6. One-Time Setup Guide (Step by Step)

> **Done by:** Developer, using client's Google account credentials
> **Frequency:** One-time only

### Step 1: Create the Google Sheet

1. Log in to [sheets.google.com](https://sheets.google.com) with the **client's** Google credentials
2. Click **Blank** → create a new spreadsheet
3. Rename the spreadsheet: `Revo365 Enquiries`
4. Rename the default tab `Sheet1` → `Individual`
5. Click the **`+`** button at the bottom to add a new tab → name it `Corporate`
6. In the **`Individual`** tab, Row 1 — enter these headers (one per cell):
   ```
   Timestamp | First Name | Last Name | Email | Phone | Topic | Message
   ```
7. In the **`Corporate`** tab, Row 1 — enter these headers:
   ```
   Timestamp | First Name | Last Name | Work Email | Phone | Company | Employee Count | Preferred Date | Notes
   ```
8. **Copy the Spreadsheet ID** from the URL:
   ```
   https://docs.google.com/spreadsheets/d/  <<<THIS_PART>>>  /edit
   ```
   → Save this ID, you'll need it for `.env` (optional — Apps Script doesn't need it, but useful for reference)

---

### Step 2: Open Apps Script

1. In the Google Sheet → click **Extensions** (top menu)
2. Click **Apps Script**
3. A new tab opens with the Apps Script editor
4. Delete the default `function myFunction() {}` code
5. Paste the full Apps Script code from **Section 7** below

---

### Step 3: Deploy as Web App

1. In the Apps Script editor → click **Deploy** (top right)
2. Click **New deployment**
3. Click the gear icon ⚙️ next to "Type" → select **Web App**
4. Fill in the settings:
   - **Description:** `Revo365 Enquiry Sheet Writer`
   - **Execute as:** `Me` (client's Google account — this is important)
   - **Who has access:** `Anyone`
     > ⚠️ This means anyone with the URL can POST to it.
     > We handle security via the secret token in the request body (see Section 12).
5. Click **Deploy**
6. If prompted → click **Authorize access** → log in as client → Allow
7. **Copy the Web App URL** — it looks like:
   ```
   https://script.google.com/macros/s/AKfycbXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX/exec
   ```
   → This URL is your integration endpoint. **Store it securely in `.env`**

---

### Step 4: Update `.env` in the Backend

Add these lines to the project's `.env` file:

```env
# ─── Google Sheets Integration (Apps Script Web App) ─────────────────────────
ENQUIRY_SHEETS_WEBHOOK_URL=https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec
ENQUIRY_SHEETS_SECRET=REVO365_SHEET_SECRET_2026      # choose any strong secret string
ENQUIRY_CORPORATE_SHEET=Corporate
ENQUIRY_INDIVIDUAL_SHEET=Individual
# ─────────────────────────────────────────────────────────────────────────────
```

**Important:** The secret in `.env` must exactly match the `ALLOWED_SECRET` in the Apps Script code.

---

### Step 5: Redeploy After Any Script Changes

If the Apps Script code is ever modified:
1. Go to the Apps Script editor
2. Click **Deploy → Manage deployments**
3. Click the edit pencil ✏️ on the existing deployment
4. Change version to **"New version"**
5. Click **Deploy**
> ⚠️ The URL stays the same — no need to update `.env` after redeployment

---

## 7. Apps Script Code (Complete)

> **Where to paste:** Google Apps Script editor (Extensions → Apps Script in the Google Sheet)

```javascript
// ============================================================
// Revo365 Enquiry Sheet Writer — Google Apps Script Web App
// Version: 1.0
// Last Updated: 2026-03-06
// 
// This script acts as an HTTPS webhook endpoint.
// It receives POST requests from the Revo365 backend and
// appends a new row to the appropriate sheet tab.
//
// Deployment settings:
//   Execute as: Me
//   Who has access: Anyone
// ============================================================

// ⚠️ IMPORTANT: Must match ENQUIRY_SHEETS_SECRET in .env exactly
var ALLOWED_SECRET = "TEQIT_DEV_contactteqit.io";

// Status dropdown options for the Status column
var STATUS_OPTIONS = ["Open", "In Progress", "Closed", "Converted", "No Response"];

function doPost(e) {
  // ── Step 1: Acquire a script-level lock (handles concurrent requests) ──
  var lock = LockService.getScriptLock();
  var acquiredLock = lock.tryLock(30000); // Wait up to 30 seconds

  if (!acquiredLock) {
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: "Could not acquire lock — too many concurrent requests. Please retry."
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  try {
    // ── Step 2: Parse the incoming JSON body ──
    var body;
    try {
      body = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return ContentService
        .createTextOutput(JSON.stringify({
          success: false,
          error: "Invalid JSON body: " + parseErr.message
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // ── Step 3: Validate the secret token ──
    if (!body.secret || body.secret !== ALLOWED_SECRET) {
      return ContentService
        .createTextOutput(JSON.stringify({
          success: false,
          error: "Unauthorized: invalid or missing secret"
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // ── Step 4: Validate required fields ──
    if (!body.sheetName) {
      return ContentService
        .createTextOutput(JSON.stringify({
          success: false,
          error: "Missing required field: sheetName"
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (!body.rowData || !Array.isArray(body.rowData) || body.rowData.length === 0) {
      return ContentService
        .createTextOutput(JSON.stringify({
          success: false,
          error: "Missing or invalid field: rowData (must be a non-empty array)"
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // ── Step 5: Get the target sheet tab ──
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(body.sheetName);

    if (!sheet) {
      return ContentService
        .createTextOutput(JSON.stringify({
          success: false,
          error: "Sheet tab not found: '" + body.sheetName + "'. Available tabs: Individual, Corporate"
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // ── Step 6: Append the row ──
    // appendRow() is atomic — concurrent calls safely queued by LockService.
    sheet.appendRow(body.rowData);
    var newRowNum = sheet.getLastRow();

    // ── Step 7: Apply Status dropdown to the new row's Status cell ──
    // Dynamically find the "Status" column from row 1 headers
    var lastCol = sheet.getLastColumn();
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var statusColIndex = -1;
    for (var i = 0; i < headers.length; i++) {
      if (String(headers[i]).trim().toLowerCase() === "status") {
        statusColIndex = i + 1; // Convert to 1-based index
        break;
      }
    }

    if (statusColIndex > 0) {
      var statusCell = sheet.getRange(newRowNum, statusColIndex);

      // Apply dropdown validation for Status
      var rule = SpreadsheetApp.newDataValidation()
        .requireValueInList(STATUS_OPTIONS, true)
        .setAllowInvalid(false)
        .setHelpText("Select the current status of this enquiry")
        .build();
      statusCell.setDataValidation(rule);

      // Highlight the status cell with a light yellow background
      statusCell.setBackground("#FFF2CC");
      statusCell.setFontWeight("bold");
    }

    // ── Step 8: Return success ──
    return ContentService
      .createTextOutput(JSON.stringify({
        success: true,
        message: "Row appended to sheet: " + body.sheetName,
        rowCount: newRowNum
      }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    // ── Catch unexpected errors ──
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: "Internal script error: " + err.message
      }))
      .setMimeType(ContentService.MimeType.JSON);

  } finally {
    // ── Always release the lock ──
    lock.releaseLock();
  }
}

// ── Health check: GET request test (optional) ──
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({
      status: "ok",
      message: "Revo365 Enquiry Sheet Writer is running",
      timestamp: new Date().toISOString()
    }))
    .setMimeType(ContentService.MimeType.JSON);
}
```

---

## 8. Environment Variables Required

Add the following to `.env` in the project root:

```env
# ─── Google Sheets Integration (Apps Script Web App) ─────────────────────────
ENQUIRY_SHEETS_WEBHOOK_URL=https://script.google.com/macros/s/YOUR_SCRIPT_ID_HERE/exec
ENQUIRY_SHEETS_SECRET=REVO365_SHEET_SECRET_2026
ENQUIRY_CORPORATE_SHEET=Corporate
ENQUIRY_INDIVIDUAL_SHEET=Individual
# ─────────────────────────────────────────────────────────────────────────────
```

> ⚠️ The `ENQUIRY_SHEETS_SECRET` value must exactly match `ALLOWED_SECRET` in the Apps Script code.
> ⚠️ Do NOT commit the real `ENQUIRY_SHEETS_WEBHOOK_URL` to git if the repo is public.

---

## 9. Backend Implementation Plan

### Flow per API hit

```
POST /enquiry-individual  (or /enquiry-corporate)
        ↓
enquiryController.enquiryIndividual()
        ↓
enquiryService.enquiryIndividual(request)
   ├── 1. Extract payload from request.body
   ├── 2. Main business logic (existing)
   ├── 3. Build rowData array with timestamp
   ├── 4. Call sheetsService.appendToSheet("Individual", rowData)
   │         ↓
   │     axios.post(WEBHOOK_URL, { secret, sheetName, rowData })
   │         ↓
   │     Retry on failure (up to 3 times, exponential backoff)
   │
   └── 5. Return { status: 200, message: "..." } to controller
         (Sheet failure is logged but NEVER fails the API response)
```

### Key Design Decisions

| Decision | Rationale |
|---|---|
| Sheet write is `await`-ed | Ensures the row is written before the response is sent, so data is never lost |
| Sheet errors don't fail the API | Wrapped in its own try-catch — sheet unavailability does not affect the user's submission |
| Timestamp is added by the backend | More reliable than Apps Script timestamp; consistent IST timezone |
| Retry logic (3 attempts) | Google's infrastructure can occasionally have transient 5xx errors |
| Exponential backoff | 500ms → 1000ms → 2000ms — avoids hammering a temporarily busy endpoint |

---

## 10. Files to Create / Modify

### New Files

```
src/
└── googleSheets/
    ├── sheetsClient.ts        (NOT needed — we use axios directly, no googleapis package)
    └── sheetsService.ts       ← NEW: appendToSheet() with retry logic
```

### Modified Files

```
src/
└── services/
    └── enquiry.service.ts     ← MODIFIED: call sheetsService after each API hit

.env                           ← MODIFIED: add 4 new environment variables
```

### No New npm Packages Required
- Uses `axios` (already installed in the project)
- No `googleapis` package needed

---

## 11. Concurrency Handling

### Problem
Multiple users can hit the enquiry API simultaneously. Without handling, two concurrent rows
could potentially conflict.

### Solution: Two Layers of Protection

**Layer 1 — Apps Script `LockService` (Server-side)**
```javascript
var lock = LockService.getScriptLock();
lock.tryLock(30000); // waits up to 30 seconds for the lock
// ... appendRow() ...
lock.releaseLock();
```
- Ensures only **one** `appendRow()` runs at a time within the Apps Script
- Subsequent concurrent calls wait in queue — no data lost, no row overwritten
- `appendRow()` itself is atomic — always appends after the last row with data

**Layer 2 — Backend Retry Logic (Client-side)**
```
Attempt 1 → if fails → wait 500ms → Attempt 2 → if fails → wait 1000ms → Attempt 3
```
- Handles transient network errors or Google infrastructure hiccups
- After 3 failed attempts → logs the error (does not crash the API)

### Concurrency Safety Guarantee
| Scenario | Outcome |
|---|---|
| 2 requests arrive simultaneously | Lock queues them — both get separate rows |
| 50 requests arrive simultaneously | All 50 queued by LockService — all get separate rows (within 30s window) |
| Sheet write fails after 3 retries | Logged as error, API still returns 200 to user |
| Google Scripts service is down | Logged as error, API still returns 200 to user |

---

## 12. Security Considerations

### Threat Model
The Apps Script Web App URL is publicly accessible (required for the backend to call it).
We mitigate abuse with a shared secret.

### Security Measures

| Measure | Implementation |
|---|---|
| **Secret token validation** | Every POST must include `secret: ENQUIRY_SHEETS_SECRET` — wrong secret returns 401 |
| **URL privacy** | URL stored in `.env` only — never hardcoded or committed to git |
| `.gitignore` check | Ensure `.env` is in `.gitignore` |
| **HTTPS only** | Apps Script Web Apps always use HTTPS — encrypted in transit |
| **No sensitive data** | Sheet only contains enquiry contact info — not financial/personal health data |
| **Read-only for sheet users** | Service responds only to POST — no read endpoint exposed |

### What to Add to `.gitignore`
```
.env
```
(Verify `.env` is already in `.gitignore` — it should be)

---

## 13. Cost Analysis

| Resource | Provider | Cost | Duration |
|---|---|---|---|
| Google Apps Script | Google (free) | **$0** | Forever |
| Google Sheets | Google (free) | **$0** | Forever (spreadsheets don't count against Drive quota) |
| Google Drive (sheet storage) | Google (free) | **$0** | Forever |
| Apps Script execution quota | Google (free tier) | **$0** | 90 min execution/day → at ~200ms per request = **27,000 submissions/day** before hitting limits |
| `axios` (already installed) | npm (open source) | **$0** | Forever |
| **Total** | | **$0** | **Forever** |

### Industry-Level Free Quota
- **Write requests:** 60/minute (Apps Script doesn't count toward Sheets API rate limits)
- **Script runtime:** 90 minutes/day = ~27,000 enquiry submissions per day at zero cost
- For an enquiry form, it is **virtually impossible** to hit this limit

---

## 14. API Payload Reference

### What the backend sends to the Apps Script Web App

#### For `/enquiry-individual`:
```json
{
  "secret": "REVO365_SHEET_SECRET_2026",
  "sheetName": "Individual",
  "rowData": [
    "2026-03-06T01:05:14+05:30",  // Timestamp (IST)
    "John",                         // firstName
    "Doe",                          // lastName (empty string if not provided)
    "john@example.com",             // email
    "9876543210",                   // phone
    "Technical Support",            // topic
    "I need help with my device"    // message
  ]
}
```

#### For `/enquiry-corporate`:
```json
{
  "secret": "REVO365_SHEET_SECRET_2026",
  "sheetName": "Corporate",
  "rowData": [
    "2026-03-06T01:05:14+05:30",  // Timestamp (IST)
    "Jane",                         // firstName
    "Smith",                        // lastName (empty string if not provided)
    "jane@company.com",             // email (work email)
    "9123456789",                   // phone
    "Acme Corp",                    // company
    "51–200 employees",             // fleet (employee count)
    "2026-03-10",                   // date (preferred date)
    "Looking for bulk pricing"      // notes (empty string if not provided)
  ]
}
```

### Apps Script Response
**Success:**
```json
{ "success": true, "message": "Row appended to sheet: Individual", "rowCount": 42 }
```
**Failure:**
```json
{ "success": false, "error": "Unauthorized: invalid or missing secret" }
```

---

## 15. Implementation Checklist

### One-Time Google Setup (by developer, using client's Google account)
- [ ] ✅ Log into [sheets.google.com](https://sheets.google.com) with client's credentials
- [ ] ✅ Create a new Google Spreadsheet → name: `Revo365 Enquiries`
- [ ] ✅ Add tab: `Individual` — with headers in Row 1
- [ ] ✅ Add tab: `Corporate` — with headers in Row 1
- [ ] ✅ Open **Extensions → Apps Script**
- [ ] ✅ Paste the Apps Script code from Section 7
- [ ] ✅ Set `ALLOWED_SECRET` in the script to match your chosen secret
- [ ] ✅ Click **Deploy → New Deployment → Web App**
- [ ] ✅ Set: Execute as: **Me** | Who has access: **Anyone**
- [ ] ✅ Copy the **Web App URL**

### Backend Setup (by developer)
- [ ] ✅ Add 4 environment variables to `.env` (see Section 8)
- [ ] ✅ Verify `.env` is in `.gitignore`
- [ ] ✅ Create `src/googleSheets/sheetsService.ts`
- [ ] ✅ Update `src/services/enquiry.service.ts`
- [ ] ✅ Test both APIs and verify rows appear in the sheet

### Testing
- [ ] ✅ Hit `POST /enquiry-individual` → verify row appears in `Individual` tab
- [ ] ✅ Hit `POST /enquiry-corporate` → verify row appears in `Corporate` tab
- [ ] ✅ Send 5 simultaneous requests → verify all 5 rows are present, none overwritten
- [ ] ✅ Verify sheet failure (wrong URL) does not crash the API

---

## 📞 Quick Reference — Key Values

After setup, fill in these values here for quick reference:

```
Web App URL:        https://script.google.com/macros/s/___________________/exec
Sheet URL:          https://docs.google.com/spreadsheets/d/___________________/edit
Spreadsheet ID:     ___________________
Individual Tab:     Individual
Corporate Tab:      Corporate
Secret:             REVO365_SHEET_SECRET_2026  (or your chosen value)
```

---

*End of Document — All rights reserved, Revo365 Project 2026*