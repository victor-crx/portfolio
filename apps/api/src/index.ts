import { Hono } from 'hono';

type Bindings = {
  DB: D1Database;
  ADMIN_TOKEN?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

const asInt = (value: string | null | undefined, fallback: number) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const toJsonText = (value: unknown, fallback: string) => {
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return fallback;
  return JSON.stringify(value);
};

const parseJsonField = <T>(value: string | null | undefined, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const nowIso = () => new Date().toISOString();

const getStatus = (input: unknown, fallback: 'draft' | 'published' = 'draft') =>
  input === 'published' ? 'published' : fallback;

const authHeaderToken = (headerValue: string | null) => {
  if (!headerValue || !headerValue.startsWith('Bearer ')) return '';
  return headerValue.slice('Bearer '.length).trim();
};

const audit = async (
  db: D1Database,
  action: string,
  entityType: string,
  entityId: string | number | null,
  metadata: Record<string, unknown> = {}
) => {
  await db
    .prepare(
      `INSERT INTO audit_log (action, entity_type, entity_id, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(action, entityType, entityId ? String(entityId) : null, JSON.stringify(metadata), nowIso())
    .run();
};

app.get('/api/health', (c) => c.json({ status: 'ok' }));

app.get('/api/projects', async (c) => {
  const db = c.env.DB;
  const collection = c.req.query('collection');
  const type = c.req.query('type');
  const q = c.req.query('q');
  const page = asInt(c.req.query('page'), 1);
  const pageSize = Math.min(asInt(c.req.query('pageSize'), 20), 100);
  const offset = (page - 1) * pageSize;

  const where: string[] = ['p.status = ?'];
  const params: (string | number)[] = ['published'];

  if (collection) {
    where.push('EXISTS (SELECT 1 FROM json_each(p.collections_json) WHERE value = ?)');
    params.push(collection);
  }

  if (type) {
    where.push('p.type = ?');
    params.push(type);
  }

  if (q) {
    where.push('(p.title LIKE ? OR p.summary LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }

  const whereClause = `WHERE ${where.join(' AND ')}`;

  const totalResult = await db
    .prepare(`SELECT COUNT(*) AS total FROM projects p ${whereClause}`)
    .bind(...params)
    .first<{ total: number }>();

  const rows = await db
    .prepare(
      `SELECT p.id, p.slug, p.title, p.summary, p.type, p.project_date, p.collections_json
       FROM projects p
       ${whereClause}
       ORDER BY COALESCE(p.featured_order, 999999) ASC, COALESCE(p.published_at, p.project_date) DESC, p.created_at DESC
       LIMIT ? OFFSET ?`
    )
    .bind(...params, pageSize, offset)
    .all<{
      id: string;
      slug: string;
      title: string;
      summary: string;
      type: string;
      project_date: string;
      collections_json: string;
    }>();

  return c.json({
    data: (rows.results ?? []).map((row) => ({
      ...row,
      collections: parseJsonField(row.collections_json, [] as string[])
    })),
    pagination: {
      total: totalResult?.total ?? 0,
      page,
      pageSize
    }
  });
});

app.get('/api/projects/:id', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB
    .prepare(
      `SELECT p.*,
      (
        SELECT json_group_array(t.name)
        FROM project_tags pt
        JOIN tags t ON t.id = pt.tag_id
        WHERE pt.project_id = p.id
      ) AS tags,
      (
        SELECT json_group_array(t.name)
        FROM project_tools pt
        JOIN tools t ON t.id = pt.tool_id
        WHERE pt.project_id = p.id
      ) AS tools,
      (
        SELECT json_group_array(
          json_object(
            'type', ma.asset_type,
            'label', ma.label,
            'path', ma.path,
            'sortOrder', pm.sort_order
          )
        )
        FROM project_media pm
        JOIN media_assets ma ON ma.id = pm.media_asset_id
        WHERE pm.project_id = p.id
      ) AS media
      FROM projects p
      WHERE (p.id = ? OR p.slug = ?) AND p.status = 'published'
      LIMIT 1`
    )
    .bind(id, id)
    .first<Record<string, string | null>>();

  if (!row) {
    return c.json({ error: 'Project not found' }, 404);
  }

  return c.json({
    ...row,
    collections: parseJsonField((row.collections_json as string | null) ?? '[]', [] as string[]),
    actions: parseJsonField((row.actions_json as string | null) ?? '[]', [] as string[]),
    results: parseJsonField((row.results_json as string | null) ?? '[]', [] as string[]),
    nextSteps: parseJsonField((row.next_steps_json as string | null) ?? '[]', [] as string[]),
    tags: parseJsonField((row.tags as string | null) ?? '[]', [] as string[]),
    tools: parseJsonField((row.tools as string | null) ?? '[]', [] as string[]),
    media: parseJsonField((row.media as string | null) ?? '[]', [] as Array<Record<string, unknown>>)
  });
});

app.get('/api/services', async (c) => {
  const rows = await c.env.DB
    .prepare("SELECT * FROM services WHERE status = 'published' ORDER BY COALESCE(featured_order, 999999) ASC, sort_order ASC, id ASC")
    .all();
  return c.json({ data: rows.results ?? [] });
});

app.get('/api/certifications', async (c) => {
  const rows = await c.env.DB
    .prepare("SELECT * FROM certifications WHERE status = 'published' ORDER BY COALESCE(featured_order, 999999) ASC, COALESCE(published_at, issued_on) DESC, id ASC")
    .all();
  return c.json({ data: rows.results ?? [] });
});

app.get('/api/labs', async (c) => {
  const rows = await c.env.DB
    .prepare("SELECT * FROM labs WHERE status = 'published' ORDER BY COALESCE(featured_order, 999999) ASC, COALESCE(published_at, published_on) DESC, id ASC")
    .all();
  return c.json({ data: rows.results ?? [] });
});

app.get('/api/site-blocks', async (c) => {
  const rows = await c.env.DB
    .prepare("SELECT * FROM site_blocks WHERE status = 'published' ORDER BY page ASC, COALESCE(featured_order, 999999) ASC, block_key ASC, id ASC")
    .all();
  return c.json({ data: rows.results ?? [] });
});

app.use('/api/admin/*', async (c, next) => {
  const expected = c.env.ADMIN_TOKEN;
  const supplied = authHeaderToken(c.req.header('Authorization') ?? null);
  if (!expected || supplied !== expected) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
});

app.get('/api/admin/dashboard', async (c) => {
  const db = c.env.DB;
  const [projects, services, certs, labs, inquiries] = await Promise.all([
    db.prepare('SELECT COUNT(*) AS total FROM projects').first<{ total: number }>(),
    db.prepare('SELECT COUNT(*) AS total FROM services').first<{ total: number }>(),
    db.prepare('SELECT COUNT(*) AS total FROM certifications').first<{ total: number }>(),
    db.prepare('SELECT COUNT(*) AS total FROM labs').first<{ total: number }>(),
    db.prepare('SELECT COUNT(*) AS total FROM inquiries').first<{ total: number }>()
  ]);

  return c.json({
    counts: {
      projects: projects?.total ?? 0,
      services: services?.total ?? 0,
      certifications: certs?.total ?? 0,
      labs: labs?.total ?? 0,
      inquiries: inquiries?.total ?? 0
    }
  });
});

app.get('/api/admin/projects', async (c) => {
  const rows = await c.env.DB
    .prepare('SELECT * FROM projects ORDER BY updated_at DESC, created_at DESC')
    .all();
  return c.json({ data: rows.results ?? [] });
});

app.post('/api/admin/projects', async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  const id = String(body.id || crypto.randomUUID());
  const status = getStatus(body.status);
  const publishedAt = status === 'published' ? nowIso() : null;

  await c.env.DB
    .prepare(
      `INSERT INTO projects (
        id, slug, title, summary, type, project_date, collections_json, problem, constraints_text,
        actions_json, results_json, next_steps_json, status, published_at, featured_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      String(body.slug || id),
      String(body.title || ''),
      String(body.summary || ''),
      String(body.type || 'case_study'),
      String(body.project_date || ''),
      toJsonText(body.collections, '[]'),
      String(body.problem || ''),
      String(body.constraints_text || ''),
      toJsonText(body.actions, '[]'),
      toJsonText(body.results, '[]'),
      toJsonText(body.next_steps, '[]'),
      status,
      publishedAt,
      Number.isFinite(Number(body.featured_order)) ? Number(body.featured_order) : null,
      nowIso(),
      nowIso()
    )
    .run();

  await audit(c.env.DB, 'create', 'project', id, { status });
  return c.json({ ok: true, id });
});

app.put('/api/admin/projects/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<Record<string, unknown>>();
  const status = getStatus(body.status);
  const maybePublishedAt = status === 'published' ? nowIso() : null;

  await c.env.DB
    .prepare(
      `UPDATE projects SET
        slug = ?, title = ?, summary = ?, type = ?, project_date = ?, collections_json = ?,
        problem = ?, constraints_text = ?, actions_json = ?, results_json = ?, next_steps_json = ?,
        status = ?, published_at = COALESCE(?, published_at), featured_order = ?, updated_at = ?
      WHERE id = ?`
    )
    .bind(
      String(body.slug || id),
      String(body.title || ''),
      String(body.summary || ''),
      String(body.type || 'case_study'),
      String(body.project_date || ''),
      toJsonText(body.collections, '[]'),
      String(body.problem || ''),
      String(body.constraints_text || ''),
      toJsonText(body.actions, '[]'),
      toJsonText(body.results, '[]'),
      toJsonText(body.next_steps, '[]'),
      status,
      maybePublishedAt,
      Number.isFinite(Number(body.featured_order)) ? Number(body.featured_order) : null,
      nowIso(),
      id
    )
    .run();

  await audit(c.env.DB, 'update', 'project', id, { status });
  return c.json({ ok: true });
});

app.get('/api/admin/services', async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM services ORDER BY updated_at DESC, id DESC').all();
  return c.json({ data: rows.results ?? [] });
});

