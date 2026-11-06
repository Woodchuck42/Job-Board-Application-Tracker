// Extracts job posting data from any job application page.
// Priority: JSON-LD structured data → platform selectors → DOM sections → text patterns.

// ── JSON-LD (schema.org/JobPosting) ─────────────────────────────────────────
function getJobPosting() {
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(script.textContent);
      const nodes = [].concat(data?.['@graph'] || data);
      const job = nodes.find(n => n?.['@type'] === 'JobPosting');
      if (job) return job;
    } catch (_) {}
  }
  return null;
}

// ── Description element ───────────────────────────────────────────────────────
function getDescriptionEl(jsonLd) {
  // If JSON-LD has an HTML description, parse it into a temp container
  if (jsonLd?.description && /<[a-z]/i.test(jsonLd.description)) {
    const div = document.createElement('div');
    div.innerHTML = jsonLd.description;
    return div;
  }

  const selectors = [
    '[data-qa="job-description"]',
    '[data-automation-id="job-posting-details"]',
    '.job-description',
    '.posting-description',
    '#job-description',
    '#jobDescriptionText',
    '.jobsearch-jobDescriptionText',
    '.description__text',
    '[class*="jobDescription"]',
    '[class*="job-desc"]',
    'main',
    '[role="main"]',
  ];

  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && (el.innerText || el.textContent || '').trim().length > 100) return el;
  }

  return document.body;
}

function getDescriptionText(descEl, jsonLd) {
  // Plain text fallback from JSON-LD
  if (jsonLd?.description && !/<[a-z]/i.test(jsonLd.description)) {
    return jsonLd.description.replace(/[ \t]{2,}/g, ' ').trim();
  }
  return (descEl.innerText || descEl.textContent || '').replace(/[ \t]{2,}/g, ' ').trim();
}

// ── DOM section extraction ────────────────────────────────────────────────────
// Finds a section whose heading text matches one of the given keywords,
// then returns the text content of the elements that follow until the next heading.
function extractSectionByHeading(root, keywords) {
  // Candidates for section headings: h-tags and lone strong/b inside p or div
  const candidates = root.querySelectorAll(
    'h1,h2,h3,h4,h5,h6,p>strong:only-child,p>b:only-child,div>strong:only-child,li>strong:only-child'
  );

  for (const el of candidates) {
    const label = (el.textContent || '').toLowerCase().trim().replace(/[:\s]+$/, '');
    if (!keywords.some(kw => label === kw || label.startsWith(kw + ' ') || label.endsWith(' ' + kw))) {
      continue;
    }

    // The anchor is the heading itself (h-tag) or its parent p/div
    const anchor = /^H\d$/.test(el.tagName) ? el : (el.closest('p,div,li') || el);

    const content = collectAfter(anchor, root);
    if (content.length >= 30) return content.slice(0, 600);
  }

  return '';
}

// Collects text from siblings after `anchor` until the next heading-like element.
// If nothing useful is found at the sibling level, walks up one level and tries again.
function collectAfter(anchor, root) {
  for (let node = anchor; node && node !== root; node = node.parentElement) {
    let text = '';
    let sib = node.nextElementSibling;
    let count = 0;

    while (sib && count < 25) {
      if (isHeadingLike(sib)) break;
      const t = (sib.innerText || sib.textContent || '').trim();
      if (t) text += t + '\n';
      sib = sib.nextElementSibling;
      count++;
    }

    if (text.trim().length >= 30) return text.trim();
  }
  return '';
}

function isHeadingLike(el) {
  if (/^H[1-6]$/.test(el.tagName)) return true;
  // A <p> or <div> whose only child is a <strong>/<b> with short text
  if (['P', 'DIV'].includes(el.tagName)) {
    const children = [...el.children];
    if (children.length === 1 && ['STRONG', 'B'].includes(children[0].tagName)) {
      return (children[0].textContent || '').trim().length < 120;
    }
  }
  return false;
}

