import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const NPX = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..", "..");

const getArg = (name) => {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
};

const dbName = getArg('--db');
const local = process.argv.includes('--local');
const inputPath = getArg('--input') ?? path.resolve(repoRoot, 'apps/web/public/projects.json');

if (!dbName) {
  throw new Error('Missing required --db argument');
}

const tryPaths = [inputPath, path.resolve(repoRoot, 'projects.json')];
let jsonRaw = '';
for (const p of tryPaths) {
  try {
    jsonRaw = await readFile(p, 'utf8');
    break;
  } catch {
    // try next path
  }
}

if (!jsonRaw) {
  throw new Error('Could not load projects JSON from apps/web/public/projects.json or projects.json');
}

const payload = JSON.parse(jsonRaw);

const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;

const sql = [];
sql.push('PRAGMA foreign_keys = ON;');

for (const project of payload.projects ?? []) {
  const slug = project.slug ?? project.id;
  sql.push(`
INSERT OR REPLACE INTO projects (
  id, slug, title, summary, type, project_date, collections_json, problem, constraints_text,
  actions_json, results_json, next_steps_json, updated_at
) VALUES (
  ${quote(project.id)},
  ${quote(slug)},
  ${quote(project.title)},
  ${quote(project.summary)},
  ${quote(project.type)},
  ${quote(project.date ?? '')},
  ${quote(JSON.stringify(project.collections ?? []))},
  ${quote(project.sections?.problem ?? '')},
  ${quote(project.sections?.constraints ?? '')},
  ${quote(JSON.stringify(project.sections?.actions ?? []))},
  ${quote(JSON.stringify(project.sections?.results ?? []))},
  ${quote(JSON.stringify(project.sections?.next_steps ?? []))},
  CURRENT_TIMESTAMP
);`);

  sql.push(`DELETE FROM project_tags WHERE project_id = ${quote(project.id)};`);
  sql.push(`DELETE FROM project_tools WHERE project_id = ${quote(project.id)};`);

  for (const tag of project.tags ?? []) {
    sql.push(`INSERT OR IGNORE INTO tags (name) VALUES (${quote(tag)});`);
    sql.push(`
INSERT OR IGNORE INTO project_tags (project_id, tag_id)
SELECT ${quote(project.id)}, id FROM tags WHERE name = ${quote(tag)};
`);
  }

  for (const tool of project.tools ?? []) {
    sql.push(`INSERT OR IGNORE INTO tools (name) VALUES (${quote(tool)});`);
    sql.push(`
INSERT OR IGNORE INTO project_tools (project_id, tool_id)
SELECT ${quote(project.id)}, id FROM tools WHERE name = ${quote(tool)};
`);
  }

  sql.push(`DELETE FROM project_media WHERE project_id = ${quote(project.id)};`);

  const artifacts = [...(project.artifacts ?? []).map((asset) => ({ ...asset, role: 'artifact' })), ...(project.images ?? []).map((path) => ({ path, role: 'image' }))];

  artifacts.forEach((asset, index) => {
    const label = asset.label ?? null;
    sql.push(`
INSERT INTO media_assets (asset_type, label, path, metadata_json)
VALUES (
  ${quote(asset.role === 'image' ? 'image' : 'artifact')},
  ${label ? quote(label) : 'NULL'},
  ${quote(asset.path)},
  '{}'
);
`);

    sql.push(`
INSERT OR IGNORE INTO project_media (project_id, media_asset_id, sort_order, role)
VALUES (${quote(project.id)}, last_insert_rowid(), ${index}, ${quote(asset.role)});
`);
  });

  if (project.type === 'lab') {
    sql.push(`
INSERT OR REPLACE INTO labs (project_id, slug, title, summary, status, published_on)
VALUES (
  ${quote(project.id)},
  ${quote(slug)},
  ${quote(project.title)},
  ${quote(project.summary)},
  'published',
  ${quote(project.date ?? '')}
);
`);
  }
}

sql.push(`INSERT OR IGNORE INTO site_blocks (page, block_key, title, body, data_json, status, published_at, created_at, updated_at) VALUES (
  'home',
  'hero',
  'Homepage Hero',
  'Primary hero content for the home page.',
  '${JSON.stringify({
    title: 'Systems clarity, collaborative execution, elegant outcomes.',
    subtitle: 'Brochure-inspired portfolio design with a technical backbone, curated across Systems, Collaboration & Live, Delivery, and Creative lanes.',
    ctaText: 'Contact Me',
    ctaHref: '/contact/',
    heroMediaId: null,
    heroMediaUrl: null
  }).replaceAll("'", "''")}',
  'published', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);`);
sql.push(`INSERT OR IGNORE INTO site_blocks (page, block_key, title, body, data_json, status, published_at, created_at, updated_at) VALUES (
  'home',
  'press',
  'Home Press & Testimonials',
  'Quotes and social proof for the home page.',
  '${JSON.stringify({
    items: [{ label: 'Testimonial', quote: 'Operationally calm, technically rigorous, and always clear in communication.', source: 'Program Sponsor', href: '' }]
  }).replaceAll("'", "''")}',
  'published', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);`);
sql.push(`INSERT OR IGNORE INTO site_blocks (page, block_key, title, body, data_json, status, published_at, created_at, updated_at) VALUES (
  'global',
  'footer',
  'Global Footer',
  'Footer text and global links.',
  '${JSON.stringify({
    leftText: 'Portfolio focused on systems, collaboration, delivery, and creative execution with sanitized, reusable examples.',
    links: [
      { label: 'Home', href: '/' },
      { label: 'Work', href: '/work/' },
      { label: 'About', href: '/about/' },
      { label: 'Contact', href: '/contact/' }
    ],
    smallPrint: '© Victor Lane'
  }).replaceAll("'", "''")}',
  'published', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);`);
sql.push(`INSERT OR IGNORE INTO site_blocks (page, block_key, title, body, data_json, status, published_at, created_at, updated_at) VALUES (
  'contact',
  'intro',
  'Contact Intro',
  'Contact page heading and introductory text.',
  '${JSON.stringify({ title: 'Contact', subtitle: 'Use the form below to send an inquiry.' }).replaceAll("'", "''")}',
  'published', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);`);
sql.push("INSERT OR IGNORE INTO services (slug, title, summary, body, sort_order) VALUES ('fractional-ops', 'Fractional Operations Leadership', 'Operational leadership and delivery orchestration.', 'Placeholder service description.', 1);");
sql.push("INSERT OR IGNORE INTO certifications (title, issuer, issued_on) VALUES ('Example Certification', 'Example Issuer', '2024-01');");

const tempDir = await mkdtemp(path.join(tmpdir(), 'portfolio-seed-'));
const sqlFile = path.join(tempDir, 'seed.sql');
const wranglerConfig = path.join(repoRoot, 'apps', 'api', 'wrangler.toml');
await writeFile(sqlFile, sql.join('\n'), 'utf8');

await new Promise((resolvePromise, rejectPromise) => {
  const args = [
  'wrangler',
  '--config', wranglerConfig,
  'd1', 'execute', dbName,
  '--file', sqlFile,
];

if (local) {
  args.push('--local');
} else {
  args.push('--remote');
}

const child = spawn(NPX, args, {
  cwd: repoRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

  child.on('exit', (code) => {
    if (code === 0) {
      resolvePromise();
      return;
    }
    rejectPromise(new Error(`Seed command failed with exit code ${code}`));
  });

  child.on('error', rejectPromise);
});

await rm(tempDir, { recursive: true, force: true });
console.log('Seed import completed.');
