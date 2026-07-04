// Seeds placeholder content for the MyChatPDF marketing site and publishes it.
// Rerunnable: upserts every entry by fixed id. Run setup-contentful.mjs first.
//
// Usage:
//   CONTENTFUL_CMA_TOKEN=<management token> CONTENTFUL_SPACE_ID=<space id> node scripts/seed-contentful.mjs

const SPACE = process.env.CONTENTFUL_SPACE_ID;
const TOKEN = process.env.CONTENTFUL_CMA_TOKEN;
const ENV = process.env.CONTENTFUL_ENVIRONMENT || "master";
const LOCALE = "en-US";

if (!SPACE || !TOKEN) {
  console.error("Set CONTENTFUL_SPACE_ID and CONTENTFUL_CMA_TOKEN env vars.");
  process.exit(1);
}

const BASE = `https://api.contentful.com/spaces/${SPACE}/environments/${ENV}`;

async function cma(method, path, { body, version, contentType } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/vnd.contentful.management.v1+json",
      ...(version ? { "X-Contentful-Version": String(version) } : {}),
      ...(contentType ? { "X-Contentful-Content-Type": contentType } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 404) return null;
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

const loc = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { [LOCALE]: v }]));

const link = (id) => ({ sys: { type: "Link", linkType: "Entry", id } });

async function upsertEntry(contentType, id, fields) {
  const existing = await cma("GET", `/entries/${id}`);
  const saved = await cma("PUT", `/entries/${id}`, {
    body: { fields: loc(fields) },
    version: existing?.sys.version,
    contentType: existing ? undefined : contentType,
  });
  await cma("PUT", `/entries/${id}/published`, { version: saved.sys.version });
  console.log(`published ${contentType}: ${id}`);
}

// ---------------------------------------------------------------------------
// Landing sections
// ---------------------------------------------------------------------------

await upsertEntry("landingSection", "sectionHomeHero", {
  name: "Home hero",
  variant: "hero",
  heading: "Chat with your documents, get answers you can check",
  subheading:
    "MyChatPDF turns PDFs, Word files, and other documents into a conversation. Ask questions in plain language and get answers with citations that point back to the exact page.",
  ctaLabel: "Get started free",
  ctaUrl: "app:signup",
  order: 1,
});

await upsertEntry("landingSection", "sectionHomeFeatures", {
  name: "Home features",
  variant: "features",
  heading: "Built for real research, not just quick summaries",
  subheading: "Everything you need to work through long documents without reading every page.",
  items: [
    {
      title: "Chat with any document",
      description:
        "Upload PDFs, Word documents, and more. Ask questions the way you would ask a colleague and get direct answers from the text.",
    },
    {
      title: "Multi-document conversations",
      description:
        "Pull several files into one chat. Compare contracts, cross-reference reports, or study a whole reading list in a single thread.",
    },
    {
      title: "Citations on every answer",
      description:
        "Each answer links back to the source passage and page number, so you can verify claims instead of taking them on faith.",
    },
    {
      title: "Fast and private",
      description:
        "Documents are processed securely and stay in your workspace. Delete a file and it is gone from your account.",
    },
  ],
  order: 2,
});

await upsertEntry("landingSection", "sectionHomeCta", {
  name: "Home CTA",
  variant: "cta",
  heading: "Stop skimming. Start asking.",
  subheading:
    "Upload your first document and get answers in minutes. No credit card required for the free plan.",
  ctaLabel: "Try MyChatPDF free",
  ctaUrl: "app:signup",
  order: 3,
});

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

await upsertEntry("page", "pageHome", {
  title: "MyChatPDF",
  slug: "home",
  sections: [link("sectionHomeHero"), link("sectionHomeFeatures"), link("sectionHomeCta")],
  seoTitle: "MyChatPDF: Chat with PDFs and documents, with citations",
  seoDescription:
    "Ask questions about your PDFs and documents in plain language. MyChatPDF answers with citations that point to the exact page, and supports multi-document conversations.",
});

await upsertEntry("page", "pageAbout", {
  title: "About MyChatPDF",
  slug: "about",
  body: `MyChatPDF started with a simple frustration: important answers are buried in long documents, and nobody has time to read everything.

We build an AI document chat platform that lets you upload PDFs and other files, ask questions in plain language, and get answers with citations that point back to the source. You can bring several documents into one conversation, which makes it useful for contract review, research, studying, and due diligence.

We care about verifiability. A confident answer without a source is a liability, so every response links back to the passage it came from. If the documents do not contain the answer, we say so.

The team is small and product-focused. We ship improvements weekly and read every piece of feedback that comes in through the contact form.`,
  seoTitle: "About MyChatPDF",
  seoDescription:
    "MyChatPDF is an AI document chat platform. Learn why we built it and how we think about accuracy, citations, and privacy.",
});

