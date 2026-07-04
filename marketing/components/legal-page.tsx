import type { Metadata } from "next";
import { notFound } from "next/navigation";
import TextBody from "@/components/text-body";
import { getLegalPage } from "@/lib/cms";

// Shared renderer for /privacy, /terms, and /refund-policy.

export async function legalMetadata(slug: string): Promise<Metadata> {
  const page = await getLegalPage(slug);
  if (!page) return {};
  return {
    title: page.seoTitle ?? page.title,
    description: page.seoDescription,
  };
}

export default async function LegalPageBody({ slug }: { slug: string }) {
  const page = await getLegalPage(slug);
  if (!page) notFound();
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{page.title}</h1>
      <div className="mt-8">
        <TextBody text={page.body} />
      </div>
    </div>
  );
}
