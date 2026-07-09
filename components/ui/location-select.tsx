"use client";

import { useEffect, useMemo, useState } from "react";
import Select, { type StylesConfig, type ClassNamesConfig } from "react-select";
import {
  getCountries,
  getStatesOfCountry,
  getAllCitiesOfCountry,
  type ICountry,
  type IState,
  type ICity,
} from "@countrystatecity/countries-browser";
import { cn } from "@/lib/utils";

// ─── Option type ─────────────────────────────────────────────────────────────

type Option = { value: string; label: string };

// ─── Shared react-select styles ───────────────────────────────────────────────

function buildClassNames(extra?: string): ClassNamesConfig<Option> {
  return {
    control: ({ isFocused }) =>
      cn(
        "border-input bg-background rounded-lg border px-1 py-0.5 text-sm cursor-pointer transition-shadow",
        isFocused && "ring-2 ring-ring border-ring",
        extra,
      ),
    menu: () =>
      "bg-card border-border mt-1 rounded-xl border shadow-xl z-[9999] overflow-hidden",
    menuList: () => "max-h-56 overflow-y-auto py-1",
    option: ({ isFocused, isSelected }) =>
      cn(
        "px-3 py-2 text-sm cursor-pointer transition-colors",
        isFocused && "bg-muted",
        isSelected && "bg-primary/10 text-primary font-medium",
      ),
    placeholder: () => "text-muted-foreground text-sm px-1",
    singleValue: () => "text-foreground text-sm px-1",
    input: () => "text-foreground text-sm",
    clearIndicator: () =>
      "text-muted-foreground hover:text-foreground cursor-pointer px-1 transition-colors",
    dropdownIndicator: () =>
      "text-muted-foreground hover:text-foreground cursor-pointer px-1 transition-colors",
    indicatorSeparator: () => "bg-border mx-1",
    noOptionsMessage: () => "text-muted-foreground text-sm py-6 text-center",
    loadingMessage: () => "text-muted-foreground text-sm py-6 text-center",
  };
}

const noStyles: StylesConfig<Option> = {
  menu: (base) => ({ ...base, zIndex: 9999 }),
};

// ─── CountrySelect ────────────────────────────────────────────────────────────

interface CountrySelectProps {
  value: string;
  onChange: (isoCode: string, countryName: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** BCP 47 locale tag, e.g. "ar" or "en". Used to translate country names. */
  locale?: string;
}

export function CountrySelect({
  value,
  onChange,
  placeholder = "Select country…",
  disabled,
  locale = "ar",
}: CountrySelectProps) {
  const [countries, setCountries] = useState<ICountry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCountries()
      .then(setCountries)
      .finally(() => setLoading(false));
  }, []);

  // Build a locale-aware Intl.DisplayNames instance
  const displayNames = useMemo(() => {
    try {
      return new Intl.DisplayNames([locale], { type: "region" });
    } catch {
      return null;
    }
  }, [locale]);

  const options = useMemo(
    () =>
      countries.map((c) => {
        const localizedName = displayNames?.of(c.iso2) ?? c.name;
        return {
          value: c.iso2,
          label: `${c.emoji ?? ""} ${localizedName}`,
          name: localizedName,
        };
      }),
    [countries, displayNames],
  );

  const selected = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value],
  );

  return (
    <Select
      instanceId="country-select"
      unstyled
      styles={noStyles}
      classNames={buildClassNames()}
      options={options}
      value={selected}
      isLoading={loading}
      isDisabled={disabled}
      isClearable
      isSearchable
      placeholder={placeholder}
      onChange={(opt) => {
        const o = opt as (typeof options)[0] | null;
        onChange(o?.value ?? "", o?.name ?? "");
      }}
    />
  );
}

// ─── StateSelect ──────────────────────────────────────────────────────────────

interface StateSelectProps {
  countryCode: string;
  value: string;
  onChange: (isoCode: string, stateName: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Fallback placeholder when no country is selected */
  chooseCountryFirst?: string;
}

export function StateSelect({
  countryCode,
  value,
  onChange,
  placeholder = "Select state…",
  disabled,
  chooseCountryFirst = "Choose a country first",
}: StateSelectProps) {
  const [options, setOptions] = useState<(Option & { name: string })[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!countryCode) {
      setOptions([]);
      return;
    }
    setLoading(true);
    getStatesOfCountry(countryCode)
      .then((list: IState[]) =>
        setOptions(
          list.map((s) => ({ value: s.iso2, label: s.name, name: s.name })),
        ),
      )
      .finally(() => setLoading(false));
  }, [countryCode]);

  const selected = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value],
  );

  return (
    <Select
      instanceId="state-select"
      unstyled
      styles={noStyles}
      classNames={buildClassNames()}
      options={options}
      value={selected}
      isLoading={loading}
      isDisabled={disabled || !countryCode}
      isClearable
      isSearchable
      placeholder={!countryCode ? chooseCountryFirst : placeholder}
      onChange={(opt) => {
        const o = opt as (typeof options)[0] | null;
        onChange(o?.value ?? "", o?.name ?? "");
      }}
    />
  );
}

// ─── CitySelect ───────────────────────────────────────────────────────────────

interface CitySelectProps {
  countryCode: string;
  value: string;
  onChange: (cityName: string) => void;
  placeholder?: string;
  disabled?: boolean;
  chooseCountryFirst?: string;
}

export function CitySelect({
  countryCode,
  value,
  onChange,
  placeholder = "Select city…",
  disabled,
  chooseCountryFirst = "Choose a country first",
}: CitySelectProps) {
  const [options, setOptions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!countryCode) {
      setOptions([]);
      return;
    }
    setLoading(true);
    getAllCitiesOfCountry(countryCode)
      .then((list: ICity[]) =>
        setOptions(list.map((c) => ({ value: c.name, label: c.name }))),
      )
      .finally(() => setLoading(false));
  }, [countryCode]);

  const selected = useMemo(
    () => (value ? { value, label: value } : null),
    [value],
  );

  return (
    <Select
      instanceId="city-select"
      unstyled
      styles={noStyles}
      classNames={buildClassNames()}
      options={options}
      value={selected}
      isLoading={loading}
      isDisabled={disabled || !countryCode}
      isClearable
      isSearchable
      placeholder={!countryCode ? chooseCountryFirst : placeholder}
      onChange={(opt) => {
        const o = opt as Option | null;
        onChange(o?.value ?? "");
      }}
    />
  );
}
