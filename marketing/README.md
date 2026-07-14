# MyPDFChat marketing site

Next.js (App Router) marketing website for MyPDFChat. All content is managed in Contentful and fetched through the Delivery API, with tag-based revalidation so content edits go live without a redeploy. If CMS credentials are missing, every page renders hardcoded fallback content, so the site always builds.

## Run it

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev                  # http://localhost:3000
npm run build && npm start   # production build
```

## Environment variables

Set these in `.env.local` (gitignored). `.env.example` lists the same keys with empty values.

| Variable | Purpose |
| --- | --- |
| `CONTENTFUL_SPACE_ID` | Contentful space id |
| `CONTENTFUL_DELIVERY_TOKEN` | Delivery API token (read-only, published content) |
| `CONTENTFUL_PREVIEW_TOKEN` | Preview API token (reserved for draft previews, not used yet) |
| `CONTENTFUL_ENVIRONMENT` | Contentful environment, normally `master` |
| `REVALIDATE_SECRET` | Shared secret for `POST /api/revalidate` |
| `CONTACT_WEBHOOK_URL` | Optional. If set, contact form submissions are POSTed here as JSON |
| `NEXT_PUBLIC_APP_URL` | URL of the product app for Sign in / Get started buttons. Defaults to `https://app.mychatpdf.example` |

The Contentful management (CMA) token is deliberately NOT part of the app env. It is only needed by the one-off setup scripts below; pass it inline as `CONTENTFUL_CMA_TOKEN` when running them and never commit it.

## Content model setup and seeding

Two rerunnable scripts manage the Contentful space. Both upsert by fixed ids, so running them again is safe (they update and republish).

```bash
# 1. Create/update and publish the content types
CONTENTFUL_CMA_TOKEN=<cma token> CONTENTFUL_SPACE_ID=<space id> node scripts/setup-contentful.mjs

# 2. Seed and publish placeholder content
CONTENTFUL_CMA_TOKEN=<cma token> CONTENTFUL_SPACE_ID=<space id> node scripts/seed-contentful.mjs
```

`CONTENTFUL_ENVIRONMENT` can be set for both (defaults to `master`).

Note: on newer Contentful plans, org admins get time-limited space access. If the scripts fail with `OrganizationAccessGrantRequired`, open the space in the Contentful web app first to refresh your access, then rerun.

## Content model (FR-7 checklist)

Every piece of managed content maps to a content type:

| Managed content (FR-7) | Content type | Key fields |
| --- | --- | --- |
| Landing page content | `page` (slug `home`) + `landingSection` | page: `title`, `slug`, `sections`, `seoTitle`, `seoDescription`. section: `variant` (`hero`/`features`/`steps`/`stats`/`testimonial`/`logos`/`usecases`/`faq`/`cta`), `badge`, `heading`, `subheading`, `body`, `ctaLabel`, `ctaUrl`, `secondaryCtaLabel`, `secondaryCtaUrl`, `items` (JSON), `order` |
| Service pages | `service` | `title`, `slug`, `summary`, `body`, `order`, `seoTitle`, `seoDescription` |
| Blog articles | `blogPost` | `title`, `slug`, `excerpt`, `body`, `author`, `publishDate`, `seoTitle`, `seoDescription` |
| FAQs | `faqItem` | `question`, `answer`, `order` |
| Legal pages (privacy, terms, refund) | `legalPage` | `title`, `slug`, `body`, `seoTitle`, `seoDescription` |
| Company info | `siteSettings` | `siteName`, `tagline`, `companyName` |
| Contact info | `siteSettings` | `contactEmail`, `contactPhone`, `address` |
| Navigation | `siteSettings` | `navItems` (JSON array of `{ label, href }`) |
| Footer | `siteSettings` | `footerColumns` (JSON), `footerText` |
| SEO metadata | per-entry `seoTitle`/`seoDescription`, site-wide defaults in `siteSettings` (`defaultSeoTitle`, `defaultSeoDescription`) |
| About page | `page` (slug `about`) | `title`, `slug`, `body`, SEO fields |

Long-form bodies are plain long text. Blank lines separate paragraphs and lines starting with `## ` render as headings.

## How content updates go live

All Delivery API fetches go through `lib/cms.ts` and are cached with the Next.js cache tag `cms`. Configure a Contentful webhook (on publish/unpublish) pointing at:

```
POST https://<site domain>/api/revalidate?secret=<REVALIDATE_SECRET>
```

The handler calls `revalidateTag("cms")`, so edited content appears on the next request without a redeploy. You can trigger it manually with curl to test.

## Contact form

`components/contact-form.tsx` posts to `POST /api/contact`, which validates the payload (name, email, message, email format), logs it server-side, and forwards it to `CONTACT_WEBHOOK_URL` if configured. Email provider integration is a marked upgrade path in the route handler.

## Pages

`/` (landing, CMS sections), `/services`, `/about`, `/blog`, `/blog/[slug]`, `/contact`, `/faq`, `/privacy`, `/terms`, `/refund-policy`, plus `sitemap.xml` and `robots.txt` generated from `app/sitemap.ts` and `app/robots.ts`.