// ── Platform-specific selectors ──────────────────────────────────────────────
function platformExtract() {
  const h = window.location.hostname;
  const r = {};

  if (h.includes('greenhouse.io')) {
    r.company  = document.querySelector('.company-name, #header .company-name')?.innerText?.trim();
    r.location = document.querySelector('.location, #header .location')?.innerText?.trim();
  }
  if (h.includes('lever.co')) {
    r.company  = document.querySelector('.main-header-name')?.innerText?.trim();
    r.location = document.querySelector('.sort-by-time li, .posting-categories .sort-by-time')?.innerText?.trim();
  }
  if (h.includes('linkedin.com')) {
    r.company  = document.querySelector(
      '.job-details-jobs-unified-top-card__company-name, .topcard__org-name-link'
    )?.innerText?.trim();
    r.location = document.querySelector(
      '.job-details-jobs-unified-top-card__bullet, .topcard__flavor--bullet'
    )?.innerText?.trim();
  }
  if (h.includes('indeed.com')) {
    r.company  = document.querySelector('[data-company-name]')?.innerText?.trim()
                 || document.querySelector('[class*="CompanyInfo"] [class*="companyName"]')?.innerText?.trim();
    r.location = document.querySelector('[data-testid="job-location"]')?.innerText?.trim();
  }
  if (h.includes('workday.com') || h.includes('myworkdayjobs.com')) {
    r.company  = document.querySelector('[data-automation-id="company"]')?.innerText?.trim();
    r.location = document.querySelector('[data-automation-id="locations"]')?.innerText?.trim();
  }
  if (h.includes('ashbyhq.com') || h.includes('jobs.ashby.io')) {
    r.company  = document.querySelector('[class*="company-name"],[class*="CompanyName"]')?.innerText?.trim();
    r.location = document.querySelector('[class*="location"],[class*="Location"]')?.innerText?.trim();
  }
  if (h.includes('smartrecruiters.com')) {
    r.company  = document.querySelector('[itemprop="hiringOrganization"] .name, .company-name')?.innerText?.trim();
    r.location = document.querySelector('[itemprop="jobLocation"], .job-detail__location')?.innerText?.trim();
  }
  if (h.includes('jobvite.com')) {
    r.company  = document.querySelector('.jv-company-name, .company-name')?.innerText?.trim();
    r.location = document.querySelector('.jv-job-location, [class*="location"]')?.innerText?.trim();
  }

  Object.keys(r).forEach(k => { if (!r[k]) delete r[k]; });
  return r;
}

// ── Field extractors ─────────────────────────────────────────────────────────
function extractTitle(jsonLd) {
  if (jsonLd?.title) return jsonLd.title.trim();

  const h1 = document.querySelector('h1');
  if (h1) {
    const t = (h1.innerText || h1.textContent || '').trim();
    if (t && t.length < 200) return t;
  }

  const og = document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';
  if (og) return og.split(/\s*[|\-–]\s*/)[0].trim();

  return document.title.split(/\s*[|\-–]\s*/)[0].trim();
}

function extractCompany(jsonLd, platform, text) {
  if (jsonLd?.hiringOrganization?.name) return jsonLd.hiringOrganization.name.trim();
  if (platform.company) return platform.company;

  const og = document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';
  const atMatch = og.match(/\bat\s+(.+)$/i);
  if (atMatch) return atMatch[1].split(/[|\-–]/)[0].trim();

  const siteName = document.querySelector('meta[property="og:site_name"]')?.getAttribute('content') || '';
  if (siteName && !/indeed|linkedin|glassdoor|greenhouse|lever|workday|ziprecruiter|smartrecruiters|jobvite|icims|ashby/i.test(siteName)) {
    return siteName.trim();
  }

  const parts = document.title.split(/\s*[|\-–]\s*/);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1]
      .replace(/\s*(jobs?|careers?|job board|hiring|apply now)\s*/i, '').trim();
    if (last && last !== parts[0].trim()) return last;
  }

  if (text) return extractCompanyFromText(text);

  return '';
}

