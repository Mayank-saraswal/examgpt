"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

export function ChatMarkdown({ content }: { content: string }) {
  return (
    <div className="prose prose-slate dark:prose-invert max-w-none text-sm leading-relaxed prose-p:my-2 prose-pre:bg-slate-900">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
