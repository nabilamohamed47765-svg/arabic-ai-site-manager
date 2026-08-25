/**
 * Advanced Website Scanner & Project Manifest Engine
 * Discovers frameworks, architectures, dependencies, public roots, routing, SEO, and security postures.
 */

export function analyzeProjectStructure(fileList = [], configFiles = {}) {
  const normalizedFiles = fileList.map(f => {
    const raw = typeof f === "string" ? f : (f.path || f.name || f.file_path || "");
    return raw.trim().replace(/^\/+/, "");
  }).filter(Boolean);

  const fileSet = new Set(normalizedFiles);

  let framework = "Static Website";
  let language = "HTML / CSS / JS";
  let packageManager = "None";
  let buildCommand = "";
  let startCommand = "";
  let publicRoot = "/";
  let architectureType = "Static";
  const entryPoints = [];
  const pages = [];
  const assets = [];
  const dependencies = [];
  const securityWarnings = [];

  // 1. Detect Framework & Architecture
  if (fileSet.has("next.config.js") || fileSet.has("next.config.mjs") || fileSet.has("next.config.ts") || normalizedFiles.some(f => f.startsWith("pages/") || f.startsWith("app/"))) {
    framework = "Next.js";
    architectureType = "SSR / Hybrid Full-Stack";
    language = normalizedFiles.some(f => f.endsWith(".tsx") || f.endsWith(".ts")) ? "TypeScript / React" : "JavaScript / React";
    buildCommand = "npm run build";
    startCommand = "npm start";
    publicRoot = fileSet.has("public") ? "/public" : "/";
  } else if (fileSet.has("astro.config.mjs") || fileSet.has("astro.config.ts") || fileSet.has("astro.config.js")) {
    framework = "Astro";
    architectureType = "Static / Islands Architecture";
    language = "Astro / TypeScript";
    buildCommand = "npm run build";
    publicRoot = "/public";
  } else if (fileSet.has("nuxt.config.js") || fileSet.has("nuxt.config.ts")) {
    framework = "Nuxt.js";
    architectureType = "SSR / Vue Full-Stack";
    language = "Vue / TypeScript";
    buildCommand = "npm run build";
    startCommand = "npm run preview";
    publicRoot = "/public";
  } else if (fileSet.has("svelte.config.js") || fileSet.has("vite.config.js") && normalizedFiles.some(f => f.endsWith(".svelte"))) {
    framework = "Svelte / SvelteKit";
    architectureType = "SPA / SSR";
    language = "Svelte / JavaScript";
    buildCommand = "npm run build";
    publicRoot = "/static";
  } else if (fileSet.has("vite.config.js") || fileSet.has("vite.config.ts")) {
    if (normalizedFiles.some(f => f.endsWith(".vue"))) {
      framework = "Vue 3 (Vite)";
      architectureType = "SPA";
      language = "Vue / JavaScript";
    } else {
      framework = "React (Vite)";
      architectureType = "SPA";
      language = normalizedFiles.some(f => f.endsWith(".tsx") || f.endsWith(".ts")) ? "TypeScript / React" : "JavaScript / React";
    }
    buildCommand = "npm run build";
    publicRoot = "/public";
  } else if (fileSet.has("artisan") || fileSet.has("composer.json") && normalizedFiles.some(f => f.startsWith("app/Http") || f.startsWith("routes/"))) {
    framework = "Laravel";
    architectureType = "MVC Backend / Blade";
    language = "PHP";
    packageManager = "composer";
    buildCommand = "composer install --no-dev --optimize-autoloader";
    startCommand = "php artisan serve";
    publicRoot = "/public";
  } else if (fileSet.has("wp-config.php") || fileSet.has("wp-load.php") || normalizedFiles.some(f => f.startsWith("wp-content/"))) {
    framework = "WordPress";
    architectureType = "CMS / PHP";
    language = "PHP";
    publicRoot = "/";
  } else if (fileSet.has("manage.py")) {
    framework = "Django";
    architectureType = "MVC / Python";
    language = "Python";
    packageManager = "pip";
    startCommand = "python manage.py runserver";
    publicRoot = "/static";
  } else if (fileSet.has("package.json") && (fileSet.has("server.js") || fileSet.has("app.js") || fileSet.has("src/index.js") || fileSet.has("src/server.ts"))) {
    framework = "Node.js (Express/Fastify/API)";
    architectureType = "Backend API / Microservice";
    language = normalizedFiles.some(f => f.endsWith(".ts")) ? "TypeScript" : "JavaScript";
    buildCommand = "npm install";
    startCommand = "npm start";
  } else if (normalizedFiles.some(f => f.endsWith(".php"))) {
    framework = "Native PHP Application";
    architectureType = "Server-Rendered PHP";
    language = "PHP";
    publicRoot = "/";
  } else if (fileSet.has("index.html") || normalizedFiles.some(f => f.endsWith(".html"))) {
    framework = "Static HTML5 / CSS3";
    architectureType = "Client-Side Static";
    language = "HTML5 / JavaScript";
    publicRoot = "/";
  }

  // 2. Package Manager
  if (fileSet.has("pnpm-lock.yaml")) packageManager = "pnpm";
  else if (fileSet.has("yarn.lock")) packageManager = "yarn";
  else if (fileSet.has("bun.lockb") || fileSet.has("bun.lock")) packageManager = "bun";
  else if (fileSet.has("package-lock.json")) packageManager = "npm";
  else if (fileSet.has("composer.lock") || fileSet.has("composer.json")) packageManager = "composer";
  else if (fileSet.has("requirements.txt") || fileSet.has("Pipfile")) packageManager = "pip";

  // 3. Entry Points & Pages
  for (const file of normalizedFiles) {
    if (file === "index.html" || file === "index.php" || file === "app.js" || file === "server.js" || file === "src/main.jsx" || file === "src/main.tsx" || file === "src/index.js") {
      entryPoints.push(file);
    }

    if (file.endsWith(".html") || file.endsWith(".php") || file.startsWith("pages/") || file.startsWith("app/") && file.endsWith("page.tsx")) {
      pages.push(file);
    }

    if (/\.(png|jpe?g|webp|avif|svg|gif|ico|woff2?|ttf|eot|mp4|webm)$/i.test(file)) {
      assets.push(file);
    }
  }

  // 4. Inspect package.json / composer.json if provided
  if (configFiles["package.json"]) {
    try {
      const pkg = typeof configFiles["package.json"] === "string" ? JSON.parse(configFiles["package.json"]) : configFiles["package.json"];
      if (pkg.dependencies) {
        dependencies.push(...Object.keys(pkg.dependencies).map(d => `${d}@${pkg.dependencies[d]}`));
      }
      if (pkg.scripts?.build && !buildCommand) buildCommand = `npm run ${pkg.scripts.build}`;
      if (pkg.scripts?.start && !startCommand) startCommand = `npm run ${pkg.scripts.start}`;
    } catch {}
  }

  // 5. Security & Configuration Audits
  if (fileSet.has(".env") || fileSet.has(".env.production")) {
    securityWarnings.push("يوجد ملف .env في المجلد الرئيسي؛ تأكد من حظره في إعدادات خادم الويب (Nginx/Apache) لمنع تسريب المفاتيح.");
  }
  if (fileSet.has(".git") || fileSet.has(".git/config")) {
    securityWarnings.push("مجلد .git موجود مباشرة؛ تأكد من تعطيل الوصول إليه عبر HTTP لمنع استخراج الكود المصدري.");
  }

  return {
    framework,
    language,
    packageManager,
    architecture: {
      type: architectureType,
      publicRoot,
      totalFiles: normalizedFiles.length,
      totalPages: pages.length,
      totalAssets: assets.length
    },
    buildCommand,
    startCommand,
    publicRoot,
    entryPoints,
    pages,
    assets: assets.slice(0, 50),
    dependencies: dependencies.slice(0, 40),
    security: {
      score: securityWarnings.length > 0 ? 80 : 100,
      warnings: securityWarnings
    },
    seo: {
      sitemapPresent: fileSet.has("sitemap.xml") || fileSet.has("public/sitemap.xml"),
      robotsPresent: fileSet.has("robots.txt") || fileSet.has("public/robots.txt")
    },
    scannedAt: new Date().toISOString()
  };
}
