import { useMemo } from "react";
import ReactQuill from "react-quill-new";
import DOMPurify from "dompurify";
import "react-quill-new/dist/quill.snow.css";
import { cn } from "@/lib/utils";

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
  readOnly?: boolean;
  minHeight?: string;
  testId?: string;
}

export function RichTextEditor({
  value,
  onChange,
  onBlur,
  placeholder = "Skriv her...",
  className,
  readOnly = false,
  minHeight = "200px",
  testId,
}: RichTextEditorProps) {
  const modules = useMemo(
    () => ({
      toolbar: readOnly
        ? false
        : [
            [{ header: [1, 2, 3, false] }],
            ["bold", "italic", "underline", "strike"],
            [{ list: "ordered" }, { list: "bullet" }],
            [{ indent: "-1" }, { indent: "+1" }],
            ["blockquote"],
            ["link"],
            ["clean"],
          ],
    }),
    [readOnly]
  );

  const formats = [
    "header",
    "bold",
    "italic",
    "underline",
    "strike",
    "list",
    "indent",
    "blockquote",
    "link",
  ];

  const handleChange = (content: string) => {
    const sanitized = DOMPurify.sanitize(content, {
      ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 's', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'a'],
      ALLOWED_ATTR: ['href', 'target', 'rel'],
    });
    onChange(sanitized);
  };

  return (
    <div
      className={cn(
        "rich-text-editor rounded-md border border-input bg-muted/30 dark:bg-muted/10 focus-within:bg-background transition-colors",
        readOnly && "border-none bg-transparent",
        `[--min-height:${minHeight}]`,
        className
      )}
      data-testid={testId}
    >
      <ReactQuill
        theme="snow"
        value={value}
        onChange={handleChange}
        onBlur={onBlur}
        modules={modules}
        formats={formats}
        placeholder={placeholder}
        readOnly={readOnly}
      />
    </div>
  );
}

interface RichTextViewerProps {
  content: string;
  className?: string;
  testId?: string;
}

export function RichTextViewer({ content, className, testId }: RichTextViewerProps) {
  const sanitizedContent = useMemo(() => {
    return DOMPurify.sanitize(content, {
      ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 's', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'a'],
      ALLOWED_ATTR: ['href', 'target', 'rel'],
    });
  }, [content]);

  return (
    <div
      className={cn("rich-text-viewer prose prose-sm dark:prose-invert max-w-none", className)}
      dangerouslySetInnerHTML={{ __html: sanitizedContent }}
      data-testid={testId}
    />
  );
}
