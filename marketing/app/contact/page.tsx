import type { Metadata } from "next";
import ContactForm from "@/components/contact-form";
import { getPage, getSiteSettings } from "@/lib/cms";

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPage("contact");
  return {
    title: page?.seoTitle ?? "Contact",
    description:
      page?.seoDescription ?? "Get in touch with the MyChatPDF team. We usually reply within one business day.",
  };
}

export default async function ContactPage() {
  const settings = await getSiteSettings();
  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Contact us</h1>
      <p className="mt-4 max-w-2xl text-lg text-slate-600">
        Questions about the product, pricing, or your account? Send us a message.
      </p>
      <div className="mt-12 grid gap-12 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <ContactForm />
        </div>
        <div className="space-y-6 lg:col-span-2">
          {settings.contactEmail && (
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Email</h2>
              <p className="mt-1">
                <a href={`mailto:${settings.contactEmail}`} className="text-slate-900 hover:text-indigo-600">
                  {settings.contactEmail}
                </a>
              </p>
            </div>
          )}
          {settings.contactPhone && (
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Phone</h2>
              <p className="mt-1 text-slate-900">{settings.contactPhone}</p>
            </div>
          )}
          {settings.address && (
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Office</h2>
              <p className="mt-1 text-slate-900">{settings.address}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