app.post('/api/admin/services', async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  const status = getStatus(body.status);
  const publishedAt = status === 'published' ? nowIso() : null;
  const result = await c.env.DB
    .prepare(
      `INSERT INTO services (
        slug, title, summary, body, sort_order, status, published_at, featured_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      String(body.slug || crypto.randomUUID()),
      String(body.title || ''),
      String(body.summary || ''),
      String(body.body || ''),
      Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0,
      status,
      publishedAt,
      Number.isFinite(Number(body.featured_order)) ? Number(body.featured_order) : null,
      nowIso(),
      nowIso()
    )
    .run();
  await audit(c.env.DB, 'create', 'service', result.meta.last_row_id ?? null, { status });
  return c.json({ ok: true, id: result.meta.last_row_id ?? null });
});

app.put('/api/admin/services/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<Record<string, unknown>>();
  const status = getStatus(body.status);
  const maybePublishedAt = status === 'published' ? nowIso() : null;

  await c.env.DB
    .prepare(
      `UPDATE services SET
        slug = ?, title = ?, summary = ?, body = ?, sort_order = ?, status = ?,
        published_at = COALESCE(?, published_at), featured_order = ?, updated_at = ?
      WHERE id = ?`
    )
    .bind(
      String(body.slug || ''),
      String(body.title || ''),
      String(body.summary || ''),
      String(body.body || ''),
      Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0,
      status,
      maybePublishedAt,
      Number.isFinite(Number(body.featured_order)) ? Number(body.featured_order) : null,
      nowIso(),
      id
    )
    .run();
  await audit(c.env.DB, 'update', 'service', id, { status });
  return c.json({ ok: true });
});

app.get('/api/admin/certifications', async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM certifications ORDER BY created_at DESC, id DESC').all();
  return c.json({ data: rows.results ?? [] });
});

app.post('/api/admin/certifications', async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  const status = getStatus(body.status);
  const publishedAt = status === 'published' ? nowIso() : null;
  const result = await c.env.DB
    .prepare(
      `INSERT INTO certifications (
        title, issuer, credential_id, credential_url, issued_on, expires_on,
        status, published_at, featured_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      String(body.title || ''),
      String(body.issuer || ''),
      String(body.credential_id || ''),
      String(body.credential_url || ''),
      String(body.issued_on || ''),
      String(body.expires_on || ''),
      status,
      publishedAt,
      Number.isFinite(Number(body.featured_order)) ? Number(body.featured_order) : null,
      nowIso(),
      nowIso()
    )
    .run();
  await audit(c.env.DB, 'create', 'certification', result.meta.last_row_id ?? null, { status });
  return c.json({ ok: true, id: result.meta.last_row_id ?? null });
});

