import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/** Line Item validator
 * @description Line Item validator
 * @property {string} product - The product of the line item
 * @property {number} quantity - The quantity of the line item
 * @property {number} price - The price of the line item
 * @property {number} discount - The discount of the line item
 * @property {number} priceAfterDiscount - The price after discount of the line item
 * @property {number} subtotal - The subtotal of the line item
 * @property {number} taxAmount - The tax amount of the line item
 * @property {number} totalAfterTax - The total after tax of the line item
 */
export const lineItemValidator = v.object({
  product: v.id("products"),
  quantity: v.number(),
  price: v.number(),
  discount: v.optional(v.number()),
  priceAfterDiscount: v.optional(v.number()),
  subtotal: v.optional(v.number()),
  taxes: v.optional(
    v.array(
      v.object({
        taxId: v.id("taxes"),
        rate: v.number(),
        name: v.optional(v.string()),
      }),
    ),
  ),
  taxAmount: v.optional(v.number()),
  totalAfterTax: v.optional(v.number()),
  /** ربط بسطر عرض السعر عند إنشاء الفاتورة من عرض */
  quoteLineIndex: v.optional(v.number()),
});

/** Service line item validator
 * @description Service line item validator
 * @property {string} service - The service of the line item
 * @property {number} duration - The duration of the line item
 * @property {number} quantity - The quantity of the line item
 * @property {number} price - The price of the line item
 * @property {number} discount - The discount of the line item
 * @property {number} priceAfterDiscount - The price after discount of the line item
 * @property {number} subtotal - The subtotal of the line item
 * @property {number} taxAmount - The tax amount of the line item
 * @property {number} totalAfterTax - The total after tax of the line item
 */
export const serviceLineItemValidator = v.object({
  service: v.id("services"),
  duration: v.optional(v.number()),
  quantity: v.number(),
  price: v.number(),
  discount: v.optional(v.number()),
  taxes: v.optional(
    v.array(
      v.object({
        taxId: v.id("taxes"),
        rate: v.number(),
        name: v.optional(v.string()),
      }),
    ),
  ),
  priceAfterDiscount: v.optional(v.number()),
  subtotal: v.optional(v.number()),
  taxAmount: v.optional(v.number()),
  totalAfterTax: v.optional(v.number()),
});

