import { Hono } from 'hono';

type Bindings = {
  DB: D1Database;
  R2_BUCKET: R2Bucket;
  ADMIN_TOKEN?: string;
  R2_PUBLIC_BASE_URL?: string;
  TURNSTILE_SECRET_KEY?: string;
};

type AdminRole = 'admin' | 'reviewer';

type AdminIdentity = {
  email: string;
  role: AdminRole;
  userId: number | null;
  isLocalTokenAuth: boolean;
};

const app = new Hono<{ Bindings: Bindings; Variables: { adminIdentity: AdminIdentity } }>();

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

const MAX_MEDIA_SIZE = 10 * 1024 * 1024;
const ALLOWED_MEDIA_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

const sanitizeText = (value: unknown, maxLen = 4000) =>
  String(value ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .trim()
    .slice(0, maxLen);

const slugifyFilename = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80) || 'file';

const extForMimeType = (mimeType: string) => {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'application/pdf') return 'pdf';
  return '';
};

const getClientIp = (c: { req: { header: (name: string) => string | undefined } }) => {
  const cfIp = c.req.header('CF-Connecting-IP') ?? c.req.header('x-forwarded-for') ?? '';
  return cfIp.split(',')[0]?.trim() || 'unknown';
};

const getStatus = (input: unknown, fallback: 'draft' | 'published' = 'draft') =>
  input === 'published' ? 'published' : fallback;

const authHeaderToken = (headerValue: string | null) => {
  if (!headerValue || !headerValue.startsWith('Bearer ')) return '';
  return headerValue.slice('Bearer '.length).trim();
};

const decodeBase64Url = (value: string) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4;
  const padded = pad ? normalized + '='.repeat(4 - pad) : normalized;
  return atob(padded);
};

const emailFromAccessJwt = (jwt: string | null) => {
  if (!jwt) return '';
  const segments = jwt.split('.');
  if (segments.length < 2) return '';
  try {
    const payload = JSON.parse(decodeBase64Url(segments[1])) as { email?: string };
    return typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  } catch {
    return '';
  }
};

const isLocalDevHost = (host: string) => {
  const normalized = host.toLowerCase();
  return normalized.includes('localhost') || normalized.startsWith('127.0.0.1') || normalized.startsWith('[::1]');
};

const getAccessEmail = (c: { req: { header: (name: string) => string | undefined } }) => {
  const jwtEmail = emailFromAccessJwt(c.req.header('CF-Access-Jwt-Assertion') ?? null);
  if (jwtEmail) return jwtEmail;
  const headerEmail = c.req.header('Cf-Access-Authenticated-User-Email') ?? c.req.header('cf-access-authenticated-user-email');
  return headerEmail?.trim().toLowerCase() ?? '';
};

const canMutateEntity = (identity: AdminIdentity, entityType: string, nextStatus?: string, existingStatus?: string) => {
  if (identity.role === 'admin') return true;
  if (entityType === 'site_block') return false;
  if (nextStatus && nextStatus !== 'draft') return false;
  if (existingStatus && existingStatus !== 'draft') return false;
  return true;
};