app.put('/api/admin/certifications/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<Record<string, unknown>>();
  const status = getStatus(body.status);
  const maybePublishedAt = status === 'published' ? nowIso() : null;

  await c.env.DB
    .prepare(
      `UPDATE certifications SET
        title = ?, issuer = ?, credential_id = ?, credential_url = ?, issued_on = ?, expires_on = ?,
        status = ?, published_at = COALESCE(?, published_at), featured_order = ?, updated_at = ?
      WHERE id = ?`
    )
    .bind(
      String(body.title || ''),
      String(body.issuer || ''),
      String(body.credential_id || ''),
      String(body.credential_url || ''),
      String(body.issued_on || ''),
      String(body.expires_on || ''),
      status,
      maybePublishedAt,
      Number.isFinite(Number(body.featured_order)) ? Number(body.featured_order) : null,
      nowIso(),
      id
    )
    .run();
  await audit(c.env.DB, 'update', 'certification', id, { status });
  return c.json({ ok: true });
});

app.get('/api/admin/labs', async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM labs ORDER BY created_at DESC, id DESC').all();
  return c.json({ data: rows.results ?? [] });
});

app.post('/api/admin/labs', async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  const status = getStatus(body.status);
  const publishedAt = status === 'published' ? nowIso() : null;
  const result = await c.env.DB
    .prepare(
      `INSERT INTO labs (
        project_id, slug, title, summary, status, published_on, published_at,
        featured_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      body.project_id ? String(body.project_id) : null,
      String(body.slug || crypto.randomUUID()),
      String(body.title || ''),
      String(body.summary || ''),
      status,
      String(body.published_on || ''),
      publishedAt,
      Number.isFinite(Number(body.featured_order)) ? Number(body.featured_order) : null,
      nowIso(),
      nowIso()
    )
    .run();
  await audit(c.env.DB, 'create', 'lab', result.meta.last_row_id ?? null, { status });
  return c.json({ ok: true, id: result.meta.last_row_id ?? null });
});

app.put('/api/admin/labs/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<Record<string, unknown>>();
  const status = getStatus(body.status);
  const maybePublishedAt = status === 'published' ? nowIso() : null;

  await c.env.DB
    .prepare(
      `UPDATE labs SET
        project_id = ?, slug = ?, title = ?, summary = ?, status = ?, published_on = ?,
        published_at = COALESCE(?, published_at), featured_order = ?, updated_at = ?
      WHERE id = ?`
    )
    .bind(
      body.project_id ? String(body.project_id) : null,
      String(body.slug || ''),
      String(body.title || ''),
      String(body.summary || ''),
      status,
      String(body.published_on || ''),
      maybePublishedAt,
      Number.isFinite(Number(body.featured_order)) ? Number(body.featured_order) : null,
      nowIso(),
      id
    )
    .run();
  await audit(c.env.DB, 'update', 'lab', id, { status });
  return c.json({ ok: true });
});

app.get('/api/admin/site-blocks', async (c) => {
  const rows = await c.env.DB
    .prepare('SELECT * FROM site_blocks ORDER BY page ASC, block_key ASC, updated_at DESC')
    .all();
  return c.json({ data: rows.results ?? [] });
});

app.post('/api/admin/site-blocks', async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  const status = getStatus(body.status);
  const publishedAt = status === 'published' ? nowIso() : null;

  const result = await c.env.DB
    .prepare(
      `INSERT INTO site_blocks (
        page, block_key, title, body, data_json, status, published_at, featured_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      String(body.page || 'home'),
      String(body.block_key || crypto.randomUUID()),
      String(body.title || ''),
      String(body.body || ''),
      toJsonText(body.data, '{}'),
      status,
      publishedAt,
      Number.isFinite(Number(body.featured_order)) ? Number(body.featured_order) : null,
      nowIso(),
      nowIso()
    )
    .run();
  await audit(c.env.DB, 'create', 'site_block', result.meta.last_row_id ?? null, { status });
  return c.json({ ok: true, id: result.meta.last_row_id ?? null });
});

app.put('/api/admin/site-blocks/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<Record<string, unknown>>();
  const status = getStatus(body.status);
  const maybePublishedAt = status === 'published' ? nowIso() : null;

  await c.env.DB
    .prepare(
      `UPDATE site_blocks SET
        page = ?, block_key = ?, title = ?, body = ?, data_json = ?, status = ?,
        published_at = COALESCE(?, published_at), featured_order = ?, updated_at = ?
      WHERE id = ?`
    )
    .bind(
      String(body.page || 'home'),
      String(body.block_key || ''),
      String(body.title || ''),
      String(body.body || ''),
      toJsonText(body.data, '{}'),
      status,
      maybePublishedAt,
      Number.isFinite(Number(body.featured_order)) ? Number(body.featured_order) : null,
      nowIso(),
      id
    )
    .run();
  await audit(c.env.DB, 'update', 'site_block', id, { status });
  return c.json({ ok: true });
});

app.get('/api/admin/inquiries', async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM inquiries ORDER BY created_at DESC').all();
  return c.json({ data: rows.results ?? [] });
});

app.get('/api/admin/audit', async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM audit_log ORDER BY created_at DESC, id DESC LIMIT 500').all();
  return c.json({ data: rows.results ?? [] });
});

export default app;
