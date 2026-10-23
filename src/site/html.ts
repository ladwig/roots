// Org-written HTML and CSS on public pages (header, footer, later page templates). Public pages can run under the App's
// own address (path mode), so nothing that executes may get through: an allowlist of layout tags and attributes, links
// only to http(s)/mailto/tel/relative, images only over https, no scripts, no event handlers, no forms, no iframes.
import sanitizeHtml from "sanitize-html"

const TAGS = ["a", "abbr", "b", "blockquote", "br", "caption", "code", "div", "em", "figcaption", "figure", "footer", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "i", "img", "li", "main", "mark", "nav", "ol", "p", "picture", "pre", "s", "section", "small", "source", "span", "strong", "sub", "sup", "table", "tbody", "td", "tfoot", "th", "thead", "time", "tr", "u", "ul", "article", "aside", "address", "details", "summary", "svg", "path", "circle", "rect", "g", "line", "polyline", "polygon"]

export function cleanHtml(html: string) {
  return sanitizeHtml(html, {
    allowedTags: TAGS,
    allowedAttributes: {
      "*": ["class", "id", "style", "title", "aria-label", "aria-hidden", "role", "lang", "dir"],
      a: ["href", "target", "rel"],
      img: ["src", "srcset", "alt", "width", "height", "loading"],
      source: ["srcset", "media", "type"],
      time: ["datetime"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan", "scope"],
      svg: ["viewBox", "width", "height", "fill", "stroke", "stroke-width", "xmlns"],
      path: ["d", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin"],
      circle: ["cx", "cy", "r", "fill", "stroke"],
      rect: ["x", "y", "width", "height", "rx", "fill", "stroke"],
      g: ["fill", "stroke", "transform"],
      line: ["x1", "y1", "x2", "y2", "stroke"],
      polyline: ["points", "fill", "stroke"],
      polygon: ["points", "fill", "stroke"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { img: ["https"], source: ["https"] },
    allowProtocolRelative: false,
    // Links to other sites open in a new tab without access back to ours.
    transformTags: { a: (tag, attribs) => ({ tagName: tag, attribs: attribs.target === "_blank" ? { ...attribs, rel: "noopener noreferrer" } : attribs }) },
  })
}

/** Org CSS: plain text inside <style>; nothing that can close the tag or pull in script. */
export function cleanCss(css: string) {
  return css
    .replace(/<\/?\s*style/gi, "")
    .replace(/<!--|-->/g, "")
    .replace(/[<>]/g, "")
    .replace(/expression\s*\(|javascript:|behavior\s*:|-moz-binding/gi, "")
    .slice(0, 50000)
}
