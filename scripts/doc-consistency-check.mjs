#!/usr/bin/env node
// Doc consistency regression checker.
// Verifies, against the live source tree, that every guide page:
//   1. code anchors (`packages/<pkg>/src/...:N` / `:N-M`) resolve to a real,
//      in-range, non-blank line in an existing file;
//   2. internal guide links (`/guides/<slug>/`, `./<slug>/`, `/en/...`) hit a real page;
//   3. GitHub blob links (`blob/main/<path>`) point at a file that exists locally;
//   4. heading anchors (`#...`) referenced in internal links exist on the target page;
//   5. carries no leaked work-tracking id / personal path / email / internal tooling name.
// Exit 0 only when every category is clean. Deterministic: sorted output, no timestamps.

/* eslint-disable no-console -- this is a standalone CLI reporter; stdout is its product */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const DOCS = join(ROOT, 'docs/src/content/docs');

/** Recursively collect every markdown file under a dir. */
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.md') || name.endsWith('.mdx')) out.push(p);
  }
  return out;
}

const mdFiles = walk(DOCS).sort();
const fail = { anchors: [], internal: [], github: [], heading: [], leaks: [] };
const seen = { anchors: 0, internal: 0, github: 0, heading: 0, files: 0 };

/** GitHub-style heading slugifier (handles unicode incl. Korean). */
function slugify(h) {
  return h
    .trim()
    .toLowerCase()
    .replace(/[`*_~]/g, '') // strip md emphasis/code marks
    .replace(/[^\p{L}\p{N} -]/gu, '') // drop punctuation, keep letters/numbers/space/hyphen
    .replace(/ /g, '-');
}

/** Build the set of heading anchors for one md file. */
function headingAnchors(file) {
  const set = new Set();
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /^#{2,6}\s+(.*)$/.exec(line);
    if (m) set.add(slugify(m[1]));
  }
  return set;
}

// Map slug -> existing guide page files (for internal link resolution).
function pageExists(locale, slug) {
  const base = locale === 'en' ? join(DOCS, 'en/guides') : join(DOCS, 'guides');
  return existsSync(join(base, `${slug}.md`)) || existsSync(join(base, `${slug}.mdx`));
}

const lineCache = new Map();
function fileLines(absPath) {
  if (!lineCache.has(absPath)) {
    lineCache.set(absPath, existsSync(absPath) ? readFileSync(absPath, 'utf8').split('\n') : null);
  }
  return lineCache.get(absPath);
}

for (const file of mdFiles) {
  const rel = file.slice(ROOT.length + 1);
  const text = readFileSync(file, 'utf8');
  seen.files++;

  // 1. Code anchors: packages/<pkg>/src/<path>.<ext>:N or :N-M
  const anchorRe = /packages\/[a-z0-9-]+\/src\/[A-Za-z0-9/._-]+\.[a-z]+:(\d+)(?:-(\d+))?/g;
  for (const m of text.matchAll(anchorRe)) {
    seen.anchors++;
    const refPath = m[0].slice(0, m[0].indexOf(':'));
    const start = Number(m[1]);
    const end = m[2] ? Number(m[2]) : start;
    const abs = join(ROOT, refPath);
    const lines = fileLines(abs);
    if (lines === null) {
      fail.anchors.push(`${rel}: missing file -> ${refPath}`);
      continue;
    }
    if (start < 1 || end > lines.length || end < start) {
      fail.anchors.push(
        `${rel}: out-of-range ${refPath}:${m[1]}${m[2] ? '-' + m[2] : ''} (file has ${lines.length} lines)`,
      );
      continue;
    }
    // start line must carry content (not blank)
    if (lines[start - 1].trim() === '') {
      fail.anchors.push(`${rel}: blank start line ${refPath}:${start}`);
    }
  }

  // 2/4. Markdown links: [text](target)
  const linkRe = /\]\(([^)]+)\)/g;
  for (const m of text.matchAll(linkRe)) {
    const target = m[1].trim();
    if (target.startsWith('#') || target.startsWith('mailto:')) continue;

    // GitHub blob links
    if (target.includes('github.com/Seungwoo321/agent-devtools/blob/main/')) {
      seen.github++;
      const after = target.split('/blob/main/')[1].split('#')[0].split('?')[0];
      if (after && !existsSync(join(ROOT, after))) {
        fail.github.push(`${rel}: blob path missing -> ${after}`);
      }
      continue;
    }
    if (/^https?:\/\//.test(target)) continue; // external non-repo URL: skip

    // Internal links (absolute /guides/.. or relative ./..)
    const [pathPart, anchor] = target.split('#');
    // locale + slug
    let locale = 'ko';
    let slug = null;
    let m2;
    if ((m2 = /^\/(en\/)?guides\/([a-z0-9-]+)\/?$/.exec(pathPart))) {
      locale = m2[1] ? 'en' : 'ko';
      slug = m2[2];
    } else if ((m2 = /^\.\/([a-z0-9-]+)\/?$/.exec(pathPart))) {
      locale = rel.includes('/en/') ? 'en' : 'ko';
      slug = m2[1];
    } else if (pathPart === '' && anchor) {
      // same-page anchor handled below via current file
      slug = '__self__';
    }

    if (slug && slug !== '__self__') {
      seen.internal++;
      if (!pageExists(locale, slug)) {
        fail.internal.push(`${rel}: internal target missing -> ${pathPart}`);
        continue;
      }
    }

    // Heading anchor check
    if (anchor) {
      seen.heading++;
      let targetFile;
      if (slug === '__self__') targetFile = file;
      else {
        const base = locale === 'en' ? join(DOCS, 'en/guides') : join(DOCS, 'guides');
        targetFile = existsSync(join(base, `${slug}.md`))
          ? join(base, `${slug}.md`)
          : join(base, `${slug}.mdx`);
      }
      if (existsSync(targetFile)) {
        const set = headingAnchors(targetFile);
        const want = decodeURIComponent(anchor).toLowerCase();
        if (!set.has(want)) {
          fail.heading.push(
            `${rel}: anchor #${want} not found on ${targetFile.slice(ROOT.length + 1)}`,
          );
        }
      }
    }
  }

  // 5. Leak audit (within docs pages)
  const leakRe = /\b(ADT|TASK|CMT|CYC|UNIT|PLAN|ART|PROJ)-[0-9A-Z]{2,}/g;
  for (const m of text.matchAll(leakRe)) {
    fail.leaks.push(`${rel}: work-tracking id -> ${m[0]}`);
  }
  for (const pat of [/mzc01-swlee/g, /seungwoo321@/gi]) {
    for (const m of text.matchAll(pat)) fail.leaks.push(`${rel}: personal identifier -> ${m[0]}`);
  }
}

