import type { Metadata } from "next";
import { notFound } from "next/navigation";
import TextBody from "@/components/text-body";
import { getPage } from "@/lib/cms";

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPage("about");
  return {
    title: page?.seoTitle ?? page?.title ?? "About",
    description: page?.seoDescription,
  };
}

export default async function AboutPage() {
  const page = await getPage("about");
  if (!page) notFound();
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{page.title}</h1>
      {page.body && (
        <div className="mt-8">
          <TextBody text={page.body} />
        </div>
      )}
    </div>
  );
}
