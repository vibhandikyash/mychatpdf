import type { Metadata } from "next";
import Link from "next/link";
import { getBlogPosts, getPage } from "@/lib/cms";

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPage("blog");
  return {
    title: page?.seoTitle ?? "Blog",
    description:
      page?.seoDescription ??
      "Product news and practical tips for getting more out of your documents with MyChatPDF.",
  };
}

function formatDate(date?: string) {
  if (!date) return null;
  return new Date(date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export default async function BlogPage() {
  const posts = await getBlogPosts();
  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Blog</h1>
      <p className="mt-4 max-w-2xl text-lg text-slate-600">
        Product news and practical tips for working with documents.
      </p>
      <div className="mt-12 space-y-10">
        {posts.map((post) => (
          <article key={post.slug} className="border-t border-slate-200 pt-8">
            <p className="text-sm text-slate-500">
              {formatDate(post.publishDate)}
              {post.author && <> &middot; {post.author}</>}
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">
              <Link href={`/blog/${post.slug}`} className="hover:text-indigo-600">
                {post.title}
              </Link>
            </h2>
            {post.excerpt && <p className="mt-3 leading-relaxed text-slate-600">{post.excerpt}</p>}
            <p className="mt-4">
              <Link href={`/blog/${post.slug}`} className="text-sm font-semibold text-indigo-600 hover:text-indigo-500">
                Read more &rarr;
              </Link>
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
