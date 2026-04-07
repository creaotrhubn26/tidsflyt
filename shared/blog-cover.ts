const SITE_URL = "https://tidum.no";

const BLOG_COVER_PALETTES = [
  {
    background: "linear-gradient(135deg, #16343d 0%, #1e5f68 52%, #5fb8a9 100%)",
    accent: "#d8f0ea",
    card: "rgba(255,255,255,0.10)",
    cardBorder: "rgba(255,255,255,0.22)",
    text: "#f7fffd",
    muted: "rgba(247,255,253,0.78)",
  },
  {
    background: "linear-gradient(135deg, #3d2416 0%, #8a4f26 48%, #d8a25a 100%)",
    accent: "#fff0d3",
    card: "rgba(255,248,240,0.12)",
    cardBorder: "rgba(255,240,220,0.24)",
    text: "#fffaf4",
    muted: "rgba(255,250,244,0.78)",
  },
  {
    background: "linear-gradient(135deg, #23193d 0%, #5f3ea8 50%, #9fb5ff 100%)",
    accent: "#ebe7ff",
    card: "rgba(255,255,255,0.11)",
    cardBorder: "rgba(255,255,255,0.22)",
    text: "#faf8ff",
    muted: "rgba(250,248,255,0.78)",
  },
  {
    background: "linear-gradient(135deg, #10352f 0%, #1e7461 50%, #91d2ae 100%)",
    accent: "#ddfff2",
    card: "rgba(255,255,255,0.11)",
    cardBorder: "rgba(255,255,255,0.24)",
    text: "#f6fffb",
    muted: "rgba(246,255,251,0.78)",
  },
  {
    background: "linear-gradient(135deg, #2f2348 0%, #6f4ab0 48%, #ff9eb8 100%)",
    accent: "#ffe8ef",
    card: "rgba(255,255,255,0.11)",
    cardBorder: "rgba(255,255,255,0.24)",
    text: "#fff9fb",
    muted: "rgba(255,249,251,0.78)",
  },
  {
    background: "linear-gradient(135deg, #15273a 0%, #2b5f8d 50%, #8cd0f2 100%)",
    accent: "#e4f8ff",
    card: "rgba(255,255,255,0.11)",
    cardBorder: "rgba(255,255,255,0.24)",
    text: "#f5fcff",
    muted: "rgba(245,252,255,0.78)",
  },
];

const LEGACY_SHARED_BLOG_IMAGES = new Set([
  "/screenshots/blog/tidum-time-tracking-fresh-desktop.png",
  "/screenshots/blog/tidum-time-tracking-fresh-mobile.png",
  "/screenshots/blog/tidum-time-tracking-fresh-mobile-viewport.png",
  "/blog/stock-clock.png",
  "/blog/stock-excel.png",
  "/blog/stock-caregiver.png",
]);

function escapeSvg(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function wrapText(value: string, limit: number, maxLines: number) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= limit || !current) {
      current = next;
      continue;
    }
    lines.push(current);
    current = word;
    if (lines.length === maxLines - 1) {
      break;
    }
  }

  if (current && lines.length < maxLines) {
    lines.push(current);
  }

  if (words.join(" ").length > lines.join(" ").length && lines.length > 0) {
    const lastIndex = lines.length - 1;
    lines[lastIndex] = `${lines[lastIndex].replace(/[.,;:!?-]*$/, "")}...`;
  }

  return lines.slice(0, maxLines);
}

