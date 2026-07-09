export type AuditT = (key: string, values?: Record<string, string | number>) => string;

function fmtMoney(n: unknown, locale: string): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtDateMs(n: unknown, locale: string): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return new Date(n).toLocaleDateString(
    locale === "ar" ? "ar-SA" : "en-US",
  );
}

function statusLabel(s: unknown, t: AuditT): string {
  if (s == null) return t("auditEmptyValue");
  return t(`status.${String(s)}`);
}

/**
 * يسطّح كائن changes من الـ API إلى سطور قابلة للعرض
 */
export function buildAuditChangeLines(
  action: string,
  changes: unknown,
  t: AuditT,
  locale: string,
): string[] {
  if (changes == null) return [];
  if (typeof changes !== "object" || Array.isArray(changes)) {
    return [];
  }
  const c = changes as Record<string, unknown>;
  const lines: string[] = [];

  if (action === "CREATED") {
    if (c.number != null && String(c.number).length > 0) {
      lines.push(t("auditLineCreatedNumber", { value: String(c.number) }));
    }
    if (c.total != null && typeof c.total === "number") {
      lines.push(
        t("auditLineInitialTotal", { value: fmtMoney(c.total, locale) }),
      );
    }
    if (c.status != null) {
      lines.push(
        t("auditLineInitialStatus", { value: statusLabel(c.status, t) }),
      );
    }
    if (c.revision != null) {
      lines.push(t("auditLineInitialRevision", { value: String(c.revision) }));
    }
    return lines;
  }

  for (const [key, val] of Object.entries(c)) {
    if (val == null || typeof val !== "object" || Array.isArray(val)) continue;
    const v = val as { from?: unknown; to?: unknown };
    if (!("from" in v) && !("to" in v)) continue;
    const from = "from" in v ? v.from : undefined;
    const to = "to" in v ? v.to : undefined;

    if (key === "status") {
      lines.push(
        t("auditLineDiffStatus", {
          from: statusLabel(from, t),
          to: statusLabel(to, t),
        }),
      );
    } else if (key === "description") {
      lines.push(
        t("auditLineDiffDescription", {
          from: from == null ? t("auditEmptyValue") : String(from),
          to: to == null ? t("auditEmptyValue") : String(to),
        }),
      );
    } else if (key === "expirationDate") {
      lines.push(
        t("auditLineDiffExpiry", {
          from: fmtDateMs(from, locale),
          to: fmtDateMs(to, locale),
        }),
      );
    } else if (key === "revision") {
      lines.push(
        t("auditLineDiffRevision", {
          from: String(from ?? "—"),
          to: String(to ?? "—"),
        }),
      );
    } else if (key === "lineItems") {
      lines.push(
        t("auditLineDiffLineItemCount", {
          from: String(from ?? "0"),
          to: String(to ?? "0"),
        }),
      );
    } else if (key === "subtotal" || key === "total" || key === "taxAmount" || key === "usedAmount" || key === "remainingAmount" || key === "amount") {
      const fl =
        key === "subtotal"
          ? t("auditField.subtotal")
          : key === "total"
            ? t("auditField.total")
            : key === "taxAmount"
              ? t("auditField.tax")
              : key === "usedAmount"
                ? (t as AuditT)("usedAmount")
                : key === "remainingAmount"
                  ? (t as AuditT)("remainingAmount")
                  : (t as AuditT)("fieldAmount");
      lines.push(
        t("auditLineDiffAmount", {
          field: fl,
          from: fmtMoney(from, locale),
          to: fmtMoney(to, locale),
        }),
      );
    } else {
      lines.push(
        t("auditLineDiffGeneric", {
          field: key,
          from: from == null ? t("auditEmptyValue") : String(from),
          to: to == null ? t("auditEmptyValue") : String(to),
        }),
      );
    }
  }

  return lines;
}