// Thin pages that only carry SEO metadata for the listing routes.
const seoPages = [
  {
    id: "pageServices",
    title: "Services",
    slug: "services",
    seoTitle: "Services",
    seoDescription:
      "What MyChatPDF does: AI document chat, multi-document conversations, and cited answers you can verify.",
  },
  {
    id: "pageBlog",
    title: "Blog",
    slug: "blog",
    seoTitle: "Blog",
    seoDescription: "Product news and practical tips for getting more out of your documents with MyChatPDF.",
  },
  {
    id: "pageFaq",
    title: "FAQ",
    slug: "faq",
    seoTitle: "FAQ",
    seoDescription: "Frequently asked questions about MyChatPDF: supported formats, accuracy, privacy, and pricing.",
  },
  {
    id: "pageContact",
    title: "Contact",
    slug: "contact",
    seoTitle: "Contact",
    seoDescription: "Get in touch with the MyChatPDF team. We usually reply within one business day.",
  },
];
for (const p of seoPages) {
  await upsertEntry("page", p.id, {
    title: p.title,
    slug: p.slug,
    seoTitle: p.seoTitle,
    seoDescription: p.seoDescription,
  });
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

await upsertEntry("service", "serviceDocumentChat", {
  title: "AI document chat",
  slug: "ai-document-chat",
  summary:
    "Upload a PDF or Word file and ask questions in plain language. Get direct answers pulled from the text, not generic summaries.",
  body: `Upload a document and start asking. MyChatPDF reads the full text, including long reports, manuals, contracts, and papers, and answers your questions using only what the document actually says.

It handles the tedious parts of reading: finding the clause that matters, extracting figures from tables, explaining dense sections in plain terms, and summarizing chapters on request.

Works with PDFs, Word documents, and other common text formats. Scanned documents are supported when they contain a text layer.`,
  order: 1,
  seoTitle: "AI document chat for PDFs and Word files",
  seoDescription:
    "Ask questions about any PDF or document and get direct answers from the text. MyChatPDF reads the full document so you do not have to.",
});

await upsertEntry("service", "serviceMultiDoc", {
  title: "Multi-document conversations",
  slug: "multi-document-conversations",
  summary:
    "Bring several files into one chat. Compare versions, cross-reference sources, and ask questions that span your whole document set.",
  body: `Real questions rarely live in a single file. MyChatPDF lets you add multiple documents to one conversation and ask questions across all of them at once.

Compare two contract drafts and ask what changed. Load a set of research papers and ask where they agree and disagree. Drop in a year of board minutes and trace how a decision evolved.

Each answer still cites its sources per document, so you always know which file a claim came from.`,
  order: 2,
  seoTitle: "Multi-document AI conversations",
  seoDescription:
    "Chat across multiple PDFs and documents at once. Compare, cross-reference, and ask questions that span your whole document set.",
});

await upsertEntry("service", "serviceCitations", {
  title: "Cited, verifiable answers",
  slug: "cited-answers",
  summary:
    "Every answer links back to the exact passage and page it came from, so you can verify instead of trusting blindly.",
  body: `AI that cannot show its sources is a risk in any serious workflow. MyChatPDF attaches citations to every answer: the passage, the page number, and the document it came from.

Click a citation to jump straight to the source in the original file. If the documents do not contain enough information to answer, MyChatPDF tells you that instead of guessing.

This makes it practical for work where accuracy matters: legal review, compliance checks, academic research, and technical documentation.`,
  order: 3,
  seoTitle: "AI answers with citations you can verify",
  seoDescription:
    "MyChatPDF cites the exact passage and page for every answer, so legal, research, and compliance teams can verify instead of guessing.",
});

// ---------------------------------------------------------------------------
// Blog posts
// ---------------------------------------------------------------------------

await upsertEntry("blogPost", "postAccurateAnswers", {
  title: "How to get accurate answers from your PDFs",
  slug: "how-to-get-accurate-answers-from-your-pdfs",
  excerpt:
    "A few small changes to how you ask questions make a big difference in answer quality. Here is what actually works.",
  author: "MyChatPDF Team",
  publishDate: "2026-06-15",
  body: `Most people get mediocre answers from document AI because they ask vague questions. The tool is not mind-reading; it retrieves passages that match your question and reasons over them. Better questions mean better retrieval, which means better answers.

## Ask about one thing at a time

"Summarize the contract and list the risks and tell me the payment terms" forces the model to juggle three tasks. Split it up. Ask for the payment terms first, then the termination clauses, then a risk summary. Each answer will be sharper and easier to verify.

## Use the document's own vocabulary

If the contract says "Termination for Convenience", ask about that phrase rather than "how do I cancel". Retrieval works best when your words match the source text. Skim the table of contents first if you are not sure what terms the document uses.

## Check the citations

Every MyChatPDF answer includes citations. Click through on anything that matters. If a citation points at a boilerplate section rather than the substantive clause, rephrase your question with more specific language.

## Know when the document does not have the answer

A good document chat tool tells you when the answer is not in the file. If you get a hedge like that, do not push the model to speculate. Add the missing document to the conversation instead.

Small habits, big difference. Try these on your next contract review and compare the results.`,
  seoTitle: "How to get accurate answers from your PDFs",
  seoDescription:
    "Practical tips for asking better questions in AI document chat: one topic per question, source vocabulary, and always checking citations.",
});

await upsertEntry("blogPost", "postMultiDocLaunch", {
  title: "Multi-document conversations are here",
  slug: "multi-document-conversations-are-here",
  excerpt:
    "You can now bring several documents into one chat and ask questions that span all of them. Here is how it works and what it is good for.",
  author: "MyChatPDF Team",
  publishDate: "2026-06-28",
  body: `Until now, a MyChatPDF conversation was tied to a single document. That covered a lot, but the most interesting questions usually involve more than one file. Today we are launching multi-document conversations for all plans.

## What changed

You can add multiple documents to a single chat. Ask a question and MyChatPDF retrieves relevant passages from every file in the conversation, then answers with per-document citations so you always know where each claim came from.

## What people use it for

Early testers gravitated to a few patterns. Contract teams load two drafts and ask what changed between versions. Researchers load a folder of papers and ask where the literature agrees and where it conflicts. Analysts load quarterly reports and ask for trends across periods.

## Limits and plans

Free accounts can combine up to three documents per conversation. Paid plans raise the limit and add larger file sizes. Citations, deletion, and privacy behavior work exactly as they do for single documents.

Open the app, create a new chat, and click "Add documents" to try it. We would love to hear what you cross-reference first.`,
  seoTitle: "Multi-document conversations are here",
  seoDescription:
    "MyChatPDF now supports multi-document conversations: chat across several PDFs at once with per-document citations.",
});

// ---------------------------------------------------------------------------
// FAQs
// ---------------------------------------------------------------------------

const faqs = [
  {
    id: "faqWhatIs",
    question: "What is MyChatPDF?",
    answer:
      "MyChatPDF is an AI document chat platform. You upload PDFs or other documents, ask questions in plain language, and get answers drawn from the text, each one with citations pointing to the source passage and page.",
    order: 1,
  },
  {
    id: "faqFormats",
    question: "Which file formats are supported?",
    answer:
      "PDF is the primary format. Word documents (.docx) and plain text files are also supported. Scanned PDFs work when they include a text layer; pure image scans without OCR are not readable yet.",
    order: 2,
  },
  {
    id: "faqMultiDoc",
    question: "Can I chat with more than one document at a time?",
    answer:
      "Yes. Multi-document conversations let you add several files to one chat and ask questions across all of them. Answers cite each document separately so you know where every claim came from.",
    order: 3,
  },
  {
    id: "faqAccuracy",
    question: "How do I know the answers are correct?",
    answer:
      "Every answer includes citations that link back to the exact passage in your document. Click a citation to see the source in context. If the documents do not contain the answer, MyChatPDF says so instead of guessing.",
    order: 4,
  },
  {
    id: "faqPrivacy",
    question: "What happens to my documents after I upload them?",
    answer:
      "Documents are stored securely in your workspace and used only to answer your questions. They are not used to train models. When you delete a document, it is removed from your account and our processing systems.",
    order: 5,
  },
  {
    id: "faqPricing",
    question: "Is there a free plan?",
    answer:
      "Yes. The free plan lets you upload documents and chat with them within monthly limits, no credit card required. Paid plans add higher limits, larger files, and more documents per conversation. You can cancel any time.",
    order: 6,
  },
];
for (const f of faqs) {
  await upsertEntry("faqItem", f.id, { question: f.question, answer: f.answer, order: f.order });
}

// ---------------------------------------------------------------------------
// Legal pages
// ---------------------------------------------------------------------------

await upsertEntry("legalPage", "legalPrivacy", {
  title: "Privacy Policy",
  slug: "privacy",
  seoTitle: "Privacy Policy",
  seoDescription: "How MyChatPDF collects, uses, and protects your data and uploaded documents.",
  body: `Last updated: June 1, 2026

This Privacy Policy explains how MyChatPDF ("we", "us") collects, uses, and protects information when you use our website and document chat service.

## Information we collect

Account information: your name, email address, and authentication details when you create an account. Documents and chats: files you upload and the questions and answers in your conversations, stored so the service can function. Usage data: basic analytics such as pages visited and features used, collected to improve the product. Payment data: handled by our payment processor; we never store full card numbers.

## How we use your information

We use your information to provide the service, answer your questions about your documents, maintain your account, process payments, and improve the product. Your documents are used only to answer your questions. We do not use your documents to train AI models, and we do not sell your personal data.

## Data retention and deletion

Documents and conversations remain in your account until you delete them. Deleting a document removes it from your workspace and our processing systems. Deleting your account removes your personal data within 30 days, except where law requires longer retention.

## Sharing

We share data only with service providers needed to run the product (hosting, payments, email), each bound by contractual confidentiality obligations, and where required by law.

## Security

Data is encrypted in transit and at rest. Access to production systems is restricted and logged.

## Your rights

Depending on your jurisdiction, you may request access to, correction of, or deletion of your personal data. Contact us at the email address on the contact page and we will respond within 30 days.

## Changes

We will post any changes to this policy on this page and update the date above. Material changes will be announced by email.`,
});

await upsertEntry("legalPage", "legalTerms", {
  title: "Terms of Service",
  slug: "terms",
  seoTitle: "Terms of Service",
  seoDescription: "The terms that govern your use of MyChatPDF.",
  body: `Last updated: June 1, 2026

These Terms of Service govern your use of MyChatPDF. By creating an account or using the service, you agree to these terms.

## The service

MyChatPDF provides AI-assisted chat over documents you upload. Answers are generated automatically and include citations to the source text. The service is provided "as is"; while we work hard on accuracy, AI-generated answers can contain mistakes and you are responsible for verifying anything you rely on.

## Your account

You must provide accurate information and keep your credentials secure. You are responsible for activity under your account. One person per account unless your plan says otherwise.

## Your content

You keep all rights to documents you upload. You grant us a limited license to store and process them solely to provide the service to you. You must have the right to upload the documents you use, and you may not upload content that is illegal or infringes the rights of others.

## Acceptable use

Do not attempt to break, overload, or reverse engineer the service, resell it without permission, or use it to violate any law. We may suspend accounts that do.

## Billing

Paid plans bill in advance on a recurring basis. You can cancel at any time and keep access until the end of the paid period. See the Refund Policy for refund terms.

## Liability

To the maximum extent permitted by law, our total liability for any claim is limited to the amount you paid us in the twelve months before the claim arose. We are not liable for indirect or consequential damages.

## Termination

You can close your account at any time. We may terminate accounts that violate these terms, with notice where practical.

## Changes

We may update these terms. We will announce material changes by email at least 14 days before they take effect. Continued use after that constitutes acceptance.`,
});

await upsertEntry("legalPage", "legalRefund", {
  title: "Refund Policy",
  slug: "refund-policy",
  seoTitle: "Refund Policy",
  seoDescription: "When and how MyChatPDF issues refunds for paid plans.",
  body: `Last updated: June 1, 2026

We want you to be happy with MyChatPDF. This policy explains when refunds apply.

## Free plan first

The free plan exists so you can evaluate the product before paying. We encourage you to test your real documents on it before subscribing.

## Monthly plans

If MyChatPDF did not work as described, contact us within 14 days of a monthly charge and we will refund that month in full. After 14 days, charges for the current period are non-refundable, but you can cancel to stop future charges and keep access until the period ends.

## Annual plans

Annual subscriptions can be refunded in full within 30 days of the initial purchase. After 30 days, we refund the unused full months remaining on the plan, minus the discounted value of months already used.

## How to request a refund

Email us via the contact page from the address on your account, including the date of the charge. Refunds are issued to the original payment method within 5 to 10 business days of approval.

## Exceptions

We do not refund charges older than 90 days, accounts terminated for violating the Terms of Service, or amounts already refunded once. Where local consumer law grants you stronger rights, that law prevails.`,
});

// ---------------------------------------------------------------------------
// Site settings (singleton)
// ---------------------------------------------------------------------------

await upsertEntry("siteSettings", "siteSettings", {
  siteName: "MyChatPDF",
  tagline: "Chat with your documents, with citations",
  companyName: "MyChatPDF Inc.",
  contactEmail: "hello@mychatpdf.example",
  contactPhone: "+1 (555) 010-4242",
  address: "600 Congress Ave, Suite 1400, Austin, TX 78701",
  navItems: [
    { label: "Services", href: "/services" },
    { label: "Blog", href: "/blog" },
    { label: "FAQ", href: "/faq" },
    { label: "About", href: "/about" },
    { label: "Contact", href: "/contact" },
  ],
  footerColumns: [
    {
      title: "Product",
      links: [
        { label: "Services", href: "/services" },
        { label: "FAQ", href: "/faq" },
        { label: "Blog", href: "/blog" },
      ],
    },
    {
      title: "Company",
      links: [
        { label: "About", href: "/about" },
        { label: "Contact", href: "/contact" },
      ],
    },
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
    "Upload PDFs and documents, ask questions in plain language, and get answers with citations. Multi-document conversations supported.",
});

console.log("Seed done.");
