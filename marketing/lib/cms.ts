// All Contentful access for the marketing site goes through this module.
// Fetches use the Delivery API with Next's fetch cache tagged CMS_TAG, so
// POST /api/revalidate makes content edits live without a redeploy.
// When CMS env vars are missing (or the space has no content yet), every
// fetcher returns typed fallback content so the site builds and renders.

const SPACE = process.env.CONTENTFUL_SPACE_ID;
const TOKEN = process.env.CONTENTFUL_DELIVERY_TOKEN;
const ENVIRONMENT = process.env.CONTENTFUL_ENVIRONMENT || "master";

export const CMS_TAG = "cms";
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.mychatpdf.example";
// ponytail: constant base URL; move to an env var when the real domain exists.
export const SITE_URL = "https://www.mychatpdf.example";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NavLink = { label: string; href: string };
export type FooterColumn = { title: string; links: NavLink[] };

export type SiteSettings = {
  siteName: string;
  tagline?: string;
  companyName?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  navItems: NavLink[];
  footerColumns: FooterColumn[];
  footerText?: string;
  defaultSeoTitle?: string;
  defaultSeoDescription?: string;
};

export type SectionItem = {
  title?: string;
  description?: string;
  quote?: string;
  author?: string;
  role?: string;
};

export type LandingSection = {
  variant: "hero" | "features" | "cta" | "testimonial";
  heading?: string;
  subheading?: string;
  body?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  items?: SectionItem[];
  order?: number;
};

export type Page = {
  title: string;
  slug: string;
  body?: string;
  sections: LandingSection[];
  seoTitle?: string;
  seoDescription?: string;
};

export type Service = {
  title: string;
  slug: string;
  summary?: string;
  body?: string;
  order?: number;
  seoTitle?: string;
  seoDescription?: string;
};

export type BlogPost = {
  title: string;
  slug: string;
  excerpt?: string;
  body?: string;
  author?: string;
  publishDate?: string;
  seoTitle?: string;
  seoDescription?: string;
};

export type FaqItem = { question: string; answer: string; order?: number };

export type LegalPage = {
  title: string;
  slug: string;
  body: string;
  seoTitle?: string;
  seoDescription?: string;
};

// ---------------------------------------------------------------------------
// Delivery API client
// ---------------------------------------------------------------------------

type CdaEntry = { sys: { id: string; contentType?: { sys: { id: string } } }; fields: Record<string, unknown> };
type CdaResponse = { items: CdaEntry[]; includes?: { Entry?: CdaEntry[] } };

async function cdaFetch(params: Record<string, string>): Promise<CdaResponse | null> {
  if (!SPACE || !TOKEN) return null;
  const qs = new URLSearchParams(params).toString();
  try {
    const res = await fetch(
      `https://cdn.contentful.com/spaces/${SPACE}/environments/${ENVIRONMENT}/entries?${qs}`,
      {
        headers: { Authorization: `Bearer ${TOKEN}` },
        cache: "force-cache",
        next: { tags: [CMS_TAG] },
      }
    );
    if (!res.ok) return null;
    return (await res.json()) as CdaResponse;
  } catch {
    return null;
  }
}

// Resolves a linked-entry field ({ sys: { id } } links) against includes.
function resolveLinks(entry: CdaEntry, field: string, response: CdaResponse): CdaEntry[] {
  const links = entry.fields[field];
  if (!Array.isArray(links)) return [];
  const included = new Map(
    [...response.items, ...(response.includes?.Entry ?? [])].map((e) => [e.sys.id, e])
  );
  return links
    .map((l: { sys?: { id?: string } }) => (l?.sys?.id ? included.get(l.sys.id) : undefined))
    .filter((e): e is CdaEntry => Boolean(e));
}

const f = <T>(entry: CdaEntry) => entry.fields as T;

// ---------------------------------------------------------------------------
// Fallback content (used without CMS creds or before the space is seeded)
// ---------------------------------------------------------------------------

const FALLBACK_SETTINGS: SiteSettings = {
  siteName: "MyChatPDF",
  tagline: "Chat with your documents, with citations",
  companyName: "MyChatPDF Inc.",
  contactEmail: "hello@mychatpdf.example",
  navItems: [
    { label: "Services", href: "/services" },
    { label: "Blog", href: "/blog" },
    { label: "FAQ", href: "/faq" },
    { label: "About", href: "/about" },
    { label: "Contact", href: "/contact" },
  ],
  footerColumns: [
    {
      title: "Legal",
      links: [
        { label: "Privacy Policy", href: "/privacy" },
        { label: "Terms of Service", href: "/terms" },
        { label: "Refund Policy", href: "/refund-policy" },
      ],
    },
  ],
  footerText: "MyChatPDF Inc. All rights reserved.",
  defaultSeoTitle: "MyChatPDF: Chat with PDFs and documents",
  defaultSeoDescription:
    "Upload PDFs and documents, ask questions in plain language, and get answers with citations.",
};