function humanizeSlug(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function getBlogCoverPath(slug: string) {
  return `/api/blog/cover/${encodeURIComponent(slug)}.svg`;
}

export function getBlogCoverOgUrl(slug: string) {
  return `${SITE_URL}${getBlogCoverPath(slug)}`;
}

export function isLegacySharedBlogImage(value?: string | null) {
  return Boolean(value && LEGACY_SHARED_BLOG_IMAGES.has(value));
}

export function shouldUseGeneratedBlogCover(value?: string | null) {
  if (!value) {
    return true;
  }
  if (isLegacySharedBlogImage(value)) {
    return true;
  }
  return value.startsWith("/api/blog/cover/");
}

export function renderBlogCoverSvg({
  slug,
  title,
  categoryLabel,
  excerpt,
}: {
  slug: string;
  title: string;
  categoryLabel?: string | null;
  excerpt?: string | null;
}) {
  const palette = BLOG_COVER_PALETTES[hashString(slug) % BLOG_COVER_PALETTES.length];
  const titleLines = wrapText(title || humanizeSlug(slug), 20, 3);
  const excerptLines = wrapText(excerpt || "", 34, 2);
  const label = (categoryLabel || "Tidum Blogg").toUpperCase();
  const hash = hashString(`${slug}:${title}`);
  const arcA = 120 + (hash % 160);
  const arcB = 240 + (hash % 200);
  const arcC = 880 - (hash % 180);
  const dotX = 820 + (hash % 220);
  const dotY = 130 + (hash % 140);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="630" viewBox="0 0 1200 630" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc">
  <title id="title">${escapeSvg(title || humanizeSlug(slug))}</title>
  <desc id="desc">${escapeSvg(excerpt || categoryLabel || "Tidum bloggcover")}</desc>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1200" y2="630" gradientUnits="userSpaceOnUse">
      <stop stop-color="${palette.background.match(/#(?:[0-9a-fA-F]{3}){1,2}/)?.[0] || "#16343d"}" />
      <stop offset="0.55" stop-color="${palette.background.match(/#(?:[0-9a-fA-F]{3}){1,2}/g)?.[1] || "#1e5f68"}" />
      <stop offset="1" stop-color="${palette.background.match(/#(?:[0-9a-fA-F]{3}){1,2}/g)?.[2] || "#5fb8a9"}" />
    </linearGradient>
    <filter id="blur" x="-10%" y="-10%" width="120%" height="120%">
      <feGaussianBlur stdDeviation="40" />
    </filter>
  </defs>

  <rect width="1200" height="630" rx="32" fill="url(#bg)" />
  <circle cx="${dotX}" cy="${dotY}" r="132" fill="${palette.accent}" opacity="0.18" filter="url(#blur)" />
  <circle cx="1020" cy="520" r="${arcA}" fill="${palette.accent}" opacity="0.09" filter="url(#blur)" />
  <path d="M870 ${arcA}C980 ${arcB} 1060 300 1180 360V630H760C760 520 785 430 870 ${arcA}Z" fill="${palette.card}" />
  <path d="M0 448C118 420 184 350 242 266C301 180 364 102 492 86C612 70 698 124 760 194C818 261 874 338 1026 332C1112 328 1170 301 1200 283V630H0V448Z" fill="${palette.card}" opacity="0.62" />

  <rect x="64" y="60" width="624" height="510" rx="28" fill="${palette.card}" stroke="${palette.cardBorder}" />
  <rect x="96" y="98" width="206" height="34" rx="17" fill="${palette.accent}" fill-opacity="0.15" stroke="${palette.cardBorder}" />
  <text x="117" y="120" fill="${palette.accent}" font-family="Inter, Arial, sans-serif" font-size="12" font-weight="700" letter-spacing="2.6">
    ${escapeSvg(label)}
  </text>

  ${titleLines
    .map(
      (line, index) => `<text x="96" y="${208 + index * 68}" fill="${palette.text}" font-family="Inter, Arial, sans-serif" font-size="50" font-weight="700" letter-spacing="-1.6">
    ${escapeSvg(line)}
  </text>`,
    )
    .join("\n")}

  ${
    excerptLines.length
      ? excerptLines
          .map(
            (line, index) => `<text x="98" y="${390 + index * 30}" fill="${palette.muted}" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="500">
    ${escapeSvg(line)}
  </text>`,
          )
          .join("\n")
      : ""
  }

  <g transform="translate(96 470)">
    <rect width="212" height="52" rx="16" fill="${palette.accent}" fill-opacity="0.12" stroke="${palette.cardBorder}" />
    <text x="24" y="31" fill="${palette.text}" font-family="Inter, Arial, sans-serif" font-size="20" font-weight="600">
      tidum.no/blog
    </text>
  </g>

  <g transform="translate(760 76)">
    <rect width="360" height="478" rx="28" fill="rgba(255,255,255,0.08)" stroke="${palette.cardBorder}" />
    <rect x="34" y="42" width="292" height="160" rx="24" fill="rgba(255,255,255,0.12)" />
    <path d="M84 144C128 88 198 77 245 120C274 146 289 178 313 189" stroke="${palette.accent}" stroke-opacity="0.7" stroke-width="22" stroke-linecap="round" />
    <circle cx="120" cy="328" r="54" fill="rgba(255,255,255,0.14)" />
    <circle cx="248" cy="328" r="54" fill="rgba(255,255,255,0.10)" />
    <circle cx="184" cy="406" r="54" fill="rgba(255,255,255,0.08)" />
    <rect x="46" y="270" width="268" height="16" rx="8" fill="rgba(255,255,255,0.12)" />
    <rect x="46" y="456" width="180" height="12" rx="6" fill="rgba(255,255,255,0.16)" />
    <rect x="46" y="480" width="124" height="12" rx="6" fill="rgba(255,255,255,0.12)" />
  </g>
</svg>`;
}
