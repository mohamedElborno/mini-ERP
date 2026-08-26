"use client";

import type { ReactNode } from "react";
import type { PrintLang } from "./printLabels";
import { getLabels } from "./printLabels";
import { DocumentQrCode } from "./DocumentQrCode";
import { PrintNationalAddressBlock } from "./PrintNationalAddressBlock";
import type { SaudiNationalAddressFields } from "@/lib/saudiNationalAddress";

type PrintGroup = ({
  name: string;
  logoUrl?: string | null;
  taxNumber?: string | null;
} & SaudiNationalAddressFields) | null;

export function PrintDocumentHeader({
  group,
  subtitle,
  lang,
  publicViewUrl,
  qrLabel,
  children,
}: {
  group: PrintGroup;
  subtitle?: ReactNode;
  lang: PrintLang;
  publicViewUrl?: string | null;
  qrLabel?: string;
  children: ReactNode;
}) {
  const L = getLabels(lang);
  const hasQr = Boolean(publicViewUrl && qrLabel);
  const headerClass = [
    "doc-header",
    lang === "ar" ? "doc-header--ar" : "doc-header--en",
    hasQr ? "doc-header--with-qr" : "doc-header--no-qr",
  ].join(" ");

  return (
    <div className={headerClass}>
      <div className="doc-header-company">
        <div className="doc-company-row">
          {group?.logoUrl ? (
            <img
              src={group.logoUrl}
              alt=""
              className="doc-company-logo"
              decoding="sync"
            />
          ) : null}
          <div
            className="doc-company-details"
            dir={lang === "ar" ? "rtl" : "ltr"}
            lang={lang}
          >
            <div className="doc-company-name">{group?.name ?? "—"}</div>
            {group?.taxNumber ? (
              <div className="doc-company-meta">
                <span className="doc-company-meta-label">{L.taxNumber}</span>
                <span className="doc-company-meta-value">{group.taxNumber}</span>
              </div>
            ) : null}
            {group ? (
              <PrintNationalAddressBlock
                data={group}
                lang={lang}
                className="doc-company-meta-line"
              />
            ) : null}
            {subtitle}
          </div>
        </div>
      </div>

      <div
        className="doc-header-document"
        dir={lang === "ar" ? "rtl" : "ltr"}
        lang={lang}
      >
        {children}
      </div>

      {hasQr ? (
        <div className="doc-header-qr">
          <DocumentQrCode url={publicViewUrl!} label={qrLabel!} />
        </div>
      ) : null}
    </div>
  );
}