const getExistingStatus = async (db: D1Database, table: string, id: string) => {
  const row = await db
    .prepare(`SELECT status FROM ${table} WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<{ status: string }>();
  return row?.status ?? null;
};

const audit = async (
  db: D1Database,
  identity: AdminIdentity,
  action: string,
  entityType: string,
  entityId: string | number | null,
  metadata: Record<string, unknown> = {}
) => {
  await db
    .prepare(
      `INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(
      identity.userId,
      action,
      entityType,
      entityId ? String(entityId) : null,
      JSON.stringify({ ...metadata, actorEmail: identity.email }),
      nowIso()
    )
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
            'id', ma.id,
            'key', ma.key,
            'publicUrl', ma.public_url,
            'mimeType', ma.mime_type,
            'altText', ma.alt_text,
            'visibility', ma.visibility,
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

app.post('/api/inquiries', async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  const token = String(body.turnstileToken || '').trim();
  if (!token) return c.json({ error: 'Turnstile token required' }, 400);

  const ip = getClientIp(c);
  const oneHourAgoIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const rate = await c.env.DB
    .prepare('SELECT COUNT(*) AS total FROM inquiries WHERE source = ? AND created_at >= ?')
    .bind(ip, oneHourAgoIso)
    .first<{ total: number }>();
  if ((rate?.total ?? 0) >= 10) return c.json({ error: 'Rate limit exceeded' }, 429);

  const verifyBody = new URLSearchParams({
    secret: c.env.TURNSTILE_SECRET_KEY ?? '',
    response: token,
    remoteip: ip
  });

  const verifyResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: verifyBody
  });
  const verifyResult = (await verifyResponse.json()) as { success?: boolean; 'error-codes'?: string[] };
  if (!verifyResult?.success) {
    return c.json({ error: 'Turnstile verification failed', details: verifyResult?.['error-codes'] ?? [] }, 400);
  }

  const inquiryType = sanitizeText(body.inquiry_type || 'general', 40) || 'general';
  const name = sanitizeText(body.name, 120);
  const email = sanitizeText(body.email, 254).toLowerCase();
  const subject = sanitizeText(body.subject, 200);
  const message = sanitizeText(body.message, 4000);
  const createdAt = nowIso();

  const result = await c.env.DB
    .prepare(
      `INSERT INTO inquiries (inquiry_type, name, email, subject, message, payload_json, source, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?)`
    )
    .bind(
      inquiryType,
      name,
      email,
      subject,
      message,
      JSON.stringify({ userAgent: c.req.header('user-agent') ?? '', turnstile: 'verified' }),
      ip,
      createdAt
    )
    .run();

  return c.json({ ok: true, id: result.meta.last_row_id ?? null });
});

app.get('/api/media/:id', async (c) => {
  const id = c.req.param('id');
  const media = await c.env.DB
    .prepare('SELECT * FROM media_assets WHERE id = ? LIMIT 1')
    .bind(id)
    .first<Record<string, unknown> & { visibility?: string }>();

  if (!media) return c.json({ error: 'Not found' }, 404);
  if (media.visibility === 'private') {
    // TODO(PR future): return signed URL once private media delivery is implemented.
    return c.json({ error: 'Private media delivery not implemented yet' }, 501);
  }
  return c.json(media);
});

app.use('/api/admin/*', async (c, next) => {
  const host = new URL(c.req.url).host;
  const accessEmail = getAccessEmail(c);
  const localToken = authHeaderToken(c.req.header('Authorization') ?? null);
  const usingLocalToken = isLocalDevHost(host) && !!c.env.ADMIN_TOKEN && localToken === c.env.ADMIN_TOKEN;

  if (!accessEmail && !usingLocalToken) {
    return c.json({ error: 'Unauthorized: Cloudflare Access identity required' }, 401);
  }

  const resolvedEmail = accessEmail || 'local-admin@localhost';
  const userRecord = await c.env.DB
    .prepare('SELECT id, role FROM users WHERE email = ? AND is_active = 1 LIMIT 1')
    .bind(resolvedEmail)
    .first<{ id: number; role: AdminRole }>();

  let identity: AdminIdentity;
  if (usingLocalToken && !accessEmail) {
    identity = {
      email: resolvedEmail,
      role: 'admin',
      userId: null,
      isLocalTokenAuth: true
    };
  } else if (userRecord?.role === 'admin' || userRecord?.role === 'reviewer') {
    identity = {
      email: resolvedEmail,
      role: userRecord.role,
      userId: userRecord.id,
      isLocalTokenAuth: false
    };
  } else {
    return c.json({ error: 'Forbidden' }, 403);
  }

  c.set('adminIdentity', identity);
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
  const identity = c.get('adminIdentity');
  const body = await c.req.json<Record<string, unknown>>();
  const requestedStatus = getStatus(body.status);
  if (!canMutateEntity(identity, 'project', requestedStatus)) return c.json({ error: 'Forbidden' }, 403);
  const id = String(body.id || crypto.randomUUID());
  const status = requestedStatus;
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

  await audit(c.env.DB, c.get('adminIdentity'), 'create', 'project', id, { status });
  return c.json({ ok: true, id });
});

