import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

// --- Configuration ---
const START_URL = "https://sgroupvn.org/";
const ALLOWED_DOMAINS = [
  "sgroupvn.org",
  "clubby.sgroupvn.org",
  "audioloop.sgroupvn.org"
];
// Avoid crawling large media, zip files or irrelevant extensions
const EXCLUDED_EXTENSIONS = /\.(jpg|jpeg|png|gif|svg|pdf|zip|tar|gz|mp4|webm|mp3|wav|json)$/i;
const OUTPUT_PATH = "data/sgroup-site.json";
const MAX_CONCURRENCY = 3;

// --- State ---
const queue = [
  START_URL,
  "https://sgroupvn.org/ve-chung-toi",
  "https://sgroupvn.org/du-an",
  "https://sgroupvn.org/tin-tuc",
  "https://sgroupvn.org/tuyen-thanh-vien",
  "https://sgroupvn.org/kien-thuc"
];
const visited = new Set();
const results = [];

function isAllowedUrl(urlString) {
  try {
    const url = new URL(urlString);
    const domainMatch = ALLOWED_DOMAINS.some(d => url.hostname === d || url.hostname.endsWith(`.${d}`));
    if (!domainMatch) return false;
    if (EXCLUDED_EXTENSIONS.test(url.pathname)) return false;
    if (url.hash && url.pathname === "/") return false;
    return true;
  } catch (e) {
    return false;
  }
}

function normalizeUrl(urlString) {
  try {
    const url = new URL(urlString);
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch (e) {
    return urlString;
  }
}

async function crawl() {
  console.log("Launching headless browser...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "SGroup-Research-Crawler/2.0 (Playwright)"
  });

  console.log(`Starting Playwright deep crawl from ${START_URL}`);

  while (queue.length > 0) {
    const batch = queue.splice(0, MAX_CONCURRENCY);
    const promises = batch.map(async (url) => {
      if (visited.has(url)) return;
      visited.add(url);

      const page = await context.newPage();
      try {
        console.log(`[GET] ${url}`);
        // Navigate and wait for network to be idle to allow CSR to fetch internal static files
        await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
        
        // Wait an extra 2 seconds for any JS hydration or DOM updates
        await page.waitForTimeout(2000);

        // Run extraction logic inside the browser context
        const pageData = await page.evaluate(() => {
          // 1. Remove non-content noise from DOM
          const noiseSelectors = "nav, footer, header, script, style, noscript, iframe, svg, #__nuxt-loading";
          document.querySelectorAll(noiseSelectors).forEach(el => el.remove());

          // 2. Best effort main content
          const mainNode = document.querySelector("main") || document.querySelector("article") || document.body;
          let text = mainNode ? mainNode.innerText : document.body.innerText;
          // Clean up spacing
          text = text.replace(/\s+/g, " ").trim();

          // 3. Extract Links
          const links = Array.from(document.querySelectorAll("a[href]")).map(a => a.href);

          return {
            title: document.title || "",
            text,
            links
          };
        });

        results.push({
          url,
          title: pageData.title,
          content: pageData.text.substring(0, 10000), // Limit storage size per page
          domain: new URL(url).hostname,
          timestamp: new Date().toISOString()
        });

        // Add discovered valid links to the queue
        for (const l of pageData.links) {
          try {
             // Basic check to exclude obviously bad ones
             if(l.startsWith("mailto:") || l.startsWith("tel:")) continue;
             const norm = normalizeUrl(l);
             if (isAllowedUrl(norm) && !visited.has(norm) && !queue.includes(norm)) {
               queue.push(norm);
             }
          } catch(e) {}
        }

      } catch (err) {
        console.error(`[ERROR] Processing ${url}: ${err.message}`);
      } finally {
        await page.close();
      }
    });

    await Promise.all(promises);
    console.log(`Queue size: ${queue.length}, Visited: ${visited.size}, Extracted: ${results.length}`);
  }

  await browser.close();

  // Save results
  try {
    const outputDir = path.dirname(OUTPUT_PATH);
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(OUTPUT_PATH, JSON.stringify(results, null, 2), "utf8");
    console.log(`\nCrawl complete! Successfully saved ${results.length} pages to ${OUTPUT_PATH}`);
  } catch (err) {
    console.error(`[ERROR] Saving results: ${err.message}`);
  }
}

crawl().catch(console.error);