export default defineSchema({
  publicViewBudget: defineTable({ resetAt: v.number(), total: v.number(), counts: v.record(v.string(), v.number()) }),
  /** Users table schema
   * @description Users table schema
   * @property {string} clerkId - The clerk ID of the user
   * @property {string} firstName - The first name of the user
   * @property {string} lastName - The last name of the user
   * @property {string} email - The email of the user
   * @property {string} imageUrl - The image URL of the user
   * @property {string} phoneNumber - The phone number of the user
   * @property {string} createdBy - The user who created the user
   * @property {string} updatedBy - The user who updated the user
   * @property {number} updatedAt - The timestamp of the last update
   */

  users: defineTable({
    clerkId: v.string(),
    role: v.optional(v.id("roles")),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    email: v.string(),
    imageUrl: v.optional(v.string()),
    phoneNumber: v.optional(v.string()),
    managerId: v.optional(v.id("users")),
    group: v.optional(v.id("groups")),
    /** Companies/branches the employee can access */
    assignedGroups: v.optional(v.array(v.id("groups"))),
    createdBy: v.optional(v.id("users")),
    updatedBy: v.optional(v.id("users")),
    updatedAt: v.optional(v.number()),
  })
    .index("by_clerk_id", ["clerkId"])
    .index("by_email", ["email"])
    .index("by_managerId", ["managerId"])
    .index("by_group", ["group"])
    .index("by_role", ["role"])
    .index("by_createdBy", ["createdBy"])
    .index("by_updatedBy", ["updatedBy"]),

  /** groups table schema
   * @description groups table schema
   * @property {string} name - The name of the group
   * @property {string} description - The description of the group
   * @property {string} createdBy - The user who created the group
   * @property {string} updatedBy - The user who updated the group
   * @property {number} updatedAt - The timestamp of the last update
   */
  groups: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    parent: v.optional(v.id("groups")),
    children: v.optional(v.array(v.id("groups"))),
    /** Auto-created default company when workspace has none */
    isDefault: v.optional(v.boolean()),
    /** Company logo for printed documents */
    logoStorageId: v.optional(v.id("_storage")),
    /** SPL short address — 4 letters + 4 digits */
    nationalAddress: v.optional(v.string()),
    buildingNumber: v.optional(v.string()),
    address: v.optional(v.string()),
    district: v.optional(v.string()),
    secondaryNumber: v.optional(v.string()),
    city: v.optional(v.string()),
    zipCode: v.optional(v.string()),
    /** VAT / tax registration number (printed on documents) */
    taxNumber: v.optional(v.string()),
    createdBy: v.optional(v.id("users")),
    updatedBy: v.optional(v.id("users")),
    updatedAt: v.optional(v.number()),
  })
    .index("by_name", ["name"])
    .index("by_parent", ["parent"])
    .index("by_children", ["children"])
    .index("by_createdBy", ["createdBy"])
    .index("by_updatedBy", ["updatedBy"]),

  /** Roles table schema
   * @description Roles table schema
   * @property {string} name - The name of the role
   * @property {array} permissions - The permissions of the role
   * @property {string} createdBy - The user who created the role
   * @property {string} updatedBy - The user who updated the role
   * @property {number} updatedAt - The timestamp of the last update
   */
  roles: defineTable({
    name: v.string(),
    permissions: v.array(v.string()),
    createdBy: v.optional(v.id("users")),
    updatedBy: v.optional(v.id("users")),
    updatedAt: v.optional(v.number()),
  })
    .index("by_name", ["name"])
    .index("by_createdBy", ["createdBy"]),

  /** Clients table schema
   * @description Clients table schema
   * @property {string} firstName - The first name of the client
   * @property {string} lastName - The last name of the client
   * @property {string} phoneNumber - The phone number of the client
   * @property {string} email - The email of the client
   * @property {string} createdBy - The user who created the client
   * @property {string} updatedBy - The user who updated the client
   * @property {number} updatedAt - The timestamp of the last update
   */
  companies: defineTable({
    name: v.string(),
    country: v.optional(v.string()),
    city: v.optional(v.string()),
    countryCode: v.optional(v.string()),
    zipCode: v.optional(v.string()),
    address: v.optional(v.string()),
    /** SPL short address — 4 letters + 4 digits (e.g. RRRD2929) */
    nationalAddress: v.optional(v.string()),
    /** Building number — 4 digits */
    buildingNumber: v.optional(v.string()),
    /** District / neighborhood (الحي) */
    district: v.optional(v.string()),
    /** Secondary number (الرقم الفرعي) — 4 digits */
    secondaryNumber: v.optional(v.string()),
    /** VAT / tax registration number */
    taxNumber: v.optional(v.string()),
    website: v.optional(v.string()),
    email: v.optional(v.string()),
    phoneNumber: v.optional(v.string()),
    /** Customer prepaid credit balance (default currency) */
    prepaidBalance: v.optional(v.number()),
    /** Credit limit (اجل) — default currency */
    creditLimit: v.optional(v.number()),
    /** Credit term in days — entered manually */
    creditPeriodDays: v.optional(v.number()),
    /** Outstanding credit used — automatic, default currency */
    creditUsed: v.optional(v.number()),
    /** Start of current credit term cycle — automatic */
    creditPeriodStartedAt: v.optional(v.number()),
    owner: v.id("users"),
    group: v.optional(v.id("groups")),
    createdBy: v.id("users"),
    updatedBy: v.optional(v.id("users")),
    updatedAt: v.optional(v.number()),
  })
    .index("by_name", ["name"])
    .index("by_phoneNumber", ["phoneNumber"])
    .index("by_email", ["email"])
    .index("by_group", ["group"])
    .index("by_owner", ["owner"]),

  /** Contacts table schema
   * @description Contacts table schema
   * @property {string} firstName - The first name of the contact
   * @property {string} lastName - The last name of the contact
   * @property {string} email - The email of the contact
   * @property {string} phoneNumber - The phone number of the contact
   * @property {string} createdBy - The user who created the contact
   * @property {string} updatedBy - The user who updated the contact
   * @property {number} updatedAt - The timestamp of the last update
   */

  contacts: defineTable({
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    jobTitle: v.optional(v.string()),
    company: v.optional(v.id("companies")),
    email: v.optional(v.string()),
    countryCode: v.optional(v.string()),
    phoneNumber: v.optional(v.string()),
    owner: v.id("users"),
    group: v.optional(v.id("groups")),
    createdBy: v.id("users"),
    updatedBy: v.optional(v.id("users")),
    updatedAt: v.optional(v.number()),
  })
    .index("by_firstName_lastName", ["firstName", "lastName"])
    .index("by_email", ["email"])
    .index("by_phoneNumber", ["phoneNumber"])
    .index("by_createdBy", ["createdBy"])
    .index("by_company", ["company"])
    .index("by_group", ["group"])
    .index("by_owner", ["owner"]),

  /** deals table schema
   * @description Deals table schema
   * @property {string} name - The name of the deal
   * @property {string} description - The description of the deal
   * @property {string} createdBy - The user who created the deal
   * @property {string} updatedBy - The user who updated the deal
   * @property {number} updatedAt - The timestamp of the last update
   */
  deals: defineTable({
    title: v.string(),
    description: v.optional(v.string()),
    owner: v.id("users"),
    group: v.optional(v.id("groups")),
    value: v.optional(v.number()),
    /** Deal value currency */
    currency: v.optional(v.id("currencies")),
    company: v.optional(v.id("companies")),
    contact: v.id("contacts"),
    stage: v.optional(
      v.union(
        v.literal("lead"),
        v.literal("contacted"),
        v.literal("negotiation"),
        v.literal("won"),
        v.literal("lost"),
      ),
    ),
    expectedCloseDate: v.optional(v.number()),
    actualCloseDate: v.optional(v.number()),
    probability: v.optional(v.number()),
    lossReason: v.optional(v.string()),
    createdBy: v.id("users"),
    updatedBy: v.optional(v.id("users")),
    updatedAt: v.optional(v.number()),
  })
    .index("by_title", ["title"])
    .index("by_group", ["group"])
    .index("by_company", ["company"])
    .index("by_contact", ["contact"])
    .index("by_createdBy", ["createdBy"])
    .index("by_owner", ["owner"])
    .index("by_stage", ["stage"])
    .index("by_updatedBy", ["updatedBy"]),

  /** Activities table schema
   * @description Activities table schema
   * @property {string} deal - The deal of the activity
   * @property {string} activityType - The type of the activity
   * @property {number} activityDate - The date of the activity
   * @property {string} activityDescription - The description of the activity
   * @property {string} createdBy - The user who created the activity
   * @property {string} updatedBy - The user who updated the activity
   * @property {number} updatedAt - The timestamp of the last update
   */
  activities: defineTable({
    deal: v.id("deals"),
    activityType: v.union(
      v.literal("call"),
      v.literal("email"),
      v.literal("meeting"),
      v.literal("note"),
      v.literal("task"),
    ),
    activityDate: v.number(),
    activityDescription: v.optional(v.string()),
    createdBy: v.id("users"),
    updatedBy: v.optional(v.id("users")),
    updatedAt: v.optional(v.number()),
  })
    .index("by_deal", ["deal"])
    .index("by_createdBy", ["createdBy"])
    .index("by_updatedBy", ["updatedBy"])
    .index("by_activityType", ["activityType"]),

  /** Products table schema
   * @description Products table schema
   * @property {string} name - The name of the product
   * @property {string} description - The description of the product
   * @property {number} price - The price of the product
   * @property {number} stock - The stock of the product
   * @property {string} createdBy - The user who created the product
   * @property {string} updatedBy - The user who updated the product
   * @property {number} updatedAt - The timestamp of the last update
   */
  products: defineTable({
    code: v.optional(v.string()),
    name: v.string(),
    categories: v.optional(v.array(v.id("categories"))),
    description: v.optional(v.string()),
    status: v.optional(
      v.union(v.literal("draft"), v.literal("active"), v.literal("archived")),
    ),
    stock: v.optional(v.number()),
    /** units mentioned in quotes (not yet enforced) */
    reserved: v.optional(v.number()),
    /** units that exceed the actual reserved stock (recalculated from the reserved and stock) */
    shortage: v.optional(v.number()),
    price: v.optional(v.number()),
    group: v.optional(v.id("groups")),
    createdBy: v.id("users"),
    updatedBy: v.optional(v.id("users")),
    updatedAt: v.optional(v.number()),
  })
    .index("by_name", ["name"])
    .index("by_code", ["code"])
    .index("by_categories", ["categories"])
    .index("by_status", ["status"])
    .index("by_createdBy", ["createdBy"])
    .index("by_updatedBy", ["updatedBy"])
    .index("by_group", ["group"])
    .index("by_group_status", ["group", "status"]),

  /** Services table schema
   * @description Services table schema
   * @property {string} name - The name of the service
   * @property {string} description - The description of the service
   * @property {number} price - The price of the service
   * @property {string} createdBy - The user who created the service
   * @property {string} updatedBy - The user who updated the service
   * @property {number} updatedAt - The timestamp of the last update
   */
  services: defineTable({
    code: v.optional(v.string()),
    name: v.string(),
    status: v.optional(
      v.union(v.literal("draft"), v.literal("active"), v.literal("archived")),
    ),
    description: v.optional(v.string()),
    categories: v.optional(v.array(v.id("categories"))),
    price: v.optional(v.number()),
    group: v.optional(v.id("groups")),
    createdBy: v.id("users"),
    updatedBy: v.optional(v.id("users")),
    updatedAt: v.optional(v.number()),
  })
    .index("by_name", ["name"])
    .index("by_code", ["code"])
    .index("by_status", ["status"])
    .index("by_categories", ["categories"])
    .index("by_createdBy", ["createdBy"])
    .index("by_updatedBy", ["updatedBy"])
    .index("by_group", ["group"]),

  /** Categories table schema
   * @description Categories table schema
   * @property {string} name - The name of the category
   * @property {string} description - The description of the category
   * @property {string} createdBy - The user who created the category
   * @property {string} updatedBy - The user who updated the category
   * @property {number} updatedAt - The timestamp of the last update
   */
  categories: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    group: v.optional(v.id("groups")),
    createdBy: v.id("users"),
    updatedBy: v.optional(v.id("users")),
    updatedAt: v.optional(v.number()),
  })
    .index("by_name", ["name"])
    .index("by_createdBy", ["createdBy"])
    .index("by_updatedBy", ["updatedBy"])
    .index("by_group", ["group"]),

  /** Quotes table schema
   * @description Quotes table schema
   * @property {string} deal - The deal of the quote
   * @property {array} products - The products of the quote
   * @property {number} total - The total of the quote
   * @property {string} createdBy - The user who created the quote
   * @property {string} updatedBy - The user who updated the quote
   * @property {number} updatedAt - The timestamp of the last update
   */
  quotes: defineTable({
    deal: v.id("deals"),
    number: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("draft"),
        v.literal("sent"),
        v.literal("accepted"),
        v.literal("invoiced"),
        v.literal("rejected"),
        v.literal("expired"),
      ),
    ),
    description: v.optional(v.string()),
    dueDate: v.optional(v.number()),
    issueDate: v.optional(v.number()),
    expirationDate: v.optional(v.number()),
    currency: v.optional(v.id("currencies")),
    /** immediate = pay on receipt; on_credit = client credit (اجل) */
    paymentMethod: v.optional(
      v.union(v.literal("immediate"), v.literal("on_credit")),
    ),
    paymentTerms: v.optional(v.id("paymentTerms")),
    shippingTerms: v.optional(v.id("shippingTerms")),
    deliveryTerms: v.optional(v.id("deliveryTerms")),
    deliveryDate: v.optional(v.number()),
    lineItems: v.optional(v.array(lineItemValidator)),
    services: v.optional(v.array(serviceLineItemValidator)),
    company: v.optional(v.id("companies")),
    contact: v.id("contacts"),
    /** Organizational company / branch */
    group: v.optional(v.id("groups")),
    subtotal: v.optional(v.number()),
    discount: v.optional(v.number()),
    shippingAmount: v.optional(v.number()),
    shippingTaxes: v.optional(
      v.array(
        v.object({
          taxId: v.id("taxes"),
          rate: v.number(),
          name: v.optional(v.string()),
        }),
      ),
    ),
    taxAmount: v.optional(v.number()),
    total: v.optional(v.number()),
    /** Revision number for the quote (e.g. QT-26-00003 R1) */
    revision: v.optional(v.number()),
    /** Set to true when an invoice is issued (linked quote + prevent modification) */
    invoiced: v.optional(v.boolean()),
    /** Legacy / partial-close flag stored on some quote documents */
    quoteClosingAmountsInvoiced: v.optional(v.boolean()),
    /** Legacy plaintext token — migrated to hash; do not write new values */
    publicViewToken: v.optional(v.string()),
    /** SHA-256 hash of the public view token (lookup only) */
    publicViewTokenExpiresAt: v.optional(v.number()),
    publicViewTokenHash: v.optional(v.string()),
    /** AES-GCM encrypted token for authorized re-print (optional) */
    publicViewTokenEnc: v.optional(v.string()),
    createdBy: v.id("users"),
    updatedBy: v.optional(v.id("users")),
    updatedAt: v.optional(v.number()),
  })
    .index("by_deal", ["deal"])
    .index("by_createdBy", ["createdBy"])
    .index("by_company", ["company"])
    .index("by_contact", ["contact"])
    .index("by_group", ["group"])
    .index("by_status", ["status"])
    .index("by_group_status", ["group", "status"])
    .index("by_publicViewToken", ["publicViewToken"])
    .index("by_publicViewTokenHash", ["publicViewTokenHash"]),

  /** Audit log: quotes, deals, invoices, etc. */
  auditLogs: defineTable({
    /** Document ID (as string) to join with entityType */
    entityId: v.string(),
    entityType: v.string(),
    action: v.string(),
    changes: v.optional(v.any()),
    performedBy: v.id("users"),
    timestamp: v.number(),
  })
    .index("by_entity", ["entityId"])
    .index("by_entity_type", ["entityType", "entityId"])
    .index("by_timestamp", ["timestamp"]),

  /** Invoices table schema
   * @description Invoices table schema
   * @property {string} quote - The quote of the invoice
   * @property {string} createdBy - The user who created the invoice
   * @property {string} updatedBy - The user who updated the invoice
   * @property {number} updatedAt - The timestamp of the last update
   */
  invoices: defineTable({
    quote: v.id("quotes"),
    deal: v.optional(v.id("deals")),
    company: v.optional(v.id("companies")),
    contact: v.id("contacts"),
    /** Organizational company / branch */
    group: v.optional(v.id("groups")),
    number: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("draft"),
        v.literal("sent"),
        v.literal("paid"),
        v.literal("partially_paid"),
        v.literal("overdue"),
        v.literal("void"),
      ),
    ),
    description: v.optional(v.string()),
    dueDate: v.optional(v.number()),
    issueDate: v.optional(v.number()),
    expirationDate: v.optional(v.number()),
    lineItems: v.optional(v.array(lineItemValidator)),
    services: v.optional(v.array(serviceLineItemValidator)),
    subtotal: v.optional(v.number()),
    discount: v.optional(v.number()),
    shippingAmount: v.optional(v.number()),
    taxAmount: v.optional(v.number()),
    total: v.optional(v.number()),
    currency: v.optional(v.id("currencies")),
    /** Amount still counted against client credit (default currency) */
    creditOutstanding: v.optional(v.number()),
    /** Whether this invoice consumes the client's credit line */
    onCredit: v.optional(v.boolean()),
    paymentTerms: v.optional(v.id("paymentTerms")),
    shippingTerms: v.optional(v.id("shippingTerms")),
    deliveryTerms: v.optional(v.id("deliveryTerms")),
    deliveryDate: v.optional(v.number()),
    /** Legacy plaintext token — migrated to hash; do not write new values */
    publicViewToken: v.optional(v.string()),
    /** SHA-256 hash of the public view token (lookup only) */
    publicViewTokenExpiresAt: v.optional(v.number()),
    publicViewTokenHash: v.optional(v.string()),
    /** AES-GCM encrypted token for authorized re-print (optional) */
    publicViewTokenEnc: v.optional(v.string()),
    createdBy: v.id("users"),
    updatedBy: v.optional(v.id("users")),
    updatedAt: v.optional(v.number()),
  })
    .index("by_quote", ["quote"])
    .index("by_createdBy", ["createdBy"])
    .index("by_updatedBy", ["updatedBy"])
    .index("by_status", ["status"])
    .index("by_company", ["company"])
    .index("by_contact", ["contact"])
    .index("by_deal", ["deal"])
    .index("by_group", ["group"])
    .index("by_group_status", ["group", "status"])
    .index("by_publicViewToken", ["publicViewToken"])
    .index("by_publicViewTokenHash", ["publicViewTokenHash"]),

  /** Receipt vouchers — payments linked to invoices, deals, quotes, or general credit */
  receiptVouchers: defineTable({
    number: v.optional(v.string()),
    company: v.id("companies"),
    contact: v.id("contacts"),
    /** Organizational company / branch */
    group: v.optional(v.id("groups")),
    /** general_credit | invoice_payment | deal_advance | quote_advance */
    voucherContext: v.optional(
      v.union(
        v.literal("general_credit"),
        v.literal("invoice_payment"),
        v.literal("deal_advance"),
        v.literal("quote_advance"),
      ),
    ),
    deal: v.optional(v.id("deals")),
    quote: v.optional(v.id("quotes")),
    /** Gross paid amount in the voucher currency */
    amount: v.number(),
    /** Net amount after payment-method tax (amount - tax) */
    netAmount: v.optional(v.number()),
    currency: v.id("currencies"),
    /** Gross amount in the default currency (when voucher currency differs) */
    amountInDefaultCurrency: v.optional(v.number()),
    /** Net amount in the default currency after tax */
    netAmountInDefaultCurrency: v.optional(v.number()),
    /** Exchange rate actually used (user-editable) */
    exchangeRateUsed: v.optional(v.number()),
    paymentMethod: v.union(
      v.literal("cash"),
      v.literal("bank_transfer"),
      v.literal("check"),
      v.literal("credit_card"),
      v.literal("other"),
    ),
    /** Destination bank account (bank transfer / credit card) */
    bankAccount: v.optional(v.id("bankAccounts")),
    /** Optional tax on payment method — stored on the voucher */
    paymentMethodTaxRate: v.optional(v.number()),
    paymentMethodTaxAmount: v.optional(v.number()),
    /** Linked document references (e.g. invoice IDs) */
    references: v.optional(v.array(v.id("invoices"))),
    /** Amount allocated per referenced invoice */
    allocations: v.optional(
      v.array(
        v.object({
          invoiceId: v.id("invoices"),
          amount: v.number(),
          amountInDefaultCurrency: v.optional(v.number()),
        }),
      ),
    ),
    /** Total allocated amount (sum of allocations) */
    usedAmount: v.number(),
    /** Remaining unallocated amount */
    remainingAmount: v.number(),
    /** Portion of remaining amount credited to company prepaid balance (default currency) */
    balanceCreditInDefault: v.optional(v.number()),
    issueDate: v.optional(v.number()),
    description: v.optional(v.string()),
    createdBy: v.id("users"),
    updatedBy: v.optional(v.id("users")),
    updatedAt: v.optional(v.number()),
  })
    .index("by_company", ["company"])
    .index("by_contact", ["contact"])
    .index("by_createdBy", ["createdBy"])
    .index("by_number", ["number"])
    .index("by_deal", ["deal"])
    .index("by_quote", ["quote"])
    .index("by_group", ["group"]),

  /** Bank accounts for receiving transfers and card payments */
  bankAccounts: defineTable({
    /** Optional display label; defaults to bank name when omitted */
    name: v.optional(v.string()),
    bankName: v.string(),
    accountNumber: v.string(),
    iban: v.string(),
    swift: v.optional(v.string()),
    country: v.string(),
    city: v.string(),
    currency: v.id("currencies"),
    /** Only one account may be primary at a time */
    isPrimary: v.optional(v.boolean()),
    active: v.optional(v.boolean()),
    group: v.optional(v.id("groups")),
    createdBy: v.id("users"),
    updatedBy: v.optional(v.id("users")),
    updatedAt: v.optional(v.number()),
  })
    .index("by_name", ["name"])
    .index("by_createdBy", ["createdBy"])
    .index("by_isPrimary", ["isPrimary"])
    .index("by_group", ["group"]),

  /** Client credit ledger — tracks credit limit usage per company */
  companyCreditLedger: defineTable({
    company: v.id("companies"),
    group: v.optional(v.id("groups")),
    /** increase = more available credit; decrease = less available (used for invoice) */
    movementType: v.union(v.literal("increase"), v.literal("decrease")),
    amount: v.number(),
    creditUsedBefore: v.number(),
    creditUsedAfter: v.number(),
    creditAvailableBefore: v.number(),
    creditAvailableAfter: v.number(),
    sourceType: v.union(
      v.literal("manual_limit_update"),
      v.literal("invoice_credit"),
      v.literal("invoice_payment"),
      v.literal("invoice_void"),
    ),
    sourceLabel: v.optional(v.string()),
    referenceType: v.optional(v.string()),
    referenceId: v.optional(v.string()),
    invoice: v.optional(v.id("invoices")),
    receiptVoucher: v.optional(v.id("receiptVouchers")),
    note: v.optional(v.string()),
    performedBy: v.id("users"),
    timestamp: v.number(),
  })
    .index("by_company", ["company"])
    .index("by_group", ["group"])
    .index("by_invoice", ["invoice"]),

  /** Payment Terms table schema
   * @description Payment Terms table schema
   * @property {string} name - The name of the payment term
   * @property {string} description - The description of the payment term
   * @property {string} createdBy - The user who created the payment term
   * @property {string} updatedBy - The user who updated the payment term
   * @property {number} updatedAt - The timestamp of the last update
   */
  paymentTerms: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    createdBy: v.id("users"),
    updatedBy: v.optional(v.id("users")),
    updatedAt: v.optional(v.number()),
  })
    .index("by_name", ["name"])
    .index("by_createdBy", ["createdBy"])
    .index("by_updatedBy", ["updatedBy"]),

  /** Shipping Terms table schema
   * @description Shipping Terms table schema
   * @property {string} name - The name of the shipping term
   * @property {string} description - The description of the shipping term
   * @property {string} createdBy - The user who created the shipping term
   * @property {string} updatedBy - The user who updated the shipping term
   * @property {number} updatedAt - The timestamp of the last update
   */
  shippingTerms: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    createdBy: v.id("users"),
    updatedBy: v.optional(v.id("users")),
    updatedAt: v.optional(v.number()),
  })
    .index("by_name", ["name"])
    .index("by_createdBy", ["createdBy"])
    .index("by_updatedBy", ["updatedBy"]),

  /** Delivery Terms table schema
   * @description Delivery Terms table schema
   * @property {string} name - The name of the delivery term
   * @property {string} description - The description of the delivery term
   * @property {string} createdBy - The user who created the delivery term
   * @property {string} updatedBy - The user who updated the delivery term
   * @property {number} updatedAt - The timestamp of the last update
   */
  deliveryTerms: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    createdBy: v.id("users"),
    updatedBy: v.optional(v.id("users")),
    updatedAt: v.optional(v.number()),
  })
    .index("by_name", ["name"])
    .index("by_createdBy", ["createdBy"])
    .index("by_updatedBy", ["updatedBy"]),

  /** Currencies table schema
   * @description Currencies table schema
   * @property {string} name - The name of the currency
   * @property {string} symbol - The symbol of the currency
   * @property {boolean} default - Whether the currency is the default currency
   * @property {string} createdBy - The user who created the currency
   * @property {string} updatedBy - The user who updated the currency
   * @property {number} updatedAt - The timestamp of the last update
   */
  currencies: defineTable({
    name: v.string(),
    symbol: v.string(),
    default: v.optional(v.boolean()),
    exchangeRate: v.optional(v.number()),
    /** Default currency units per 1 unit of this currency (non-default only) */
    group: v.optional(v.id("groups")),
    createdBy: v.id("users"),
    updatedBy: v.optional(v.id("users")),
    updatedAt: v.optional(v.number()),
  })
    .index("by_name", ["name"])
    .index("by_symbol", ["symbol"])
    .index("by_createdBy", ["createdBy"])
    .index("by_updatedBy", ["updatedBy"])
    .index("by_group", ["group"]),

  /** Taxes table schema
   * @description Taxes table schema
   * @property {string} code - The code of the tax
   * @property {string} name - The name of the tax
   * @property {number} rate - The rate of the tax
   * @property {string} createdBy - The user who created the tax
   * @property {string} updatedBy - The user who updated the tax
   * @property {number} updatedAt - The timestamp of the last update
   */
  taxes: defineTable({
    code: v.optional(v.string()),
    name: v.string(),
    rate: v.optional(v.number()),
    group: v.optional(v.id("groups")),
    createdBy: v.id("users"),
    updatedBy: v.optional(v.id("users")),
    updatedAt: v.optional(v.number()),
  })
    .index("by_name", ["name"])
    .index("by_code", ["code"])
    .index("by_createdBy", ["createdBy"])
    .index("by_group", ["group"]),

  /** Pending invitations — role + groups chosen at invitation time */
  pendingInvitations: defineTable({
    email: v.string(),
    roleId: v.id("roles"),
    groupIds: v.array(v.id("groups")),
    invitedBy: v.id("users"),
    clerkInvitationId: v.optional(v.string()),
    usedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_email", ["email"])
    .index("by_invitedBy", ["invitedBy"]),

  /** Settings — one document per organizational company (group) */
  settings: defineTable({
    group: v.optional(v.id("groups")),
    defaultCurrency: v.optional(v.id("currencies")),

    // ── Quote numbering ────────────────────────────────────────────────
    quoteNumberMode: v.optional(
      v.union(v.literal("auto"), v.literal("manual")),
    ),
    quoteNumberPrefix: v.optional(v.string()),
    quoteNumberIncludeYear: v.optional(v.boolean()),
    quoteNumberPadding: v.optional(v.number()),
    quoteNextSequence: v.optional(v.number()),

    // ── Invoice numbering ──────────────────────────────────────────────
    invoiceNumberMode: v.optional(
      v.union(v.literal("auto"), v.literal("manual")),
    ),
    invoiceNumberPrefix: v.optional(v.string()),
    invoiceNumberIncludeYear: v.optional(v.boolean()),
    invoiceNumberPadding: v.optional(v.number()),
    invoiceNextSequence: v.optional(v.number()),

    // ── Product code numbering ─────────────────────────────────────────
    productCodeMode: v.optional(
      v.union(v.literal("auto"), v.literal("manual")),
    ),
    productCodePrefix: v.optional(v.string()),
    productCodeIncludeYear: v.optional(v.boolean()),
    productCodePadding: v.optional(v.number()),
    productNextSequence: v.optional(v.number()),

    // ── Receipt voucher numbering ──────────────────────────────────────
    receiptVoucherNumberMode: v.optional(
      v.union(v.literal("auto"), v.literal("manual")),
    ),
    receiptVoucherNumberPrefix: v.optional(v.string()),
    receiptVoucherNumberIncludeYear: v.optional(v.boolean()),
    receiptVoucherNumberPadding: v.optional(v.number()),
    receiptVoucherNextSequence: v.optional(v.number()),

    /** When false (default), document-level taxes apply to all lines uniformly. */
    allowPerLineTaxes: v.optional(v.boolean()),
    /** Taxes pre-selected when creating a new quote. */
    defaultTaxIds: v.optional(v.array(v.id("taxes"))),

    /** Company logo for print documents (quotes, invoices). */
    companyLogoStorageId: v.optional(v.id("_storage")),

    updatedBy: v.optional(v.id("users")),
    updatedAt: v.optional(v.number()),
  })
    .index("by_group", ["group"]),
});
