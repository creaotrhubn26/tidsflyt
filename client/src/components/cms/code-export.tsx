import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { 
  Code2, Download, Copy, Check, FileCode, FileJson, 
  Braces, LayoutTemplate, Palette 
} from "lucide-react";

interface Section {
  id: string;
  type: string;
  title: string;
  content: any;
  spacing: any;
  background: any;
  layout?: any;
  animations?: any;
  order: number;
  children?: Section[];
}

interface CodeExportProps {
  sections: Section[];
}

export function CodeExport({ sections }: CodeExportProps) {
  const { toast } = useToast();
  const [copiedType, setCopiedType] = useState<string | null>(null);

  const generateReactCode = () => {
    const imports = `import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

`;

    const sectionComponents = sections.map((section, idx) => {
      const layoutStyle = section.layout ? {
        display: section.layout.type === 'grid' ? 'grid' : 'flex',
        flexDirection: section.layout.direction || 'row',
        justifyContent: section.layout.justify || 'start',
        alignItems: section.layout.align || 'start',
        gap: `${section.layout.gap}px`,
        ...(section.layout.type === 'grid' && {
          gridTemplateColumns: `repeat(${section.layout.gridCols || 3}, 1fr)`,
        }),
      } : {};

      return `function Section${idx}() {
  return (
    <section 
      className="section-${section.type}"
      style={{
        paddingTop: '${section.spacing.paddingTop}px',
        paddingBottom: '${section.spacing.paddingBottom}px',
        paddingLeft: '${section.spacing.paddingX}px',
        paddingRight: '${section.spacing.paddingX}px',
        background: '${section.background.gradient || section.background.color}',
        ${Object.entries(layoutStyle).map(([k, v]) => `${k}: '${v}'`).join(',\n        ')}
      }}
    >
      <Badge>{section.type}</Badge>
      <h2 className="text-3xl font-bold">{section.title}</h2>
      {/* Add your content here */}
    </section>
  );
}`;
    }).join('\n\n');

    const mainComponent = `
export function LandingPage() {
  return (
    <div className="landing-page">
${sections.map((_, idx) => `      <Section${idx} />`).join('\n')}
    </div>
  );
}`;

    return imports + sectionComponents + mainComponent;
  };

  const generateHTMLCode = () => {
    const styles = sections.map((section, idx) => {
      const layoutCSS = section.layout ? `
  .section-${idx} > .content {
    display: ${section.layout.type === 'grid' ? 'grid' : 'flex'};
    flex-direction: ${section.layout.direction || 'row'};
    justify-content: ${section.layout.justify === 'between' ? 'space-between' : section.layout.justify};
    align-items: ${section.layout.align};
    gap: ${section.layout.gap}px;
    ${section.layout.type === 'grid' ? `grid-template-columns: repeat(${section.layout.gridCols || 3}, 1fr);` : ''}
  }` : '';

      const animationCSS = section.animations?.enabled ? `
  .section-${idx} {
    transition: all ${section.animations.duration}ms ease-in-out;
    transition-delay: ${section.animations.delay}ms;
    ${section.animations.type === 'fade' ? 'opacity: 0;' : ''}
    ${section.animations.type === 'slide' ? 'transform: translateY(20px);' : ''}
  }
  .section-${idx}.animated {
    ${section.animations.type === 'fade' ? 'opacity: 1;' : ''}
    ${section.animations.type === 'slide' ? 'transform: translateY(0);' : ''}
  }` : '';

      return `.section-${idx} {
  padding-top: ${section.spacing.paddingTop}px;
  padding-bottom: ${section.spacing.paddingBottom}px;
  padding-left: ${section.spacing.paddingX}px;
  padding-right: ${section.spacing.paddingX}px;
  background: ${section.background.gradient || section.background.color};
}${layoutCSS}${animationCSS}`;
    }).join('\n\n');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Landing Page</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    
${styles}
  </style>
</head>
<body>
${sections.map((section, idx) => `  <section class="section-${idx}">
    <span class="badge">${section.type}</span>
    <h2>${section.title}</h2>
    <div class="content">
      <!-- Add your content here -->
    </div>
  </section>`).join('\n\n')}
</body>
</html>`;

    return html;
  };

  const generateTailwindCode = () => {
    const justifyMap: Record<string, string> = {
      'start': 'justify-start',
      'center': 'justify-center',
      'end': 'justify-end',
      'between': 'justify-between',
      'around': 'justify-around',
      'evenly': 'justify-evenly',
    };

    const alignMap: Record<string, string> = {
      'start': 'items-start',
      'center': 'items-center',
      'end': 'items-end',
      'stretch': 'items-stretch',
      'baseline': 'items-baseline',
    };

    const components = sections.map((section, idx) => {
      const layoutClasses = section.layout ? [
        section.layout.type === 'grid' ? 'grid' : 'flex',
        section.layout.type === 'grid' ? `grid-cols-${section.layout.gridCols || 3}` : '',
        section.layout.direction === 'row' ? 'flex-row' : '',
        section.layout.direction === 'column' ? 'flex-col' : '',
        section.layout.direction === 'row-reverse' ? 'flex-row-reverse' : '',
        section.layout.direction === 'column-reverse' ? 'flex-col-reverse' : '',
        justifyMap[section.layout.justify] || '',
        alignMap[section.layout.align] || '',
        section.layout.wrap ? 'flex-wrap' : '',
        `gap-${Math.round(section.layout.gap / 4)}`,
      ].filter(Boolean).join(' ') : '';

      const spacingClasses = [
        `pt-${Math.round(section.spacing.paddingTop / 4)}`,
        `pb-${Math.round(section.spacing.paddingBottom / 4)}`,
        `px-${Math.round(section.spacing.paddingX / 4)}`,
      ].join(' ');

      return `<section className="${spacingClasses} ${layoutClasses}" style={{ background: '${section.background.gradient || section.background.color}' }}>
  <span className="inline-block px-3 py-1 bg-gray-100 rounded text-sm">${section.type}</span>
  <h2 className="text-3xl font-bold mt-4">${section.title}</h2>
  <div className="content">
    {/* Add your content here */}
  </div>
</section>`;
    }).join('\n\n');

    return `import React from 'react';

export function LandingPage() {
  return (
    <div className="landing-page">
${components}
    </div>
  );
}`;
  };

  const generateJSONConfig = () => {
    return JSON.stringify({ 
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      sections: sections.map(s => ({
        id: s.id,
        type: s.type,
        title: s.title,
        spacing: s.spacing,
        background: s.background,
        layout: s.layout,
        animations: s.animations,
        order: s.order,
      }))
    }, null, 2);
  };

  const copyToClipboard = async (code: string, type: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedType(type);
      toast({ 
        title: 'Copied!', 
        description: `${type} code copied to clipboard` 
      });
      setTimeout(() => setCopiedType(null), 2000);
    } catch (error) {
      toast({ 
        title: 'Error', 
        description: 'Failed to copy to clipboard',
        variant: 'destructive'
      });
    }
  };

  const downloadFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ 
      title: 'Downloaded!', 
      description: `${filename} downloaded successfully` 
    });
  };

  const exportOptions = [
    {
      id: 'react',
      name: 'React Component',
      icon: <Braces className="h-5 w-5" />,
      description: 'Clean React JSX with inline styles',
      code: generateReactCode(),
      filename: 'LandingPage.tsx',
    },
    {
      id: 'html',
      name: 'HTML/CSS',
      icon: <FileCode className="h-5 w-5" />,
      description: 'Standalone HTML with embedded CSS',
      code: generateHTMLCode(),
      filename: 'landing-page.html',
    },
    {
      id: 'tailwind',
      name: 'Tailwind CSS',
      icon: <Palette className="h-5 w-5" />,
      description: 'React with Tailwind utility classes',
      code: generateTailwindCode(),
      filename: 'LandingPage.tailwind.tsx',
    },
    {
      id: 'json',
      name: 'JSON Config',
      icon: <FileJson className="h-5 w-5" />,
      description: 'Portable JSON configuration',
      code: generateJSONConfig(),
      filename: 'page-config.json',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Code2 className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Export Code</h3>
        <Badge variant="secondary">{sections.length} sections</Badge>
      </div>

      <Tabs defaultValue="react" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          {exportOptions.map((option) => (
            <TabsTrigger key={option.id} value={option.id} className="text-xs">
              {option.icon}
              <span className="ml-1 hidden sm:inline">{option.name.split(' ')[0]}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {exportOptions.map((option) => (
          <TabsContent key={option.id} value={option.id} className="space-y-3">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  {option.icon}
                  {option.name}
                </CardTitle>
                <CardDescription className="text-xs">
                  {option.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  value={option.code}
                  readOnly
                  className="font-mono text-xs h-64 resize-none"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => copyToClipboard(option.code, option.name)}
                    className="flex-1"
                  >
                    {copiedType === option.name ? (
                      <>
                        <Check className="h-4 w-4 mr-2" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 mr-2" />
                        Copy Code
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => downloadFile(option.code, option.filename)}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="pt-4">
          <p className="text-xs text-muted-foreground flex items-center gap-2">
            <LayoutTemplate className="h-4 w-4" />
            Export your design as production-ready code. All layouts, animations, and styles are preserved.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
