/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as activities from "../activities.js";
import type * as auditLog from "../auditLog.js";
import type * as bankAccounts from "../bankAccounts.js";
import type * as categories from "../categories.js";
import type * as companies from "../companies.js";
import type * as companyCredit from "../companyCredit.js";
import type * as contacts from "../contacts.js";
import type * as currencies from "../currencies.js";
import type * as dashboard from "../dashboard.js";
import type * as deals from "../deals.js";
import type * as documentViews from "../documentViews.js";
import type * as financials from "../financials.js";
import type * as groups from "../groups.js";
import type * as http from "../http.js";
import type * as inventoryReservations from "../inventoryReservations.js";
import type * as invitations from "../invitations.js";
import type * as invoices from "../invoices.js";
import type * as lib_publicViewToken from "../lib/publicViewToken.js";
import type * as lib_publicViewTokenStorage from "../lib/publicViewTokenStorage.js";
import type * as lib_saudiNationalAddress from "../lib/saudiNationalAddress.js";
import type * as listPagination from "../listPagination.js";
import type * as orgGroupDelete from "../orgGroupDelete.js";
import type * as orgGroupHelpers from "../orgGroupHelpers.js";
import type * as products from "../products.js";
import type * as publicDocuments from "../publicDocuments.js";
import type * as quoteFinance from "../quoteFinance.js";
import type * as quotes from "../quotes.js";
import type * as receiptVouchers from "../receiptVouchers.js";
import type * as roles from "../roles.js";
import type * as services from "../services.js";
import type * as settings from "../settings.js";
import type * as taxes from "../taxes.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activities: typeof activities;
  auditLog: typeof auditLog;
  bankAccounts: typeof bankAccounts;
  categories: typeof categories;
  companies: typeof companies;
  companyCredit: typeof companyCredit;
  contacts: typeof contacts;
  currencies: typeof currencies;
  dashboard: typeof dashboard;
  deals: typeof deals;
  documentViews: typeof documentViews;
  financials: typeof financials;
  groups: typeof groups;
  http: typeof http;
  inventoryReservations: typeof inventoryReservations;
  invitations: typeof invitations;
  invoices: typeof invoices;
  "lib/publicViewToken": typeof lib_publicViewToken;
  "lib/publicViewTokenStorage": typeof lib_publicViewTokenStorage;
  "lib/saudiNationalAddress": typeof lib_saudiNationalAddress;
  listPagination: typeof listPagination;
  orgGroupDelete: typeof orgGroupDelete;
  orgGroupHelpers: typeof orgGroupHelpers;
  products: typeof products;
  publicDocuments: typeof publicDocuments;
  quoteFinance: typeof quoteFinance;
  quotes: typeof quotes;
  receiptVouchers: typeof receiptVouchers;
  roles: typeof roles;
  services: typeof services;
  settings: typeof settings;
  taxes: typeof taxes;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
