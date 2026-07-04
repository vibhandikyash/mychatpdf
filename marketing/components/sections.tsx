import { ctaHref, type LandingSection } from "@/lib/cms";

export default function Sections({ sections }: { sections: LandingSection[] }) {
  return <>{sections.map((s, i) => <Section key={i} section={s} firstSection={i === 0} />)}</>;
}

function Section({ section, firstSection }: { section: LandingSection; firstSection: boolean }) {
  switch (section.variant) {
    case "hero":
      return <Hero section={section} firstSection={firstSection} />;
    case "features":
      return <Features section={section} />;
    case "cta":
      return <Cta section={section} />;
    case "testimonial":
      return <Testimonial section={section} />;
    default:
      return null;
  }
}

// The landing page h1 comes from the first section (normally the hero).
function Heading({ asH1, className, children }: { asH1: boolean; className: string; children: React.ReactNode }) {
  return asH1 ? <h1 className={className}>{children}</h1> : <h2 className={className}>{children}</h2>;
}

function Hero({ section, firstSection }: { section: LandingSection; firstSection: boolean }) {
  return (
    <section className="bg-gradient-to-b from-indigo-50 to-white">
      <div className="mx-auto max-w-6xl px-4 py-20 text-center sm:px-6 sm:py-28">
        <Heading
          asH1={firstSection}
          className="mx-auto max-w-3xl text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl"
        >
          {section.heading}
        </Heading>
        {section.subheading && (
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-600">{section.subheading}</p>
        )}
        {section.ctaLabel && (
          <div className="mt-10">
            <a
              href={ctaHref(section.ctaUrl)}
              className="inline-block rounded-lg bg-indigo-600 px-6 py-3 text-base font-semibold text-white hover:bg-indigo-500"
            >
              {section.ctaLabel}
            </a>
          </div>
        )}
      </div>
    </section>
  );
}

function Features({ section }: { section: LandingSection }) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
      {section.heading && (
        <h2 className="text-center text-3xl font-bold tracking-tight text-slate-900">{section.heading}</h2>
      )}
      {section.subheading && (
        <p className="mx-auto mt-4 max-w-2xl text-center text-lg text-slate-600">{section.subheading}</p>
      )}
      <div className="mt-12 grid gap-8 sm:grid-cols-2">
        {(section.items ?? []).map((item, i) => (
          <div key={i} className="rounded-2xl border border-slate-200 bg-white p-6">
            <h3 className="text-lg font-semibold text-slate-900">{item.title}</h3>
            <p className="mt-2 leading-relaxed text-slate-600">{item.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Cta({ section }: { section: LandingSection }) {
  return (
    <section className="bg-indigo-600">
      <div className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6">
        <h2 className="text-3xl font-bold tracking-tight text-white">{section.heading}</h2>
        {section.subheading && (
          <p className="mx-auto mt-4 max-w-2xl text-lg text-indigo-100">{section.subheading}</p>
        )}
        {section.ctaLabel && (
          <div className="mt-8">
            <a
              href={ctaHref(section.ctaUrl)}
              className="inline-block rounded-lg bg-white px-6 py-3 text-base font-semibold text-indigo-700 hover:bg-indigo-50"
            >
              {section.ctaLabel}
            </a>
          </div>
        )}
      </div>
    </section>
  );
}

function Testimonial({ section }: { section: LandingSection }) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      {section.heading && (
        <h2 className="text-center text-3xl font-bold tracking-tight text-slate-900">{section.heading}</h2>
      )}
      <div className="mt-10 grid gap-8 sm:grid-cols-2">
        {(section.items ?? []).map((item, i) => (
          <figure key={i} className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
            <blockquote className="leading-relaxed text-slate-700">&ldquo;{item.quote}&rdquo;</blockquote>
            <figcaption className="mt-4 text-sm font-medium text-slate-900">
              {item.author}
              {item.role && <span className="font-normal text-slate-500">, {item.role}</span>}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
