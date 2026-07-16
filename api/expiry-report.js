import {
  authorizeCron,
  expiryLabel,
  fetchAllProducts,
  fetchStoreSettings,
  getExpiryInfo,
  getSupabase,
  productsByExpiryStatus,
  sendTelegramText,
} from './_report-utils.js';

const MAX_PER_SECTION = 20;

function formatSection(products, settings, now) {
  const lines = [];
  products.slice(0, MAX_PER_SECTION).forEach((product, index) => {
    const info = getExpiryInfo(product, settings.expiryAlertDays, now);
    lines.push(
      `${index + 1}. ${product.name || 'منتج غير محدد'}`,
      `   تاريخ الانتهاء: ${product.expiry_date} (${expiryLabel(info)})`,
      `   المتبقي بالمخزون: ${Number(product.stock_quantity || 0)}`,
    );
  });
  if (products.length > MAX_PER_SECTION) {
    lines.push(`... و${products.length - MAX_PER_SECTION} منتج آخر (شوف صفحة النواقص)`);
  }
  return lines;
}

/**
 * ملخص يومي لصلاحية المنتجات.
 * بيرجّع null لو مفيش أي منتج أوشك أو انتهى — عشان البوت ما يبعتش رسالة فاضية كل يوم.
 */
export function buildExpiryMessage(settings, products, now = new Date()) {
  const soon = productsByExpiryStatus(products, 'soon', settings.expiryAlertDays, now);
  const expired = productsByExpiryStatus(products, 'expired', settings.expiryAlertDays, now);
  if (soon.length === 0 && expired.length === 0) return null;

  const lines = [
    `تنبيه صلاحية المنتجات - ${settings.name}`,
    `حد التنبيه الافتراضي: ${settings.expiryAlertDays} يوم قبل الانتهاء`,
    '',
    `أوشكت على الانتهاء: ${soon.length}`,
    `منتهية الصلاحية: ${expired.length}`,
  ];

  if (expired.length) {
    lines.push('', 'منتهية الصلاحية (اسحبها من الرف):', ...formatSection(expired, settings, now));
  }
  if (soon.length) {
    lines.push('', 'أوشكت على الانتهاء:', ...formatSection(soon, settings, now));
  }

  return lines.join('\n');
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  if (!authorizeCron(req)) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  try {
    const supabase = getSupabase();
    const [settings, products] = await Promise.all([
      fetchStoreSettings(supabase),
      fetchAllProducts(supabase),
    ]);

    const text = buildExpiryMessage(settings, products);
    if (!text) {
      return res.status(200).json({ ok: true, skipped: true, reason: 'No expiring or expired products' });
    }

    const result = await sendTelegramText(text);
    return res.status(200).json({ ok: true, result });
  } catch (error) {
    return res.status(500).json({ ok: false, error: String(error) });
  }
}
