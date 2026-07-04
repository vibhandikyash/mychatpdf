import Link from "next/link";
import type { SiteSettings } from "@/lib/cms";

export default function Footer({ settings }: { settings: SiteSettings }) {
  return (
    <footer className="border-t border-slate-200 bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-lg font-bold text-slate-900">{settings.siteName}</p>
            {settings.tagline && <p className="mt-2 text-sm text-slate-600">{settings.tagline}</p>}
            <div className="mt-4 space-y-1 text-sm text-slate-600">
              {settings.contactEmail && (
                <p>
                  <a href={`mailto:${settings.contactEmail}`} className="hover:text-slate-900">
                    {settings.contactEmail}
                  </a>
                </p>
              )}
              {settings.contactPhone && <p>{settings.contactPhone}</p>}
              {settings.address && <p>{settings.address}</p>}
            </div>
          </div>

          {settings.footerColumns.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <p className="text-sm font-semibold text-slate-900">{col.title}</p>
              <ul className="mt-3 space-y-2">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-sm text-slate-600 hover:text-slate-900">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <p className="mt-10 border-t border-slate-200 pt-6 text-sm text-slate-500">
          &copy; {new Date().getFullYear()} {settings.footerText ?? settings.siteName}
        </p>
      </div>
    </footer>
  );
}
