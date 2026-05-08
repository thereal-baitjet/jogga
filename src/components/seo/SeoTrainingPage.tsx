import React from 'react';
import { ArrowRight, Check, Dumbbell, Home, Route, ShieldCheck, Sparkles } from 'lucide-react';
import { SEO_PAGES, SeoPageContent, SITE_URL } from './seoPages';

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

function useSeoMetadata(page: SeoPageContent) {
  React.useEffect(() => {
    const canonicalUrl = `${SITE_URL}${page.path}`;

    document.title = page.title;
    upsertMeta('meta[name="description"]', { name: 'description', content: page.description });
    upsertMeta('meta[property="og:title"]', { property: 'og:title', content: page.title });
    upsertMeta('meta[property="og:description"]', { property: 'og:description', content: page.description });
    upsertMeta('meta[property="og:type"]', { property: 'og:type', content: 'website' });
    upsertMeta('meta[property="og:url"]', { property: 'og:url', content: canonicalUrl });
    upsertMeta('meta[property="og:site_name"]', { property: 'og:site_name', content: 'Jogga' });
    upsertMeta('meta[property="og:image"]', { property: 'og:image', content: `${SITE_URL}/mainLogo.png` });
    upsertMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary_large_image' });
    upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: page.title });
    upsertMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: page.description });

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
      isPartOf: {
        '@type': 'WebSite',
        name: 'Jogga',
        url: SITE_URL,
      },
      about: {
        '@type': 'Thing',
        name: page.primaryKeyword,
      },
      potentialAction: {
        '@type': 'Action',
        name: page.cta,
        target: `${SITE_URL}/#start`,
      },
      breadcrumb: {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Jogga',
            item: SITE_URL,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: page.h1,
            item: canonicalUrl,
          },
        ],
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

function StartPlanCta({ label, source }: { label: string; source: string }) {
  return (
    <a
      href={`/?source=${encodeURIComponent(source)}#start`}
      className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-zinc-100 px-6 py-4 text-sm font-bold text-zinc-950 shadow-xl shadow-black/30 transition hover:bg-white active:scale-95 sm:w-auto"
    >
      {label}
      <ArrowRight size={18} />
    </a>
  );
}

