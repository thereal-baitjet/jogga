import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_META_DESCRIPTION, DEFAULT_META_TITLE, SEO_PAGES, SeoPageContent, SITE_URL } from '../src/components/seo/seoPages';

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function buildJsonLd(page: SeoPageContent) {
  const canonicalUrl = `${SITE_URL}${page.path}`;

  return {
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
}

function injectSeoHead(template: string, page: SeoPageContent) {
  const canonicalUrl = `${SITE_URL}${page.path}`;
  const title = escapeHtml(DEFAULT_META_TITLE);
  const description = escapeHtml(DEFAULT_META_DESCRIPTION);
  const canonical = escapeHtml(canonicalUrl);
  const image = `${SITE_URL}/mainLogo.png`;
  const jsonLd = safeJsonLd(buildJsonLd(page));

  const withTitle = template.replace(/<title>.*?<\/title>/, `<title>${title}</title>`);
  const withDescription = withTitle.replace(
    /<meta name="description" content=".*?" \/>/,
    `<meta name="description" content="${description}" />`,
  );

  const seoTags = [
    `<link rel="canonical" href="${canonical}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${canonical}" />`,
    `<meta property="og:site_name" content="Jogga" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<script type="application/ld+json" data-jogga-seo-jsonld="true">${jsonLd}</script>`,
  ].join('\n    ');

  return withDescription.replace('</head>', `    ${seoTags}\n  </head>`);
}

async function main() {
  const distDir = path.resolve(process.cwd(), 'dist');
  const template = await readFile(path.join(distDir, 'index.html'), 'utf8');

  await Promise.all(SEO_PAGES.map(async (page) => {
    const slug = page.path.replace(/^\//, '');
    const outputDir = path.join(distDir, slug);
    await mkdir(outputDir, { recursive: true });
    await writeFile(path.join(outputDir, 'index.html'), injectSeoHead(template, page));
  }));

  console.log(`Generated ${SEO_PAGES.length} SEO HTML pages.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
