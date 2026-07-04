import Link from "next/link";
import { APP_URL, type SiteSettings } from "@/lib/cms";

export default function Header({ settings }: { settings: SiteSettings }) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="text-lg font-bold tracking-tight text-slate-900">
          {settings.siteName}
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-6 md:flex">
          {settings.navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <a href={APP_URL} className="text-sm font-medium text-slate-600 hover:text-slate-900">
            Sign in
          </a>
          <a
            href={APP_URL}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            Get started
          </a>
        </div>

        {/* ponytail: native details/summary mobile menu, no JS. Swap for a client component if animation is ever wanted. */}
        <details className="relative md:hidden">
          <summary
            className="flex cursor-pointer list-none items-center rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 [&::-webkit-details-marker]:hidden"
            aria-label="Menu"
          >
            Menu
          </summary>
          <nav
            aria-label="Mobile"
            className="absolute right-0 mt-2 flex w-56 flex-col gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-lg"
          >
            {settings.navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {item.label}
              </Link>
            ))}
            <a href={APP_URL} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Sign in
            </a>
            <a
              href={APP_URL}
              className="mt-1 rounded-lg bg-indigo-600 px-3 py-2 text-center text-sm font-semibold text-white hover:bg-indigo-500"
            >
              Get started
            </a>
          </nav>
        </details>
      </div>
    </header>
  );
}
