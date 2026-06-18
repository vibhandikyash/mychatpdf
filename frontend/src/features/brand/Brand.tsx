export const PRODUCT_NAME = "MyPDFChat";

interface BrandMarkProps {
  className?: string;
}

export function BrandMark({ className = "h-11 w-11" }: BrandMarkProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      role="img"
      aria-label={`${PRODUCT_NAME} logo`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="64" height="64" rx="16" fill="#17212b" />
      <path d="M20 13h19l10 10v28H20z" fill="#ffffff" />
      <path d="M39 13v11h10z" fill="#ccefed" />
      <path d="M26 31h16M26 38h20M26 45h13" stroke="#0f766e" strokeWidth="3" strokeLinecap="round" />
      <path
        d="M13 43c0-5.5 4.8-10 10.8-10h2.7c6 0 10.8 4.5 10.8 10s-4.8 10-10.8 10h-4.2l-6.5 4v-5.2C14.1 50 13 46.7 13 43z"
        fill="#0f766e"
      />
      <path d="M22 42h7M22 47h10" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

interface BrandLockupProps {
  markClassName?: string;
  textClassName?: string;
}

export function BrandLockup({ markClassName, textClassName }: BrandLockupProps) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <BrandMark className={markClassName} />
      <span className={textClassName ?? "text-xl font-semibold tracking-tight"}>{PRODUCT_NAME}</span>
    </span>
  );
}