app.put('/api/admin/projects/:id', async (c) => {
  const identity = c.get('adminIdentity');
  const id = c.req.param('id');
  const body = await c.req.json<Record<string, unknown>>();
  const existingStatus = await getExistingStatus(c.env.DB, 'projects', id);
  if (!existingStatus) return c.json({ error: 'Not found' }, 404);
  const status = getStatus(body.status, existingStatus === 'published' ? 'published' : 'draft');
  if (!canMutateEntity(identity, 'project', status, existingStatus)) return c.json({ error: 'Forbidden' }, 403);
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

  await audit(c.env.DB, c.get('adminIdentity'), 'update', 'project', id, { status });
  return c.json({ ok: true });
});

app.get('/api/admin/services', async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM services ORDER BY updated_at DESC, id DESC').all();
  return c.json({ data: rows.results ?? [] });
});

app.post('/api/admin/services', async (c) => {
  const identity = c.get('adminIdentity');
  const body = await c.req.json<Record<string, unknown>>();
  const requestedStatus = getStatus(body.status);
  if (!canMutateEntity(identity, 'service', requestedStatus)) return c.json({ error: 'Forbidden' }, 403);
  const status = requestedStatus;
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
  await audit(c.env.DB, c.get('adminIdentity'), 'create', 'service', result.meta.last_row_id ?? null, { status });
  return c.json({ ok: true, id: result.meta.last_row_id ?? null });
});

app.put('/api/admin/services/:id', async (c) => {
  const identity = c.get('adminIdentity');
  const id = c.req.param('id');
  const body = await c.req.json<Record<string, unknown>>();
  const existingStatus = await getExistingStatus(c.env.DB, 'services', id);
  if (!existingStatus) return c.json({ error: 'Not found' }, 404);
  const status = getStatus(body.status, existingStatus === 'published' ? 'published' : 'draft');
  if (!canMutateEntity(identity, 'service', status, existingStatus)) return c.json({ error: 'Forbidden' }, 403);
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
  await audit(c.env.DB, c.get('adminIdentity'), 'update', 'service', id, { status });
  return c.json({ ok: true });
});

app.get('/api/admin/certifications', async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM certifications ORDER BY created_at DESC, id DESC').all();
  return c.json({ data: rows.results ?? [] });
});

app.post('/api/admin/certifications', async (c) => {
  const identity = c.get('adminIdentity');
  const body = await c.req.json<Record<string, unknown>>();
  const requestedStatus = getStatus(body.status);
  if (!canMutateEntity(identity, 'certification', requestedStatus)) return c.json({ error: 'Forbidden' }, 403);
  const status = requestedStatus;
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
  await audit(c.env.DB, c.get('adminIdentity'), 'create', 'certification', result.meta.last_row_id ?? null, { status });
  return c.json({ ok: true, id: result.meta.last_row_id ?? null });
});

app.put('/api/admin/certifications/:id', async (c) => {
  const identity = c.get('adminIdentity');
  const id = c.req.param('id');
  const body = await c.req.json<Record<string, unknown>>();
  const existingStatus = await getExistingStatus(c.env.DB, 'certifications', id);
  if (!existingStatus) return c.json({ error: 'Not found' }, 404);
  const status = getStatus(body.status, existingStatus === 'published' ? 'published' : 'draft');
  if (!canMutateEntity(identity, 'certification', status, existingStatus)) return c.json({ error: 'Forbidden' }, 403);
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
  await audit(c.env.DB, c.get('adminIdentity'), 'update', 'certification', id, { status });
  return c.json({ ok: true });
});

app.get('/api/admin/labs', async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM labs ORDER BY created_at DESC, id DESC').all();
  return c.json({ data: rows.results ?? [] });
});

app.post('/api/admin/labs', async (c) => {
  const identity = c.get('adminIdentity');
  const body = await c.req.json<Record<string, unknown>>();
  const requestedStatus = getStatus(body.status);
  if (!canMutateEntity(identity, 'lab', requestedStatus)) return c.json({ error: 'Forbidden' }, 403);
  const status = requestedStatus;
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
  await audit(c.env.DB, c.get('adminIdentity'), 'create', 'lab', result.meta.last_row_id ?? null, { status });
  return c.json({ ok: true, id: result.meta.last_row_id ?? null });
});

