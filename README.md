# A2P Landing Page Agent
### GHL-Triggered · Claude-Powered · Compliance-First

Automatically generates branded, A2P-compliant landing pages the moment a client completes your GHL onboarding form. Zero back-and-forth. Every page includes TCPA consent, Privacy Policy, and SMS Terms out of the box.

---

## What It Generates (Per Client)

| File | Contents |
|---|---|
| `index.html` | Branded landing page with lead form + TCPA consent block |
| `privacy-policy.html` | CCPA/GDPR-compliant, auto-filled with client details |
| `terms.html` | A2P/CTIA-compliant SMS Terms with all mandatory disclosures |

---

## Architecture

```
GHL Onboarding Form
        ↓  (webhook POST)
  agent.js (Express)
        ↓
  Claude API  ──────► 3 HTML files generated in parallel
        ↓
  Saved to /output/client-slug/
        ↓
  [Optional] Auto-deploy to Vercel
        ↓
  [Optional] Update GHL contact with page URLs
        ↓
  [Optional] Trigger GHL workflow to notify client
```

---

## STEP 1 — Local Setup

```bash
# Clone / copy this project
cd a2p-agent

# Install dependencies
npm install

# Create your .env
cp .env.example .env
# Fill in ANTHROPIC_API_KEY and GHL_API_KEY at minimum
nano .env

# Start the server
npm start
# → Running on http://localhost:3000
```

---

## STEP 2 — Get Your Public Webhook URL

Your webhook server needs to be publicly accessible for GHL to reach it.

### Option A: Railway (Recommended — $5/mo, easiest)
```bash
npm install -g @railway/cli
railway login
railway init
railway up
# → Gives you: https://a2p-agent-production.up.railway.app
```

### Option B: Render (Free tier available)
1. Push code to GitHub
2. Go to render.com → New Web Service
3. Connect your repo, set build command: `npm install`, start: `npm start`
4. Add environment variables in Render dashboard
5. → Gives you: `https://a2p-agent.onrender.com`

### Option C: ngrok (Local testing only)
```bash
ngrok http 3000
# → Gives you temporary public URL for testing
```

Your webhook endpoint will be:
```
https://YOUR-DOMAIN/webhook/ghl-onboarding
```

---

## STEP 3 — Configure GHL Custom Fields

In GHL, go to **Settings → Custom Fields** and create these fields on the Contact object:

| Field Label | Field Key (API Name) | Type |
|---|---|---|
| Business Name | `business_name` | Text |
| Industry | `industry` | Dropdown |
| Tagline | `tagline` | Text |
| Primary Color | `primary_color` | Text |
| Accent Color | `accent_color` | Text |
| Logo URL | `logo_url` | Text |
| SMS Number | `sms_number` | Phone |
| Business Email | `business_email` | Email |
| Website | `website` | Text |
| Business Address | `business_address` | Text |
| City | `city` | Text |
| State | `state` | Text |
| ZIP | `zip` | Text |
| Message Frequency | `message_frequency` | Text |
| Service Description | `service_description` | Textarea |
| CTA Text | `cta_text` | Text |
| Landing Page URL *(output)* | `landing_page_url` | Text |
| Privacy Policy URL *(output)* | `privacy_policy_url` | Text |
| SMS Terms URL *(output)* | `sms_terms_url` | Text |
| A2P Pages Generated *(output)* | `a2p_pages_generated` | Text |

---

## STEP 4 — Build the GHL Onboarding Form

1. In GHL, go to **Sites → Forms → New Form**
2. Add form fields mapped to the custom fields above
3. **Key fields to include:**
   - Business Name (required)
   - Industry (dropdown)
   - Primary Brand Color (use a color picker widget or hex text input)
   - Accent Brand Color
   - Logo URL (or file upload — then store the URL)
   - SMS Phone Number
   - Service Description
   - Message Frequency (e.g., "up to 4 messages per month")
4. Save and publish the form

---

## STEP 5 — Set Up the GHL Webhook

### Method A: Via GHL Workflow (Recommended)

