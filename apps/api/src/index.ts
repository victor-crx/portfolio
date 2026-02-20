import { Hono } from 'hono';

type Bindings = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

const asInt = (value: string | null, fallback: number) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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

  const where: string[] = [];
  const params: (string | number)[] = [];

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

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  const totalResult = await db
    .prepare(`SELECT COUNT(*) AS total FROM projects p ${whereClause}`)
    .bind(...params)
    .first<{ total: number }>();

  const rows = await db
    .prepare(
      `SELECT p.id, p.slug, p.title, p.summary, p.type, p.project_date, p.collections_json
       FROM projects p
       ${whereClause}
       ORDER BY p.project_date DESC, p.created_at DESC
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
      collections: JSON.parse(row.collections_json)
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
      WHERE p.id = ? OR p.slug = ?
      LIMIT 1`
    )
    .bind(id, id)
    .first<Record<string, string | null>>();

  if (!row) {
    return c.json({ error: 'Project not found' }, 404);
  }

  return c.json({
    ...row,
    collections: JSON.parse((row.collections_json as string | null) ?? '[]'),
    actions: JSON.parse((row.actions_json as string | null) ?? '[]'),
    results: JSON.parse((row.results_json as string | null) ?? '[]'),
    nextSteps: JSON.parse((row.next_steps_json as string | null) ?? '[]'),
    tags: JSON.parse((row.tags as string | null) ?? '[]'),
    tools: JSON.parse((row.tools as string | null) ?? '[]'),
    media: JSON.parse((row.media as string | null) ?? '[]')
  });
});

app.get('/api/services', async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM services ORDER BY sort_order ASC, id ASC').all();
  return c.json({ data: rows.results ?? [] });
});

app.get('/api/certifications', async (c) => {
  const rows = await c.env.DB
    .prepare('SELECT * FROM certifications ORDER BY issued_on DESC, id ASC')
    .all();
  return c.json({ data: rows.results ?? [] });
});

app.get('/api/labs', async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM labs ORDER BY published_on DESC, id ASC').all();
  return c.json({ data: rows.results ?? [] });
});

app.get('/api/site-blocks', async (c) => {
  const rows = await c.env.DB
    .prepare('SELECT * FROM site_blocks ORDER BY page ASC, block_key ASC, id ASC')
    .all();
  return c.json({ data: rows.results ?? [] });
});

export default app;
