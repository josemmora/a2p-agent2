/**
 * A2P Landing Page Agent
 * Receives GHL webhook → Generates branded, A2P-compliant landing pages via Claude API
 * 
 * SETUP: npm install express axios fs-extra slugify
 */

const express = require("express");
const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const slugify = require("slugify");

const app = express();
app.use(express.json());

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const PORT = process.env.PORT || 3000;
const OUTPUT_DIR = path.join(__dirname, "../output");

// ─── MAIN WEBHOOK ENDPOINT ────────────────────────────────────────────────────
// GHL will POST to this URL when a client completes your onboarding form
app.post("/webhook/ghl-onboarding", async (req, res) => {
  try {
    console.log("📥 GHL Webhook received:", JSON.stringify(req.body, null, 2));

    // Parse GHL form fields (map these to your actual GHL field names)
    const clientData = parseGHLPayload(req.body);

    console.log(`🚀 Generating pages for: ${clientData.businessName}`);

    // Run the agent — all 3 pages in parallel
    const [landingPage, privacyPolicy, smsTerms] = await Promise.all([
      generateLandingPage(clientData),
      generatePrivacyPolicy(clientData),
      generateSMSTerms(clientData),
    ]);

    // Save files to disk (or push to GitHub / Vercel — see deploy.js)
    const slug = slugify(clientData.businessName, { lower: true, strict: true });
    const clientDir = path.join(OUTPUT_DIR, slug);
    await fs.ensureDir(clientDir);

    await fs.writeFile(path.join(clientDir, "index.html"), landingPage);
    await fs.writeFile(path.join(clientDir, "privacy-policy.html"), privacyPolicy);
    await fs.writeFile(path.join(clientDir, "terms.html"), smsTerms);

    console.log(`✅ Pages saved to /output/${slug}/`);

    // Respond to GHL so it knows the webhook succeeded
    res.json({
      success: true,
      slug,
      pages: ["index.html", "privacy-policy.html", "terms.html"],
      message: `Landing pages generated for ${clientData.businessName}`,
    });

    // Optionally: trigger GHL automation to notify client (see README)
  } catch (err) {
    console.error("❌ Agent error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── PARSE GHL PAYLOAD ────────────────────────────────────────────────────────
// GHL sends form data in different formats depending on version.
// Map YOUR GHL custom field names/IDs here.
function parseGHLPayload(body) {
  // GHL can send data nested under contact, form_data, or custom_fields
  const contact = body.contact || body;
  const customFields = body.customFields || body.custom_fields || {};

  return {
    businessName:     customFields.business_name     || contact.companyName || "Your Business",
    industry:         customFields.industry           || "General",
    tagline:          customFields.tagline            || "",
    primaryColor:     customFields.primary_color      || "#2563eb",
    accentColor:      customFields.accent_color       || "#06b6d4",
    logoUrl:          customFields.logo_url           || "",
    smsNumber:        customFields.sms_number         || contact.phone || "",
    email:            customFields.business_email     || contact.email || "",
    website:          customFields.website            || "",
    address:          customFields.business_address   || "",
    city:             customFields.city               || "",
    state:            customFields.state              || "",
    zip:              customFields.zip                || "",
    contactName:      contact.firstName + " " + contact.lastName || "",
    messageFrequency: customFields.message_frequency  || "up to 4 messages per month",
    serviceDesc:      customFields.service_description || "",
    ctaText:          customFields.cta_text           || "Get a Free Consultation",
  };
}

// ─── GENERATE LANDING PAGE ────────────────────────────────────────────────────
async function generateLandingPage(client) {
  const prompt = `You are an expert landing page developer specializing in A2P SMS compliance and conversion optimization.

Generate a complete, production-ready HTML landing page for this client:

BUSINESS: ${client.businessName}
INDUSTRY: ${client.industry}
TAGLINE: ${client.tagline || "Generate a compelling tagline for this industry"}
PRIMARY COLOR: ${client.primaryColor}
ACCENT COLOR: ${client.accentColor}
LOGO URL: ${client.logoUrl || "none - use text logo"}
SMS NUMBER: ${client.smsNumber}
EMAIL: ${client.email}
SERVICE DESCRIPTION: ${client.serviceDesc || "Professional " + client.industry + " services"}
CTA TEXT: ${client.ctaText}
MESSAGE FREQUENCY: ${client.messageFrequency}
ADDRESS: ${client.address}, ${client.city}, ${client.state} ${client.zip}

REQUIREMENTS — every single one is MANDATORY:
1. Full HTML file with embedded CSS and JS (no external dependencies except Google Fonts)
2. Navigation with logo, links to privacy-policy.html and terms.html
3. Hero section with branded gradient background using the exact hex colors provided
4. Lead capture form with: First Name, Last Name, Mobile Phone, Email
5. TCPA-compliant SMS consent block — must include ALL of these:
   - "By submitting this form, you authorize [BUSINESS] to send SMS messages..."  
   - "Message frequency: [FREQUENCY]. Msg & data rates may apply."
   - "Reply STOP to opt out. Reply HELP for help."
   - "Consent is not a condition of any purchase."
   - Links to privacy-policy.html and terms.html
6. Compliance badges: "TCPA Compliant", "A2P 10DLC Registered", "Data Secure"
7. Footer with: copyright, Privacy Policy link, Terms link, SMS Terms link, "Msg & data rates may apply"
8. Mobile responsive — works on all screen sizes
9. Professional, conversion-optimized design using the brand colors

Output ONLY the complete HTML — no explanation, no markdown, no code fences.`;

  return callClaude(prompt);
}

// ─── GENERATE PRIVACY POLICY ──────────────────────────────────────────────────
async function generatePrivacyPolicy(client) {
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const prompt = `Generate a complete, legally sound Privacy Policy HTML page for:

BUSINESS: ${client.businessName}
EMAIL: ${client.email}
WEBSITE: ${client.website || "our website"}
ADDRESS: ${client.address}, ${client.city}, ${client.state} ${client.zip}
EFFECTIVE DATE: ${today}

The privacy policy MUST cover:
1. Information we collect (name, phone, email, SMS opt-in data)
2. How we use information (SMS communications, appointment reminders, promotions)
3. SMS/Text messaging data — how it is collected, stored, never sold to third parties
4. IMPORTANT: "Mobile information will not be shared with third parties/affiliates for marketing/promotional purposes. All the above categories exclude text messaging originator opt-in data and consent; this information will not be shared with any third parties."
5. Cookies and tracking
6. Third-party service providers (Twilio, CRMs, etc.)
7. Data retention and security
8. CCPA rights (California residents)
9. GDPR rights (EU residents if applicable)
10. Children's privacy (no data from under 13)
11. How to opt out of SMS: reply STOP
12. Contact information for privacy requests
13. Right to access, delete, correct data

Style: Clean, professional HTML with embedded CSS. Use brand color ${client.primaryColor} for headings and links.
Navigation link back to index.html.

Output ONLY the complete HTML file — no explanation, no markdown.`;

  return callClaude(prompt);
}

// ─── GENERATE SMS TERMS ───────────────────────────────────────────────────────
async function generateSMSTerms(client) {
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const prompt = `Generate complete SMS Terms & Conditions HTML page for A2P 10DLC compliance.

BUSINESS: ${client.businessName}
SMS NUMBER: ${client.smsNumber}
EMAIL: ${client.email}
MESSAGE FREQUENCY: ${client.messageFrequency}
EFFECTIVE DATE: ${today}
ADDRESS: ${client.address}, ${client.city}, ${client.state} ${client.zip}

MANDATORY A2P/CTIA compliance elements — all required:
1. Program description: what SMS messages will be sent and why
2. Message frequency: "${client.messageFrequency}"
3. "Message and data rates may apply"
4. How to opt out: "Text STOP to [number] to unsubscribe at any time"
5. How to get help: "Text HELP to [number] or email [email]"
6. Supported carriers list (AT&T, Verizon, T-Mobile, etc.)
7. No mobile information shared with third parties for marketing — VERBATIM: "Mobile information will not be shared with third parties/affiliates for marketing/promotional purposes."
8. Consent is not a condition of purchase
9. How opt-out confirmation message works
10. Limitation of liability for carrier issues
11. Link back to Privacy Policy (privacy-policy.html)
12. Contact information

Style: Clean, professional HTML with embedded CSS. Use brand color ${client.primaryColor}.
Navigation link back to index.html.

Output ONLY the complete HTML — no explanation, no markdown.`;

  return callClaude(prompt);
}

// ─── CLAUDE API CALL ──────────────────────────────────────────────────────────
async function callClaude(prompt) {
  const response = await axios.post(
    "https://api.anthropic.com/v1/messages",
    {
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    },
    {
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
    }
  );

  return response.data.content[0].text;
}

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get("/health", (req, res) => res.json({ status: "ok", agent: "A2P Landing Page Agent v1.0" }));

app.listen(PORT, () => {
  console.log(`\n🚀 A2P Agent running on port ${PORT}`);
  console.log(`📡 Webhook URL: http://localhost:${PORT}/webhook/ghl-onboarding`);
  console.log(`✅ Health check: http://localhost:${PORT}/health\n`);
});

module.exports = app;
