// ─── نظام صلاحية المنتجات ─────────────────────────────────────
// كل منتج ممكن (اختيارياً) يكون له تاريخ إنتاج وتاريخ انتهاء، وعدد أيام
// تنبيه قبل الانتهاء. المنتج اللي مالوش تاريخ انتهاء بيفضل عادي ومش
// بيتفلتر في أي شاشة.
//
// كل المقارنات بتتم بتاريخ القاهرة (مش وقت الجهاز)، عشان كاشير سهران بعد
// منتصف الليل ما يشوفش يوم مختلف عن التقرير اللي البوت بعته.

export const DEFAULT_EXPIRY_ALERT_DAYS = 30;

const TIME_ZONE = 'Africa/Cairo';

/** حالة صلاحية المنتج. */
export type ExpiryStatus =
  | 'none'     // مالوش تاريخ انتهاء — منتج مش بينتهي
  | 'ok'       // لسه بدري
  | 'soon'     // أوشك على الانتهاء (داخل نطاق أيام التنبيه)
  | 'expired'; // انتهت صلاحيته

export interface ExpiryInfo {
  status: ExpiryStatus;
  /** الأيام المتبقية للانتهاء. سالب = عدد الأيام اللي فاتت من وقت الانتهاء. null لو مفيش تاريخ. */
  daysLeft: number | null;
  /** عدد أيام التنبيه المستخدَم فعلياً (المنتج أو الافتراضي). */
  alertDays: number;
}

// بناء Intl.DateTimeFormat غالي جداً (~56 ضعف الـ format نفسه)، و getExpiryInfo
// بيتنادى لكل منتج في كل رندر — فالـ formatter بيتبني مرة واحدة بس.
// التاريخ نفسه بيتحسب كل نداء عشان الكاشير اللي سايب الشاشة مفتوحة بعد نص
// الليل يشوف اليوم الجديد من غير ما يعمل refresh.
const cairoDayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** تاريخ اليوم بتوقيت القاهرة بصيغة YYYY-MM-DD. */
export function todayInCairo(): string {
  return cairoDayFormatter.format(new Date());
}

/**
 * تحويل YYYY-MM-DD لمنتصف ليل UTC.
 * المقارنة بين تاريخين متثبّتين على UTC بتلغي أي مشاكل توقيت صيفي —
 * الفرق بينهم دايماً مضاعف صحيح لليوم.
 */
function toUTCDay(dateStr: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** عدد الأيام من النهارده (بتوقيت القاهرة) لحد تاريخ معيّن. سالب = التاريخ فات. */
export function daysUntil(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const target = toUTCDay(dateStr);
  const today = toUTCDay(todayInCairo());
  if (target === null || today === null) return null;
  return Math.round((target - today) / 86_400_000);
}

/**
 * حالة صلاحية المنتج.
 * `defaultAlertDays` بييجي من إعدادات المحل، وبيتستخدم لما المنتج
 * ما يكونش محدد عدد أيام تنبيه خاص بيه.
 */
export function getExpiryInfo(
  product: { expiry_date?: string | null; expiry_alert_days?: number | null },
  defaultAlertDays: number = DEFAULT_EXPIRY_ALERT_DAYS,
): ExpiryInfo {
  const fallback = Number.isFinite(defaultAlertDays) && Number(defaultAlertDays) > 0
    ? Number(defaultAlertDays)
    : DEFAULT_EXPIRY_ALERT_DAYS;
  const alertDays = Number.isFinite(product.expiry_alert_days) && Number(product.expiry_alert_days) > 0
    ? Number(product.expiry_alert_days)
    : fallback;

  const daysLeft = daysUntil(product.expiry_date);
  if (daysLeft === null) return { status: 'none', daysLeft: null, alertDays };
  if (daysLeft < 0) return { status: 'expired', daysLeft, alertDays };
  if (daysLeft <= alertDays) return { status: 'soon', daysLeft, alertDays };
  return { status: 'ok', daysLeft, alertDays };
}

export function isExpired(
  product: { expiry_date?: string | null; expiry_alert_days?: number | null },
  defaultAlertDays?: number,
): boolean {
  return getExpiryInfo(product, defaultAlertDays).status === 'expired';
}

export function isExpiringSoon(
  product: { expiry_date?: string | null; expiry_alert_days?: number | null },
  defaultAlertDays?: number,
): boolean {
  return getExpiryInfo(product, defaultAlertDays).status === 'soon';
}

const displayFormatter = new Intl.DateTimeFormat('ar-EG', {
  timeZone: 'UTC',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  numberingSystem: 'latn',
});

/** تنسيق التاريخ للعرض (يوم/شهر/سنة). */
export function formatExpiryDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  const day = toUTCDay(dateStr);
  if (day === null) return dateStr;
  return displayFormatter.format(new Date(day));
}

/** نص مختصر للحالة، مثل «باقي 5 أيام» أو «منتهي من 3 أيام». */
export function expiryLabel(info: ExpiryInfo): string {
  if (info.daysLeft === null) return '';
  const days = Math.abs(info.daysLeft);
  const plural = days === 1 ? 'يوم' : days === 2 ? 'يومين' : days <= 10 ? 'أيام' : 'يوم';
  const count = days === 1 || days === 2 ? '' : `${days} `;

  if (info.status === 'expired') return `منتهي من ${count}${plural}`;
  if (info.daysLeft === 0) return 'ينتهي اليوم';
  return `باقي ${count}${plural}`;
}