const FALLBACK_PAGES: Record<string, Page> = {
  home: {
    title: "MyChatPDF",
    slug: "home",
    sections: [
      {
        variant: "hero",
        heading: "Chat with your documents, get answers you can check",
        subheading:
          "Upload PDFs and other documents, ask questions in plain language, and get answers with citations.",
        ctaLabel: "Get started free",
        ctaUrl: "app:signup",
      },
      {
        variant: "features",
        heading: "What you get",
        items: [
          { title: "Chat with any document", description: "Ask questions and get direct answers from the text." },
          { title: "Multi-document conversations", description: "Bring several files into one chat." },
          { title: "Citations on every answer", description: "Every answer links back to the source passage." },
        ],
      },
      {
        variant: "cta",
        heading: "Start chatting with your documents",
        ctaLabel: "Try MyChatPDF free",
        ctaUrl: "app:signup",
      },
    ],
  },
  about: {
    title: "About MyChatPDF",
    slug: "about",
    body: "MyChatPDF is an AI document chat platform. Upload PDFs and other documents, ask questions, and get cited answers.",
    sections: [],
  },
};

const FALLBACK_SERVICES: Service[] = [
  {
    title: "AI document chat",
    slug: "ai-document-chat",
    summary: "Upload a document and ask questions in plain language.",
    order: 1,
  },
  {
    title: "Multi-document conversations",
    slug: "multi-document-conversations",
    summary: "Chat across several documents at once.",
    order: 2,
  },
  {
    title: "Cited, verifiable answers",
    slug: "cited-answers",
    summary: "Every answer links back to the exact passage it came from.",
    order: 3,
  },
];

const FALLBACK_POSTS: BlogPost[] = [
  {
    title: "Welcome to the MyChatPDF blog",
    slug: "welcome",
    excerpt: "Product news and practical tips for working with documents.",
    body: "Content is on its way. Connect the CMS to manage blog posts.",
    author: "MyChatPDF Team",
    publishDate: "2026-01-01",
  },
];

const FALLBACK_FAQS: FaqItem[] = [
  {
    question: "What is MyChatPDF?",
    answer:
      "An AI document chat platform: upload PDFs and other documents, ask questions, and get answers with citations.",
    order: 1,
  },
  {
    question: "Is there a free plan?",
    answer: "Yes, you can chat with documents within monthly limits, no credit card required.",
    order: 2,
  },
];

const FALLBACK_LEGAL: Record<string, LegalPage> = {
  privacy: {
    title: "Privacy Policy",
    slug: "privacy",
    body: "Our privacy policy is being finalized. Contact us with any questions about how your data is handled.",
  },
  terms: {
    title: "Terms of Service",
    slug: "terms",
    body: "Our terms of service are being finalized. Contact us with any questions.",
  },
  "refund-policy": {
    title: "Refund Policy",
    slug: "refund-policy",
    body: "Our refund policy is being finalized. Contact us about any billing questions.",
  },
};

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------

export async function getSiteSettings(): Promise<SiteSettings> {
  const res = await cdaFetch({ content_type: "siteSettings", limit: "1" });
  const entry = res?.items[0];
  if (!entry) return FALLBACK_SETTINGS;
  const fields = f<Partial<SiteSettings>>(entry);
  return { ...FALLBACK_SETTINGS, ...fields };
}

export async function getPage(slug: string): Promise<Page | null> {
  const res = await cdaFetch({ content_type: "page", "fields.slug": slug, include: "2", limit: "1" });
  const entry = res?.items[0];
  if (!entry) return FALLBACK_PAGES[slug] ?? null;
  const fields = f<Omit<Page, "sections">>(entry);
  const sections = resolveLinks(entry, "sections", res!)
    .map((e) => f<LandingSection>(e))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return { ...fields, sections };
}

export async function getServices(): Promise<Service[]> {
  const res = await cdaFetch({ content_type: "service", order: "fields.order" });
  if (!res || res.items.length === 0) return FALLBACK_SERVICES;
  return res.items.map((e) => f<Service>(e));
}

export async function getBlogPosts(): Promise<BlogPost[]> {
  const res = await cdaFetch({ content_type: "blogPost", order: "-fields.publishDate" });
  if (!res || res.items.length === 0) return FALLBACK_POSTS;
  return res.items.map((e) => f<BlogPost>(e));
}

export async function getBlogPost(slug: string): Promise<BlogPost | null> {
  const res = await cdaFetch({ content_type: "blogPost", "fields.slug": slug, limit: "1" });
  const entry = res?.items[0];
  if (!entry) return FALLBACK_POSTS.find((p) => p.slug === slug) ?? null;
  return f<BlogPost>(entry);
}

export async function getFaqItems(): Promise<FaqItem[]> {
  const res = await cdaFetch({ content_type: "faqItem", order: "fields.order" });
  if (!res || res.items.length === 0) return FALLBACK_FAQS;
  return res.items.map((e) => f<FaqItem>(e));
}

export async function getLegalPage(slug: string): Promise<LegalPage | null> {
  const res = await cdaFetch({ content_type: "legalPage", "fields.slug": slug, limit: "1" });
  const entry = res?.items[0];
  if (!entry) return FALLBACK_LEGAL[slug] ?? null;
  return f<LegalPage>(entry);
}

// Resolves CMS CTA URLs: "app:signup" style values point at the product app.
export function ctaHref(url?: string): string {
  if (!url || url.startsWith("app:")) return APP_URL;
  return url;
}
