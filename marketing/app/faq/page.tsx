import type { Metadata } from "next";
import { getFaqItems, getPage } from "@/lib/cms";

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPage("faq");
  return {
    title: page?.seoTitle ?? "FAQ",
    description:
      page?.seoDescription ??
      "Frequently asked questions about MyChatPDF: supported formats, accuracy, privacy, and pricing.",
  };
}

export default async function FaqPage() {
  const faqs = await getFaqItems();
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
        Frequently asked questions
      </h1>
      <div className="mt-10 divide-y divide-slate-200">
        {faqs.map((faq) => (
          <details key={faq.question} className="group py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between text-lg font-medium text-slate-900 [&::-webkit-details-marker]:hidden">
              {faq.question}
              <span aria-hidden className="ml-4 text-slate-400 transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="mt-3 leading-relaxed text-slate-600">{faq.answer}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
