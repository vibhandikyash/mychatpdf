import type { Metadata } from "next";
import Sections from "@/components/sections";
import { getPage } from "@/lib/cms";

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPage("home");
  return {
    title: { absolute: page?.seoTitle ?? page?.title ?? "MyChatPDF" },
    description: page?.seoDescription,
  };
}

export default async function HomePage() {
  const page = await getPage("home");
  return <Sections sections={page?.sections ?? []} />;
}