1. Go to **Automation → Workflows → New Workflow**
2. **Trigger:** Form Submitted → select your onboarding form
3. **Action:** Add a **Webhook** action
   - Method: `POST`
   - URL: `https://YOUR-DOMAIN/webhook/ghl-onboarding`
   - Headers: `Content-Type: application/json`
   - Body: Select **Contact** (sends full contact + custom fields)
4. Save and publish the workflow

### Method B: Via GHL Settings → Integrations → Webhooks

1. Go to **Settings → Integrations → Webhooks**
2. Click **Add New Webhook**
3. Event: `Form Submission`
4. URL: `https://YOUR-DOMAIN/webhook/ghl-onboarding`
5. Save

---

## STEP 6 — Map GHL Field Names to agent.js

GHL sends custom field data with the internal field key names.
Open `src/agent.js` and update the `parseGHLPayload()` function to match
your exact GHL field keys:

```javascript
function parseGHLPayload(body) {
  const customFields = body.customFields || {};
  
  return {
    businessName: customFields.business_name,  // ← must match your GHL field key
    primaryColor: customFields.primary_color,
    // ... etc
  };
}
```

**Pro tip:** Use the test script to see exactly what GHL sends:
```bash
# Temporarily add this to agent.js webhook handler:
console.log("RAW GHL PAYLOAD:", JSON.stringify(req.body, null, 2));
# Then submit your onboarding form and check your server logs
```

---

## STEP 7 — Test End to End

```bash
# Make sure server is running
npm start

# Simulate a GHL webhook locally
npm run test-webhook

# Check output
ls output/sunrise-dental-group/
# → index.html  privacy-policy.html  terms.html

# Open in browser
open output/sunrise-dental-group/index.html
```

---

## STEP 8 — Auto-Deploy to Vercel (Optional but Recommended)

```bash
# Get your Vercel token from vercel.com/account/tokens
# Add to .env: VERCEL_TOKEN=your-token

# In agent.js, uncomment the deploy section:
const { deployToVercel } = require("./deploy");
const liveUrl = await deployToVercel(slug, clientDir, clientData);
```

Each client gets their own Vercel project at:
```
https://a2p-sunrise-dental-group.vercel.app
```

Or assign branded subdomains:
```
https://sunrise-dental-group.youragency.com
```

---

## STEP 9 — Notify Client via GHL Workflow

After pages are generated, the agent calls back to GHL to:
1. Update the contact record with the 3 page URLs
2. Trigger a GHL workflow that sends the client an SMS/email

**Create a "Pages Ready" GHL Workflow:**
1. Trigger: Contact Field Updated → `a2p_pages_generated` = "Yes"
2. Action: Send SMS → "Your landing page is live! View it here: {{contact.landing_page_url}}"
3. Action: Send Email → Include all 3 URLs

---

## A2P Compliance Checklist (Auto-Included on Every Page)

- [x] TCPA express written consent language
- [x] "Consent is not a condition of any purchase"
- [x] Message frequency disclosure
- [x] "Msg & data rates may apply"
- [x] STOP keyword opt-out instructions
- [x] HELP keyword support instructions
- [x] Privacy Policy linked (same domain)
- [x] SMS-specific Terms linked (same domain)
- [x] "Mobile information will not be shared with third parties" statement
- [x] Footer compliance text on all pages

---

## Environment Variables Reference

```env
ANTHROPIC_API_KEY=     # Claude API key (required)
GHL_API_KEY=           # GHL private integration key
GHL_LOCATION_ID=       # Your GHL sub-account location ID  
GHL_NOTIFY_WORKFLOW_ID= # Workflow to trigger after generation
VERCEL_TOKEN=          # For auto-deploy (optional)
PORT=3000              # Server port
```

---

## Estimated Time to Full Integration: 2-3 Hours

| Step | Time |
|---|---|
| Local setup & test | 20 min |
| Deploy server (Railway/Render) | 20 min |
| GHL custom fields setup | 30 min |
| GHL form build | 30 min |
| GHL webhook + workflow | 20 min |
| End-to-end test | 20 min |
| **Total** | **~2.5 hours** |
