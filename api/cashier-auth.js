import { createClient } from '@supabase/supabase-js';

// =============================================================================
// Cashier (accountant) auth provisioning — admin only.
//
// The browser has no service-role key, so adding a cashier from the admin UI
// can only insert a row; it cannot create the Supabase Auth user the cashier
// needs to log in. This serverless endpoint closes that gap: it runs with the
// service-role key and creates / updates / deletes the matching Auth user, and
// can reset the admin's own password.
//
// Security: every request must carry the admin's Supabase session token
// (Authorization: Bearer <token>) AND that user's email must equal the
// configured admin email. Nobody else can call it.
//
// Required env (Vercel project settings):
//   SUPABASE_URL (or VITE_SUPABASE_URL)
//   SUPABASE_SERVICE_ROLE_KEY            ← service role (secret)
//   SUPABASE_ANON_KEY (or VITE_SUPABASE_ANON_KEY)
//   ADMIN_EMAIL (or VITE_ADMIN_EMAIL)    ← must match the control-panel login
// Optional:
//   CASHIER_EMAIL_DOMAIN  (default: cashier.local)
// =============================================================================

const URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || process.env.VITE_ADMIN_EMAIL || '').toLowerCase();
const CASHIER_DOMAIN = process.env.CASHIER_EMAIL_DOMAIN || 'cashier.local';

// Verify the caller is the authenticated admin; returns the user or null.
async function verifyAdmin(req) {
  if (!URL || !ANON_KEY) return null;
  const header = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return null;
  try {
    const anon = createClient(URL, ANON_KEY);
    const { data, error } = await anon.auth.getUser(token);
    if (error || !data?.user) return null;
    const email = (data.user.email || '').toLowerCase();
    if (!ADMIN_EMAIL || email !== ADMIN_EMAIL) return null;
    return data.user;
  } catch {
    return null;
  }
}

async function findAuthUserByEmail(admin, email) {
  const target = (email || '').toLowerCase();
  let page = 1;
  // Small shops: a handful of users. Page through just in case.
  for (let i = 0; i < 20; i++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return null;
    const users = data?.users || [];
    const found = users.find((u) => (u.email || '').toLowerCase() === target);
    if (found) return found;
    if (users.length < 200) break;
    page += 1;
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }
  if (!URL || !SERVICE_KEY) {
    res.status(500).json({ ok: false, error: 'SUPABASE_SERVICE_ROLE_KEY غير مضبوط على الخادم (Vercel).' });
    return;
  }
  if (!ADMIN_EMAIL) {
    res.status(500).json({ ok: false, error: 'ADMIN_EMAIL / VITE_ADMIN_EMAIL غير مضبوط على الخادم.' });
    return;
  }

  const adminUser = await verifyAdmin(req);
  if (!adminUser) {
    res.status(401).json({ ok: false, error: 'غير مصرّح — لازم تكون مسجّل دخول كمدير.' });
    return;
  }

  const admin = createClient(URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const action = body?.action;

  try {
    if (action === 'create') {
      const name = (body.name || '').trim();
      const password = (body.password || '').trim();
      if (!name || !password) { res.status(400).json({ ok: false, error: 'الاسم وكلمة المرور مطلوبان.' }); return; }
      if (password.length < 6) { res.status(400).json({ ok: false, error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل.' }); return; }

      const email = `cashier-${Date.now()}-${Math.floor(Math.random() * 1000)}@${CASHIER_DOMAIN}`.toLowerCase();
      const { error: cErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (cErr) { res.status(400).json({ ok: false, error: 'تعذّر إنشاء حساب الدخول: ' + cErr.message }); return; }

      const row = { name, password, phone: body.phone || null, photo_url: body.photo_url || null, email };
      const { data, error: iErr } = await admin.from('cashiers').insert(row).select().single();
      if (iErr) { res.status(400).json({ ok: false, error: 'تم إنشاء الدخول لكن فشل حفظ المحاسب: ' + iErr.message }); return; }
      res.status(200).json({ ok: true, cashier: data });
      return;
    }

    if (action === 'update') {
      const id = body.id;
      if (!id) { res.status(400).json({ ok: false, error: 'معرّف المحاسب مطلوب.' }); return; }
      const { data: existing, error: gErr } = await admin.from('cashiers').select('*').eq('id', id).single();
      if (gErr || !existing) { res.status(404).json({ ok: false, error: 'المحاسب غير موجود.' }); return; }

      const updates = {};
      if (body.name !== undefined) updates.name = body.name;
      if (body.phone !== undefined) updates.phone = body.phone;
      if (body.photo_url !== undefined) updates.photo_url = body.photo_url;

      const newPassword = (body.password || '').trim();
      let email = existing.email;
      if (newPassword) {
        if (newPassword.length < 6) { res.status(400).json({ ok: false, error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل.' }); return; }
        let authUser = email ? await findAuthUserByEmail(admin, email) : null;
        if (!authUser) {
          // No Auth user yet (legacy row) — create one now.
          email = email || `cashier-${id}@${CASHIER_DOMAIN}`.toLowerCase();
          const { error: cErr } = await admin.auth.admin.createUser({ email, password: newPassword, email_confirm: true });
          if (cErr) { res.status(400).json({ ok: false, error: 'تعذّر إنشاء حساب الدخول: ' + cErr.message }); return; }
          updates.email = email;
        } else {
          const { error: uErr } = await admin.auth.admin.updateUserById(authUser.id, { password: newPassword });
          if (uErr) { res.status(400).json({ ok: false, error: 'تعذّر تغيير كلمة المرور: ' + uErr.message }); return; }
        }
        updates.password = newPassword;
      }

      const { data, error: upErr } = await admin.from('cashiers').update(updates).eq('id', id).select().single();
      if (upErr) { res.status(400).json({ ok: false, error: 'فشل حفظ التعديلات: ' + upErr.message }); return; }
      res.status(200).json({ ok: true, cashier: data });
      return;
    }

    if (action === 'delete') {
      const id = body.id;
      if (!id) { res.status(400).json({ ok: false, error: 'معرّف المحاسب مطلوب.' }); return; }
      const { data: existing } = await admin.from('cashiers').select('*').eq('id', id).single();
      if (existing?.email) {
        const authUser = await findAuthUserByEmail(admin, existing.email);
        if (authUser) await admin.auth.admin.deleteUser(authUser.id);
      }
      const { error: dErr } = await admin.from('cashiers').delete().eq('id', id);
      if (dErr) { res.status(400).json({ ok: false, error: 'فشل الحذف: ' + dErr.message }); return; }
      res.status(200).json({ ok: true });
      return;
    }

    if (action === 'reset_admin') {
      const password = (body.password || '').trim();
      if (password.length < 6) { res.status(400).json({ ok: false, error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل.' }); return; }
      const authUser = await findAuthUserByEmail(admin, ADMIN_EMAIL);
      if (!authUser) { res.status(404).json({ ok: false, error: 'حساب المدير غير موجود في Supabase Auth.' }); return; }
      const { error: uErr } = await admin.auth.admin.updateUserById(authUser.id, { password });
      if (uErr) { res.status(400).json({ ok: false, error: 'تعذّر تغيير كلمة مرور المدير: ' + uErr.message }); return; }
      res.status(200).json({ ok: true });
      return;
    }

    res.status(400).json({ ok: false, error: 'إجراء غير معروف.' });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
