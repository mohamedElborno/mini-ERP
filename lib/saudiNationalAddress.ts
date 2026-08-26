/** Saudi Post (SPL) national address — short code is 4 letters + 4 digits. */
export const SAUDI_SHORT_ADDRESS_PATTERN = /^[A-Z]{4}\d{4}$/;
export const SAUDI_FOUR_DIGIT_PATTERN = /^\d{4}$/;
export const SAUDI_POSTAL_CODE_PATTERN = /^\d{5}$/;

export type SaudiNationalAddressFields = {
  nationalAddress?: string | null;
  buildingNumber?: string | null;
  address?: string | null;
  district?: string | null;
  secondaryNumber?: string | null;
  city?: string | null;
  zipCode?: string | null;
};

export function formatShortAddressInput(value: string): string {
  const letters = value.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 4);
  const digits = value.replace(/\D/g, "").slice(0, 4);
  return letters + digits;
}

export function isValidShortAddress(value: string): boolean {
  return SAUDI_SHORT_ADDRESS_PATTERN.test(value.trim().toUpperCase());
}

export function formatFourDigitInput(value: string): string {
  return value.replace(/\D/g, "").slice(0, 4);
}

export function formatPostalCodeInput(value: string): string {
  return value.replace(/\D/g, "").slice(0, 5);
}

export type PrintAddressLabels = {
  shortAddress: string;
  buildingNumber: string;
  street: string;
  district: string;
  secondaryNumber: string;
  postalCode: string;
  city: string;
};

/** Lines for PDF / print — follows SPL component order. */
export function buildNationalAddressPrintLines(
  data: SaudiNationalAddressFields,
  L: PrintAddressLabels,
): string[] {
  const lines: string[] = [];

  if (data.address) {
    const street = data.buildingNumber
      ? `${L.buildingNumber}: ${data.buildingNumber} — ${data.address}`
      : data.address;
    lines.push(street);
  } else if (data.buildingNumber) {
    lines.push(`${L.buildingNumber}: ${data.buildingNumber}`);
  }

  if (data.district || data.city) {
    if (data.district && data.city) {
      lines.push(`${L.district}: ${data.district} — ${data.city}`);
    } else if (data.district) {
      lines.push(`${L.district}: ${data.district}`);
    } else if (data.city) {
      lines.push(`${L.city}: ${data.city}`);
    }
  }

  if (data.secondaryNumber) {
    lines.push(`${L.secondaryNumber}: ${data.secondaryNumber}`);
  }

  if (data.zipCode) {
    lines.push(`${L.postalCode}: ${data.zipCode}`);
  }

  if (data.nationalAddress) {
    lines.push(`${L.shortAddress}: ${data.nationalAddress}`);
  }

  return lines;
}
