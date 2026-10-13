import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"

// Markdown (GitHub flavour: tables, task lists, strikethrough) with the app's tokens. No raw HTML: react-markdown
// ignores HTML in the text, so stored pages can't inject markup. Works on the server and in the editor preview.
const components: Components = {
  h1: (p) => <h2 className="mt-6 mb-2 font-heading text-2xl font-semibold first:mt-0" {...p} />,
  h2: (p) => <h3 className="mt-6 mb-2 font-heading text-xl font-semibold first:mt-0" {...p} />,
  h3: (p) => <h4 className="mt-5 mb-1.5 text-lg font-semibold first:mt-0" {...p} />,
  h4: (p) => <h5 className="mt-4 mb-1 font-semibold first:mt-0" {...p} />,
  p: (p) => <p className="my-2 leading-relaxed" {...p} />,
  ul: (p) => <ul className="my-2 list-disc space-y-1 pl-6 [&:has(input)]:list-none [&:has(input)]:pl-1" {...p} />,
  ol: (p) => <ol className="my-2 list-decimal space-y-1 pl-6" {...p} />,
  a: ({ href = "", ...p }) => (
    <a href={href} className="text-primary underline underline-offset-4" {...(/^https?:/.test(href) ? { target: "_blank", rel: "noreferrer" } : {})} {...p} />
  ),
  blockquote: (p) => <blockquote className="my-3 border-l-2 pl-4 text-muted-foreground" {...p} />,
  hr: () => <hr className="my-6 border-border" />,
  code: ({ className, ...p }) => <code className={className ? `${className} block` : "rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]"} {...p} />,
  pre: (p) => <pre className="my-3 overflow-x-auto rounded-lg bg-muted p-3 font-mono text-sm" {...p} />,
  table: (p) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-sm" {...p} />
    </div>
  ),
  th: (p) => <th className="border px-2 py-1 text-left font-medium" {...p} />,
  td: (p) => <td className="border px-2 py-1 align-top" {...p} />,
  img: ({ alt, ...p }) => <img alt={alt ?? ""} className="my-3 max-w-full rounded-lg" {...p} />, // eslint-disable-line @next/next/no-img-element -- user content, any size
  input: (p) => <input {...p} disabled className="mr-2 size-4 align-middle" />,
}

export function Markdown({ children }: { children: string }) {
  return (
    <div className="min-w-0 text-sm break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  )
}
