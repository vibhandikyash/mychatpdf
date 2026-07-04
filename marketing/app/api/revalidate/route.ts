import { revalidateTag } from "next/cache";
import type { NextRequest } from "next/server";
import { CMS_TAG } from "@/lib/cms";

// Contentful webhook target. Configure the webhook URL as:
//   https://<site>/api/revalidate?secret=<REVALIDATE_SECRET>
// (or send the secret in an x-revalidate-secret header).
export async function POST(request: NextRequest) {
  const secret =
    request.nextUrl.searchParams.get("secret") ?? request.headers.get("x-revalidate-secret");
  if (!process.env.REVALIDATE_SECRET || secret !== process.env.REVALIDATE_SECRET) {
    return Response.json({ error: "Invalid secret." }, { status: 401 });
  }
  revalidateTag(CMS_TAG, "max");
  return Response.json({ revalidated: true, tag: CMS_TAG, now: new Date().toISOString() });
}
