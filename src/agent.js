/**
 * A2P Landing Page Agent v4.0
 * Generates a full multi-page website for A2P compliance
 * Pages: Home, About, Services, Contact, Thank You, Privacy Policy, Terms
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
    console.log(`🚀 Generating website for: ${clientData.businessName}`);

    // Extract brand colors
    if (clientData.website) {
      console.log(`🎨 Extracting colors from: ${clientData.website}`);
      const colors = await extractBrandColors(clientData.website);
      clientData.primaryColor = colors.primary;
      clientData.accentColor  = colors.accent;
      console.log(`✅ Colors — Primary: ${colors.primary} Accent: ${colors.accent}`);
    }

    // Get industry images
    const images = getIndustryImages(clientData.industry, clientData.serviceDesc);
    clientData.heroImage     = images.hero;
    clientData.galleryImage1 = images.gallery[0];
    clientData.galleryImage2 = images.gallery[1];
    clientData.galleryImage3 = images.gallery[2];

    // Generate shared nav/footer snippet first
    const navFooter = buildNavFooter(clientData);
    clientData.nav    = navFooter.nav;
    clientData.footer = navFooter.footer;

    // Generate all pages in parallel
    console.log("⚙️ Generating all pages with Claude...");
    const [homePage, aboutPage, servicesPage, contactPage, thankYouPage, privacyPage, termsPage] = await Promise.all([
      generateHomePage(clientData),
      generateAboutPage(clientData),
      generateServicesPage(clientData),
      generateContactPage(clientData),
      generateThankYouPage(clientData),
      generatePrivacyPolicy(clientData),
      generateSMSTerms(clientData),
    ]);

    // Save locally
    const slug = slugify(clientData.businessName, { lower: true, strict: true });
    const clientDir = path.join(OUTPUT_DIR, slug);
    await fs.ensureDir(clientDir);
    await fs.writeFile(path.join(clientDir, "index.html"),          homePage);
    await fs.writeFile(path.join(clientDir, "about.html"),          aboutPage);
    await fs.writeFile(path.join(clientDir, "services.html"),       servicesPage);
    await fs.writeFile(path.join(clientDir, "contact.html"),        contactPage);
    await fs.writeFile(path.join(clientDir, "thank-you.html"),      thankYouPage);
    await fs.writeFile(path.join(clientDir, "privacy-policy.html"), privacyPage);
    await fs.writeFile(path.join(clientDir, "terms.html"),          termsPage);
    console.log(`✅ All pages saved to /output/${slug}/`);

    // Deploy to Vercel
    let liveUrl = null;
    if (VERCEL_TOKEN) {
      console.log("🚀 Deploying to Vercel...");
      liveUrl = await deployToVercel(slug, {
        "index.html":          homePage,
        "about.html":          aboutPage,
        "services.html":       servicesPage,
        "contact.html":        contactPage,
        "thank-you.html":      thankYouPage,
        "privacy-policy.html": privacyPage,
        "terms.html":          termsPage,
      });
      console.log(`🌐 Live URL: ${liveUrl}`);
    }

    res.json({
      success: true,
      slug,
      liveUrl,
      pages: ["index.html", "about.html", "services.html", "contact.html", "thank-you.html", "privacy-policy.html", "terms.html"],
      message: `Full website generated for ${clientData.businessName}`,
    });

  } catch (err) {
    console.error("❌ Agent error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── BUILD SHARED NAV + FOOTER ────────────────────────────────────────────────
function buildNavFooter(client) {
  const nav = `
<nav style="background:#fff;border-bottom:1px solid #e0e0e0;padding:16px 32px;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:1000;">
  <a href="index.html" style="font-weight:700;font-size:18px;color:#000;text-decoration:none;">${client.businessName}</a>
  <div style="display:flex;gap:24px;align-items:center;">
    <a href="index.html" style="color:#333;text-decoration:none;font-size:14px;">Home</a>
    <a href="about.html" style="color:#333;text-decoration:none;font-size:14px;">About</a>
    <a href="services.html" style="color:#333;text-decoration:none;font-size:14px;">Services</a>
    <a href="contact.html" style="color:#333;text-decoration:none;font-size:14px;">Contact</a>
    <a href="index.html#opt-in" style="background:#000;color:#fff;padding:10px 20px;border-radius:4px;text-decoration:none;font-size:14px;font-weight:600;">Get a Quote</a>
  </div>
</nav>`;

  const footer = `
<footer style="background:#000;color:#fff;padding:48px 32px;">
  <div style="max-width:1100px;margin:0 auto;">
    <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:32px;margin-bottom:32px;">
      <div>
        <div style="font-weight:700;font-size:18px;margin-bottom:8px;">${client.businessName}</div>
        <div style="color:#aaa;font-size:14px;line-height:1.6;">${client.address}</div>
        <div style="color:#aaa;font-size:14px;">Phone: ${client.smsNumber}</div>
        <div style="color:#aaa;font-size:14px;">Email: ${client.email}</div>
      </div>
      <div>
        <div style="font-weight:600;margin-bottom:12px;">Quick Links</div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <a href="index.html" style="color:#aaa;text-decoration:none;font-size:14px;">Home</a>
          <a href="about.html" style="color:#aaa;text-decoration:none;font-size:14px;">About Us</a>
          <a href="services.html" style="color:#aaa;text-decoration:none;font-size:14px;">Services</a>
          <a href="contact.html" style="color:#aaa;text-decoration:none;font-size:14px;">Contact</a>
        </div>
      </div>
      <div>
        <div style="font-weight:600;margin-bottom:12px;">Legal</div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <a href="privacy-policy.html" style="color:#aaa;text-decoration:none;font-size:14px;">Privacy Policy</a>
          <a href="terms.html" style="color:#aaa;text-decoration:none;font-size:14px;">Terms & Conditions</a>
        </div>
      </div>
    </div>
    <div style="border-top:1px solid #333;padding-top:24px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;">
      <div style="color:#666;font-size:12px;">© ${new Date().getFullYear()} ${client.businessName}. All rights reserved.</div>
      <div style="color:#666;font-size:12px;">Msg & data rates may apply. Reply STOP to opt out.</div>
    </div>
  </div>
</footer>`;

  return { nav, footer };
}

// ─── GENERATE HOME PAGE ───────────────────────────────────────────────────────
async function generateHomePage(client) {
  const prompt = `You are an expert web developer. Generate a complete HTML home page for a business website.

CLIENT:
- Business: ${client.businessName}
- Industry: ${client.industry}
- Tagline: ${client.tagline || "Professional " + client.industry + " Services"}
- Phone: ${client.smsNumber}
- Email: ${client.email}
- Services: ${client.serviceDesc}
- Address: ${client.address}
- Hero Image URL: ${client.heroImage}
- Gallery Image 1: ${client.galleryImage1}
- Gallery Image 2: ${client.galleryImage2}
- Gallery Image 3: ${client.galleryImage3}

INJECT THIS EXACT NAV HTML at the top of body:
${client.nav}

INJECT THIS EXACT FOOTER HTML at the bottom of body:
${client.footer}

PAGE SECTIONS — build in this order:

1. NAV — inject the nav HTML above exactly as provided

2. HERO SECTION
   - Full width, min-height 520px
   - background-image: url("${client.heroImage}") with overlay linear-gradient(rgba(0,0,0,0.65), rgba(0,0,0,0.65))
   - background-size: cover, background-position: center
   - Centered white text, padding 120px 40px
   - Small badge: "LIMITED TIME OFFER" white border uppercase
   - H1: craft an irresistible offer headline based on "${client.serviceDesc}" — specific, benefit-driven, includes a dollar amount discount or free offer
   - Subheadline: brief description of their services
   - Two buttons side by side: "Claim Your Offer →" (white bg, black text) and "Learn More" (transparent, white border, white text) linking to about.html

3. TRUST BAR
   - White background, border-bottom 1px #e0e0e0
   - 4 items: "⭐ 5-Star Rated" | "✓ Licensed & Insured" | "✓ Free Estimates" | "✓ Locally Owned"
   - Centered flex row, padding 20px, font-size 13px, font-weight 600

4. SERVICES PREVIEW
   - White background, padding 80px 32px
   - H2: "Our Services" centered black
   - 3 service cards in a row using flexbox
   - Each card: white bg, border 1px #e0e0e0, border-radius 8px, padding 32px, text center
   - Pick 3 main services from "${client.serviceDesc}"
   - Each card: bold service name, short description, "Learn More →" link to services.html
   - Hover: box-shadow 0 4px 20px rgba(0,0,0,0.1)

5. PHOTO GALLERY
   - 3 photos side by side, no gap
   - Image 1: background-image url("${client.galleryImage1}"), height 260px, background-size cover, background-position center, flex:1
   - Image 2: background-image url("${client.galleryImage2}"), height 260px, background-size cover, background-position center, flex:1
   - Image 3: background-image url("${client.galleryImage3}"), height 260px, background-size cover, background-position center, flex:1
   - Display as flex row

6. OPT-IN FORM SECTION (id="opt-in")
   - Light gray background (#f9f9f9), padding 80px 32px
   - Max-width 580px centered white card, border-radius 8px, padding 48px, box-shadow 0 2px 20px rgba(0,0,0,0.08)
   - H2: "Claim Your Free Consultation" black centered
   - Gray subtext: "Fill out the form below and we'll contact you within 24 hours."

   FIELDS IN ORDER:
   - First Name (optional, no asterisk)
   - Last Name (optional, no asterisk)
   - Phone * (required)
   - Email * (required)

   CHECKBOX 1 — Non-Marketing (FIRST, unchecked, optional):
   Based on "${client.serviceDesc}" and "${client.industry}" pick specific use case (appointment reminders, project updates, etc.)
   "I consent to receive non-marketing text messages from ${client.businessName} regarding [SPECIFIC USE CASE]. Message frequency varies, message & data rates may apply. Reply HELP for assistance, reply STOP to opt out."

   CHECKBOX 2 — Marketing (SECOND, unchecked, optional):
   "I consent to receive marketing text messages from ${client.businessName} regarding special offers, discounts, and promotional updates. Message frequency varies, message & data rates may apply. Reply HELP for assistance, reply STOP to opt out."

   - Submit button: full width black background white text "Submit" padding 16px
   - form action="thank-you.html" method="GET" so clicking submit goes to thank-you page
   - DIRECTLY BELOW submit button centered:
     <a href="privacy-policy.html">Privacy Policy</a> | <a href="terms.html">Terms and Conditions</a>

7. FOOTER — inject the footer HTML above exactly as provided

STYLING:
- Font: system fonts -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif
- Black and white design only — #000, #fff, #333, #666, #aaa, #e0e0e0, #f9f9f9
- All inputs: border 1px solid #ddd, padding 12px, border-radius 4px, width 100%, box-sizing border-box, font-size 16px
- Input focus: border-color #000, outline none
- Checkbox labels: font-size 13px, line-height 1.6, color #444, margin-bottom 16px
- Fully mobile responsive — stack on mobile using @media (max-width: 768px)
- Nav hamburger menu on mobile

Output ONLY the complete HTML — no explanation, no markdown, no code fences.`;

  return callClaude(prompt);
}

// ─── GENERATE ABOUT PAGE ──────────────────────────────────────────────────────
async function generateAboutPage(client) {
  const prompt = `Generate a complete HTML About Us page for a business website.

CLIENT:
- Business: ${client.businessName}
- Industry: ${client.industry}
- Services: ${client.serviceDesc}
- Phone: ${client.smsNumber}
- Email: ${client.email}
- Address: ${client.address}

INJECT THIS EXACT NAV at top of body:
${client.nav}

INJECT THIS EXACT FOOTER at bottom of body:
${client.footer}

PAGE SECTIONS:

1. NAV — inject exactly as provided

2. PAGE HERO
   - Black background, white text, padding 80px 32px, text center
   - H1: "About ${client.businessName}"
   - Subtext: "Learn more about who we are and what drives us"

3. OUR STORY
   - White background, max-width 900px centered, padding 80px 32px
   - H2: "Our Story" black
   - 2 columns: left text, right image (use ${client.galleryImage1} as background div, height 350px, border-radius 8px)
   - Write a compelling 3-4 paragraph story about a ${client.industry} business — mention expertise, local roots, customer commitment

4. WHY CHOOSE US
   - Gray background (#f9f9f9), padding 80px 32px
   - H2: "Why Choose Us" centered
   - 4 value cards in a 2x2 grid: "✓ Licensed & Insured", "✓ Free Estimates", "✓ Locally Owned", "✓ 5-Star Service"
   - Each card: white bg, padding 32px, border-radius 8px, bold title, short description

5. CTA SECTION
   - Black background, white text, padding 80px 32px, text center
   - H2: "Ready to Get Started?"
   - Button: white bg, black text, "Get a Free Quote →" linking to index.html#opt-in

6. FOOTER — inject exactly as provided

STYLING: Black and white only, system fonts, mobile responsive.
Output ONLY the complete HTML — no explanation, no markdown, no code fences.`;

  return callClaude(prompt);
}

// ─── GENERATE SERVICES PAGE ───────────────────────────────────────────────────
async function generateServicesPage(client) {
  const prompt = `Generate a complete HTML Services page for a business website.

CLIENT:
- Business: ${client.businessName}
- Industry: ${client.industry}
- Services: ${client.serviceDesc}
- Phone: ${client.smsNumber}
- Email: ${client.email}
- Address: ${client.address}

INJECT THIS EXACT NAV at top of body:
${client.nav}

INJECT THIS EXACT FOOTER at bottom of body:
${client.footer}

PAGE SECTIONS:

1. NAV — inject exactly as provided

2. PAGE HERO
   - Black background, white text, padding 80px 32px, text center
   - H1: "Our Services"
   - Subtext: "Professional ${client.industry} services tailored to your needs"

3. SERVICES GRID
   - White background, max-width 1100px centered, padding 80px 32px
   - Parse "${client.serviceDesc}" and create individual service cards for each service mentioned
   - Each card: border 1px #e0e0e0, border-radius 8px, padding 40px, margin-bottom 24px
   - Bold H3 service name, 2-3 sentence description of what the service includes
   - "Get a Quote →" button linking to index.html#opt-in
   - Display as 2-column grid on desktop, 1 column on mobile

4. PROCESS SECTION
   - Gray background (#f9f9f9), padding 80px 32px
   - H2: "Our Process" centered
   - 4 steps in a row: "1. Free Consultation" → "2. Custom Quote" → "3. Professional Execution" → "4. Final Walkthrough"
   - Each step: circle number, bold title, short description

5. CTA SECTION
   - Black background, white text, padding 80px 32px, text center
   - H2: "Get a Free Estimate Today"
   - Button: white bg, black text linking to index.html#opt-in

6. FOOTER — inject exactly as provided

STYLING: Black and white only, system fonts, mobile responsive.
Output ONLY the complete HTML — no explanation, no markdown, no code fences.`;

  return callClaude(prompt);
}

// ─── GENERATE CONTACT PAGE ────────────────────────────────────────────────────
async function generateContactPage(client) {
  const prompt = `Generate a complete HTML Contact Us page for a business website.

CLIENT:
- Business: ${client.businessName}
- Industry: ${client.industry}
- Phone: ${client.smsNumber}
- Email: ${client.email}
- Address: ${client.address}

INJECT THIS EXACT NAV at top of body:
${client.nav}

INJECT THIS EXACT FOOTER at bottom of body:
${client.footer}

PAGE SECTIONS:

1. NAV — inject exactly as provided

2. PAGE HERO
   - Black background, white text, padding 80px 32px, text center
   - H1: "Contact Us"
   - Subtext: "We'd love to hear from you. Reach out today."

3. CONTACT SECTION
   - White background, max-width 1000px centered, padding 80px 32px
   - Two columns side by side:

   LEFT COLUMN — Contact Info:
   - H2: "Get In Touch"
   - Phone: ${client.smsNumber}
   - Email: ${client.email}
   - Address: ${client.address}
   - Business hours: Mon-Fri 8am-6pm, Sat 9am-4pm
   - Each item with a simple icon label (📞 Phone, ✉️ Email, 📍 Address, 🕐 Hours)

   RIGHT COLUMN — Contact Form:
   - Fields: First Name, Last Name, Phone *, Email *, Message (textarea)
   - Submit button: black bg, white text, "Send Message", full width
   - form action="thank-you.html" method="GET"
   - Below button: <a href="privacy-policy.html">Privacy Policy</a> | <a href="terms.html">Terms</a>

4. FOOTER — inject exactly as provided

STYLING: Black and white only, system fonts, mobile responsive. Stack columns on mobile.
Output ONLY the complete HTML — no explanation, no markdown, no code fences.`;

  return callClaude(prompt);
}

// ─── GENERATE THANK YOU PAGE ──────────────────────────────────────────────────
async function generateThankYouPage(client) {
  const prompt = `Generate a complete HTML Thank You page shown after form submission.

CLIENT:
- Business: ${client.businessName}
- Phone: ${client.smsNumber}
- Email: ${client.email}

INJECT THIS EXACT NAV at top of body:
${client.nav}

INJECT THIS EXACT FOOTER at bottom of body:
${client.footer}

PAGE:

1. NAV — inject exactly as provided

2. THANK YOU SECTION
   - White background, full viewport height, centered content, padding 120px 32px
   - Large checkmark: ✓ in a black circle, font-size 48px, margin-bottom 24px
   - H1: "Thank You!" black
   - H2: "We've received your request" gray
   - Paragraph: "A member of the ${client.businessName} team will contact you within 24 hours. If you need immediate assistance, please call us at ${client.smsNumber} or email ${client.email}."
   - Two buttons: "Back to Home →" linking to index.html (black bg white text) | "Our Services" linking to services.html (white bg black border)
   - What to expect next section: 3 steps "1. We review your request" "2. We'll reach out within 24hrs" "3. Get your free consultation"

3. FOOTER — inject exactly as provided

STYLING: Black and white only, clean, minimal, celebratory but professional.
Output ONLY the complete HTML — no explanation, no markdown, no code fences.`;

  return callClaude(prompt);
}

// ─── GENERATE PRIVACY POLICY ──────────────────────────────────────────────────
async function generatePrivacyPolicy(client) {
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const prompt = `Generate a complete Privacy Policy HTML page.

CLIENT:
- Business: ${client.businessName}
- Email: ${client.email}
- Phone: ${client.smsNumber}
- Website: ${client.website || "our website"}
- Address: ${client.address}
- Effective Date: ${today}

INJECT THIS EXACT NAV at top of body:
${client.nav}

INJECT THIS EXACT FOOTER at bottom of body:
${client.footer}

REQUIRED SECTIONS:

1. NAV — inject exactly as provided
2. Page hero: black bg, white text, H1 "Privacy Policy", effective date

3. CONTENT (white bg, max-width 800px centered, padding 80px 32px):

Section 1: Introduction
Section 2: Information We Collect (name, email, phone, IP, cookies)
Section 3: How We Use Your Information
Section 4: SMS / Text Messaging Opt-In — use this EXACT language:
  "By providing your phone number and checking the consent box on our website, you agree to receive SMS text messages from ${client.businessName}. You may receive marketing messages about special offers and promotions, as well as non-marketing messages including appointment reminders and service updates. No mobile information will be shared with third parties/affiliates for marketing/promotional purposes. Information sharing to subcontractors in support services, such as customer service, is permitted. All other use case categories exclude text messaging originator opt-in data and consent; this information will not be shared with any third parties."
Section 5: Cookie & Tracking Practices (essential, analytics, marketing cookies, how to disable)
Section 6: Data Security and Handling (SSL encryption, secure servers, breach notification within 72hrs)
Section 7: Third Party Sharing (we do NOT sell data)
Section 8: User Rights — CCPA & GDPR (right to access, delete, opt out)
Section 9: Data Retention
Section 10: Contact Us — ${client.email} | ${client.smsNumber} | ${client.address}

4. FOOTER — inject exactly as provided

STYLING: Black and white, system fonts, h2 in black, mobile responsive.
Output ONLY the complete HTML — no explanation, no markdown, no code fences.`;

  return callClaude(prompt);
}

// ─── GENERATE SMS TERMS ───────────────────────────────────────────────────────
async function generateSMSTerms(client) {
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const prompt = `Generate a complete SMS Terms & Conditions HTML page for A2P 10DLC 2026 compliance.

CLIENT:
- Business: ${client.businessName}
- SMS Number: ${client.smsNumber}
- Email: ${client.email}
- Address: ${client.address}
- Effective Date: ${today}

INJECT THIS EXACT NAV at top of body:
${client.nav}

INJECT THIS EXACT FOOTER at bottom of body:
${client.footer}

REQUIRED SECTIONS:

1. NAV — inject exactly as provided
2. Page hero: black bg, white text, H1 "Terms & Conditions", effective date

3. CONTENT (white bg, max-width 800px centered, padding 80px 32px):

Section 1: Program Description — who we are and what messages we send
Section 2: Opt-Out — EXACT text:
  "You can cancel the SMS service at any time. Just text STOP to ${client.smsNumber}. After you send the SMS message STOP to us, we will send you an SMS message to confirm that you have been unsubscribed. After this, you will no longer receive SMS messages from us. If you want to join again, just sign up as you did the first time and we will start sending SMS messages to you again. If you are experiencing issues with the messaging program you can reply with the keyword HELP for more assistance, or you can get help directly at ${client.email}."
Section 3: Carrier Liability — EXACT text: "Carriers are not liable for delayed or undelivered messages."
Section 4: Message Frequency — EXACT text: "As always, message and data rates may apply for any messages sent to you from us and to us from you. You will receive daily messages. If you have any questions about your text plan or data plan, it is best to contact your wireless provider."
Section 5: Age Restriction — "You must be 18 years of age or older to opt in to receive SMS messages from ${client.businessName}. By submitting your phone number, you confirm that you are 18 years of age or older."
Section 6: Non-Sharing — "No mobile information will be shared with third parties/affiliates for marketing/promotional purposes. Information sharing to subcontractors in support services, such as customer service, is permitted."
Section 7: Privacy Policy Link — "If you have any questions regarding privacy, please read our privacy policy: <a href='privacy-policy.html'>Privacy Policy</a>"
Section 8: Contact Us — ${client.email} | ${client.smsNumber} | ${client.address}

4. FOOTER — inject exactly as provided

STYLING: Black and white, system fonts, h2 in black, mobile responsive.
Output ONLY the complete HTML — no explanation, no markdown, no code fences.`;

  return callClaude(prompt);
}

// ─── DEPLOY TO VERCEL ─────────────────────────────────────────────────────────
async function deployToVercel(slug, pages) {
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

    const files = Object.entries(pages).map(([filename, html]) => ({
      file: filename,
      data: Buffer.from(html).toString("base64"),
      encoding: "base64",
    }));

    await axios.post(
      "https://api.vercel.com/v13/deployments",
      {
        name: projectName,
        files,
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
    businessName:  get("legal_entity_name", "company_name", "companyName", "business_name") || "Your Business",
    industry:      get("business_type", "industry")                                          || "General Contractor",
    tagline:       get("do_you_have_slogans", "slogan", "tagline")                           || "",
    website:       get("business_website", "website", "company_website")                     || "",
    logoUrl:       get("company_logo", "logo_url", "logo")                                   || "",
    smsNumber:     get("business_phone_number", "business_phone", "phone")                   || contact.phone || "",
    email:         get("business_email", "email")                                             || contact.email || "",
    address:       get("business_address", "address")                                         || "",
    contactName:   (contact.firstName || contact.first_name || "") + " " + (contact.lastName || contact.last_name || ""),
    serviceDesc:   get("detailed_list_of_your_services", "services", "service_description")  || "",
    messageFrequency: "daily messages",
    ctaText:       get("cta_text", "cta")                                                     || "Get a Free Consultation",
    primaryColor:  "#000000",
    accentColor:   "#333333",
  };
}

// ─── EXTRACT BRAND COLORS ─────────────────────────────────────────────────────
async function extractBrandColors(websiteUrl) {
  try {
    const url = websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`;
    const response = await axios.get(url, {
      timeout: 8000,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; A2PAgent/1.0)" },
      responseType: "text",
    });
    const html = String(response.data);
    const colorRegex = /#([0-9A-Fa-f]{6})\b/g;
    const allColors = [];
    let match;
    while ((match = colorRegex.exec(html)) !== null) allColors.push("#" + match[1]);
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
    return { primary: sorted[0] || "#000000", accent: sorted[1] || "#333333" };
  } catch (err) {
    console.log(`⚠️ Color extraction failed: ${err.message}`);
    return { primary: "#000000", accent: "#333333" };
  }
}

// ─── GET INDUSTRY IMAGES ──────────────────────────────────────────────────────
function getIndustryImages(industry, services) {
  const text = (industry + " " + services).toLowerCase();

  if (text.match(/turf|sod|grass|landscape|lawn|garden|yard|tree|irrigation|paver|travertine|pergola|outdoor kitchen|backyard/)) return {
    hero: "https://images.unsplash.com/photo-1558904541-efa843a96f01?w=1600&q=80&auto=format&fit=crop",
    gallery: [
      "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=800&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?w=800&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1574923228344-3b31b36ab90b?w=800&q=80&auto=format&fit=crop",
    ]
  };

  if (text.match(/concrete|masonry|cement|foundation|slab|driveway|sidewalk|stamped/)) return {
    hero: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1600&q=80&auto=format&fit=crop",
    gallery: [
      "https://images.unsplash.com/photo-1581094271901-8022df4466f9?w=800&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=800&q=80&auto=format&fit=crop",
    ]
  };

  if (text.match(/roof|shingle|gutter|flashing/)) return {
    hero: "https://images.unsplash.com/photo-1632207691143-643e2a9a9361?w=1600&q=80&auto=format&fit=crop",
    gallery: [
      "https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=800&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1590579491624-f98f36d4c763?w=800&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=800&q=80&auto=format&fit=crop",
    ]
  };

  if (text.match(/plumb|pipe|drain|water|hvac|heat|cool|air condition/)) return {
    hero: "https://images.unsplash.com/photo-1621905251189-08b45249ff78?w=1600&q=80&auto=format&fit=crop",
    gallery: [
      "https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=800&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=800&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80&auto=format&fit=crop",
    ]
  };

  if (text.match(/paint|coat|stain|finish|color|wall/)) return {
    hero: "https://images.unsplash.com/photo-1562259949-e8e7689d7828?w=1600&q=80&auto=format&fit=crop",
    gallery: [
      "https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=800&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=800&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1581094271901-8022df4466f9?w=800&q=80&auto=format&fit=crop",
    ]
  };

  if (text.match(/electric|wire|panel|lighting|solar/)) return {
    hero: "https://images.unsplash.com/photo-1565008447742-97f6f38c985c?w=1600&q=80&auto=format&fit=crop",
    gallery: [
      "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=800&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1581094271901-8022df4466f9?w=800&q=80&auto=format&fit=crop",
    ]
  };

  if (text.match(/remodel|renovate|kitchen|bath|flooring|tile|cabinet|interior/)) return {
    hero: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1600&q=80&auto=format&fit=crop",
    gallery: [
      "https://images.unsplash.com/photo-1484101403633-562f891dc89a?w=800&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1600607687939-ce8a6d766163?w=800&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1556909172-54557c7e4fb7?w=800&q=80&auto=format&fit=crop",
    ]
  };

  if (text.match(/fence|deck|patio|pergola|wood|composite/)) return {
    hero: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1600&q=80&auto=format&fit=crop",
    gallery: [
      "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1599619585752-c3edb42a414c?w=800&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1574923228344-3b31b36ab90b?w=800&q=80&auto=format&fit=crop",
    ]
  };

  if (text.match(/clean|pressure|wash|janitorial|maid/)) return {
    hero: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=1600&q=80&auto=format&fit=crop",
    gallery: [
      "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1600607687939-ce8a6d766163?w=800&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1581094271901-8022df4466f9?w=800&q=80&auto=format&fit=crop",
    ]
  };

  return {
    hero: "https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=1600&q=80&auto=format&fit=crop",
    gallery: [
      "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=800&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=800&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1581094271901-8022df4466f9?w=800&q=80&auto=format&fit=crop",
    ]
  };
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
app.get("/health", (req, res) => res.json({ status: "ok", agent: "A2P Website Agent v4.0" }));

app.listen(PORT, () => {
  console.log(`\n🚀 A2P Website Agent v4.0 running on port ${PORT}`);
  console.log(`📡 Webhook: http://localhost:${PORT}/webhook/ghl-onboarding`);
  console.log(`✅ Health: http://localhost:${PORT}/health\n`);
});

module.exports = app;
