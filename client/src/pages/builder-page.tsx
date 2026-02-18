import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { tidumPageStyles, tidumScrollAnimScript } from "@/lib/tidum-page-styles";
import { Loader2 } from "lucide-react";
import { useSEO } from "@/hooks/use-seo";

// ── Section Renderer ─────────────────────────────────────────────────
function renderSectionContent(section: any): string {
  const c = section.content || {};
  const t = section.title || '';

  switch (section.templateId) {
    // Navigation
    case 'tidum-header-bar':
      return `
        <nav style="display:flex;justify-content:space-between;align-items:center;max-width:1200px;margin:0 auto;width:100%;">
          <a href="/" style="font-weight:700;font-size:1.25rem;color:var(--color-primary);text-decoration:none;">
            ${c.logo || 'Tidum'}
          </a>
          <div style="display:flex;gap:24px;align-items:center;">
            ${(c.navLinks || []).map((l: any) => `<a href="${l.href}" style="color:var(--color-text-main);text-decoration:none;font-size:0.95rem;">${l.text}</a>`).join('')}
            ${c.ctaButton ? `<a href="${c.ctaButton.href}" class="tidum-btn-primary" style="padding:8px 20px;font-size:0.9rem;text-decoration:none;">${c.ctaButton.text}</a>` : ''}
          </div>
        </nav>`;

    // Hero variants
    case 'tidum-hero-split':
      return `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;max-width:1200px;margin:0 auto;align-items:center;">
          <div>
            <h1 class="tidum-title">${t}</h1>
            ${c.subtitle ? `<p class="tidum-text" style="margin-top:16px;">${c.subtitle}</p>` : ''}
            <div style="display:flex;gap:12px;margin-top:24px;">
              ${c.ctaPrimary ? `<a href="${c.ctaPrimary.url}" class="tidum-btn-primary" style="padding:12px 28px;text-decoration:none;">${c.ctaPrimary.text}</a>` : ''}
              ${c.ctaSecondary ? `<a href="${c.ctaSecondary.url}" class="tidum-btn-secondary" style="padding:12px 28px;text-decoration:none;">${c.ctaSecondary.text}</a>` : ''}
            </div>
          </div>
          ${c.heroImage ? `<div style="text-align:center;"><img src="${c.heroImage}" alt="" style="max-width:100%;border-radius:12px;"/></div>` : '<div></div>'}
        </div>`;

    case 'tidum-hero-centered':
      return `
        <div style="text-align:center;max-width:800px;margin:0 auto;">
          <h1 class="tidum-title">${t}</h1>
          ${c.subtitle ? `<p class="tidum-text" style="margin-top:16px;">${c.subtitle}</p>` : ''}
          <div style="display:flex;gap:12px;justify-content:center;margin-top:24px;">
            ${c.ctaPrimary ? `<a href="${c.ctaPrimary.url}" class="tidum-btn-primary" style="padding:12px 28px;text-decoration:none;">${c.ctaPrimary.text}</a>` : ''}
            ${c.ctaSecondary ? `<a href="${c.ctaSecondary.url}" class="tidum-btn-secondary" style="padding:12px 28px;text-decoration:none;">${c.ctaSecondary.text}</a>` : ''}
          </div>
        </div>`;

    case 'tidum-hero-icon':
      return `
        <div style="text-align:center;max-width:700px;margin:0 auto;">
          ${c.icon ? `<div style="display:inline-flex;padding:16px;border-radius:16px;background:${c.iconBg || '#E7F3EE'};margin-bottom:16px;font-size:2rem;">🛡️</div>` : ''}
          <h1 class="tidum-title">${t}</h1>
          ${c.subtitle ? `<p class="tidum-text" style="margin-top:12px;">${c.subtitle}</p>` : ''}
          ${c.dateLabel ? `<p style="margin-top:8px;font-size:0.85rem;color:var(--color-text-muted);">${c.dateLabel}: ${c.date || ''}</p>` : ''}
        </div>`;

    // Hero Contact (with form)
    case 'tidum-hero-contact':
      return `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;max-width:1200px;margin:0 auto;align-items:start;">
          <div>
            <h1 class="tidum-title">${t}</h1>
            ${c.subtitle ? `<p class="tidum-text" style="margin-top:16px;">${c.subtitle}</p>` : ''}
          </div>
          <div>
            <form class="builder-contact-form" style="display:flex;flex-direction:column;gap:16px;padding:24px;border-radius:12px;background:var(--color-bg-section);border:1px solid var(--color-border);">
              <div>
                <label style="display:block;font-weight:500;margin-bottom:4px;font-size:0.9rem;">Navn</label>
                <input type="text" name="name" class="tidum-input" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--color-border);" required/>
              </div>
              <div>
                <label style="display:block;font-weight:500;margin-bottom:4px;font-size:0.9rem;">E-post</label>
                <input type="email" name="email" class="tidum-input" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--color-border);" required/>
              </div>
              <div>
                <label style="display:block;font-weight:500;margin-bottom:4px;font-size:0.9rem;">Melding</label>
                <textarea name="message" class="tidum-input" rows="4" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--color-border);resize:vertical;" required></textarea>
              </div>
              <button type="submit" class="tidum-btn-primary" style="padding:12px 28px;cursor:pointer;border:none;font-size:1rem;">Send melding</button>
            </form>
          </div>
        </div>`;

    // Features
    case 'tidum-feature-grid-3':
    case 'tidum-feature-grid-2':
      const cols = section.templateId === 'tidum-feature-grid-3' ? 3 : 2;
      return `
        <div style="max-width:1200px;margin:0 auto;">
          <h2 style="font-size:2rem;font-weight:600;color:var(--color-heading, #0E4852);text-align:center;margin-bottom:32px;">${t}</h2>
          ${c.subtitle ? `<p style="text-align:center;color:var(--color-text-muted);margin-bottom:40px;max-width:600px;margin-left:auto;margin-right:auto;">${c.subtitle}</p>` : ''}
          <div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:24px;">
            ${(c.features || c.items || []).map((f: any) => `
              <div class="tidum-panel" style="padding:24px;border-radius:12px;">
                ${f.icon ? `<div style="font-size:1.5rem;margin-bottom:12px;">${f.icon}</div>` : ''}
                <h3 style="font-weight:600;font-size:1.1rem;color:var(--color-heading, #0E4852);">${f.title || f.name || ''}</h3>
                <p style="color:var(--color-text-muted);font-size:0.95rem;margin-top:8px;">${f.description || f.desc || ''}</p>
              </div>
            `).join('')}
          </div>
        </div>`;

    // Stats
    case 'tidum-stat-bar':
    case 'tidum-stat-cards':
      return `
        <div style="max-width:1200px;margin:0 auto;">
          ${t ? `<h2 style="font-size:1.5rem;font-weight:600;text-align:center;margin-bottom:24px;color:var(--color-heading);">${t}</h2>` : ''}
          <div style="display:flex;justify-content:center;gap:40px;flex-wrap:wrap;">
            ${(c.stats || []).map((s: any) => `
              <div style="text-align:center;">
                <div style="font-size:2.5rem;font-weight:700;color:var(--color-primary);">${s.value || ''}</div>
                <div style="font-size:0.9rem;color:var(--color-text-muted);margin-top:4px;">${s.label || ''}</div>
              </div>
            `).join('')}
          </div>
        </div>`;

    // Testimonials
    case 'tidum-testimonials-cards':
      return `
        <div style="max-width:1200px;margin:0 auto;">
          <h2 style="font-size:1.5rem;font-weight:600;text-align:center;margin-bottom:32px;color:var(--color-heading);">${t}</h2>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:24px;">
            ${(c.testimonials || []).map((t: any) => `
              <div class="tidum-panel" style="padding:24px;border-radius:12px;">
                <p style="font-style:italic;color:var(--color-text-main);line-height:1.6;">"${t.quote || ''}"</p>
                <div style="margin-top:16px;display:flex;align-items:center;gap:12px;">
                  ${t.avatar ? `<img src="${t.avatar}" alt="" style="width:40px;height:40px;border-radius:50%;"/>` : ''}
                  <div>
                    <div style="font-weight:600;font-size:0.9rem;">${t.name || ''}</div>
                    <div style="font-size:0.8rem;color:var(--color-text-muted);">${t.role || ''}</div>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>`;

    // CTA
    case 'tidum-cta-banner':
      return `
        <div style="text-align:center;max-width:700px;margin:0 auto;">
          <h2 style="font-size:1.75rem;font-weight:600;color:var(--color-heading);">${t}</h2>
          ${c.subtitle ? `<p style="margin-top:12px;color:var(--color-text-muted);">${c.subtitle}</p>` : ''}
          <div style="display:flex;gap:12px;justify-content:center;margin-top:24px;">
            ${c.primaryButton ? `<a href="${c.primaryButton.url || '#'}" class="tidum-btn-primary" style="padding:12px 28px;text-decoration:none;">${c.primaryButton.text}</a>` : ''}
            ${c.secondaryButton ? `<a href="${c.secondaryButton.url || '#'}" class="tidum-btn-secondary" style="padding:12px 28px;text-decoration:none;">${c.secondaryButton.text}</a>` : ''}
          </div>
        </div>`;

    // Pricing
    case 'tidum-pricing-table':
      return `
        <div style="max-width:1200px;margin:0 auto;">
          <h2 style="font-size:2rem;font-weight:600;text-align:center;color:var(--color-heading);margin-bottom:40px;">${t}</h2>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px;">
            ${(c.plans || []).map((p: any) => `
              <div class="tidum-panel" style="padding:32px;border-radius:16px;text-align:center;${p.featured ? 'border-color:var(--color-primary);box-shadow:0 0 0 2px var(--color-primary);' : ''}">
                <h3 style="font-size:1.25rem;font-weight:600;">${p.name || ''}</h3>
                <div style="font-size:2.5rem;font-weight:700;color:var(--color-primary);margin:16px 0;">${p.price || ''}</div>
                <p style="color:var(--color-text-muted);font-size:0.9rem;">${p.period || ''}</p>
                <ul style="text-align:left;margin-top:24px;list-style:none;padding:0;">
                  ${(p.features || []).map((f: string) => `<li style="padding:6px 0;border-bottom:1px solid var(--color-border);font-size:0.9rem;">✓ ${f}</li>`).join('')}
                </ul>
                <a href="${p.ctaUrl || '#'}" class="tidum-btn-primary" style="display:block;margin-top:24px;padding:12px;text-decoration:none;text-align:center;">${p.ctaText || 'Velg plan'}</a>
              </div>
            `).join('')}
          </div>
        </div>`;

    // Footer
    case 'tidum-footer-full':
    case 'tidum-footer-simple':
      return `
        <footer style="max-width:1200px;margin:0 auto;text-align:center;padding:24px 0;">
          <div style="display:flex;justify-content:center;gap:24px;flex-wrap:wrap;margin-bottom:16px;">
            ${(c.links || []).map((l: any) => `<a href="${l.href || '#'}" style="color:var(--color-text-muted);text-decoration:none;font-size:0.9rem;">${l.text || ''}</a>`).join('')}
          </div>
          <p style="color:var(--color-text-muted);font-size:0.8rem;">${c.copyright || `© ${new Date().getFullYear()} Tidum`}</p>
        </footer>`;

    // Content blocks
    case 'tidum-rich-text':
      return `<div style="max-width:800px;margin:0 auto;line-height:1.8;color:var(--color-text-main);">${c.html || c.body || `<h2>${t}</h2>`}</div>`;

    case 'tidum-accordion-faq':
      return `
        <div style="max-width:800px;margin:0 auto;">
          <h2 style="font-size:1.5rem;font-weight:600;text-align:center;margin-bottom:24px;color:var(--color-heading);">${t}</h2>
          ${(c.items || []).map((item: any) => `
            <details style="border-bottom:1px solid var(--color-border);padding:16px 0;">
              <summary style="cursor:pointer;font-weight:600;font-size:1rem;">${item.question || item.title || ''}</summary>
              <p style="margin-top:12px;color:var(--color-text-muted);line-height:1.6;">${item.answer || item.content || ''}</p>
            </details>
          `).join('')}
        </div>`;

    // Contact form
    case 'tidum-contact-form':
      return `
        <div style="max-width:600px;margin:0 auto;">
          <h2 style="font-size:1.5rem;font-weight:600;text-align:center;margin-bottom:24px;color:var(--color-heading);">${t}</h2>
          <form class="builder-contact-form" style="display:flex;flex-direction:column;gap:16px;">
            ${(c.fields || [{ name: 'name', label: 'Navn', type: 'text' }, { name: 'email', label: 'E-post', type: 'email' }, { name: 'message', label: 'Melding', type: 'textarea' }]).map((f: any) => `
              <div>
                <label style="display:block;font-weight:500;margin-bottom:4px;font-size:0.9rem;">${f.label || f.name}</label>
                ${f.type === 'textarea'
                  ? `<textarea name="${f.name}" class="tidum-input" rows="4" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--color-border);resize:vertical;" ${f.required ? 'required' : ''}></textarea>`
                  : `<input type="${f.type || 'text'}" name="${f.name}" class="tidum-input" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--color-border);" ${f.required ? 'required' : ''}/>`
                }
              </div>
            `).join('')}
            <button type="submit" class="tidum-btn-primary" style="padding:12px 28px;cursor:pointer;border:none;font-size:1rem;">${c.submitText || 'Send melding'}</button>
          </form>
        </div>`;

    // Newsletter
    case 'tidum-newsletter':
      return `
        <div style="text-align:center;max-width:500px;margin:0 auto;">
          <h2 style="font-size:1.5rem;font-weight:600;color:var(--color-heading);">${t}</h2>
          ${c.subtitle ? `<p style="color:var(--color-text-muted);margin-top:8px;">${c.subtitle}</p>` : ''}
          <form class="builder-newsletter-form" style="display:flex;gap:8px;margin-top:20px;">
            <input type="email" name="email" placeholder="${c.placeholder || 'Din e-post'}" class="tidum-input" style="flex:1;padding:10px 16px;border-radius:8px;border:1px solid var(--color-border);" required/>
            <button type="submit" class="tidum-btn-primary" style="padding:10px 24px;cursor:pointer;border:none;">${c.buttonText || 'Abonner'}</button>
          </form>
        </div>`;

    // Timeline
    case 'tidum-timeline':
      return `
        <div style="max-width:700px;margin:0 auto;">
          <h2 style="font-size:1.5rem;font-weight:600;text-align:center;margin-bottom:32px;color:var(--color-heading);">${t}</h2>
          <div style="position:relative;padding-left:32px;border-left:2px solid var(--color-primary);">
            ${(c.items || []).map((item: any) => `
              <div style="margin-bottom:24px;position:relative;">
                <div style="position:absolute;left:-39px;width:14px;height:14px;border-radius:50%;background:var(--color-primary);border:2px solid white;"></div>
                <div style="font-weight:600;color:var(--color-primary);font-size:0.85rem;">${item.date || item.year || ''}</div>
                <h3 style="font-weight:600;margin-top:4px;">${item.title || ''}</h3>
                <p style="color:var(--color-text-muted);margin-top:4px;font-size:0.9rem;">${item.description || ''}</p>
              </div>
            `).join('')}
          </div>
        </div>`;

    // Logo Strip
    case 'tidum-logo-strip':
      return `
        <div style="text-align:center;max-width:1000px;margin:0 auto;">
          ${c.heading ? `<p style="color:var(--color-text-muted);font-size:0.9rem;margin-bottom:20px;">${c.heading}</p>` : ''}
          <div style="display:flex;justify-content:center;align-items:center;gap:40px;flex-wrap:wrap;opacity:0.6;">
            ${(c.logos || []).map((l: any) => `<img src="${l.src || l}" alt="${l.alt || ''}" style="height:36px;object-fit:contain;"/>`).join('')}
          </div>
        </div>`;

    // Video Embed
    case 'tidum-video-embed':
      return `
        <div style="max-width:800px;margin:0 auto;text-align:center;">
          ${t ? `<h2 style="font-size:1.5rem;font-weight:600;color:var(--color-heading);margin-bottom:20px;">${t}</h2>` : ''}
          <div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:12px;">
            <iframe src="${c.embedUrl || ''}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;" allowfullscreen></iframe>
          </div>
        </div>`;

    // Gallery
    case 'tidum-image-gallery':
      return `
        <div style="max-width:1200px;margin:0 auto;">
          ${t ? `<h2 style="font-size:1.5rem;font-weight:600;text-align:center;margin-bottom:24px;color:var(--color-heading);">${t}</h2>` : ''}
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:16px;">
            ${(c.images || []).map((img: any) => `
              <div style="border-radius:12px;overflow:hidden;">
                <img src="${img.src || img}" alt="${img.alt || ''}" style="width:100%;height:200px;object-fit:cover;"/>
                ${img.caption ? `<p style="text-align:center;font-size:0.85rem;color:var(--color-text-muted);padding:8px;">${img.caption}</p>` : ''}
              </div>
            `).join('')}
          </div>
        </div>`;

    // Team
    case 'tidum-team-grid':
      return `
        <div style="max-width:1000px;margin:0 auto;">
          <h2 style="font-size:1.75rem;font-weight:600;text-align:center;margin-bottom:32px;color:var(--color-heading);">${t}</h2>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:24px;">
            ${(c.members || []).map((m: any) => `
              <div style="text-align:center;">
                ${m.photo ? `<img src="${m.photo}" alt="${m.name}" style="width:120px;height:120px;border-radius:50%;object-fit:cover;margin:0 auto 12px;"/>` : ''}
                <h3 style="font-weight:600;font-size:1rem;">${m.name || ''}</h3>
                <p style="color:var(--color-text-muted);font-size:0.85rem;">${m.role || ''}</p>
              </div>
            `).join('')}
          </div>
        </div>`;

    // Numbered steps / Guide
    case 'tidum-guide-numbered-steps':
      return `
        <div style="max-width:800px;margin:0 auto;">
          <h2 style="font-size:1.5rem;font-weight:600;text-align:center;margin-bottom:32px;color:var(--color-heading);">${t}</h2>
          ${(c.steps || []).map((s: any, i: number) => `
            <div style="display:flex;gap:16px;margin-bottom:24px;align-items:start;">
              <div style="flex-shrink:0;width:36px;height:36px;border-radius:50%;background:var(--color-primary);color:white;display:flex;align-items:center;justify-content:center;font-weight:700;">${i + 1}</div>
              <div>
                <h3 style="font-weight:600;">${s.title || ''}</h3>
                <p style="color:var(--color-text-muted);margin-top:4px;font-size:0.95rem;">${s.description || ''}</p>
              </div>
            </div>
          `).join('')}
        </div>`;

    // Benefits Grid
    case 'tidum-benefits-grid':
      return `
        <div style="max-width:1200px;margin:0 auto;">
          ${t ? `<h2 style="font-size:1.75rem;font-weight:700;text-align:center;margin-bottom:8px;color:var(--color-heading);">${t}</h2>` : ''}
          ${c.subtitle ? `<p style="text-align:center;color:var(--color-text-muted);margin-bottom:32px;max-width:600px;margin-left:auto;margin-right:auto;">${c.subtitle}</p>` : ''}
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px;">
            ${(c.benefits || []).map((b: any) => `
              <div class="tidum-panel" style="padding:24px;border-radius:12px;text-align:center;">
                <div style="font-size:1.5rem;margin-bottom:12px;color:var(--color-primary);">⭐</div>
                <h3 style="font-weight:600;font-size:1.05rem;margin-bottom:8px;">${b.title || ''}</h3>
                <p style="color:var(--color-text-muted);font-size:0.9rem;line-height:1.5;">${b.description || ''}</p>
              </div>
            `).join('')}
          </div>
        </div>`;

    // How It Works (steps with badge)
    case 'tidum-how-it-works':
      return `
        <div style="max-width:1000px;margin:0 auto;">
          ${t ? `<h2 style="font-size:1.75rem;font-weight:700;text-align:center;margin-bottom:8px;color:var(--color-heading);">${t}</h2>` : ''}
          ${c.badge ? `<div style="text-align:center;margin-bottom:32px;"><span style="background:var(--color-primary);color:white;padding:6px 16px;border-radius:999px;font-size:0.85rem;font-weight:500;">${c.badge}</span></div>` : ''}
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:24px;">
            ${(c.steps || []).map((s: any) => `
              <div class="tidum-panel" style="padding:24px;border-radius:12px;text-align:center;">
                <div style="width:40px;height:40px;border-radius:50%;background:var(--color-primary);color:white;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1.1rem;margin:0 auto 16px;">${s.step || ''}</div>
                <h3 style="font-weight:600;font-size:1.05rem;margin-bottom:8px;">${s.title || ''}</h3>
                <p style="color:var(--color-text-muted);font-size:0.9rem;line-height:1.5;">${s.description || ''}</p>
              </div>
            `).join('')}
          </div>
        </div>`;

    // Story Section (Problem/Solution)
    case 'tidum-story-section': {
      const left = c.leftCard || {};
      const right = c.rightCard || {};
      return `
        <div style="max-width:1100px;margin:0 auto;">
          ${t ? `<h2 style="font-size:1.75rem;font-weight:700;text-align:center;margin-bottom:32px;color:var(--color-heading);">${t}</h2>` : ''}
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:32px;">
            <div class="tidum-panel" style="padding:28px;border-radius:16px;border-left:4px solid #e74c3c;">
              ${left.badge ? `<span style="display:inline-block;background:#fdeaea;color:#c0392b;padding:4px 12px;border-radius:999px;font-size:0.8rem;font-weight:500;margin-bottom:12px;">${left.badge}</span>` : ''}
              <h3 style="font-weight:700;font-size:1.15rem;margin-bottom:8px;">${left.title || ''}</h3>
              <p style="color:var(--color-text-muted);font-size:0.9rem;margin-bottom:16px;">${left.description || ''}</p>
              ${(left.issues || []).map((iss: any) => `
                <div style="display:flex;gap:10px;margin-bottom:10px;align-items:start;">
                  <span style="color:#e74c3c;font-size:1rem;">⚠</span>
                  <div>
                    <strong style="font-size:0.9rem;">${iss.title || ''}</strong>
                    <p style="color:var(--color-text-muted);font-size:0.85rem;margin-top:2px;">${iss.detail || ''}</p>
                  </div>
                </div>
              `).join('')}
            </div>
            <div class="tidum-panel" style="padding:28px;border-radius:16px;border-left:4px solid var(--color-primary);">
              <h3 style="font-weight:700;font-size:1.15rem;margin-bottom:8px;">${right.title || ''}</h3>
              <p style="color:var(--color-text-muted);font-size:0.9rem;margin-bottom:16px;">${right.subtitle || ''}</p>
              ${(right.timeline || []).map((ev: any) => `
                <div style="display:flex;gap:12px;margin-bottom:10px;align-items:center;">
                  <span style="font-weight:700;font-size:0.85rem;color:var(--color-primary);min-width:48px;">${ev.time || ''}</span>
                  <span style="font-size:0.9rem;">${ev.text || ''}</span>
                </div>
              `).join('')}
              ${right.callout ? `<div style="margin-top:16px;padding:12px;background:var(--color-primary-light,#e8f5ee);border-radius:8px;font-size:0.9rem;font-weight:500;color:var(--color-primary);">${right.callout}</div>` : ''}
            </div>
          </div>
        </div>`;
    }

    // Two-Column Split
    case 'tidum-two-col-split':
      return `
        <div style="max-width:1100px;margin:0 auto;">
          ${t ? `<h2 style="font-size:1.75rem;font-weight:700;text-align:center;margin-bottom:32px;color:var(--color-heading);">${t}</h2>` : ''}
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:32px;">
            <div class="tidum-panel" style="padding:28px;border-radius:16px;">
              <h3 style="font-weight:700;font-size:1.1rem;margin-bottom:6px;">${c.leftTitle || ''}</h3>
              <p style="color:var(--color-text-muted);font-size:0.9rem;margin-bottom:20px;">${c.leftSubtitle || ''}</p>
              ${(c.leftItems || []).map((it: any) => `
                <div style="display:flex;gap:12px;margin-bottom:14px;align-items:start;">
                  <span style="color:var(--color-primary);font-size:1.1rem;">✓</span>
                  <div>
                    <strong style="font-size:0.9rem;">${it.title || ''}</strong>
                    <p style="color:var(--color-text-muted);font-size:0.85rem;margin-top:2px;">${it.description || ''}</p>
                  </div>
                </div>
              `).join('')}
            </div>
            <div class="tidum-panel" style="padding:28px;border-radius:16px;">
              <h3 style="font-weight:700;font-size:1.1rem;margin-bottom:6px;">${c.rightTitle || ''}</h3>
              <p style="color:var(--color-text-muted);font-size:0.9rem;margin-bottom:20px;">${c.rightSubtitle || ''}</p>
              ${(c.rightItems || []).map((it: any) => `
                <div style="display:flex;gap:12px;margin-bottom:14px;align-items:start;">
                  <span style="color:var(--color-primary);font-size:1.1rem;">✓</span>
                  <div>
                    <strong style="font-size:0.9rem;">${it.title || ''}</strong>
                    <p style="color:var(--color-text-muted);font-size:0.85rem;margin-top:2px;">${it.description || ''}</p>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>`;

    // Audience List
    case 'tidum-audience-list':
      return `
        <div style="max-width:800px;margin:0 auto;">
          ${t ? `<h2 style="font-size:1.75rem;font-weight:700;text-align:center;margin-bottom:32px;color:var(--color-heading);">${t}</h2>` : ''}
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
            ${(c.items || []).map((it: any) => `
              <div class="tidum-panel" style="display:flex;align-items:center;gap:14px;padding:16px 20px;border-radius:12px;">
                <span style="font-size:1.3rem;">👤</span>
                <span style="font-weight:500;font-size:1rem;">${it.label || ''}</span>
              </div>
            `).join('')}
          </div>
        </div>`;

    // Prose/Markdown Content
    case 'tidum-prose-content': {
      const md = (c.markdown || '').replace(/^### (.+)$/gm, '<h3 style="font-size:1.2rem;font-weight:600;margin:20px 0 8px;">$1</h3>')
        .replace(/^## (.+)$/gm, '<h2 style="font-size:1.4rem;font-weight:700;margin:24px 0 12px;color:var(--color-heading);">$1</h2>')
        .replace(/^# (.+)$/gm, '<h1 style="font-size:1.6rem;font-weight:700;margin:28px 0 14px;color:var(--color-heading);">$1</h1>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/^- (.+)$/gm, '<li style="margin-left:20px;margin-bottom:4px;">$1</li>')
        .replace(/\n\n/g, '</p><p style="margin-bottom:12px;line-height:1.7;color:var(--color-text);">')
        .replace(/\n/g, '<br/>');
      return `
        <div style="max-width:800px;margin:0 auto;" class="tidum-prose">
          ${t ? `<h2 style="font-size:1.5rem;font-weight:700;margin-bottom:20px;color:var(--color-heading);">${t}</h2>` : ''}
          <div style="line-height:1.7;color:var(--color-text);font-size:1rem;"><p style="margin-bottom:12px;line-height:1.7;color:var(--color-text);">${md}</p></div>
        </div>`;
    }

    // Nordic Split (checklist + features)
    case 'tidum-nordic-split':
      return `
        <div style="max-width:1100px;margin:0 auto;">
          ${t ? `<h2 style="font-size:1.75rem;font-weight:700;text-align:center;margin-bottom:32px;color:var(--color-heading);">${t}</h2>` : ''}
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:32px;">
            <div class="tidum-panel" style="padding:28px;border-radius:16px;">
              <h3 style="font-weight:700;font-size:1.1rem;margin-bottom:6px;">${c.leftTitle || ''}</h3>
              <p style="color:var(--color-text-muted);font-size:0.9rem;margin-bottom:20px;">${c.leftSubtitle || ''}</p>
              ${(c.bulletPoints || []).map((bp: any) => `
                <div style="display:flex;gap:10px;align-items:center;margin-bottom:10px;">
                  <span style="color:var(--color-primary);font-weight:700;">✓</span>
                  <span style="font-size:0.95rem;">${bp}</span>
                </div>
              `).join('')}
            </div>
            <div class="tidum-panel" style="padding:28px;border-radius:16px;">
              <h3 style="font-weight:700;font-size:1.1rem;margin-bottom:6px;">${c.rightTitle || ''}</h3>
              <p style="color:var(--color-text-muted);font-size:0.9rem;margin-bottom:20px;">${c.rightSubtitle || ''}</p>
              ${(c.features || []).map((f: any) => `
                <div style="display:flex;gap:12px;margin-bottom:14px;align-items:start;">
                  <span style="color:var(--color-primary);font-size:1.1rem;">⚡</span>
                  <div>
                    <strong style="font-size:0.9rem;">${f.title || ''}</strong>
                    <p style="color:var(--color-text-muted);font-size:0.85rem;margin-top:2px;">${f.description || ''}</p>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>`;

    // Trust Norsk (Norwegian compliance grid)
    case 'tidum-trust-norsk':
      return `
        <div style="max-width:1000px;margin:0 auto;">
          ${t ? `<h2 style="font-size:1.75rem;font-weight:700;text-align:center;margin-bottom:8px;color:var(--color-heading);">${t}</h2>` : ''}
          ${c.description ? `<p style="text-align:center;color:var(--color-text-muted);margin-bottom:32px;max-width:700px;margin-left:auto;margin-right:auto;">${c.description}</p>` : ''}
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
            ${(c.items || []).map((it: any) => `
              <div class="tidum-panel" style="display:flex;align-items:center;gap:14px;padding:20px;border-radius:12px;">
                ${it.flag ? '<span style="font-size:1.3rem;">🇳🇴</span>' : '<span style="font-size:1.2rem;color:var(--color-primary);">✓</span>'}
                <div>
                  <strong style="font-size:0.95rem;">${it.title || ''}</strong>
                  <p style="color:var(--color-text-muted);font-size:0.85rem;margin-top:2px;">${it.detail || ''}</p>
                </div>
              </div>
            `).join('')}
          </div>
        </div>`;

    // Trust Section (Recommended by)
    case 'tidum-trust-section':
      return `
        <div style="max-width:1000px;margin:0 auto;">
          ${t ? `<h2 style="font-size:1.75rem;font-weight:700;text-align:center;margin-bottom:8px;color:var(--color-heading);">${t}</h2>` : ''}
          ${c.subtitle ? `<p style="text-align:center;color:var(--color-text-muted);margin-bottom:16px;">${c.subtitle}</p>` : ''}
          ${c.badge ? `<div style="text-align:center;margin-bottom:32px;"><span style="background:var(--color-primary-light,#e8f5ee);color:var(--color-primary);padding:6px 16px;border-radius:999px;font-size:0.85rem;font-weight:500;">${c.badge.text || ''}</span></div>` : ''}
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
            ${(c.items || []).map((it: any) => `
              <div class="tidum-panel" style="display:flex;align-items:center;gap:14px;padding:20px;border-radius:12px;">
                <span style="font-size:1.2rem;color:var(--color-primary);">🏆</span>
                <div>
                  <strong style="font-size:0.95rem;">${it.title || ''}</strong>
                  <p style="color:var(--color-text-muted);font-size:0.85rem;margin-top:2px;">${it.detail || ''}</p>
                </div>
              </div>
            `).join('')}
          </div>
        </div>`;

    // Contact Info Cards
    case 'tidum-contact-info':
      return `
        <div style="max-width:600px;margin:0 auto;">
          ${t ? `<h2 style="font-size:1.5rem;font-weight:700;margin-bottom:24px;color:var(--color-heading);">${t}</h2>` : ''}
          ${(c.items || []).map((it: any) => `
            <div class="tidum-panel" style="display:flex;align-items:center;gap:16px;padding:16px 20px;border-radius:12px;margin-bottom:12px;">
              <span style="font-size:1.3rem;">📬</span>
              <div>
                <div style="font-size:0.8rem;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.5px;">${it.label || ''}</div>
                ${it.href ? `<a href="${it.href}" style="font-weight:500;color:var(--color-primary);text-decoration:none;">${it.value || ''}</a>` : `<span style="font-weight:500;">${it.value || ''}</span>`}
              </div>
            </div>
          `).join('')}
          ${c.footerText ? `<p style="margin-top:20px;color:var(--color-text-muted);font-size:0.9rem;">${c.footerText}</p>` : ''}
        </div>`;

    // Guide Feature (icon + story)
    case 'tidum-guide-feature':
      return `
        <div style="max-width:800px;margin:0 auto;">
          <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px;">
            ${c.iconBg ? `<div style="width:48px;height:48px;border-radius:12px;background:${c.iconBg};display:flex;align-items:center;justify-content:center;"><span style="color:${c.iconColor || 'var(--color-primary)'};font-size:1.3rem;">⏱️</span></div>` : ''}
            <div>
              <h2 style="font-size:1.5rem;font-weight:700;color:var(--color-heading);">${t}</h2>
              ${c.subtitle ? `<p style="color:var(--color-text-muted);font-size:0.9rem;">${c.subtitle}</p>` : ''}
            </div>
          </div>
          ${c.storyEmoji || c.storyTitle ? `
            <div class="tidum-panel" style="padding:24px;border-radius:16px;display:flex;gap:16px;align-items:start;">
              ${c.storyEmoji ? `<span style="font-size:2rem;">${c.storyEmoji}</span>` : ''}
              <div>
                <h3 style="font-weight:600;font-size:1.05rem;margin-bottom:8px;">${c.storyTitle || ''}</h3>
                <p style="color:var(--color-text-muted);font-size:0.9rem;line-height:1.6;">${c.storyDescription || ''}</p>
              </div>
            </div>
          ` : ''}
        </div>`;

    // Best Practices Grid
    case 'tidum-best-practices':
      return `
        <div style="max-width:1000px;margin:0 auto;">
          ${t ? `<h2 style="font-size:1.75rem;font-weight:700;text-align:center;margin-bottom:32px;color:var(--color-heading);">${t}</h2>` : ''}
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px;">
            ${(c.practices || []).map((p: any) => `
              <div class="tidum-panel" style="padding:24px;border-radius:12px;">
                <span style="font-size:1.5rem;display:block;margin-bottom:10px;">${p.emoji || ''}</span>
                <h3 style="font-weight:600;font-size:1.05rem;margin-bottom:8px;">${p.title || ''}</h3>
                <p style="color:var(--color-text-muted);font-size:0.9rem;line-height:1.5;">${p.description || ''}</p>
              </div>
            `).join('')}
          </div>
        </div>`;

    // Info Callout Box
    case 'tidum-info-callout': {
      const variants: any = c.variants || {};
      const v = variants[c.variant || 'info'] || { borderColor: '#1F6B73', bgColor: '#E7F3EE', iconColor: '#1F6B73' };
      return `
        <div style="max-width:800px;margin:0 auto;">
          <div style="display:flex;align-items:start;gap:14px;padding:20px;border-radius:12px;background:${v.bgColor};border-left:4px solid ${v.borderColor};">
            <span style="color:${v.iconColor};font-size:1.3rem;flex-shrink:0;">ℹ</span>
            <div style="font-size:0.95rem;line-height:1.6;color:#1a1a1a;">${c.text || ''}</div>
          </div>
        </div>`;
    }

    // Default fallback
    default:
      if (section.type === 'hero') {
        return `
          <div style="text-align:center;max-width:800px;margin:0 auto;">
            <h1 class="tidum-title">${t}</h1>
            ${c.subtitle ? `<p class="tidum-text" style="margin-top:16px;">${c.subtitle}</p>` : ''}
          </div>`;
      }
      if (section.type === 'features') {
        return `
          <div style="max-width:1200px;margin:0 auto;">
            <h2 style="font-size:1.75rem;font-weight:600;text-align:center;color:var(--color-heading);margin-bottom:24px;">${t}</h2>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px;">
              ${(c.features || c.items || []).map((f: any) => `
                <div class="tidum-panel" style="padding:24px;border-radius:12px;">
                  <h3 style="font-weight:600;">${f.title || f.name || ''}</h3>
                  <p style="color:var(--color-text-muted);margin-top:8px;">${f.description || f.desc || ''}</p>
                </div>
              `).join('')}
            </div>
          </div>`;
      }
      return `<div style="max-width:800px;margin:0 auto;"><h2 style="font-size:1.5rem;font-weight:600;color:var(--color-heading);">${t}</h2>${c.body || c.html || c.text || ''}</div>`;
  }
}

function renderSection(section: any): string {
  const bg = section.background || {};
  const sp = section.spacing || {};
  const bgStyle = [
    bg.gradient ? `background:${bg.gradient};` : '',
    bg.color && !bg.gradient ? `background-color:${bg.color};` : '',
    bg.image ? `background-image:url('${bg.image}');background-size:cover;background-position:center;` : '',
  ].join('');

  // New design properties
  const textColor = section.textColor ? `color:${section.textColor};` : '';
  const borderRadius = section.borderRadius ? `border-radius:${section.borderRadius}px;` : '';
  const borderWidth = section.borderWidth ? `border:${section.borderWidth}px solid ${section.borderColor || '#e5e7eb'};` : '';
  const boxShadow = section.boxShadow ? `box-shadow:${section.boxShadow};` : '';
  const overlayHtml = bg.overlay ? `<div style="position:absolute;inset:0;background:${bg.overlay};pointer-events:none;${section.borderRadius ? `border-radius:${section.borderRadius}px;` : ''}"></div>` : '';

  const customCss = section.customCss || '';

  // Scroll-based animation attributes
  const anim = section.animations || {};
  const animAttrs = anim.enabled ? `data-anim-type="${anim.type || 'fade'}" data-anim-duration="${anim.duration || 500}" data-anim-delay="${anim.delay || 0}" data-anim-trigger="${anim.trigger || 'scroll'}" data-anim-offset="${anim.scrollOffset || 15}"` : '';

  return `
    <section 
      style="position:relative;padding:${sp.paddingTop || 0}px ${sp.paddingX || 0}px ${sp.paddingBottom || 0}px;${bgStyle}${textColor}${borderRadius}${borderWidth}${boxShadow}"
      class="tidum-section tidum-fade-up"
      ${section.id ? `id="${section.id}"` : ''}
      ${animAttrs}
    >
      ${overlayHtml}
      ${customCss ? `<style>${customCss}</style>` : ''}
      <div style="position:relative;z-index:1;">
        ${renderSectionContent(section)}
      </div>
    </section>
  `;
}

// ── Main Page Component ──────────────────────────────────────────────
export default function BuilderPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const containerRef = useRef<HTMLDivElement>(null);
  const trackSent = useRef(false);
  const startTime = useRef(Date.now());

  const { data: page, isLoading, error } = useQuery({
    queryKey: ['/api/cms/builder-pages/slug', slug],
    queryFn: async () => {
      const res = await fetch(`/api/cms/builder-pages/slug/${slug}`);
      if (!res.ok) throw new Error('Page not found');
      return res.json();
    },
    enabled: !!slug,
  });

  // Track page view
  useEffect(() => {
    if (page && !trackSent.current) {
      trackSent.current = true;
      const device = window.innerWidth < 768 ? 'mobile' : window.innerWidth < 1024 ? 'tablet' : 'desktop';
      fetch('/api/cms/page-analytics/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageId: page.id,
          pageSlug: page.slug,
          referrer: document.referrer,
          device,
        }),
      }).catch(() => {}); // fire and forget
    }
  }, [page]);

  // Track duration on unmount
  useEffect(() => {
    return () => {
      if (page && trackSent.current) {
        const duration = Math.round((Date.now() - startTime.current) / 1000);
        navigator.sendBeacon('/api/cms/page-analytics/track', JSON.stringify({
          pageId: page.id,
          pageSlug: page.slug,
          duration,
          device: window.innerWidth < 768 ? 'mobile' : window.innerWidth < 1024 ? 'tablet' : 'desktop',
        }));
      }
    };
  }, [page]);

  // Handle form submissions
  useEffect(() => {
    if (!containerRef.current || !page) return;

    const handleSubmit = async (e: Event) => {
      e.preventDefault();
      const form = e.target as HTMLFormElement;
      const formData = new FormData(form);
      const data: Record<string, string> = {};
      formData.forEach((value, key) => { data[key] = value.toString(); });

      try {
        await fetch('/api/cms/form-submissions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pageId: page.id,
            pageSlug: page.slug,
            formName: form.classList.contains('builder-newsletter-form') ? 'newsletter' : 'contact',
            data,
          }),
        });
        form.reset();
        const msg = document.createElement('div');
        msg.textContent = 'Takk! Vi har mottatt din melding.';
        msg.style.cssText = 'padding:12px;background:#E7F3EE;color:#1F6B73;border-radius:8px;text-align:center;margin-top:12px;font-weight:500;';
        form.parentNode?.insertBefore(msg, form.nextSibling);
        setTimeout(() => msg.remove(), 5000);
      } catch {
        alert('Noe gikk galt. Prøv igjen.');
      }
    };

    const forms = containerRef.current.querySelectorAll('form');
    forms.forEach(form => form.addEventListener('submit', handleSubmit));
    return () => {
      forms.forEach(form => form.removeEventListener('submit', handleSubmit));
    };
  }, [page]);

  // Set SEO meta tags via useSEO hook
  useSEO({
    title: page ? (page.metaTitle || page.title || "Tidum") : "Tidum",
    description: page?.metaDescription || undefined,
    ogTitle: page?.metaTitle || page?.title || undefined,
    ogDescription: page?.metaDescription || undefined,
    ogImage: page?.ogImage || undefined,
    canonical: page?.canonicalUrl || undefined,
    twitterCard: page?.ogImage ? "summary_large_image" : "summary",
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#FAFAF8]">
        <Loader2 className="h-8 w-8 animate-spin text-[#1F6B73]" />
      </div>
    );
  }

  if (error || !page) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#FAFAF8] text-center">
        <h1 className="text-4xl font-bold text-[#0E4852] mb-4">404</h1>
        <p className="text-[#5F6B6D]">Siden ble ikke funnet.</p>
        <a href="/" className="mt-4 text-[#1F6B73] underline">Gå til forsiden</a>
      </div>
    );
  }

  // Apply theme CSS vars
  const theme: any = {};
  if (page.themeKey) {
    const THEMES: Record<string, any> = {
      'tidum-standard': { primary: '#1F6B73', bg: '#FAFAF8', bgSection: '#F1F1ED', heading: '#0E4852', border: '#E1E4E3' },
      'tidum-ocean': { primary: '#1A5276', bg: '#F5F9FC', bgSection: '#E8F0F8', heading: '#0B3D5B', border: '#D0DDE8' },
      'tidum-forest': { primary: '#2D5016', bg: '#F8FAF5', bgSection: '#EFF3E8', heading: '#1A3A0A', border: '#D5E0C8' },
      'tidum-sunset': { primary: '#A0522D', bg: '#FDFAF7', bgSection: '#F5EDE4', heading: '#6B3A1F', border: '#E8D8C8' },
      'tidum-night': { primary: '#3B82F6', bg: '#0F172A', bgSection: '#1E293B', heading: '#E2E8F0', border: '#334155' },
      'tidum-lavender': { primary: '#7C3AED', bg: '#FAF5FF', bgSection: '#F3E8FF', heading: '#4C1D95', border: '#DDD6FE' },
    };
    Object.assign(theme, THEMES[page.themeKey] || {});
  }

  const sections = (page.sections || []) as any[];
  const globalHeader = page.globalHeader as any;
  const globalFooter = page.globalFooter as any;

  const headerHtml = globalHeader ? renderSectionContent({ content: globalHeader, templateId: 'tidum-header-bar', title: '' }) : '';
  const footerHtml = globalFooter ? renderSectionContent({ content: globalFooter, templateId: 'tidum-footer-full', title: '' }) : '';
  const sectionsHtml = sections.map(renderSection).join('');

  const themeVars = theme.primary ? `
    .tidum-page {
      --color-primary: ${theme.primary};
      --color-bg-main: ${theme.bg};
      --color-bg-section: ${theme.bgSection};
      --color-heading: ${theme.heading};
      --color-border: ${theme.border};
    }
  ` : '';

  return (
    <div ref={containerRef}>
      <style dangerouslySetInnerHTML={{ __html: tidumPageStyles + themeVars + (page.customCss || '') }} />
      <main
        className="tidum-page"
        dangerouslySetInnerHTML={{
          __html: `
            ${headerHtml ? `<header style="padding:16px 24px;border-bottom:1px solid var(--color-border);">${headerHtml}</header>` : ''}
            ${sectionsHtml}
            ${footerHtml ? `<footer style="padding:32px 24px;border-top:1px solid var(--color-border);">${footerHtml}</footer>` : ''}
          `
        }}
      />
      <script dangerouslySetInnerHTML={{ __html: tidumScrollAnimScript }} />
    </div>
  );
}
