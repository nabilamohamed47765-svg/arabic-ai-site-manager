/**
 * Comprehensive SEO Intelligence Engine
 * Provides technical SEO auditing, keyword clustering, structured data generators, and ethical backlink strategy blueprints.
 */

export function auditPageSEO(htmlContent = "", url = "https://example.com") {
  const issues = [];
  const recommendations = [];
  const passed = [];
  let score = 100;

  // 1. Title Tag
  const titleMatch = htmlContent.match(/<title[^>]*>(.*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : "";
  if (!title) {
    issues.push({ severity: "CRITICAL", rule: "MISSING_TITLE", message: "وسم <title> مفقود في الصفحة." });
    score -= 25;
  } else if (title.length < 30) {
    issues.push({ severity: "MEDIUM", rule: "SHORT_TITLE", message: `عنوان الصفحة قصير جدًا (${title.length} حرفًا). الطول المثالي 30-65 حرفًا.` });
    score -= 8;
  } else if (title.length > 65) {
    issues.push({ severity: "LOW", rule: "LONG_TITLE", message: `عنوان الصفحة قد يقتطع في نتائج بحث Google (${title.length} حرفًا).` });
    score -= 4;
  } else {
    passed.push(`عنوان الصفحة <title> مثالي (${title.length} حرفًا).`);
  }

  // 2. Meta Description
  const descMatch = htmlContent.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i) ||
                    htmlContent.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i);
  const description = descMatch ? descMatch[1].trim() : "";
  if (!description) {
    issues.push({ severity: "HIGH", rule: "MISSING_META_DESC", message: "وسم <meta name='description'> مفقود." });
    score -= 15;
  } else if (description.length < 70) {
    issues.push({ severity: "MEDIUM", rule: "SHORT_META_DESC", message: `وصف الصفحة قصير (${description.length} حرفًا). الموصى به 120-160 حرفًا.` });
    score -= 5;
  } else if (description.length > 165) {
    issues.push({ severity: "LOW", rule: "LONG_META_DESC", message: `وصف الصفحة طويل وقد يتم قطعه في محركات البحث (${description.length} حرفًا).` });
    score -= 3;
  } else {
    passed.push(`وصف الصفحة meta description ممتاز ومناسب لمحركات البحث.`);
  }

  // 3. Canonical Tag
  const canonicalMatch = htmlContent.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']*)["']/i);
  if (!canonicalMatch) {
    issues.push({ severity: "HIGH", rule: "MISSING_CANONICAL", message: "وسم <link rel='canonical'> مفقود، وهو ضروري لمنع مشاكل المحتوى المكرر (Duplicate Content)." });
    score -= 10;
  } else {
    passed.push("وسم الرابط الأساسي Canonical متوفر وسليم.");
  }

  // 4. OpenGraph & Twitter Cards
  const hasOgTitle = /<meta[^>]*property=["']og:title["']/i.test(htmlContent);
  const hasOgDesc = /<meta[^>]*property=["']og:description["']/i.test(htmlContent);
  const hasOgImage = /<meta[^>]*property=["']og:image["']/i.test(htmlContent);
  const hasTwitterCard = /<meta[^>]*name=["']twitter:card["']/i.test(htmlContent);

  if (!hasOgTitle || !hasOgDesc) {
    issues.push({ severity: "MEDIUM", rule: "INCOMPLETE_OPENGRAPH", message: "بيانات OpenGraph (og:title / og:description) ناقصة للمشاركة على منصات التواصل." });
    score -= 8;
  }
  if (!hasTwitterCard) {
    recommendations.push("إضافة وسم <meta name='twitter:card' content='summary_large_image'> لتحسين ظهور الروابط على X/Twitter.");
  }

  // 5. Schema.org JSON-LD
  const hasSchema = /<script[^>]*type=["']application\/ld\+json["']/i.test(htmlContent);
  if (!hasSchema) {
    issues.push({ severity: "MEDIUM", rule: "MISSING_SCHEMA_LD", message: "البيانات المنظمة Schema.org JSON-LD مفقودة لتعزيز الظهور بالـ Rich Snippets." });
    score -= 10;
  } else {
    passed.push("بيانات Schema.org المنظمة متوفرة.");
  }

  // 6. Heading Hierarchy
  const h1Count = (htmlContent.match(/<h1[^>]*>/gi) || []).length;
  if (h1Count === 0) {
    issues.push({ severity: "HIGH", rule: "MISSING_H1", message: "لا يوجد وسم <h1> رئيسي في الصفحة." });
    score -= 12;
  } else if (h1Count > 1) {
    issues.push({ severity: "LOW", rule: "MULTIPLE_H1", message: `تكرار وسم <h1> (${h1Count} مرات) في الصفحة الواحدة قد يشتت تركيز محركات البحث.` });
    score -= 4;
  } else {
    passed.push("هيكل العناوين يبدأ بوسم <h1> واحد رئيسي.");
  }

  // 7. Image Alt Attributes
  const totalImgs = (htmlContent.match(/<img[^>]+>/gi) || []).length;
  const missingAlt = (htmlContent.match(/<img(?![^>]*\balt=)[^>]+>/gi) || []).length;
  if (missingAlt > 0) {
    issues.push({ severity: "MEDIUM", rule: "MISSING_IMG_ALT", message: `يوجد ${missingAlt} صورة بدون سمة alt الوصفية من أصل ${totalImgs}.` });
    score -= Math.min(10, missingAlt * 3);
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    title,
    description,
    hasCanonical: !!canonicalMatch,
    hasOpenGraph: hasOgTitle && hasOgDesc,
    hasSchema,
    h1Count,
    issues,
    recommendations,
    passed
  };
}

/**
 * Generates rich Schema.org JSON-LD structured data.
 */
export function generateSchemaLD({
  type = "Organization",
  name = "Company Name",
  url = "https://example.com",
  description = "",
  logo = "",
  sameAs = []
}) {
  const schema = {
    "@context": "https://schema.org",
    "@type": type,
    "name": name,
    "url": url,
    "description": description
  };

  if (logo) schema.logo = logo;
  if (sameAs && sameAs.length > 0) schema.sameAs = sameAs;

  return JSON.stringify(schema, null, 2);
}

/**
 * Ethical Backlink Strategy Generator
 */
export function generateBacklinkStrategy({ niche = "Digital Agency", targetMarket = "US/UK" }) {
  return {
    strategyName: `Ethical Authority Growth Plan for ${niche}`,
    pillars: [
      {
        title: "1. Linkable Assets Creation (الأصول القابلة للاقتباس)",
        description: "إنشاء أدوات مجانية تفاعلية، دراسات حالة موثقة بالأرقام، أو أبحاث قطاعية حصرية تشجع المدونات التقنية والمواقع الإخبارية على الإشارة إليها طبيعيًا."
      },
      {
        title: "2. Digital PR & Expert Quotes (العلاقات العامة الرقمية)",
        description: "المشاركة في منصات مثل Connectively (HARO سابقاً) و Featured.com و Qwoted لتقديم تصريحات خبراء في مقالات المواقع الكبرى والحصول على إشارات موثوقة (High DR/DA Backlinks)."
      },
      {
        title: "3. Resource Pages & Niche Hubs (صفحات الموارد المتخصصة)",
        description: "استهداف صفحات الموارد المفيدة في نفس المجال وطلب إدراج الموقع كأداة موثوقة لحل مشاكل معينة للجمهور المستهدف."
      },
      {
        title: "4. Broken Link Reclamation (استعادة الروابط المعطلة)",
        description: "اكتشاف المقالات القديمة في المجال التي تحتوي على روابط لشركات أغلقت أو خدمات انتهت، واقتراح مقالك/خدمتك كبديل محدث وعالي القيمة."
      }
    ],
    antiPatterns: [
      "ممنوع شراء روابط PBN (Private Blog Networks) أو الروابط المجمعة الرخيصة لتجنب خوارزميات Google SpamBrain.",
      "تجنب تبادل الروابط الآلي (Link Schemes) أو التعليقات المزعجة في المنتديات."
    ]
  };
}
