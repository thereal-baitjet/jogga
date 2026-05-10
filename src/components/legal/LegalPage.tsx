import React from 'react';
import { ArrowRight, Home, Scale, ShieldCheck } from 'lucide-react';
import {
  buildLegalCanonicalUrl,
  LEGAL_META_DESCRIPTION,
  LEGAL_META_TITLE,
  LEGAL_PAGES,
  LegalPageContent,
} from './legalPages';
import { SEO_PAGES, SITE_URL } from '../seo/seoPages';

function upsertMeta(selector: string, attributes: Record<string, string>) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);

  if (!element) {
    element = document.createElement('meta');
    document.head.appendChild(element);
  }

  Object.entries(attributes).forEach(([name, value]) => {
    element?.setAttribute(name, value);
  });
}

function useLegalMetadata(page: LegalPageContent) {
  React.useEffect(() => {
    const canonicalUrl = buildLegalCanonicalUrl(page);

    document.title = LEGAL_META_TITLE;
    upsertMeta('meta[name="description"]', { name: 'description', content: LEGAL_META_DESCRIPTION });
    upsertMeta('meta[property="og:title"]', { property: 'og:title', content: LEGAL_META_TITLE });
    upsertMeta('meta[property="og:description"]', { property: 'og:description', content: LEGAL_META_DESCRIPTION });
    upsertMeta('meta[property="og:type"]', { property: 'og:type', content: 'website' });
    upsertMeta('meta[property="og:url"]', { property: 'og:url', content: canonicalUrl });
    upsertMeta('meta[property="og:site_name"]', { property: 'og:site_name', content: 'Jogga' });
    upsertMeta('meta[property="og:image"]', { property: 'og:image', content: `${SITE_URL}/mainLogo.png` });
    upsertMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary_large_image' });
    upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: LEGAL_META_TITLE });
    upsertMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: LEGAL_META_DESCRIPTION });

    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = canonicalUrl;

    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: page.title,
      description: page.description,
      url: canonicalUrl,
      dateModified: page.updatedIso,
      isPartOf: {
        '@type': 'WebSite',
        name: 'Jogga',
        url: SITE_URL,
      },
      publisher: {
        '@type': 'Organization',
        name: 'Jogga',
        url: SITE_URL,
      },
    };

    let script = document.head.querySelector<HTMLScriptElement>('script[data-jogga-seo-jsonld="true"]');
    if (!script) {
      script = document.createElement('script');
      script.type = 'application/ld+json';
      script.dataset.joggaSeoJsonld = 'true';
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(jsonLd);
  }, [page]);
}

function LegalFooter() {
  const guideLinks = SEO_PAGES.slice(0, 4).map(page => ({ label: page.h1, href: page.path }));
  const legalLinks = LEGAL_PAGES.map(page => ({ label: page.h1, href: page.path }));

  return (
    <footer className="border-t border-zinc-800 bg-zinc-950 px-5 py-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <a href="/" className="flex items-center gap-3">
          <img src="/app-icon-logo.png" alt="Jogga" className="h-9 w-9 object-contain" />
          <span className="text-sm font-semibold text-zinc-100">Jogga</span>
        </a>
        <nav aria-label="Jogga legal footer" className="grid gap-3 text-sm text-zinc-500 sm:grid-cols-2 md:flex md:flex-wrap md:justify-end">
          {[...guideLinks, ...legalLinks].map((link) => (
            <a key={link.href} href={link.href} className="transition hover:text-zinc-100">
              {link.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}

export function LegalPage({ page }: { page: LegalPageContent }) {
  useLegalMetadata(page);

  const Icon = page.path === '/privacy' ? ShieldCheck : Scale;

  return (
    <div className="min-h-[100dvh] bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-20 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
          <a href="/" className="flex items-center gap-3">
            <img src="/app-icon-logo.png" alt="Jogga" className="h-10 w-10 object-contain" />
            <span className="text-lg font-semibold tracking-tight">Jogga</span>
          </a>
          <a
            href="/#start"
            className="inline-flex items-center gap-2 rounded-full bg-zinc-100 px-4 py-2 text-sm font-bold text-zinc-950 transition hover:bg-white active:scale-95"
          >
            Start
            <ArrowRight size={16} />
          </a>
        </div>
      </header>

      <main>
        <section className="border-b border-zinc-800 bg-zinc-900/30 px-5 py-12 md:py-16">
          <div className="mx-auto max-w-4xl space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-yellow-400/30 bg-yellow-400/10 px-3 py-2 text-xs font-bold uppercase tracking-widest text-yellow-100">
              <Icon size={14} />
              Legal
            </div>
            <div className="space-y-4">
              <h1 className="text-5xl font-light leading-tight tracking-tight text-zinc-50 md:text-7xl">
                {page.h1}
              </h1>
              <p className="max-w-3xl text-lg leading-8 text-zinc-300">
                {page.description}
              </p>
              <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                Last updated {page.updatedAt}
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <a
                href="/"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-zinc-700 px-6 py-4 text-sm font-bold text-zinc-100 transition hover:border-zinc-500 hover:bg-zinc-900"
              >
                <Home size={18} />
                Back to Jogga
              </a>
              {LEGAL_PAGES.filter(legalPage => legalPage.path !== page.path).map(legalPage => (
                <a
                  key={legalPage.path}
                  href={legalPage.path}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-zinc-100 px-6 py-4 text-sm font-bold text-zinc-950 transition hover:bg-white active:scale-95"
                >
                  {legalPage.h1}
                  <ArrowRight size={18} />
                </a>
              ))}
            </div>
          </div>
        </section>

        <section className="px-5 py-10 md:py-14">
          <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[240px_1fr]">
            <aside className="hidden lg:block">
              <nav className="sticky top-28 space-y-2 text-sm text-zinc-500" aria-label={`${page.h1} sections`}>
                {page.sections.map((section) => (
                  <a
                    key={section.heading}
                    href={`#${section.heading.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                    className="block rounded-lg px-3 py-2 transition hover:bg-zinc-900 hover:text-zinc-100"
                  >
                    {section.heading}
                  </a>
                ))}
              </nav>
            </aside>

            <div className="space-y-8">
              <div className="rounded-lg border border-yellow-400/20 bg-yellow-400/10 p-5">
                <p className="text-sm leading-6 text-yellow-50">
                  This page is an operational template for Jogga and should be reviewed by qualified counsel before launch or major traffic.
                </p>
              </div>

              {page.sections.map((section) => (
                <section
                  key={section.heading}
                  id={section.heading.toLowerCase().replace(/[^a-z0-9]+/g, '-')}
                  className="border-b border-zinc-800 pb-8"
                >
                  <h2 className="text-2xl font-light text-zinc-50 md:text-3xl">
                    {section.heading}
                  </h2>
                  <div className="mt-4 space-y-4">
                    {section.body.map((paragraph) => (
                      <p key={paragraph} className="text-sm leading-7 text-zinc-300 md:text-base md:leading-8">
                        {paragraph}
                      </p>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </section>
      </main>

      <LegalFooter />
    </div>
  );
}