app.put('/api/admin/labs/:id', async (c) => {
  const identity = c.get('adminIdentity');
  const id = c.req.param('id');
  const body = await c.req.json<Record<string, unknown>>();
  const existingStatus = await getExistingStatus(c.env.DB, 'labs', id);
  if (!existingStatus) return c.json({ error: 'Not found' }, 404);
  const status = getStatus(body.status, existingStatus === 'published' ? 'published' : 'draft');
  if (!canMutateEntity(identity, 'lab', status, existingStatus)) return c.json({ error: 'Forbidden' }, 403);
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
  await audit(c.env.DB, c.get('adminIdentity'), 'update', 'lab', id, { status });
  return c.json({ ok: true });
});

app.get('/api/admin/site-blocks', async (c) => {
  const rows = await c.env.DB
    .prepare('SELECT * FROM site_blocks ORDER BY page ASC, block_key ASC, updated_at DESC')
    .all();
  return c.json({ data: rows.results ?? [] });
});

app.post('/api/admin/site-blocks', async (c) => {
  const identity = c.get('adminIdentity');
  const body = await c.req.json<Record<string, unknown>>();
  const requestedStatus = getStatus(body.status);
  if (!canMutateEntity(identity, 'site_block', requestedStatus)) return c.json({ error: 'Forbidden' }, 403);
  const status = requestedStatus;
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
  await audit(c.env.DB, c.get('adminIdentity'), 'create', 'site_block', result.meta.last_row_id ?? null, { status });
  return c.json({ ok: true, id: result.meta.last_row_id ?? null });
});

app.put('/api/admin/site-blocks/:id', async (c) => {
  const identity = c.get('adminIdentity');
  const id = c.req.param('id');
  const body = await c.req.json<Record<string, unknown>>();
  const existingStatus = await getExistingStatus(c.env.DB, 'site_blocks', id);
  if (!existingStatus) return c.json({ error: 'Not found' }, 404);
  const status = getStatus(body.status, existingStatus === 'published' ? 'published' : 'draft');
  if (!canMutateEntity(identity, 'site_block', status, existingStatus)) return c.json({ error: 'Forbidden' }, 403);
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
  await audit(c.env.DB, c.get('adminIdentity'), 'update', 'site_block', id, { status });
  return c.json({ ok: true });
});

app.get('/api/admin/media', async (c) => {
  const identity = c.get('adminIdentity');
  const q = sanitizeText(c.req.query('q') ?? '', 120);
  const where = q ? 'WHERE key LIKE ? OR public_url LIKE ? OR alt_text LIKE ?' : '';
  const stmt = c.env.DB.prepare(`SELECT * FROM media_assets ${where} ORDER BY updated_at DESC, created_at DESC LIMIT 200`);
  const rows = q ? await stmt.bind(`%${q}%`, `%${q}%`, `%${q}%`).all() : await stmt.all();
  await audit(c.env.DB, identity, 'view', 'media_asset', null, { q });
  return c.json({ data: rows.results ?? [] });
});

