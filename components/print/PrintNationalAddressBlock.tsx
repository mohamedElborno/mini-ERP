"use client";

import type { PrintLang } from "./printLabels";
import { getLabels } from "./printLabels";
import {
  buildNationalAddressPrintLines,
  type SaudiNationalAddressFields,
} from "@/lib/saudiNationalAddress";

export function PrintNationalAddressBlock({
  data,
  lang,
  className = "client-sub",
}: {
  data: SaudiNationalAddressFields;
  lang: PrintLang;
  className?: string;
}) {
  const L = getLabels(lang);
  const lines = buildNationalAddressPrintLines(data, {
    shortAddress: L.shortAddress,
    buildingNumber: L.buildingNumber,
    street: L.street,
    district: L.district,
    secondaryNumber: L.secondaryNumber,
    postalCode: L.postalCode,
    city: L.city,
  });

  if (lines.length === 0) return null;

  return (
    <>
      {lines.map((line) => (
        <div key={line} className={className}>
          {line}
        </div>
      ))}
    </>
  );
}
