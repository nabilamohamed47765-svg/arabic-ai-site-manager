/**
 * AI Site Builder - Hardened Auto Fix Engine
 * Performs deterministic, safe, automated repairs on website files to resolve validation warnings & errors.
 */

import { validateWebsiteManifest } from "./validate.js";

export function autoFixWebsiteManifest(files, options = {}) {
  const maxCycles = 3;
  let currentFiles = files.map((f) => ({
    path: (f.path || f.file_path || "").trim().replace(/^\/+/, ""),
    content: typeof f.content === "string" ? f.content : (f.file_content || "")
  }));

  const repairLogs = [];

  for (let cycle = 1; cycle <= maxCycles; cycle++) {
    const validation = validateWebsiteManifest(currentFiles);
    if (validation.isValid && validation.warnings.length === 0) {
      break;
    }

    let modifiedInCycle = false;
    const fileMap = new Map();
    currentFiles.forEach((f) => fileMap.set(f.path, f.content));

    // 1. Auto-create missing referenced css/style.css
    if (!fileMap.has("css/style.css") && currentFiles.some((f) => f.content.includes("css/style.css"))) {
      currentFiles.push({
        path: "css/style.css",
        content: `/* Modern Responsive Styling */
:root {
  --primary: #2563eb;
  --primary-hover: #1d4ed8;
  --dark: #0f172a;
  --light: #f8fafc;
  --text: #334155;
  --text-muted: #64748b;
  --border: #e2e8f0;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: var(--text); background: var(--light); line-height: 1.6; }
.container { width: 100%; max-width: 1200px; margin: 0 auto; padding: 0 1.5rem; }
header { background: #fff; border-bottom: 1px solid var(--border); padding: 1rem 0; position: sticky; top: 0; z-index: 50; }
nav { display: flex; justify-content: space-between; align-items: center; }
.nav-links { display: flex; gap: 1.5rem; list-style: none; }
.nav-links a { text-decoration: none; color: var(--dark); font-weight: 500; transition: color 0.2s; }
.nav-links a:hover { color: var(--primary); }
.hero { padding: 5rem 0; text-align: center; background: linear-gradient(180deg, #fff 0%, var(--light) 100%); }
.hero h1 { font-size: 2.75rem; color: var(--dark); margin-bottom: 1rem; line-height: 1.2; }
.hero p { font-size: 1.25rem; color: var(--text-muted); max-width: 700px; margin: 0 auto 2rem; }
.btn { display: inline-block; padding: 0.75rem 1.75rem; background: var(--primary); color: #fff; text-decoration: none; border-radius: 0.5rem; font-weight: 600; transition: background 0.2s; border: none; cursor: pointer; }
.btn:hover { background: var(--primary-hover); }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 2rem; margin: 3rem 0; }
.card { background: #fff; border: 1px solid var(--border); border-radius: 0.75rem; padding: 2rem; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
footer { background: var(--dark); color: #94a3b8; padding: 3rem 0; text-align: center; margin-top: 5rem; }
@media (max-width: 768px) {
  .hero h1 { font-size: 2rem; }
  .nav-links { gap: 1rem; font-size: 0.9rem; }
}`
      });
      repairLogs.push("تم إنشاء ملف css/style.css القياسي تلقائيًا.");
      modifiedInCycle = true;
    }

    // 2. Auto-create missing referenced js/main.js
    if (!fileMap.has("js/main.js") && currentFiles.some((f) => f.content.includes("js/main.js"))) {
      currentFiles.push({
        path: "js/main.js",
        content: `// Interactive features & Mobile navigation
document.addEventListener('DOMContentLoaded', () => {
  console.log('Site initialized successfully.');
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });
});`
      });
      repairLogs.push("تم إنشاء ملف js/main.js القياسي تلقائيًا.");
      modifiedInCycle = true;
    }

    // 3. Auto-generate sitemap.xml if missing and multiple pages exist
    const htmlPageList = currentFiles.filter(f => f.path.endsWith(".html"));
    if (htmlPageList.length >= 2 && !fileMap.has("sitemap.xml")) {
      const urls = htmlPageList.map(p => `  <url>\n    <loc>https://example.com/${p.path === "index.html" ? "" : p.path}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>${p.path === "index.html" ? "1.0" : "0.8"}</priority>\n  </url>`).join("\n");
      const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
      currentFiles.push({ path: "sitemap.xml", content: sitemapXml });
      repairLogs.push("تم إنشاء ملف sitemap.xml القياسي تلقائيًا.");
      modifiedInCycle = true;
    }

    // 4. Auto-generate robots.txt if missing and multiple pages exist
    if (htmlPageList.length >= 2 && !fileMap.has("robots.txt")) {
      const robotsTxt = `User-agent: *\nAllow: /\n\nSitemap: https://example.com/sitemap.xml`;
      currentFiles.push({ path: "robots.txt", content: robotsTxt });
      repairLogs.push("تم إنشاء ملف robots.txt القياسي تلقائيًا.");
      modifiedInCycle = true;
    }

    // Process each HTML file
    currentFiles = currentFiles.map((file) => {
      if (!file.path.endsWith(".html") && !file.path.endsWith(".htm")) {
        return file;
      }

      let content = file.content;
      let fileModified = false;

      // DOCTYPE
      if (!/<!doctype\s+html>/i.test(content)) {
        content = "<!DOCTYPE html>\n" + content;
        repairLogs.push(`إضافة <!DOCTYPE html> في ${file.path}`);
        fileModified = true;
      }

      // HTML Lang
      if (!/<html[^>]*lang=/i.test(content)) {
        content = content.replace(/<html/i, '<html lang="en"');
        repairLogs.push(`إضافة خاصية lang="en" في ${file.path}`);
        fileModified = true;
      }

      // Ensure <head> tag exists
      if (!/<head>/i.test(content) && content.includes("<html")) {
        content = content.replace(/<html[^>]*>/i, "$&\n<head>\n</head>");
        fileModified = true;
      }

      // Viewport Meta
      if (!/<meta[^>]*name=["']viewport["']/i.test(content)) {
        content = content.replace(/<head[^>]*>/i, '$&\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">');
        repairLogs.push(`إصلاح وسم التجاوب <meta name="viewport"> في ${file.path}`);
        fileModified = true;
      }

      // Charset Meta
      if (!/<meta[^>]*charset=/i.test(content)) {
        content = content.replace(/<head[^>]*>/i, '$&\n  <meta charset="UTF-8">');
        repairLogs.push(`إصلاح وسم الترميز <meta charset="UTF-8"> في ${file.path}`);
        fileModified = true;
      }

      // Canonical URL Link
      if (!/<link[^>]*rel=["']canonical["']/i.test(content) && content.includes("</head>")) {
        const canonicalUrl = `https://example.com/${file.path === "index.html" ? "" : file.path}`;
        content = content.replace(/<\/head>/i, `  <link rel="canonical" href="${canonicalUrl}">\n</head>`);
        repairLogs.push(`إضافة وسم <link rel="canonical"> في ${file.path}`);
        fileModified = true;
      }

      // OpenGraph Metadata
      const titleMatch = content.match(/<title[^>]*>(.*?)<\/title>/i);
      const pageTitle = titleMatch ? titleMatch[1].trim() : "Apex Digital Website";

      if (!/<meta[^>]*property=["']og:title["']/i.test(content) && content.includes("</head>")) {
        content = content.replace(/<\/head>/i, `  <meta property="og:title" content="${pageTitle.replace(/"/g, '&quot;')}">\n  <meta property="og:type" content="website">\n</head>`);
        repairLogs.push(`إضافة وسوم OpenGraph في ${file.path}`);
        fileModified = true;
      }

      // Schema.org JSON-LD
      if (!/<script[^>]*type=["']application\/ld\+json["']/i.test(content) && content.includes("</head>")) {
        const schemaBlock = `
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": "${pageTitle.replace(/"/g, '\\"')}",
    "url": "https://example.com/${file.path === 'index.html' ? '' : file.path}"
  }
  </script>`;
        content = content.replace(/<\/head>/i, `${schemaBlock}\n</head>`);
        repairLogs.push(`حقن بيانات Schema.org المنظمة في ${file.path}`);
        fileModified = true;
      }

      // Fix unpopulated alt attributes in images
      if (/<img(?![^>]*\balt=)[^>]*>/i.test(content)) {
        content = content.replace(/<img(?![^>]*\balt=)([^>]*)>/gi, '<img$1 alt="Website Visual Asset">');
        repairLogs.push(`إصلاح وسوم الصور بإضافة خاصية alt في ${file.path}`);
        fileModified = true;
      }

      if (fileModified) {
        modifiedInCycle = true;
      }

      return { path: file.path, content };
    });

    if (!modifiedInCycle) {
      break;
    }
  }

  const finalValidation = validateWebsiteManifest(currentFiles);

  return {
    fixedFiles: currentFiles,
    repairLogs,
    finalValidation
  };
}
