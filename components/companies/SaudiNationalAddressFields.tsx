"use client";

import { useTranslations } from "next-intl";
import {
  formatFourDigitInput,
  formatPostalCodeInput,
  formatShortAddressInput,
} from "@/lib/saudiNationalAddress";

const inputCls =
  "border-input bg-background text-foreground placeholder:text-muted-foreground " +
  "focus-visible:ring-ring w-full rounded-lg border px-3 py-2 text-sm outline-none " +
  "focus-visible:ring-2 disabled:opacity-50 tracking-wide";

const labelCls = "text-muted-foreground mb-1 block text-xs font-medium";

export type SaudiNationalAddressFormState = {
  nationalAddress: string;
  buildingNumber: string;
  address: string;
  district: string;
  secondaryNumber: string;
  city: string;
  zipCode: string;
};

type FieldKey = keyof SaudiNationalAddressFormState;

interface Props {
  values: SaudiNationalAddressFormState;
  onChange: (key: FieldKey, value: string) => void;
  /** Use companiesPage or settingsPage translation namespace */
  namespace?: "companiesPage" | "settingsPage";
  showCity?: boolean;
}

export function SaudiNationalAddressFields({
  values,
  onChange,
  namespace = "companiesPage",
  showCity = true,
}: Props) {
  const t = useTranslations(namespace);

  return (
    <>
      <div className="sm:col-span-2 border-border border-t pt-3">
        <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
          {t("nationalAddressSection")}
        </p>
        <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
          {t("nationalAddressSectionHint")}
        </p>
      </div>

      <div>
        <label className={labelCls}>{t("fieldShortAddress")}</label>
        <input
          className={inputCls}
          value={values.nationalAddress}
          placeholder="RRRD2929"
          maxLength={8}
          onChange={(e) =>
            onChange("nationalAddress", formatShortAddressInput(e.target.value))
          }
        />
      </div>

      <div>
        <label className={labelCls}>{t("fieldBuildingNumber")}</label>
        <input
          className={inputCls}
          value={values.buildingNumber}
          placeholder="2929"
          maxLength={4}
          inputMode="numeric"
          onChange={(e) =>
            onChange("buildingNumber", formatFourDigitInput(e.target.value))
          }
        />
      </div>

      <div className="sm:col-span-2">
        <label className={labelCls}>{t("fieldStreet")}</label>
        <input
          className={inputCls}
          value={values.address}
          placeholder={t("fieldStreetPlaceholder")}
          onChange={(e) => onChange("address", e.target.value)}
        />
      </div>

      <div>
        <label className={labelCls}>{t("fieldDistrict")}</label>
        <input
          className={inputCls}
          value={values.district}
          placeholder={t("fieldDistrictPlaceholder")}
          onChange={(e) => onChange("district", e.target.value)}
        />
      </div>

      {showCity ? (
        <div>
          <label className={labelCls}>{t("fieldCity")}</label>
          <input
            className={inputCls}
            value={values.city}
            onChange={(e) => onChange("city", e.target.value)}
          />
        </div>
      ) : null}

      <div>
        <label className={labelCls}>{t("fieldSecondaryNumber")}</label>
        <input
          className={inputCls}
          value={values.secondaryNumber}
          placeholder="1234"
          maxLength={4}
          inputMode="numeric"
          onChange={(e) =>
            onChange("secondaryNumber", formatFourDigitInput(e.target.value))
          }
        />
      </div>

      <div>
        <label className={labelCls}>{t("fieldPostalCode")}</label>
        <input
          className={inputCls}
          value={values.zipCode}
          placeholder="12345"
          maxLength={5}
          inputMode="numeric"
          onChange={(e) =>
            onChange("zipCode", formatPostalCodeInput(e.target.value))
          }
        />
      </div>
    </>
  );
}
