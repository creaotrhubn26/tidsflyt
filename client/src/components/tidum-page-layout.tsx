/**
 * TidumPageLayout
 *
 * Reusable wrapper component that provides the standard Tidum marketing page
 * layout: tidum-page styles, hero panel with header, content area, and footer.
 *
 * Usage:
 *   <TidumPageLayout
 *     navLinks={[{ label: 'Forside', href: '/', icon: ClipboardList }]}
 *     ctaLabel="Be om demo"
 *     ctaHref="/kontakt"
 *   >
 *     {children}
 *   </TidumPageLayout>
 */

import { type ReactNode, type ComponentType } from 'react';
import { Link, useLocation } from 'wouter';
import { ArrowRight, CheckCircle2, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { tidumPageStyles } from '@/lib/tidum-page-styles';
import tidumWordmark from '@assets/tidum-wordmark.png';

export interface NavLink {
  label: string;
  href: string;
  icon?: ComponentType<{ className?: string }>;
}

export interface TidumPageLayoutProps {
  children: ReactNode;
  /** Links shown in the header nav (desktop). Default: Funksjoner link */
  navLinks?: NavLink[];
  /** Primary CTA button label. Default: "Be om demo" */
  ctaLabel?: string;
  /** Primary CTA href. Default: "/kontakt" */
  ctaHref?: string;
  /** Footer shortcut links. Default: Funksjoner, Hvorfor Tidum, Kontakt */
  footerLinks?: NavLink[];
  /** Extra trust badges in footer. Default: built-in Norwegian trust items */
  trustBadges?: string[];
  /** Whether to show the hero panel chrome (decorative blobs). Default: true */
  showHeroChrome?: boolean;
  /** Content placed inside the hero panel (below the header). */
  heroContent?: ReactNode;
  /** Whether to show the standard CTA section above footer. Default: true */
  showCta?: boolean;
  /** CTA heading. Default: "Klar for å gjøre arbeidstid enklere?" */
  ctaHeading?: string;
  /** CTA description. */
  ctaDescription?: string;
}

const DEFAULT_NAV_LINKS: NavLink[] = [];

const DEFAULT_FOOTER_LINKS: NavLink[] = [
  { label: 'Funksjoner', href: '/#funksjoner' },
  { label: 'Hvorfor Tidum?', href: '/hvorfor' },
  { label: 'Be om demo', href: '/kontakt' },
];

const DEFAULT_TRUST_BADGES = [
  'Bygget for norsk arbeidsliv',
  'Personvern først',
  'Klar for dokumentasjonskrav',
];

export default function TidumPageLayout({
  children,
  navLinks = DEFAULT_NAV_LINKS,
  ctaLabel = 'Be om demo',
  ctaHref = '/kontakt',
  footerLinks = DEFAULT_FOOTER_LINKS,
  trustBadges = DEFAULT_TRUST_BADGES,
  showHeroChrome = true,
  heroContent,
  showCta = true,
  ctaHeading = 'Klar for å gjøre arbeidstid enklere?',
  ctaDescription = 'Se hvordan Tidum kan passe deres arbeidshverdag uten unødvendig kompleksitet.',
}: TidumPageLayoutProps) {
  const [, navigate] = useLocation();

  return (
    <main className="tidum-page">
      <style>{tidumPageStyles}</style>

      <div className="rt-container pb-20 pt-8">
        {/* ── Hero Panel ── */}
        <section className="tidum-panel tidum-fade-up relative overflow-hidden rounded-[28px]">
          {showHeroChrome && (
            <>
              <div className="pointer-events-none absolute -left-16 top-[34%] h-36 w-96 rotate-[-14deg] rounded-[999px] bg-[rgba(131,171,145,0.2)]" />
              <div className="pointer-events-none absolute right-[-140px] top-14 h-80 w-[520px] rounded-[999px] bg-[rgba(194,205,195,0.24)]" />
            </>
          )}

          {/* Header */}
          <header className="relative z-10 flex items-center justify-between border-b border-[var(--color-border)] px-6 py-5 sm:px-8">
            <div className="flex items-center gap-3">
              <Link href="/">
                <img src={tidumWordmark} alt="Tidum" className="h-10 w-auto sm:h-11 cursor-pointer" />
              </Link>
            </div>
            <div className="flex items-center gap-4 sm:gap-6">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="hidden items-center gap-2 text-base text-[#26373C] transition-colors hover:text-[var(--color-primary)] sm:inline-flex"
                >
                  {link.icon && <link.icon className="h-4 w-4" />}
                  {link.label}
                </Link>
              ))}
              <Button
                onClick={() => navigate(ctaHref)}
                className="tidum-btn-primary inline-flex h-auto items-center px-6 py-3 text-base font-semibold"
              >
                {ctaLabel}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </header>

          {/* Hero Content (page-specific) */}
          {heroContent && (
            <div className="relative z-10 px-6 py-10 sm:px-8 sm:py-12">
              {heroContent}
            </div>
          )}
        </section>

        {/* ── Page Content ── */}
        {children}

        {/* ── CTA Section ── */}
        {showCta && (
          <section className="tidum-fade-up mt-12 rounded-3xl border border-[#1a5d65] bg-[var(--color-primary)] px-6 py-10 text-white sm:px-8">
            <h2 className="text-center text-[clamp(28px,4vw,42px)] font-semibold tracking-tight">
              {ctaHeading}
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-center text-white/85">
              {ctaDescription}
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <Button
                onClick={() => navigate(ctaHref)}
                className="h-auto rounded-xl bg-white px-6 py-3 text-[var(--color-primary)] hover:bg-white/90"
              >
                {ctaLabel}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate('/kontakt')}
                className="h-auto rounded-xl border-white/70 px-6 py-3 text-white hover:bg-white/10"
              >
                Ta kontakt
                <ChevronRight className="ml-1.5 h-4 w-4" />
              </Button>
            </div>
          </section>
        )}

        {/* ── Footer ── */}
        <footer className="tidum-fade-up mt-10 rounded-3xl border border-[var(--color-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(245,248,246,0.92))] px-6 py-8 sm:px-8">
          <div className="grid gap-8 md:grid-cols-[1.2fr,0.9fr,1fr]">
            <div>
              <img src={tidumWordmark} alt="Tidum" className="h-10 w-auto" />
              <p className="mt-4 max-w-md text-sm leading-relaxed text-[var(--color-text-muted)]">
                Arbeidstidssystem for felt, turnus og norsk dokumentasjonskrav.
              </p>
              <button
                type="button"
                onClick={() => navigate('/kontakt')}
                className="mt-3 text-sm font-medium text-[var(--color-primary)] transition-colors hover:text-[var(--color-primary-hover)]"
              >
                support@tidum.no
              </button>
            </div>

            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-[#35545B]">Snarveier</p>
              <div className="mt-3 grid gap-2 text-sm">
                {footerLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="inline-flex items-center gap-2 text-left text-[#2B3C41] transition-colors hover:text-[var(--color-primary)]"
                  >
                    <ChevronRight className="h-4 w-4" />
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-[#35545B]">Trygghet</p>
              <div className="mt-3 grid gap-2">
                {trustBadges.map((item) => (
                  <div key={item} className="inline-flex items-start gap-2 rounded-lg bg-white/75 px-3 py-2 text-sm text-[#2B3C41]">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-secondary)]" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-7 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border)] pt-4 text-xs text-[var(--color-text-muted)]">
            <p>&copy; {new Date().getFullYear()} Tidum. Alle rettigheter reservert.</p>
            <p>Enkel registrering. Trygg dokumentasjon. Full oversikt.</p>
          </div>
        </footer>
      </div>
    </main>
  );
}
