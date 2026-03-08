/**
 * A2P Landing Page Agent
 * GHL Webhook → Extract Colors → Generate Pages → Auto-Deploy to Vercel
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
const VERCEL_TOKEN      = process.env.VERCEL_TOKEN;
const PORT              = process.env.PORT || 3000;
const OUTPUT_DIR        = path.join(__dirname, "../output");

// ─── MAIN WEBHOOK ENDPOINT ────────────────────────────────────────────────────
app.post("/webhook/ghl-onboarding", async (req, res) => {
  try {
    console.log("📥 GHL Webhook received:", JSON.stringify(req.body, null, 2));

    const clientData = parseGHLPayload(req.body);
    console.log(`🚀 Generating pages for: ${clientData.businessName}`);

    // Step 1 — Extract brand colors from their website
    if (clientData.website) {
      console.log(`🎨 Extracting colors from: ${clientData.website}`);
      const colors = await extractBrandColors(clientData.website);
      clientData.primaryColor = colors.primary;
      clientData.accentColor  = colors.accent;
      console.log(`✅ Colors — Primary: ${colors.primary} Accent: ${colors.accent}`);
    }

    // Step 2 — Generate all 3 pages in parallel
    console.log("⚙️ Generating pages with Claude...");
    const [landingPage, privacyPolicy, smsTerms] = await Promise.all([
      generateLandingPage(clientData),
      generatePrivacyPolicy(clientData),
      generateSMSTerms(clientData),
    ]);

    // Step 3 — Save locally
    const slug = slugify(clientData.businessName, { lower: true, strict: true });
    const clientDir = path.join(OUTPUT_DIR, slug);
    await fs.ensureDir(clientDir);
    await fs.writeFile(path.join(clientDir, "index.html"),          landingPage);
    await fs.writeFile(path.join(clientDir, "privacy-policy.html"), privacyPolicy);
    await fs.writeFile(path.join(clientDir, "terms.html"),          smsTerms);
    console.log(`✅ Pages saved locally to /output/${slug}/`);

    // Step 4 — Auto-deploy to Vercel
    let liveUrl = null;
    if (VERCEL_TOKEN) {
      console.log("🚀 Deploying to Vercel...");
      liveUrl = await deployToVercel(slug, landingPage, privacyPolicy, smsTerms);
      console.log(`🌐 Live URL: ${liveUrl}`);
    }

    res.json({
      success: true,
      slug,
      liveUrl,
      colors: { primary: clientData.primaryColor, accent: clientData.accentColor },
      pages:  ["index.html", "privacy-policy.html", "terms.html"],
      message: `Pages generated and deployed for ${clientData.businessName}`,
    });

  } catch (err) {
    console.error("❌ Agent error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── DEPLOY TO VERCEL ─────────────────────────────────────────────────────────
async function deployToVercel(slug, indexHtml, privacyHtml, termsHtml) {
  try {
    const response = await axios.post(
      "https://api.vercel.com/v13/deployments",
      {
        name: `a2p-${slug}`,
        files: [
          { file: "index.html",          data: Buffer.from(indexHtml).toString("base64"),    encoding: "base64" },
          { file: "privacy-policy.html", data: Buffer.from(privacyHtml).toString("base64"),  encoding: "base64" },
          { file: "terms.html",          data: Buffer.from(termsHtml).toString("base64"),    encoding: "base64" },
        ],
        projectSettings: {
          framework: null,
          buildCommand: null,
          outputDirectory: null,
        },
        target: "production",
      },
      {
        headers: {
          Authorization:  `Bearer ${VERCEL_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    const url = `https://${response.data.url}`;
    console.log(`✅ Vercel deployment successful: ${url}`);
    return url;

  } catch (err) {
    console.error("❌ Vercel deploy error:", err.response?.data || err.message);
    return null;
  }
}

// ─── EXTRACT BRAND COLORS FROM WEBSITE ───────────────────────────────────────
async function extractBrandColors(websiteUrl) {
  try {
    const url = websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`;

    const response = await axios.get(url, {
      timeout: 8000,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; A2PAgent/1.0)" },
    });

    const html = response.data;

    const themeMatch = html.match(/name=["']theme-color["'][^>]*content=["'](#[0-9A-Fa-f]{6})["']/i)
      || html.match(/content=["'](#[0-9A-Fa-f]{6})["'][^>]*name=["']theme-color["']/i);

    const colorRegex = /#([0-9A-Fa-f]{6})\b/g;
    const allColors  = [];
    let match;

    while ((match = colorRegex.exec(html)) !== null) {
      allColors.push("#" + match[1]);
    }

    if (themeMatch) allColors.unshift(themeMatch[1]);

    const brandColors = allColors.filter((color) => {
      const hex = color.replace("#", "");
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const isGray  = Math.abs(r - g) < 25 && Math.abs(g - b) < 25;
      const isWhite = r > 235 && g > 235 && b > 235;
      const isBlack = r < 25  && g < 25  && b < 25;
      return !isGray && !isWhite && !isBlack;
    });

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
      accent:  sorted[1] || "#06b6d4",
    };

  } catch (err) {
    console.log(`⚠️ Could not extract colors: ${err.message}. Using defaults.`);
    return { primary: "#2563eb", accent: "#06b6d4" };
  }
}

// ─── PARSE GHL PAYLOAD ────────────────────────────────────────────────────────
function parseGHLPayload(body) {
  const contact      = body.contact || body;
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
  const prompt = `You are a world-class landing page designer and conversion rate optimization expert. You build stunning, high-converting pages that look like they cost $10,000 to design.

Generate a STUNNING, production-ready HTML landing page for this client. This page must look PREMIUM — not like a template.

CLIENT DATA:
- Business: ${client.businessName}
- Industry: ${client.industry}
- Tagline: ${client.tagline || "Generate a powerful, benefit-driven tagline"}
- Primary Color: ${client.primaryColor}
- Accent Color: ${client.accentColor}
- Logo URL: ${client.logoUrl || "none"}
- Phone: ${client.smsNumber}
- Email: ${client.email}
- Services: ${client.serviceDesc || "Professional " + client.industry + " services"}
- CTA: ${client.ctaText}
- Message Frequency: ${client.messageFrequency}
- Address: ${client.address}

DESIGN REQUIREMENTS — make it look like a $10k agency page:
1. Use Google Fonts — pick a premium font pairing (e.g. Playfair Display + Inter, or Montserrat + Open Sans)
2. Hero section: full viewport height, bold headline, subheadline, animated gradient background using brand colors, floating CTA button with hover effects
3. Trust bar below hero: show "500+ Clients Served", "5-Star Rated", "A2P Compliant", "Licensed & Insured" with icons
4. Services section: dark background, card grid with hover animations, icons, and descriptions
5. Social proof section: 2-3 fake but realistic testimonials with star ratings and client names from the industry
6. Lead capture form: centered, clean card design with shadow, rounded inputs, gradient submit button
7. Sticky navigation with blur backdrop effect
8. Smooth scroll animations using Intersection Observer API
9. Mobile-first fully responsive layout
10. Micro-interactions: button hover states, input focus effects, card lifts on hover

CONVERSION REQUIREMENTS:
- Headline must communicate the #1 benefit immediately
- Use urgency: "Limited spots available this month"
- Form headline: "Get Your Free Strategy Call" not just "Contact Us"
- Include a value proposition checklist next to or above the form
- CTA button must use contrasting color with arrow icon

A2P COMPLIANCE — ALL of these are MANDATORY in the form section:
- "By submitting this form, you authorize ${client.businessName} to send SMS messages to the mobile number provided."
- "Message frequency: ${client.messageFrequency}. Msg & data rates may apply."
- "Reply STOP to opt out. Reply HELP for help."
- "Consent is not a condition of any purchase."
- Links to privacy-policy.html and terms.html
- Compliance badges: "TCPA Compliant" | "A2P 10DLC Registered" | "Data Secure" | "SSL Protected"

FOOTER:
- Dark background matching brand colors
- Logo text, tagline, quick links, contact info
- Privacy Policy | Terms | SMS Terms links
- Copyright and "Msg & data rates may apply"

Output ONLY the complete HTML with all CSS and JS embedded — no explanation, no markdown, no code fences. Make it breathtaking.`;

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
        "x-api-key":          ANTHROPIC_API_KEY,
        "anthropic-version":  "2023-06-01",
        "content-type":       "application/json",
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