app.post('/api/admin/media', async (c) => {
  const identity = c.get('adminIdentity');
  if (identity.role !== 'admin') return c.json({ error: 'Forbidden' }, 403);

  const formData = await c.req.formData();
  const file = formData.get('file');
  if (!(file instanceof File)) return c.json({ error: 'file is required' }, 400);
  if (!ALLOWED_MEDIA_MIME.has(file.type)) return c.json({ error: 'Unsupported media type' }, 400);
  if (file.size > MAX_MEDIA_SIZE) return c.json({ error: 'File too large (max 10MB)' }, 400);

  const ext = extForMimeType(file.type);
  if (!ext) return c.json({ error: 'Unsupported media type' }, 400);

  const originalName = file.name.replace(/\.[^.]+$/, '');
  const slug = slugifyFilename(originalName);
  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const key = `media/${yyyy}/${mm}/${crypto.randomUUID()}-${slug}.${ext}`;

  await c.env.R2_BUCKET.put(key, await file.arrayBuffer(), {
    httpMetadata: {
      contentType: file.type
    }
  });

  const publicBase = (c.env.R2_PUBLIC_BASE_URL ?? '').replace(/\/$/, '');
  const publicUrl = publicBase ? `${publicBase}/${key}` : key;
  const altText = sanitizeText(formData.get('alt_text'), 300);
  const createdAt = nowIso();

  const result = await c.env.DB
    .prepare(
      `INSERT INTO media_assets (key, public_url, mime_type, size_bytes, alt_text, visibility, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'public', ?, ?)`
    )
    .bind(key, publicUrl, file.type, file.size, altText, createdAt, createdAt)
    .run();

  await audit(c.env.DB, identity, 'create', 'media_asset', result.meta.last_row_id ?? null, { key, mimeType: file.type, sizeBytes: file.size });

  return c.json({ ok: true, id: result.meta.last_row_id ?? null, key, public_url: publicUrl });
});

app.put('/api/admin/media/:id', async (c) => {
  const identity = c.get('adminIdentity');
  if (identity.role !== 'admin') return c.json({ error: 'Forbidden' }, 403);
  const id = c.req.param('id');
  const body = await c.req.json<Record<string, unknown>>();
  const altText = sanitizeText(body.alt_text, 300);
  const visibility = body.visibility === 'private' ? 'private' : 'public';

  await c.env.DB
    .prepare('UPDATE media_assets SET alt_text = ?, visibility = ?, updated_at = ? WHERE id = ?')
    .bind(altText, visibility, nowIso(), id)
    .run();

  await audit(c.env.DB, identity, 'update', 'media_asset', id, { visibility });
  return c.json({ ok: true });
});

app.get('/api/admin/projects/:id/media', async (c) => {
  const projectId = c.req.param('id');
  const rows = await c.env.DB
    .prepare(
      `SELECT pm.project_id, pm.media_asset_id, pm.sort_order, ma.key, ma.public_url, ma.mime_type, ma.alt_text, ma.visibility
       FROM project_media pm
       JOIN media_assets ma ON ma.id = pm.media_asset_id
       WHERE pm.project_id = ?
       ORDER BY pm.sort_order ASC, pm.media_asset_id ASC`
    )
    .bind(projectId)
    .all();
  return c.json({ data: rows.results ?? [] });
});

app.post('/api/admin/projects/:id/media', async (c) => {
  const identity = c.get('adminIdentity');
  if (identity.role !== 'admin') return c.json({ error: 'Forbidden' }, 403);
  const projectId = c.req.param('id');
  const body = await c.req.json<Record<string, unknown>>();
  const mediaAssetId = Number(body.media_asset_id);
  const sortOrder = Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0;
  if (!Number.isFinite(mediaAssetId) || mediaAssetId <= 0) return c.json({ error: 'media_asset_id is required' }, 400);

  await c.env.DB
    .prepare(
      `INSERT INTO project_media (project_id, media_asset_id, sort_order, role)
       VALUES (?, ?, ?, 'artifact')
       ON CONFLICT(project_id, media_asset_id) DO UPDATE SET sort_order = excluded.sort_order`
    )
    .bind(projectId, mediaAssetId, sortOrder)
    .run();

  await audit(c.env.DB, identity, 'attach', 'project_media', `${projectId}:${mediaAssetId}`, { sortOrder });
  return c.json({ ok: true });
});

app.delete('/api/admin/projects/:id/media/:mediaAssetId', async (c) => {
  const identity = c.get('adminIdentity');
  if (identity.role !== 'admin') return c.json({ error: 'Forbidden' }, 403);
  const projectId = c.req.param('id');
  const mediaAssetId = c.req.param('mediaAssetId');

  await c.env.DB
    .prepare('DELETE FROM project_media WHERE project_id = ? AND media_asset_id = ?')
    .bind(projectId, mediaAssetId)
    .run();

  await audit(c.env.DB, identity, 'detach', 'project_media', `${projectId}:${mediaAssetId}`);
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
