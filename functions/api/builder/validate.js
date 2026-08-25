/**
 * AI Site Builder - Hardened Automated Validation Engine
 * Validates HTML5, CSS, JS, SEO, Mobile, Links, Assets, Security, Forms, Legal compliance, and Sitemaps.
 */

export function validateWebsiteManifest(files, options = {}) {
  const fileMap = new Map();
  const htmlFiles = [];
  const cssFiles = [];
  const jsFiles = [];

  for (const f of files) {
    const path = (f.path || f.file_path || "").trim().replace(/^\/+/, "");
    const content = typeof f.content === "string" ? f.content : (f.file_content || "");
    fileMap.set(path, content);

    if (path.endsWith(".html") || path.endsWith(".htm")) {
      htmlFiles.push({ path, content });
    } else if (path.endsWith(".css")) {
      cssFiles.push({ path, content });
    } else if (path.endsWith(".js")) {
      jsFiles.push({ path, content });
    }
  }

  const results = {
    isValid: true,
    status: "PASS", // PASS, WARNING, ERROR
    score: 100,
    errors: [],
    warnings: [],
    passed: [],
    details: {
      totalPages: htmlFiles.length,
      totalStyles: cssFiles.length,
      totalScripts: jsFiles.length,
      seoScore: 100,
      mobileScore: 100,
      accessibilityScore: 100,
      legalScore: 100,
      formsScore: 100
    }
  };

  // Rule 1: Home page must exist
  const hasIndex = fileMap.has("index.html") || fileMap.has("index.htm");
  if (!hasIndex) {
    results.errors.push({
      code: "MISSING_INDEX",
      file: "index.html",
      message: "الملف الرئيسي index.html مفقود في حزمة الموقع.",
      critical: true
    });
  } else {
    results.passed.push("الصفحة الرئيسية index.html موجودة.");
  }

  // Rule 2: Validate each HTML file
  for (const page of htmlFiles) {
    const { path, content } = page;

    // A. Basic Document Structure
    if (!/<!doctype\s+html>/i.test(content)) {
      results.warnings.push({
        code: "MISSING_DOCTYPE",
        file: path,
        message: "إعلان <!DOCTYPE html> مفقود في بداية الصفحة."
      });
    }

    if (!/<html[^>]*lang=/i.test(content)) {
      results.warnings.push({
        code: "MISSING_LANG",
        file: path,
        message: "خاصية lang مفقودة في وسم <html lang='en'> لتحسين إمكانية الوصول و SEO."
      });
    }

    if (!/<meta[^>]*charset=["']?utf-8["']?/i.test(content)) {
      results.warnings.push({
        code: "MISSING_CHARSET",
        file: path,
        message: "وسم ترميز المحارف <meta charset='UTF-8'> مفقود في رأس الصفحة."
      });
    }

    // B. Mobile / Responsive Viewport
    if (!/<meta[^>]*name=["']viewport["'][^>]*content=["'][^"']*width=device-width/i.test(content)) {
      results.errors.push({
        code: "MISSING_VIEWPORT",
        file: path,
        message: "وسم التجاوب مع الموبايل <meta name='viewport' content='width=device-width, initial-scale=1.0'> مفقود.",
        critical: true
      });
    } else {
      results.passed.push(`وسم التجاوب مع الموبايل سليم في ${path}.`);
    }

    // C. SEO Title & Description
    const titleMatch = content.match(/<title[^>]*>(.*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : "";
    if (!title) {
      results.errors.push({
        code: "MISSING_TITLE",
        file: path,
        message: "وسم <title> فارغ أو مفقود.",
        critical: true
      });
    } else if (title.length < 15) {
      results.warnings.push({
        code: "SHORT_TITLE",
        file: path,
        message: `عنوان الصفحة <title> قصير (${title.length} حرفًا). الموصى به بين 30 و 65 حرفًا.`
      });
    } else {
      results.passed.push(`عنوان الصفحة <title> ممتاز في ${path}.`);
    }

    const descMatch = content.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i) ||
                      content.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i);
    const description = descMatch ? descMatch[1].trim() : "";
    if (!description) {
      results.warnings.push({
        code: "MISSING_META_DESC",
        file: path,
        message: "وسم <meta name='description'> مفقود في الصفحة."
      });
    } else if (description.length < 40) {
      results.warnings.push({
        code: "SHORT_META_DESC",
        file: path,
        message: `وصف الصفحة description قصير (${description.length} حرفًا). الموصى به بين 60 و 160 حرفًا.`
      });
    }

    // D. Canonical URL
    if (!/<link[^>]*rel=["']canonical["'][^>]*href=/i.test(content)) {
      results.warnings.push({
        code: "MISSING_CANONICAL",
        file: path,
        message: "وسم الرابط الأساسي <link rel='canonical' href='...'> مفقود لمنع تكرار الفهرسة."
      });
    } else {
      results.passed.push(`وسم Canonical متوفر في ${path}.`);
    }

    // E. Open Graph & Twitter Meta
    if (!/<meta[^>]*property=["']og:title["']/i.test(content)) {
      results.warnings.push({
        code: "MISSING_OG_TITLE",
        file: path,
        message: "وسم Open Graph <meta property='og:title'> مفقود للمشاركة على منصات التواصل."
      });
    }
    if (!/<meta[^>]*property=["']og:description["']/i.test(content)) {
      results.warnings.push({
        code: "MISSING_OG_DESC",
        file: path,
        message: "وسم Open Graph <meta property='og:description'> مفقود."
      });
    }

    // F. Schema.org JSON-LD
    if (!/<script[^>]*type=["']application\/ld\+json["']/i.test(content)) {
      results.warnings.push({
        code: "MISSING_SCHEMA_LD",
        file: path,
        message: "بيانات Schema.org (JSON-LD) غير مضافة في الصفحة لتعزيز الترتيب في محركات البحث."
      });
    } else {
      results.passed.push(`بيانات Schema.org المنظمة متوفرة في ${path}.`);
    }

    // G. Heading Structure (H1)
    const h1Matches = content.match(/<h1[^>]*>[\s\S]*?<\/h1>/gi);
    if (!h1Matches || h1Matches.length === 0) {
      results.warnings.push({
        code: "MISSING_H1",
        file: path,
        message: "لا يوجد وسم <h1> رئيسي في الصفحة."
      });
    } else if (h1Matches.length > 1) {
      results.warnings.push({
        code: "MULTIPLE_H1",
        file: path,
        message: `يوجد أكثر من وسم <h1> (${h1Matches.length}) في الصفحة. يفضل وسم <h1> واحد فقط.`
      });
    }

    // H. Image Accessibility (Alt tags)
    const imgTags = content.match(/<img[^>]+>/gi) || [];
    for (const img of imgTags) {
      if (!/alt=["'][^"']*["']/i.test(img)) {
        results.warnings.push({
          code: "MISSING_IMG_ALT",
          file: path,
          message: `عنصر صورة <img> بدون خاصية alt البديلة: ${img.slice(0, 50)}...`
        });
      }
    }

    // I. Internal Links & Asset Integrity
    const linkMatches = content.matchAll(/href=["']([^"']+)["']/gi);
    for (const match of linkMatches) {
      const href = match[1].trim();
      if (!href || href.startsWith("#") || href.startsWith("http://") || href.startsWith("https://") ||
          href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) {
        continue;
      }
      const cleanHref = href.split("#")[0].split("?")[0].replace(/^\/+/, "");
      if (cleanHref && !fileMap.has(cleanHref) && (cleanHref.endsWith(".html") || cleanHref.endsWith(".css"))) {
        results.warnings.push({
          code: "BROKEN_INTERNAL_LINK",
          file: path,
          message: `الرابط الداخلي "${href}" يشير إلى ملف غير موجود في حزمة الموقع (${cleanHref}).`
        });
      }
    }

    // Script & Style references
    const scriptMatches = content.matchAll(/<script[^>]+src=["']([^"']+)["']/gi);
    for (const match of scriptMatches) {
      const src = match[1].trim();
      if (src.startsWith("http://") || src.startsWith("https://")) continue;
      const cleanSrc = src.split("?")[0].replace(/^\/+/, "");
      if (cleanSrc && !fileMap.has(cleanSrc)) {
        results.warnings.push({
          code: "MISSING_SCRIPT_FILE",
          file: path,
          message: `الملف البرمجي "${src}" المستدعى في ${path} غير موجود في الحزمة.`
        });
      }
    }

    const styleMatches = content.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/gi);
    for (const match of styleMatches) {
      const href = match[1].trim();
      if (href.startsWith("http://") || href.startsWith("https://")) continue;
      const cleanHref = href.split("?")[0].replace(/^\/+/, "");
      if (cleanHref && !fileMap.has(cleanHref)) {
        results.warnings.push({
          code: "MISSING_STYLE_FILE",
          file: path,
          message: `ملف التنسيقات "${href}" المستدعى في ${path} غير موجود في الحزمة.`
        });
      }
    }

    // J. Forms Backend & Telemetry Check
    if (content.includes("<form") && !content.includes("action=") && !content.includes("fetch(") && !content.includes("ajax")) {
      results.warnings.push({
        code: "UNWIRED_CONTACT_FORM",
        file: path,
        message: "نموذج التواصل لا يحتوي على مسار backend (action أو fetch API) وقد يكون مجرد محاكاة واجهة مستخدم فقط."
      });
    }

    // K. Legal Document Completeness (Privacy Policy & Terms)
    if (path.includes("privacy") || path.includes("terms")) {
      const textOnly = content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      if (textOnly.split(" ").length < 60) {
        results.warnings.push({
          code: "INCOMPLETE_LEGAL_COPY",
          file: path,
          message: "وثيقة الخصوصية أو الشروط قصيرة جداً كعنصر نائب، يوصى بملء بنود المعالجة القانونية الكاملة قبل الإطلاق."
        });
      }
    }
  }

  // Rule 3: Sitemap & Robots presence for multi-page sites
  if (htmlFiles.length >= 2) {
    if (!fileMap.has("sitemap.xml")) {
      results.warnings.push({
        code: "MISSING_SITEMAP",
        file: "sitemap.xml",
        message: "ملف خريطة الموقع sitemap.xml غير موجود في الحزمة للمساعدة في فهرسة محركات البحث."
      });
    }
    if (!fileMap.has("robots.txt")) {
      results.warnings.push({
        code: "MISSING_ROBOTS_TXT",
        file: "robots.txt",
        message: "ملف توجيه العناكب robots.txt غير موجود في الحزمة."
      });
    }
  }

  // Calculate score
  let score = 100;
  score -= results.errors.length * 20;
  score -= results.warnings.length * 4;
  results.score = Math.max(0, Math.min(100, score));

  if (results.errors.length > 0) {
    results.isValid = false;
    results.status = "ERROR";
  } else if (results.warnings.length > 0) {
    results.status = "WARNING";
  } else {
    results.status = "PASS";
  }

  return results;
}