function SeoFooter() {
  const footerLinks = [
    { label: 'AI Running Coach', href: '/ai-running-coach' },
    { label: 'Training Plans', href: '/5k-training-plan' },
    { label: 'Beginner Running', href: '/beginner-running-plan' },
    { label: '5K / 10K / Marathon', href: '/10k-training-plan' },
    { label: 'Privacy', href: '/#privacy' },
    { label: 'Terms', href: '/#terms' },
  ];

  return (
    <footer className="border-t border-zinc-800 bg-zinc-950 px-5 py-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <a href="/" className="flex items-center gap-3">
          <img src="/app-icon-logo.png" alt="Jogga" className="h-9 w-9 object-contain" />
          <span className="text-sm font-semibold text-zinc-100">Jogga</span>
        </a>
        <nav aria-label="Jogga footer" className="grid gap-3 text-sm text-zinc-500 sm:grid-cols-2 md:flex md:flex-wrap md:justify-end">
          {footerLinks.map((link) => (
            <a key={link.label} href={link.href} className="transition hover:text-zinc-100">
              {link.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}

export function SeoTrainingPage({ page }: { page: SeoPageContent }) {
  useSeoMetadata(page);

  const relatedPages = SEO_PAGES.filter((relatedPage) => relatedPage.path !== page.path);

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
        <section className="mx-auto grid min-h-[calc(100dvh-73px)] max-w-6xl content-center gap-10 px-5 py-12 lg:grid-cols-[1fr_0.78fr] lg:py-16">
          <div className="space-y-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-yellow-400/30 bg-yellow-400/10 px-3 py-2 text-xs font-bold uppercase tracking-widest text-yellow-100">
              <Sparkles size={14} />
              {page.eyebrow}
            </div>
            <div className="space-y-5">
              <h1 className="max-w-3xl text-5xl font-light leading-[1.02] tracking-tight text-zinc-50 md:text-7xl">
                {page.h1}
              </h1>
              <p className="max-w-2xl text-xl leading-8 text-zinc-300 md:text-2xl">
                {page.intro}
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <StartPlanCta label={page.cta} source={page.path.slice(1)} />
              <a
                href="/"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-zinc-700 px-6 py-4 text-sm font-bold text-zinc-100 transition hover:border-zinc-500 hover:bg-zinc-900"
              >
                <Home size={18} />
                Back to Jogga
              </a>
            </div>
          </div>

          <aside className="grid gap-3 self-center">
            {[
              'Adaptive plan generation',
              'GPS-based run feedback',
              'Readiness-aware training',
              'Beginner to marathon support',
            ].map((item) => (
              <div key={item} className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/70 p-4">
                <Check size={18} className="shrink-0 text-green-300" />
                <span className="text-sm text-zinc-300">{item}</span>
              </div>
            ))}
          </aside>
        </section>

        <section className="border-y border-zinc-800 bg-zinc-900/35">
          <div className="mx-auto grid max-w-6xl gap-4 px-5 py-8 md:grid-cols-3">
            {[
              { icon: Route, label: 'Personalized', body: 'Training starts from your goal, schedule, experience, and mileage.' },
              { icon: ShieldCheck, label: 'Recovery aware', body: 'Jogga keeps rest and readiness part of the plan.' },
              { icon: Dumbbell, label: 'Built for consistency', body: 'The next workout stays clear even when your week changes.' },
            ].map(({ icon: Icon, label, body }) => (
              <div key={label} className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-5">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100 text-zinc-950">
                  <Icon size={20} />
                </div>
                <h2 className="text-base font-semibold text-zinc-50">{label}</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-400">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-5 py-12 md:py-16">
          <div className="space-y-8">
            {page.sections.map((section) => (
              <section key={section.heading} className="border-b border-zinc-800 pb-8">
                <h2 className="text-2xl font-light leading-tight text-zinc-50 md:text-3xl">
                  {section.heading}
                </h2>
                <p className="mt-4 text-base leading-8 text-zinc-300">{section.body}</p>
              </section>
            ))}
          </div>
        </section>

        <section className="border-y border-zinc-800 bg-zinc-900/35 px-5 py-12">
          <div className="mx-auto max-w-6xl">
            <div className="mb-6 flex items-center justify-between gap-4">
              <h2 className="text-2xl font-light text-zinc-50">Related Training Guides</h2>
              <a href="/" className="hidden text-sm font-semibold text-zinc-400 transition hover:text-zinc-100 sm:inline">
                Jogga home
              </a>
            </div>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {relatedPages.map((relatedPage) => (
                <a
                  key={relatedPage.path}
                  href={relatedPage.path}
                  className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-5 transition hover:border-zinc-600 hover:bg-zinc-900"
                >
                  <div className="text-xs font-bold uppercase tracking-widest text-yellow-100">{relatedPage.eyebrow}</div>
                  <div className="mt-3 text-lg font-semibold text-zinc-50">{relatedPage.h1}</div>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">{relatedPage.description}</p>
                </a>
              ))}
            </div>
          </div>
        </section>

        <section className="px-5 py-12">
          <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-5 rounded-lg border border-yellow-400/25 bg-yellow-400/10 p-6 md:flex-row md:items-center md:p-8">
            <div>
              <h2 className="text-2xl font-light text-zinc-50">Start with a personalized plan.</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-300">
                Create your Jogga profile and let the app build the training plan around your goal.
              </p>
            </div>
            <StartPlanCta label="Start Your Plan" source={`${page.path.slice(1)}-footer`} />
          </div>
        </section>
      </main>

      <SeoFooter />
    </div>
  );
}
