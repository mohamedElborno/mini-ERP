/**
 * عرض رقم عرض السعر مع النسخة: QT-26-00003 R1
 * revision = 0 يعني عدم إظهار لاحق (مسودة أو لم يُعدّل بعد الإرسال)
 */
export function formatQuoteWithRevision(
  number: string | undefined,
  revision: number | undefined,
): string {
  if (!number?.trim()) return "—";
  const r = revision ?? 0;
  return r > 0 ? `${number} R${r}` : number;
}
