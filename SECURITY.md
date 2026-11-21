# Security and deployment

The backend enforces company scope on staff endpoints and nested document references. Existing operation permissions still apply. User administration and invitations require `admin:all`; delegated `users:update` alone cannot grant roles. Ownership transfers and attaching stored logos require an administrator.

## Deploying the security update

1. Back up the production database privately. Review legacy records and assign each business record to its correct company. Records without a company fail closed for staff. Resolve cross-company document relationships before deployment; do not assign everything to a default company.
2. Configure `PUBLIC_VIEW_TOKEN_ENCRYPTION_KEY` in the Convex deployment as a securely generated 32-byte key encoded as 64 hexadecimal characters. Never commit the key. Existing public links without an expiry stop working; authorized staff must regenerate them. New links expire after 30 days and can be revoked.
3. For a new workspace only, configure `BOOTSTRAP_ADMIN_SUBJECT` to the intended owner's verified Clerk subject. Remove it after initialization. Existing workspaces with roles cannot use bootstrap; recovery is an operator task.
4. Deploy the Convex functions and schema, then deploy the frontend from the same revision. Public document endpoints are mutations now because they persist a shared rate budget; deploying only one side is incompatible. No production deployment is performed by a GitHub visibility change.
5. Smoke-test an administrator, staff in two separate companies, a pending user and an anonymous visitor. Verify printable documents, payments, and public link rotation/revocation.

Public document access is bearer-link access. Its data endpoint allows 40 requests per token and 600 total requests per minute per deployment. The shared global limit bounds work but can be exhausted by hostile traffic; use a trusted edge/WAF for stronger abuse protection at scale. The Next.js memory limit is supplementary only.

Run `npm ci --ignore-scripts`, `npm run typecheck`, `npm test`, `npm audit`, and `npm run build` on Node 24. Build requires the public Clerk key and Convex URL. Security tests use a simulated Convex backend and do not contact production.

Do not post credentials or customer data in public issues. Use GitHub private vulnerability reporting when enabled, or contact the repository owner privately.

## Third-party assets

Restricted Thmanyah font files are not distributed; the interface uses installed system fonts. `app/vendor/shadcn.css` is the stylesheet from shadcn 4.13.0, distributed with its MIT notice in the same directory. It does not require installing the shadcn CLI dependency tree.

Publishing source does not grant rights to unrelated third-party assets. No project-wide open-source license is selected by this security update.
