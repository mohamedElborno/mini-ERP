const SAUDI_SHORT_ADDRESS_PATTERN = /^[A-Z]{4}\d{4}$/;
const SAUDI_FOUR_DIGIT_PATTERN = /^\d{4}$/;
const SAUDI_POSTAL_CODE_PATTERN = /^\d{5}$/;

type NationalAddressInput = {
  nationalAddress?: string;
  buildingNumber?: string;
  secondaryNumber?: string;
  zipCode?: string;
};

function normalizeShortAddress(value: string): string {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, "");
  if (!SAUDI_SHORT_ADDRESS_PATTERN.test(normalized)) {
    throw new Error(
      "Short address must be 4 letters followed by 4 numbers (e.g. RRRD2929).",
    );
  }
  return normalized;
}

function normalizeFourDigits(label: string, value: string): string {
  const digits = value.trim().replace(/\D/g, "");
  if (!SAUDI_FOUR_DIGIT_PATTERN.test(digits)) {
    throw new Error(`${label} must be exactly 4 digits.`);
  }
  return digits;
}

function normalizePostalCode(value: string): string {
  const digits = value.trim().replace(/\D/g, "");
  if (!SAUDI_POSTAL_CODE_PATTERN.test(digits)) {
    throw new Error("Postal code must be exactly 5 digits.");
  }
  return digits;
}

/** Validate and normalize SPL national-address components before save. */
export function normalizeNationalAddressFields<T extends NationalAddressInput>(
  fields: T,
): T {
  const next = { ...fields };

  if (next.nationalAddress !== undefined) {
    const trimmed = next.nationalAddress.trim();
    next.nationalAddress = trimmed
      ? normalizeShortAddress(trimmed)
      : undefined;
  }

  if (next.buildingNumber !== undefined) {
    const trimmed = next.buildingNumber.trim();
    next.buildingNumber = trimmed
      ? normalizeFourDigits("Building number", trimmed)
      : undefined;
  }

  if (next.secondaryNumber !== undefined) {
    const trimmed = next.secondaryNumber.trim();
    next.secondaryNumber = trimmed
      ? normalizeFourDigits("Secondary number", trimmed)
      : undefined;
  }

  if (next.zipCode !== undefined) {
    const trimmed = next.zipCode.trim();
    next.zipCode = trimmed ? normalizePostalCode(trimmed) : undefined;
  }

  return next;
}
