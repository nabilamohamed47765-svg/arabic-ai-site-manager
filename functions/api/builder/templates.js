/**
 * AI Site Builder - Scaffolding Templates Catalog
 * Designed specifically for high-conversion US & UK Digital Services, Agencies & Businesses.
 */

export const TEMPLATES = {
  agency: {
    id: "agency",
    name: "Digital Growth & Marketing Agency (US/UK)",
    description: "Multi-page high-converting agency site for Social Media, SEO, Content, Paid Ads, and Brand Growth.",
    category: "Agency",
    pages: ["index.html", "services.html", "about.html", "contact.html"],
    files: [
      {
        path: "index.html",
        title: "Apex Growth | US & UK Digital Marketing & Brand Scaling Agency",
        description: "Scale your revenue with battle-tested Social Media Management, SEO, UGC, and Paid Ad strategies crafted for US and UK enterprise brands.",
        isHome: true
      },
      {
        path: "services.html",
        title: "Growth Services | Social Media, SEO, UGC & Paid Ads - Apex Growth",
        description: "Explore our full suite of enterprise digital growth services tailored for high-growth US & UK businesses.",
        isHome: false
      },
      {
        path: "about.html",
        title: "About Us | Data-Driven Growth Partners - Apex Growth",
        description: "Learn about our elite team of digital strategists, media buyers, and content creators based in London and New York.",
        isHome: false
      },
      {
        path: "contact.html",
        title: "Book a Free Growth Audit | Apex Growth Agency",
        description: "Schedule a 30-minute discovery call and receive a custom revenue roadmap for your brand.",
        isHome: false
      },
      {
        path: "css/style.css",
        isStyle: true
      },
      {
        path: "js/main.js",
        isScript: true
      }
    ]
  },

  landing_page: {
    id: "landing_page",
    name: "High-Converting Lead Gen / Service Landing Page",
    description: "Single-page powerhouse built for PPC, Paid Ads, and maximum conversion rates with FAQ and audit CTA.",
    category: "Landing Page",
    pages: ["index.html"],
    files: [
      {
        path: "index.html",
        title: "Accelerate Your Brand's Growth | Free Strategy Session",
        description: "Get 3x ROI on your digital marketing spend. Guaranteed client acquisition systems for US & UK brands.",
        isHome: true
      },
      {
        path: "css/style.css",
        isStyle: true
      },
      {
        path: "js/main.js",
        isScript: true
      }
    ]
  },

  saas: {
    id: "saas",
    name: "B2B SaaS / Product Platform",
    description: "Modern SaaS interface with interactive pricing tables, product feature spotlights, and ROI calculator.",
    category: "SaaS",
    pages: ["index.html", "pricing.html", "contact.html"],
    files: [
      {
        path: "index.html",
        title: "NextGen SaaS Analytics | AI-Powered Customer Intelligence",
        description: "Automate your revenue workflows and unlock deeper audience insights in minutes.",
        isHome: true
      },
      {
        path: "pricing.html",
        title: "Simple, Transparent Pricing | NextGen Platform",
        description: "Choose the right plan for your business scale. No hidden fees. Cancel anytime.",
        isHome: false
      },
      {
        path: "contact.html",
        title: "Talk to Sales & Support | NextGen Platform",
        description: "Get in touch with our enterprise solutions team.",
        isHome: false
      },
      {
        path: "css/style.css",
        isStyle: true
      },
      {
        path: "js/main.js",
        isScript: true
      }
    ]
  },

  portfolio: {
    id: "portfolio",
    name: "Creative Director / Growth Consultant Portfolio",
    description: "Minimalist, typography-forward showcase of case studies, client results, and consulting services.",
    category: "Portfolio",
    pages: ["index.html", "work.html", "contact.html"],
    files: [
      {
        path: "index.html",
        title: "Alexander Wright | Senior Growth & Brand Strategist",
        description: "Helping US & UK brands scale past 8-figures through strategic positioning and paid media leadership.",
        isHome: true
      },
      {
        path: "work.html",
        title: "Case Studies & Client Transformations | Alexander Wright",
        description: "In-depth breakdown of proven campaigns, performance metrics, and creative directions.",
        isHome: false
      },
      {
        path: "contact.html",
        title: "Inquire for Advisory & Consulting | Alexander Wright",
        description: "Reserve executive consulting slots or keynotes.",
        isHome: false
      },
      {
        path: "css/style.css",
        isStyle: true
      },
      {
        path: "js/main.js",
        isScript: true
      }
    ]
  },

  local_biz: {
    id: "local_biz",
    name: "Local Service & Professional Consultancy",
    description: "Optimized for local SEO, Google Business profiles, trust badges, hours, and immediate appointment scheduling.",
    category: "Local Business",
    pages: ["index.html", "services.html", "contact.html"],
    files: [
      {
        path: "index.html",
        title: "PrimeCare Consulting | Premier Advisory in London & NYC",
        description: "Trusted local experts dedicated to professional solutions, transparent pricing, and 5-star service.",
        isHome: true
      },
      {
        path: "services.html",
        title: "Our Professional Services | PrimeCare Consulting",
        description: "Comprehensive solutions tailored to your unique requirements.",
        isHome: false
      },
      {
        path: "contact.html",
        title: "Book an Appointment | PrimeCare Consulting",
        description: "Contact our friendly team today to schedule your consultation.",
        isHome: false
      },
      {
        path: "css/style.css",
        isStyle: true
      },
      {
        path: "js/main.js",
        isScript: true
      }
    ]
  }
};
