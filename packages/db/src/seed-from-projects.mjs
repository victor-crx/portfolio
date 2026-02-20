import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';

const repoRoot = resolve(new URL('../../..', import.meta.url).pathname);

const getArg = (name) => {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
};

const dbName = getArg('--db');
const local = process.argv.includes('--local');
const inputPath =
  getArg('--input') ?? resolve(repoRoot, 'apps/web/public/projects.json');

if (!dbName) {
  throw new Error('Missing required --db argument');
}

const tryPaths = [inputPath, resolve(repoRoot, 'projects.json')];
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
sql.push('BEGIN TRANSACTION;');

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

sql.push("INSERT OR IGNORE INTO site_blocks (page, block_key, title, body, data_json) VALUES ('home', 'hero', 'Homepage Hero', 'Replace with CMS-managed hero copy.', '{}');");
sql.push("INSERT OR IGNORE INTO site_blocks (page, block_key, title, body, data_json) VALUES ('about', 'intro', 'About Intro', 'Replace with CMS-managed about copy.', '{}');");
sql.push("INSERT OR IGNORE INTO services (slug, title, summary, body, sort_order) VALUES ('fractional-ops', 'Fractional Operations Leadership', 'Operational leadership and delivery orchestration.', 'Placeholder service description.', 1);");
sql.push("INSERT OR IGNORE INTO certifications (title, issuer, issued_on) VALUES ('Example Certification', 'Example Issuer', '2024-01');");
sql.push('COMMIT;');

const tempDir = await mkdtemp(join(tmpdir(), 'portfolio-seed-'));
const sqlFile = join(tempDir, 'seed.sql');
await writeFile(sqlFile, sql.join('\n'), 'utf8');

await new Promise((resolvePromise, rejectPromise) => {
  const args = ['wrangler', 'd1', 'execute', dbName, '--file', sqlFile];
  if (local) {
    args.push('--local');
  }

  const child = spawn('npx', args, {
    cwd: repoRoot,
    stdio: 'inherit'
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
