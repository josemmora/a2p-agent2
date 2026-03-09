/**
 * A2P Landing Page Agent v3.0
 * GHL Compliant — 2026 A2P Requirements
 * SETUP: npm install express axios fs-extra slugify
 */

const express = require("express");
const axios   = require("axios");
const fs      = require("fs-extra");
const path    = require("path");
const slugify  = require("slugify");

const app = express();
app.use(express.json({ limit: "10mb" }));

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

    // Extract brand colors from website
    if (clientData.website) {
      console.log(`🎨 Extracting colors from: ${clientData.website}`);
      const colors = await extractBrandColors(clientData.website);
      clientData.primaryColor = colors.primary;
      clientData.accentColor  = colors.accent;
      console.log(`✅ Colors — Primary: ${colors.primary} Accent: ${colors.accent}`);
    } else {
      console.log("⚠️ No website URL — using default colors");
    }

    // Generate all 3 pages in parallel
    console.log("⚙️ Generating pages with Claude...");
    const [landingPage, privacyPolicy, smsTerms] = await Promise.all([
      generateLandingPage(clientData),
      generatePrivacyPolicy(clientData),
      generateSMSTerms(clientData),
    ]);

    // Save locally
    const slug = slugify(clientData.businessName, { lower: true, strict: true });
    const clientDir = path.join(OUTPUT_DIR, slug);
    await fs.ensureDir(clientDir);
    await fs.writeFile(path.join(clientDir, "index.html"),          landingPage);
    await fs.writeFile(path.join(clientDir, "privacy-policy.html"), privacyPolicy);
    await fs.writeFile(path.join(clientDir, "terms.html"),          smsTerms);
    console.log(`✅ Pages saved to /output/${slug}/`);

    // Deploy to Vercel
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
      colors:  { primary: clientData.primaryColor, accent: clientData.accentColor },
      pages:   ["index.html", "privacy-policy.html", "terms.html"],
      message: `Pages generated and deployed for ${clientData.businessName}`,
    });

  } catch (err) {
    console.error("❌ Agent error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── PARSE GHL PAYLOAD ────────────────────────────────────────────────────────
function parseGHLPayload(body) {
  const contact = body.contact || body;
  const cf      = body.customFields || body.custom_fields || body.formFields || {};

  const get = (...keys) => {
    for (const key of keys) {
      const val = cf[key] || contact[key] || body[key];
      if (val && val !== "undefined" && val !== "") return val;
    }
    return "";
  };

  return {
    businessName:     get("legal_entity_name", "company_name", "companyName", "business_name") || "Your Business",
    industry:         get("business_type", "industry")                                          || "General",
    tagline:          get("do_you_have_slogans", "slogan", "tagline")                           || "",
    website:          get("business_website", "website", "company_website")                     || "",
    logoUrl:          get("company_logo", "logo_url", "logo")                                   || "",
    smsNumber:        get("business_phone_number", "business_phone", "phone")                   || contact.phone || "",
    email:            get("business_email", "email")                                             || contact.email || "",
    address:          get("business_address", "address")                                         || "",
    contactName:      (contact.firstName || contact.first_name || "") + " " + (contact.lastName || contact.last_name || ""),
    serviceDesc:      get("detailed_list_of_your_services", "services", "service_description")  || "",
    messageFrequency: "daily messages",
    ctaText:          get("cta_text", "cta")                                                     || "Get a Free Consultation",
    primaryColor:     "#1a1a2e",
    accentColor:      "#e94560",
  };
}

// ─── EXTRACT BRAND COLORS FROM WEBSITE ───────────────────────────────────────
async function extractBrandColors(websiteUrl) {
  try {
    const url = websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`;
    const response = await axios.get(url, {
      timeout: 8000,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; A2PAgent/1.0)" },
      responseType: "text",
    });

    const html = String(response.data);
    const themeMatch = html.match(/name=["']theme-color["'][^>]*content=["'](#[0-9A-Fa-f]{6})["']/i)
      || html.match(/content=["'](#[0-9A-Fa-f]{6})["'][^>]*name=["']theme-color["']/i);

    const colorRegex = /#([0-9A-Fa-f]{6})\b/g;
    const allColors  = [];
    let match;
    while ((match = colorRegex.exec(html)) !== null) allColors.push("#" + match[1]);
    if (themeMatch) allColors.unshift(themeMatch[1]);

    const brandColors = allColors.filter((color) => {
      const hex = color.replace("#", "");
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return !(Math.abs(r-g)<25 && Math.abs(g-b)<25) && !(r>235&&g>235&&b>235) && !(r<25&&g<25&&b<25);
    });

    const colorCount = {};
    brandColors.forEach((c) => { const n=c.toLowerCase(); colorCount[n]=(colorCount[n]||0)+1; });
    const sorted = Object.entries(colorCount).sort((a,b)=>b[1]-a[1]).map(([c])=>c);

    return { primary: sorted[0] || "#1a1a2e", accent: sorted[1] || "#e94560" };
  } catch (err) {
    console.log(`⚠️ Color extraction failed: ${err.message}. Using defaults.`);
    return { primary: "#1a1a2e", accent: "#e94560" };
  }
}

// ─── DEPLOY TO VERCEL ─────────────────────────────────────────────────────────
async function deployToVercel(slug, indexHtml, privacyHtml, termsHtml) {
  try {
    const projectName = `a2p-${slug}`;

    try {
      await axios.post(
        "https://api.vercel.com/v10/projects",
        { name: projectName, framework: null },
        { headers: { Authorization: `Bearer ${VERCEL_TOKEN}`, "Content-Type": "application/json" } }
      );
      console.log(`📁 Vercel project created: ${projectName}`);
    } catch (e) {
      console.log(`📁 Vercel project exists: ${projectName}`);
    }

    await axios.post(
      "https://api.vercel.com/v13/deployments",
      {
        name: projectName,
        files: [
          { file: "index.html",          data: Buffer.from(indexHtml).toString("base64"),   encoding: "base64" },
          { file: "privacy-policy.html", data: Buffer.from(privacyHtml).toString("base64"), encoding: "base64" },
          { file: "terms.html",          data: Buffer.from(termsHtml).toString("base64"),   encoding: "base64" },
        ],
        projectSettings: { framework: null, buildCommand: null, outputDirectory: null },
        target: "production",
        public: true,
      },
      { headers: { Authorization: `Bearer ${VERCEL_TOKEN}`, "Content-Type": "application/json" } }
    );

    const stableUrl = `https://${projectName}.vercel.app`;
    console.log(`✅ Deployed: ${stableUrl}`);
    return stableUrl;

  } catch (err) {
    console.error("❌ Vercel error:", err.response?.data || err.message);
    return null;
  }
}

// ─── GENERATE LANDING PAGE ────────────────────────────────────────────────────
async function generateLandingPage(client) {
  const prompt = `You are an expert web developer building A2P SMS compliance opt-in pages for the 2026 GHL A2P registration requirements.

Generate a COMPLETE, FULLY RENDERED HTML opt-in page. Use inline CSS only — no external stylesheets.

CLIENT:
- Business Name: ${client.businessName}
- Industry: ${client.industry}
- Tagline: ${client.tagline || "Professional " + client.industry + " Services"}
- Primary Color: ${client.primaryColor}
- Accent Color: ${client.accentColor}
- Phone: ${client.smsNumber}
- Email: ${client.email}
- Services: ${client.serviceDesc}
- Address: ${client.address}

PAGE STRUCTURE — build exactly this:

1. HEADER
   - White background, thin bottom border
   - Company name "${client.businessName}" on the LEFT in bold using primary color
   - Navigation links on RIGHT: "Privacy Policy" linking to privacy-policy.html | "Terms" linking to terms.html

2. HERO SECTION
   - Background: primary color ${client.primaryColor}
   - Large white headline: "${client.tagline || client.businessName}"
   - White subheadline describing their services
   - Centered, padding 80px top/bottom

3. OPT-IN FORM SECTION
   - White background, max-width 600px, centered, padding 40px
   - Heading: "Request More Information"
   - Fields (all required): First Name, Last Name, Phone Number, Email Address
   - TWO SEPARATE CONSENT CHECKBOXES (NOT pre-checked, both optional):

   CHECKBOX 1 — Marketing:
   "I consent to receive marketing text messages, about special offers, discounts, and service updates, from ${client.businessName} at the phone number provided. Message frequency may vary. Message & data rates may apply. Text HELP for assistance, reply STOP to opt out."

   CHECKBOX 2 — Non-Marketing:
   "I consent to receive non-marketing text messages from ${client.businessName} about appointment reminders, service updates, and account notifications. Message frequency may vary, message & data rates may apply. Text HELP for assistance, reply STOP to opt out."

   - Submit button using accent color ${client.accentColor} full width, text "Submit"
   - Below button small text: "Consent is not a condition of any purchase."

4. FOOTER
   - Background: primary color ${client.primaryColor}
   - White text: © ${new Date().getFullYear()} ${client.businessName}. All rights reserved.
   - Links (white, underlined): Privacy Policy | Terms & Conditions
   - Small text: "Msg & data rates may apply. Reply STOP to opt out."
   - Address: ${client.address}

STYLING RULES:
- Use system fonts: font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif
- Clean, minimal design — only 2 colors: ${client.primaryColor} and ${client.accentColor}
- Form inputs: border: 1px solid #ddd, padding: 12px, border-radius: 6px, width: 100%, box-sizing: border-box
- Checkboxes: margin-bottom: 16px, label font-size: 13px, line-height: 1.5
- Fully mobile responsive using max-width and padding
- NO animations, NO gradients, NO external fonts — keep it simple and fast loading

Output ONLY the complete HTML — no explanation, no markdown, no code fences.`;

  return callClaude(prompt);
}

// ─── GENERATE PRIVACY POLICY ──────────────────────────────────────────────────
async function generatePrivacyPolicy(client) {
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const prompt = `Generate a complete, fully rendered Privacy Policy HTML page.

CLIENT:
- Business: ${client.businessName}
- Email: ${client.email}
- Phone: ${client.smsNumber}
- Website: ${client.website || "our website"}
- Address: ${client.address}
- Primary Color: ${client.primaryColor}
- Effective Date: ${today}

PAGE STRUCTURE:
1. HEADER: "${client.businessName}" on left in bold (primary color), nav link "← Back to Home" linking to index.html
2. CONTENT: Clean white background, max-width 800px centered, all sections below

REQUIRED SECTIONS:
- Effective Date: ${today}
- Introduction
- Information We Collect
- How We Use Your Information
- SMS / Text Messaging — include this EXACT language:
  "No mobile information will be shared with third parties/affiliates for marketing/promotional purposes. Information sharing to subcontractors in support services, such as customer service, is permitted. All other use case categories exclude text messaging originator opt-in data and consent; this information will not be shared with any third parties."
- Third Party Sharing (state we do NOT sell or share data)
- CCPA Rights
- GDPR Rights  
- Data Retention
- Contact Us: ${client.email} | ${client.smsNumber} | ${client.address}

3. FOOTER: same as main page — © ${new Date().getFullYear()} ${client.businessName} | Privacy Policy | Terms

STYLING: Clean, minimal. Use ${client.primaryColor} for headings h2. System fonts. No external dependencies.

Output ONLY the complete HTML — no explanation, no markdown, no code fences.`;

  return callClaude(prompt);
}

// ─── GENERATE SMS TERMS ───────────────────────────────────────────────────────
async function generateSMSTerms(client) {
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const prompt = `Generate a complete, fully rendered SMS Terms & Conditions HTML page for A2P 10DLC 2026 compliance.

CLIENT:
- Business: ${client.businessName}
- SMS Number: ${client.smsNumber}
- Email: ${client.email}
- Address: ${client.address}
- Primary Color: ${client.primaryColor}
- Effective Date: ${today}

PAGE STRUCTURE:
1. HEADER: "${client.businessName}" on left in bold (primary color), nav link "← Back to Home" linking to index.html
2. CONTENT: Clean white background, max-width 800px centered

REQUIRED SECTIONS WITH EXACT LANGUAGE:

1. Program Description
   - Business name, what SMS messages will be sent

2. Opt-Out clause — use this EXACT text:
   "You can cancel the SMS service at any time. Just text STOP to ${client.smsNumber}. After you send the SMS message STOP to us, we will send you an SMS message to confirm that you have been unsubscribed. After this, you will no longer receive SMS messages from us. If you want to join again, just sign up as you did the first time and we will start sending SMS messages to you again. If you are experiencing issues with the messaging program you can reply with the keyword HELP for more assistance, or you can get help directly at ${client.email}."

3. Carrier Liability — use this EXACT text:
   "Carriers are not liable for delayed or undelivered messages."

4. Message Frequency — use this EXACT text:
   "As always, message and data rates may apply for any messages sent to you from us and to us from you. You will receive daily messages. If you have any questions about your text plan or data plan, it is best to contact your wireless provider."

5. Privacy Policy Link:
   "If you have any questions regarding privacy, please read our privacy policy: <a href='privacy-policy.html'>Privacy Policy</a>"

6. Non-Sharing clause:
   "No mobile information will be shared with third parties/affiliates for marketing/promotional purposes."

3. FOOTER: © ${new Date().getFullYear()} ${client.businessName} | Privacy Policy | Terms & Conditions

STYLING: Clean, minimal. Use ${client.primaryColor} for h2 headings. System fonts. No external dependencies.

Output ONLY the complete HTML — no explanation, no markdown, no code fences.`;

  return callClaude(prompt);
}

// ─── CLAUDE API CALL ──────────────────────────────────────────────────────────
async function callClaude(prompt) {
  const response = await axios.post(
    "https://api.anthropic.com/v1/messages",
    {
      model:      "claude-sonnet-4-20250514",
      max_tokens: 8000,
      messages:   [{ role: "user", content: prompt }],
    },
    {
      headers: {
        "x-api-key":         ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type":      "application/json",
      },
    }
  );
  return response.data.content[0].text;
}

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get("/health", (req, res) => res.json({ status: "ok", agent: "A2P Landing Page Agent v3.0" }));

app.listen(PORT, () => {
  console.log(`\n🚀 A2P Agent v3.0 running on port ${PORT}`);
  console.log(`📡 Webhook: http://localhost:${PORT}/webhook/ghl-onboarding`);
  console.log(`✅ Health: http://localhost:${PORT}/health\n`);
});

module.exports = app;
