/**
 * deploy.js — Auto-deploy generated pages to Vercel
 * Called after agent.js generates the HTML files
 * 
 * SETUP: npm install @vercel/client
 * Set env vars: VERCEL_TOKEN, VERCEL_ORG_ID
 */

const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const VERCEL_ORG_ID = process.env.VERCEL_ORG_ID; // Optional: for team accounts

/**
 * Deploy a client's generated pages to Vercel
 * Returns the live URL
 */
async function deployToVercel(slug, clientDir, clientData) {
  console.log(`📦 Deploying ${slug} to Vercel...`);

  // Read generated files
  const indexHtml    = await fs.readFile(path.join(clientDir, "index.html"), "utf8");
  const privacyHtml  = await fs.readFile(path.join(clientDir, "privacy-policy.html"), "utf8");
  const termsHtml    = await fs.readFile(path.join(clientDir, "terms.html"), "utf8");

  // Vercel deploy API — creates a new deployment
  const response = await axios.post(
    "https://api.vercel.com/v13/deployments",
    {
      name: `a2p-${slug}`,
      files: [
        { file: "index.html",          data: indexHtml },
        { file: "privacy-policy.html", data: privacyHtml },
        { file: "terms.html",          data: termsHtml },
      ],
      projectSettings: {
        framework: null, // Static HTML
        buildCommand: null,
        outputDirectory: null,
      },
      target: "production",
    },
    {
      headers: {
        Authorization: `Bearer ${VERCEL_TOKEN}`,
        "Content-Type": "application/json",
      },
      params: VERCEL_ORG_ID ? { teamId: VERCEL_ORG_ID } : {},
    }
  );

  const deploymentUrl = `https://${response.data.url}`;
  console.log(`✅ Deployed: ${deploymentUrl}`);
  return deploymentUrl;
}

/**
 * Optionally assign a custom subdomain
 * e.g., clientname.youragency.com
 */
async function assignCustomDomain(projectId, domain) {
  await axios.post(
    `https://api.vercel.com/v10/projects/${projectId}/domains`,
    { name: domain },
    { headers: { Authorization: `Bearer ${VERCEL_TOKEN}` } }
  );
  console.log(`🌐 Custom domain assigned: ${domain}`);
}

module.exports = { deployToVercel, assignCustomDomain };
