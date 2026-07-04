import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import TextBody from "@/components/text-body";
import { getBlogPost, getBlogPosts } from "@/lib/cms";

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const posts = await getBlogPosts();
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getBlogPost(slug);
  if (!post) return {};
  return {
    title: post.seoTitle ?? post.title,
    description: post.seoDescription ?? post.excerpt,
    openGraph: {
      title: post.seoTitle ?? post.title,
      description: post.seoDescription ?? post.excerpt,
      type: "article",
      publishedTime: post.publishDate,
    },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = await getBlogPost(slug);
  if (!post) notFound();

  return (
    <article className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <p>
        <Link href="/blog" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
          &larr; All posts
        </Link>
      </p>
      <h1 className="mt-6 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{post.title}</h1>
      <p className="mt-3 text-sm text-slate-500">
        {post.publishDate &&
          new Date(post.publishDate).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        {post.author && <> &middot; {post.author}</>}
      </p>
      {post.body && (
        <div className="mt-8">
          <TextBody text={post.body} />
        </div>
      )}
    </article>
  );
}