function extractCompanyFromText(text) {
  const genericWords = /^(us|our|the|this|we|you|team|company|role|position|job|organization|firm|startup|client)$/i;

  function isValidCandidate(s) {
    const words = s.trim().split(/\s+/);
    if (words.length < 1 || words.length > 6) return false;
    if (genericWords.test(s.trim())) return false;
    if (/\b(us|our|the|this|we|you|team|company|role|position|job)\b/i.test(s) && words.length <= 2) return false;
    return true;
  }

  // "About [CompanyName]" as a standalone heading line
  const aboutHeading = text.match(/^(?:about|overview)\s+([A-Z][A-Za-z0-9](?:[A-Za-z0-9 &.,'-]{0,50}[A-Za-z0-9])?)\s*$/im);
  if (aboutHeading && isValidCandidate(aboutHeading[1])) return aboutHeading[1].trim();

  // "at [CompanyName], we" — strong signal
  const atWe = text.match(/\bat\s+([A-Z][A-Za-z0-9](?:[A-Za-z0-9 &.,'-]{0,40}[A-Za-z0-9])?),\s+we\b/);
  if (atWe && isValidCandidate(atWe[1])) return atWe[1].trim();

  // "[CompanyName] is a/an" at the start of a paragraph
  const isA = text.match(/(?:^|\n)([A-Z][A-Za-z0-9](?:[A-Za-z0-9 &.,'-]{0,40}[A-Za-z0-9])?)\s+is\s+(?:a|an)\s+/m);
  if (isA && isValidCandidate(isA[1])) return isA[1].trim();

  // "join/joining [CompanyName]"
  const join = text.match(/\bjoining?\s+([A-Z][A-Za-z0-9](?:[A-Za-z0-9 &.,'-]{0,40}[A-Za-z0-9])?)\b/);
  if (join && isValidCandidate(join[1])) return join[1].trim();

  return '';
}

function extractLocation(jsonLd, platform, text) {
  if (jsonLd?.jobLocationType === 'TELECOMMUTE') return 'Remote';
  if (jsonLd?.jobLocation) {
    const loc = [].concat(jsonLd.jobLocation)[0];
    if (loc?.['@type'] === 'VirtualLocation') return 'Remote';
    const addr = loc?.address;
    if (typeof addr === 'string') return addr.trim();
    if (addr) return [addr.addressLocality, addr.addressRegion].filter(Boolean).join(', ');
  }

  if (platform.location) return platform.location;

  const remoteMatch = text.match(
    /\b(fully\s+remote|remote[- ]first|remote,?\s+(?:US|USA|United\s+States)|work\s+from\s+(?:home|anywhere))\b/i
  );
  if (remoteMatch) return remoteMatch[1].trim();

  const cityMatch = text.match(
    /\b([A-Z][a-zA-Z .]+,\s*[A-Z]{2}(?:\s*[-–\/]\s*(?:Remote|Hybrid|On-?[Ss]ite))?)\b/
  );
  if (cityMatch) return cityMatch[1].trim();

  const labelMatch = text.match(/\blocation[:\s]+([^\n]{4,60})/i);
  if (labelMatch) return labelMatch[1].trim();

  return '';
}

function extractSalary(jsonLd, text) {
  if (jsonLd?.baseSalary) {
    const val = jsonLd.baseSalary?.value;
    if (val?.minValue && val?.maxValue) {
      return `$${Number(val.minValue).toLocaleString()} – $${Number(val.maxValue).toLocaleString()}`;
    }
    if (val?.value) return `$${Number(val.value).toLocaleString()}`;
  }

  const patterns = [
    /(\$[\d,]+(?:\.\d+)?[KkMm]?\s*[-–to]+\s*\$[\d,]+(?:\.\d+)?[KkMm]?(?:\s*(?:\/yr|\/year|per\s+year|annually|USD))?)/i,
    /(\$[\d,.]+\s*[-–]\s*\$[\d,.]+\s*(?:\/hr|\/hour|per\s+hour))/i,
    /(?:salary|compensation|pay|base)[:\s]+(\$[\d,KkMm\s\-–]+(?:\/yr|\/year|annually|per\s+year)?)/i,
    /(OTE[:\s]+\$[\d,KkMm\s\-–]+)/i,
  ];

  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) return (m[1] || m[0]).trim();
  }

  return '';
}

// ATS/recruitment-partner widget boilerplate that should never appear as content
function isBoilerplate(t) {
  return /(?:looking\s+for\s+(?:other\s+)?opportunities\s+with|visit\s+our\s+(?:recruitment\s+partner|career\s+page)|recruitment\s+partner\s+career\s+page|this\s+role\s+is\s+managed\s+by|apply\s+via\s+our\s+(?:recruitment\s+partner|career)|powered\s+by\s+(?:greenhouse|lever|ashby|workday|icims|smartrecruiters))/i.test(t);
}

function extractAboutUs(descEl, text) {
  const domResult = extractSectionByHeading(descEl, [
    'about us', 'about the company', 'about the role', 'who we are',
    'company overview', 'company description', 'our story', 'the company',
    'company background', 'about our company',
  ]);
  if (domResult && !isBoilerplate(domResult)) return domResult;

  // Text regex fallback — allow flexible whitespace between heading and content
  const pat = /\babout\s+(?:us|the\s+company|our\s+company|[a-z][a-z0-9 ]{1,40})\s*:?\s*([\s\S]{80,800}?)(?=\n[\s\S]{0,60}\n|\bresponsib|\brequire|\bqualific|\bwhat\s+you|\byou\s+will|\bthe\s+role|$)/i;
  const m = text.match(pat);
  if (m && !isBoilerplate(m[1])) return m[1].trim().slice(0, 600);

  // Last resort: first substantial paragraph(s) before responsibilities/requirements begin
  const stopWords = /\b(responsibilit|requirement|qualificat|what you.ll|you will|the role|your role|duties|essential function)/i;
  const paras = [...descEl.querySelectorAll('p, li')];
  let collected = '';
  for (const el of paras) {
    const t = (el.innerText || el.textContent || '').trim();
    if (!t || t.length < 20) continue;
    if (stopWords.test(t)) break;
    if (isBoilerplate(t)) continue;
    if (collected.length + t.length > 600) break;
    collected += t + '\n';
  }
  return collected.trim();
}

function extractBenefits(descEl, text) {
  const domResult = extractSectionByHeading(descEl, [
    'benefits', 'perks', 'perks & benefits', 'perks and benefits',
    'what we offer', 'we offer', 'total rewards', 'compensation',
    'compensation and benefits', 'compensation & benefits',
    'why join us', 'why work with us', 'what you get',
  ]);
  if (domResult) return domResult;

  const pat = /(?:benefits?|perks?|what\s+we\s+offer|total\s+rewards?|compensation)\s*:?\s*([\s\S]{40,600}?)(?=\n[\s\S]{0,60}\n|\bresponsib|\brequire|\bqualific|$)/i;
  const m = text.match(pat);
  if (m) return m[1].trim().replace(/\n{3,}/g, '\n').slice(0, 500);

  return '';
}

function detectManagementIC(text) {
  const mgmt = [
    /manage\s+(?:and\s+)?(?:lead|grow|build|scale|mentor|develop)\s+(?:a\s+)?team/i,
    /manag(?:e|ing)\s+(?:a\s+)?(?:small|large|growing|cross[- ]functional)?\s*team/i,
    /lead\s+(?:a\s+)?(?:team|group)\s+of/i,
    /\bdirect\s+reports\b/i,
    /people\s+manag(?:er|ement)/i,
    /(?:hire|recruit)\s+and\s+(?:manage|develop|mentor)/i,
    /reporting\s+(?:directly\s+)?to\s+you\b/i,
    /will\s+manage\s+\d/i,
    /\bteam\s+of\s+\d+\b/i,
    /\bsupervise\b/i,
    /\bperformance\s+reviews?\b/i,
  ];
  const ic = [
    /\bindividual\s+contributor\b/i,
    /not\s+a\s+(?:people\s+)?management\s+role/i,
    /no\s+direct\s+reports/i,
  ];

  const ms = mgmt.filter(p => p.test(text)).length;
  const is = ic.filter(p => p.test(text)).length;
  return ms > is ? 'Management' : 'IC';
}

// ── Main ─────────────────────────────────────────────────────────────────────
function extractJobData() {
  const jsonLd   = getJobPosting();
  const platform = platformExtract();
  const descEl   = getDescriptionEl(jsonLd);
  const descText = getDescriptionText(descEl, jsonLd);

  return {
    url:      window.location.href,
    title:    extractTitle(jsonLd),
    company:  extractCompany(jsonLd, platform, descText),
    type:     detectManagementIC(descText),
    aboutUs:  extractAboutUs(descEl, descText),
    location: extractLocation(jsonLd, platform, descText),
    salary:   extractSalary(jsonLd, descText),
    benefits: extractBenefits(descEl, descText),
  };
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'getJobData') sendResponse(extractJobData());
  return true;
});