// Report
const cats = [
  ['CODE ANCHORS', fail.anchors],
  ['INTERNAL LINKS', fail.internal],
  ['GITHUB BLOB LINKS', fail.github],
  ['HEADING ANCHORS', fail.heading],
  ['IDENTIFIER LEAKS', fail.leaks],
];
const counts = {
  'CODE ANCHORS': seen.anchors,
  'INTERNAL LINKS': seen.internal,
  'GITHUB BLOB LINKS': seen.github,
  'HEADING ANCHORS': seen.heading,
  'IDENTIFIER LEAKS': seen.files,
};
const unit = {
  'CODE ANCHORS': 'checked',
  'INTERNAL LINKS': 'checked',
  'GITHUB BLOB LINKS': 'checked',
  'HEADING ANCHORS': 'checked',
  'IDENTIFIER LEAKS': 'pages swept',
};
let total = 0;
for (const [name, list] of cats) {
  total += list.length;
  if (list.length === 0) {
    console.log(`PASS ${name}: clean (${counts[name]} ${unit[name]})`);
  } else {
    console.log(`FAIL ${name}: ${list.length} issue(s) of ${counts[name]} ${unit[name]}`);
    for (const l of list.sort()) console.log(`     - ${l}`);
  }
}
console.log(total === 0 ? 'ROUND RESULT: CLEAN' : `ROUND RESULT: ${total} ISSUE(S)`);
process.exit(total === 0 ? 0 : 1);
