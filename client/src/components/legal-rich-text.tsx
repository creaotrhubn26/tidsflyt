import { Fragment, type ReactNode } from "react";

type LegalBlock =
  | { type: "heading2"; text: string }
  | { type: "heading3"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] };

function renderInlineMarkdown(text: string): ReactNode[] {
  return text.split(/(\*\*.*?\*\*)/g).filter(Boolean).map((segment, index) => {
    const isStrong = segment.startsWith("**") && segment.endsWith("**");
    if (!isStrong) {
      return <Fragment key={`text-${index}`}>{segment}</Fragment>;
    }

    return (
      <strong key={`strong-${index}`} className="font-semibold text-[#15343D]">
        {segment.slice(2, -2)}
      </strong>
    );
  });
}

function parseBlocks(content: string): LegalBlock[] {
  const normalized = content.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const blocks: LegalBlock[] = [];
  let paragraphBuffer: string[] = [];
  let listBuffer: string[] = [];

  const flushParagraph = () => {
    if (!paragraphBuffer.length) return;
    blocks.push({
      type: "paragraph",
      text: paragraphBuffer.join(" ").trim(),
    });
    paragraphBuffer = [];
  };

  const flushList = () => {
    if (!listBuffer.length) return;
    blocks.push({
      type: "list",
      items: [...listBuffer],
    });
    listBuffer = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    if (line.startsWith("## ")) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading2", text: line.slice(3).trim() });
      continue;
    }

    if (line.startsWith("### ")) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading3", text: line.slice(4).trim() });
      continue;
    }

    if (line.startsWith("- ")) {
      flushParagraph();
      listBuffer.push(line.slice(2).trim());
      continue;
    }

    flushList();
    paragraphBuffer.push(line);
  }

  flushParagraph();
  flushList();

  return blocks;
}

export function LegalRichText({ content }: { content: string }) {
  const blocks = parseBlocks(content);

  return (
    <div className="space-y-4 text-[var(--color-text-main)]" data-testid="legal-rich-text">
      {blocks.map((block, index) => {
        if (block.type === "heading2") {
          return (
            <h2
              key={`h2-${index}`}
              className="pt-4 text-xl font-semibold text-[#15343D] sm:text-2xl"
            >
              {renderInlineMarkdown(block.text)}
            </h2>
          );
        }

        if (block.type === "heading3") {
          return (
            <h3
              key={`h3-${index}`}
              className="pt-2 text-lg font-semibold text-[#15343D]"
            >
              {renderInlineMarkdown(block.text)}
            </h3>
          );
        }

        if (block.type === "list") {
          return (
            <ul
              key={`list-${index}`}
              className="ml-5 list-disc space-y-2 text-[15px] leading-7 text-[#5F6B6D]"
            >
              {block.items.map((item, itemIndex) => (
                <li key={`item-${index}-${itemIndex}`}>
                  {renderInlineMarkdown(item)}
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p
            key={`p-${index}`}
            className="text-[15px] leading-7 text-[#5F6B6D]"
          >
            {renderInlineMarkdown(block.text)}
          </p>
        );
      })}
    </div>
  );
}
