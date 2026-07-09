import Image from "next/image";

// Brand lockup: the logo mark plus the site name, with "PDF" highlighted in
// brand blue like the product app's wordmark (frontend Brand.tsx).
export default function Logo({ siteName, className }: { siteName: string; className?: string }) {
  const pdfIndex = siteName.indexOf("PDF");
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <Image
        src="/logo-mark.png"
        alt=""
        width={34}
        height={34}
        loading="eager"
        className="h-[34px] w-[34px]"
      />
      <span className="text-ink text-lg font-extrabold tracking-tight">
        {pdfIndex === -1 ? (
          siteName
        ) : (
          <>
            {siteName.slice(0, pdfIndex)}
            <span className="text-sea">PDF</span>
            {siteName.slice(pdfIndex + 3)}
          </>
        )}
      </span>
    </span>
  );
}
