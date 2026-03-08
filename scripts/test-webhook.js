/**
 * test-webhook.js — Simulate a GHL webhook to test locally
 * Run: node scripts/test-webhook.js
 */

const axios = require("axios");

const WEBHOOK_URL = "http://localhost:3000/webhook/ghl-onboarding";

// This mimics the exact payload GHL sends when a form is submitted
const mockGHLPayload = {
  contact: {
    id: "contact_abc123",
    firstName: "Maria",
    lastName: "Gonzalez",
    email: "maria@sunrisedentalgroup.com",
    phone: "+15551234567",
    companyName: "Sunrise Dental Group",
  },
  // These map to your GHL custom fields
  customFields: {
    business_name:       "Sunrise Dental Group",
    industry:            "Healthcare / Dental",
    tagline:             "Smile brighter. Live better.",
    primary_color:       "#1d4ed8",
    accent_color:        "#0891b2",
    logo_url:            "",
    sms_number:          "(555) 123-4567",
    business_email:      "hello@sunrisedental.com",
    website:             "https://sunrisedental.com",
    business_address:    "1234 Main Street",
    city:                "Austin",
    state:               "TX",
    zip:                 "78701",
    message_frequency:   "up to 4 messages per month",
    service_description: "Comprehensive dental care including cleanings, whitening, implants, and orthodontics.",
    cta_text:            "Book Your Free Consultation",
  },
};

async function testWebhook() {
  console.log("🧪 Sending test GHL webhook...\n");
  console.log("Payload:", JSON.stringify(mockGHLPayload, null, 2));

  try {
    const response = await axios.post(WEBHOOK_URL, mockGHLPayload);
    console.log("\n✅ Success:", response.data);
    console.log(`\n📂 Check /output/${response.data.slug}/ for generated files`);
  } catch (err) {
    console.error("\n❌ Error:", err.response?.data || err.message);
  }
}

testWebhook();
