import type { Metadata } from "next";
import TextBody from "@/components/text-body";
import { getPage, getServices } from "@/lib/cms";

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPage("services");
  return {
    title: page?.seoTitle ?? "Services",
    description:
      page?.seoDescription ??
      "What MyChatPDF does: AI document chat, multi-document conversations, and cited answers you can verify.",
  };
}

export default async function ServicesPage() {
  const services = await getServices();
  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Services</h1>
      <p className="mt-4 max-w-2xl text-lg text-slate-600">
        Everything MyChatPDF does to turn your documents into answers.
      </p>
      <div className="mt-12 space-y-12">
        {services.map((service) => (
          <section key={service.slug} id={service.slug} className="border-t border-slate-200 pt-10">
            <h2 className="text-2xl font-semibold text-slate-900">{service.title}</h2>
            {service.summary && <p className="mt-3 text-lg text-slate-600">{service.summary}</p>}
            {service.body && (
              <div className="mt-4">
                <TextBody text={service.body} />
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
