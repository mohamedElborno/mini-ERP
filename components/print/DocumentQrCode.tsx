"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function DocumentQrCode({ url, label }: { url: string; label: string }) {
  const [svg, setSvg] = useState("");

  useEffect(() => {
    let cancelled = false;
    void QRCode.toString(url, {
      type: "svg",
      margin: 1,
      width: 88,
      errorCorrectionLevel: "M",
    }).then((value) => {
      if (!cancelled) setSvg(value);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!svg) return null;

  return (
    <div className="doc-qr-block">
      <div
        className="doc-qr-image"
        aria-hidden
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <div className="doc-qr-label">{label}</div>
    </div>
  );
}
