/**
 * A2P Landing Page Agent
 * Receives GHL webhook → Extracts brand colors from website → Generates branded, A2P-compliant landing pages
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
app.post("/webhook/ghl-onboarding", async (req, res) => {
  try {
    console.log("📥 GHL Webhook received:", JSON.stringify(req.body, null, 2));

    const clientData = parseGHLPayload(req.body);
    console.log(`🚀 Generating pages for: ${clientData.businessName}`);

    // Extract brand colors from their website automatically
    if (clientData.website) {
      console.log(`🎨 Extracting brand colors from: ${clientData.website}`);
      const colors = await extractBrandColors(clientData.website);
      clientData.primaryColor = colors.primary;
      clientData.accentColor = colors.accent;
      console.log(`✅ Colors — Primary: ${colors.primary} Accent: ${colors.accent}`);
    }

    // Generate all 3 pages in parallel
    const [landingPage, privacyPolicy, smsTerms] = await Promise.all([
      generateLandingPage(clientData),
      generatePrivacyPolicy(clientData),
      generateSMSTerms(clientData),
    ]);

    const slug = slugify(clientData.businessName, { lower: true, strict: true });
    const clientDir = path.join(OUTPUT_DIR, slug);
    await fs.ensureDir(clientDir);

    await fs.writeFile(path.join(clientDir, "index.html"), landingPage);
    await fs.writeFile(path.join(clientDir, "privacy-policy.html"), privacyPolicy);
    await fs.writeFile(path.join(clientDir, "terms.html"), smsTerms);

    console.log(`✅ Pages saved to /output/${slug}/`);

    res.json({
      success: true,
      slug,
      colors: { primary: clientData.primaryColor, accent: clientData.accentColor },
      pages: ["index.html", "privacy-policy.html", "terms.html"],
      message: `Landing pages generated for ${clientData.businessName}`,
    });

  } catch (err) {
    console.error("❌ Agent error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── EXTRACT BRAND COLORS FROM WEBSITE ───────────────────────────────────────
// Pure regex — no cheerio or undici needed
async function extractBrandColors(websiteUrl) {
  try {
    const url = websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`;

    const response = await axios.get(url, {
      timeout: 8000,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; A2PAgent/1.0)" },
    });

    const html = response.data;

    // Check meta theme-color first — most reliable brand color
    const themeMatch = html.match(/name=["']theme-color["'][^>]*content=["'](#[0-9A-Fa-f]{6})["']/i)
      || html.match(/content=["'](#[0-9A-Fa-f]{6})["'][^>]*name=["']theme-color["']/i);

    // Extract all 6-digit hex colors from raw HTML
    const colorRegex = /#([0-9A-Fa-f]{6})\b/g;
    const allColors = [];
    let match;

    while ((match = colorRegex.exec(html)) !== null) {
      allColors.push("#" + match[1]);
    }

    if (themeMatch) allColors.unshift(themeMatch[1]);

    // Filter out blacks, whites, and grays
    const brandColors = allColors.filter((color) => {
      const hex = color.replace("#", "");
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const isGray = Math.abs(r - g) < 25 && Math.abs(g - b) < 25;
      const isWhite = r > 235 && g > 235 && b > 235;
      const isBlack = r < 25 && g < 25 && b < 25;
      return !isGray && !isWhite && !isBlack;
    });

    // Count frequency — most used = primary brand color
    const colorCount = {};
    brandColors.forEach((c) => {
      const n = c.toLowerCase();
      colorCount[n] = (colorCount[n] || 0) + 1;
    });

    const sorted = Object.entries(colorCount)
      .sort((a, b) => b[1] - a[1])
      .map(([color]) => color);

    return {
      primary: sorted[0] || "#2563eb",
      accent: sorted[1] || "#06b6d4",
    };

  } catch (err) {
    console.log(`⚠️ Could not extract colors: ${err.message}. Using defaults.`);
    return { primary: "#2563eb", accent: "#06b6d4" };
  }
}

// ─── PARSE GHL PAYLOAD ────────────────────────────────────────────────────────
function parseGHLPayload(body) {
  const contact = body.contact || body;
  const customFields = body.customFields || body.custom_fields || {};

  return {
    businessName:     customFields.legal_entity_name             || contact.companyName || "Your Business",
    industry:         customFields.business_type                  || "General",
    tagline:          customFields.do_you_have_slogans            || "",
    website:          customFields.business_website               || contact.website     || "",
    logoUrl:          customFields.company_logo                   || "",
    smsNumber:        customFields.business_phone_number          || contact.phone       || "",
    email:            customFields.business_email                 || contact.email       || "",
    address:          customFields.business_address               || "",
    contactName:      (contact.firstName || "") + " " + (contact.lastName || ""),
    serviceDesc:      customFields.detailed_list_of_your_services || "",
    messageFrequency: "daily messages",
    ctaText:          customFields.cta_text                       || "Get a Free Consultation",
    primaryColor:     "#2563eb",
    accentColor:      "#06b6d4",
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
ADDRESS: ${client.address}

REQUIREMENTS — every single one is MANDATORY:
1. Full HTML file with embedded CSS and JS (no external dependencies except Google Fonts)
2. Navigation with logo, links to privacy-policy.html and terms.html
3. Hero section with branded gradient using the exact hex colors provided
4. Lead capture form with: First Name, Last Name, Mobile Phone, Email
5. TCPA-compliant SMS consent block with ALL of these:
   - "By submitting this form, you authorize [BUSINESS] to send SMS messages..."
   - "Message frequency: [FREQUENCY]. Msg & data rates may apply."
   - "Reply STOP to opt out. Reply HELP for help."
   - "Consent is not a condition of any purchase."
   - Links to privacy-policy.html and terms.html
6. Compliance badges: "TCPA Compliant", "A2P 10DLC Registered", "Data Secure"
7. Footer with copyright, Privacy Policy, Terms, SMS Terms, "Msg & data rates may apply"
8. Mobile responsive layout
9. Professional conversion-optimized design using the brand colors

Output ONLY the complete HTML — no explanation, no markdown, no code fences.`;

  return callClaude(prompt);
}

// ─── GENERATE PRIVACY POLICY ──────────────────────────────────────────────────
async function generatePrivacyPolicy(client) {
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const prompt = `Generate a complete Privacy Policy HTML page for:

BUSINESS: ${client.businessName}
EMAIL: ${client.email}
WEBSITE: ${client.website || "our website"}
ADDRESS: ${client.address}
EFFECTIVE DATE: ${today}

Must cover: data collection, SMS data usage, TCPA consent, third-party sharing,
CCPA rights, GDPR rights, data retention, opt-out process, contact information.
IMPORTANT: Include "Mobile information will not be shared with third parties/affiliates for marketing/promotional purposes."

Style: Clean HTML with embedded CSS. Use ${client.primaryColor} for headings.
Include navigation link back to index.html.

Output ONLY the complete HTML — no explanation, no markdown.`;

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
ADDRESS: ${client.address}

Must include: program description, message frequency, "Msg & data rates may apply",
STOP/HELP keywords, supported carriers, opt-out confirmation, limitation of liability.
IMPORTANT: Include "Mobile information will not be shared with third parties for marketing purposes."

Style: Clean HTML with embedded CSS. Use ${client.primaryColor} for headings.
Include navigation link back to index.html.

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
  console.log(`📡 Webhook: http://localhost:${PORT}/webhook/ghl-onboarding`);
  console.log(`✅ Health: http://localhost:${PORT}/health\n`);
});

module.exports = app;
