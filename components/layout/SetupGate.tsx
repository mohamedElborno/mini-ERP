"use client";

import { useEffect, useRef, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useLocale } from "next-intl";
import {
  IconAlertTriangle,
  IconCheck,
  IconLoader2,
  IconRefresh,
  IconShieldCheck,
  IconUserCircle,
} from "@tabler/icons-react";
import { api } from "@/convex/_generated/api";

// ---------------------------------------------------------------------------
// Inline strings — one-time screen, no need for i18n files
// ---------------------------------------------------------------------------
const T = {
  ar: {
    syncing: "جارٍ المزامنة… قد يستغرق بضع ثوانٍ.",
    setupTitle: "تهيئة بيئة العمل",
    setupDesc: "يُنشأ الآن حساب المدير العام وبيئة العمل الافتراضية.",
    step1: "إنشاء دور المدير العام",
    step2: "إنشاء مجموعة العمل الافتراضية",
    step3: "تعيين الصلاحيات وربط الحساب",
    done: "اكتملت التهيئة بنجاح! جارٍ التوجيه…",
    errTitle: "فشلت عملية التهيئة",
    errDetail: "تفاصيل الخطأ:",
    retry: "إعادة المحاولة",
    pendingTitle: "بانتظار موافقة المدير",
    pendingDesc:
      "تم تسجيل حسابك. يرجى الانتظار حتى يقوم المدير بتفعيل حسابك وتعيين دورك في النظام.",
    misconfTitle: "خطأ في ضبط الاتصال بـ Convex",
    misconfDesc:
      "المصادقة مع Clerk غير مضبوطة في Convex. يرجى التأكد من ضبط متغير CLERK_ISSUER_URL في إعدادات Convex للإنتاج.",
    misconfCmd: "npx convex env set CLERK_ISSUER_URL <رابط-Clerk>",
  },
  en: {
    syncing: "Syncing account… this may take a few seconds.",
    setupTitle: "Initializing Workspace",
    setupDesc: "Creating your Super Admin account and default workspace.",
    step1: "Creating Super Admin role",
    step2: "Creating default workspace",
    step3: "Assigning permissions & linking account",
    done: "Workspace ready! Redirecting…",
    errTitle: "Initialization failed",
    errDetail: "Error details:",
    retry: "Retry",
    pendingTitle: "Awaiting Admin Approval",
    pendingDesc:
      "Your account has been registered. Please wait for the administrator to activate your account and assign your role.",
    misconfTitle: "Convex authentication not configured",
    misconfDesc:
      "Clerk JWT verification is not set up in your Convex deployment. Set CLERK_ISSUER_URL in your production Convex environment variables.",
    misconfCmd: "npx convex env set CLERK_ISSUER_URL <your-clerk-issuer-url>",
  },
} as const;

type SetupStatus =
  | "auth_misconfigured"
  | "syncing"
  | "setup_needed"
  | "pending_approval"
  | "ready";

// ---------------------------------------------------------------------------
// SetupGate
// ---------------------------------------------------------------------------
export function SetupGate({ children }: { children: React.ReactNode }) {
  const locale = useLocale();
  const s = T[locale === "ar" ? "ar" : "en"];
  const dir = locale === "ar" ? "rtl" : "ltr";

  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();

  const setupStatus = useQuery(
    api.users.getSetupStatus,
    authLoading || !isAuthenticated ? "skip" : {},
  );

  const bootstrapAdmin = useMutation(api.users.bootstrapAdmin);

  const [phase, setPhase] = useState<"idle" | "running" | "done" | "error">(
    "idle",
  );
  const [step, setStep] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showSetupScreen, setShowSetupScreen] = useState(false);
  const hasRun = useRef(false);

  const status: SetupStatus | undefined = setupStatus?.status as
    | SetupStatus
    | undefined;

  // Trigger bootstrap exactly once when setup is needed
  useEffect(() => {
    if (status !== "setup_needed" || hasRun.current) return;
    hasRun.current = true;
    setShowSetupScreen(true);
    setPhase("running");

    (async () => {
      try {
        setStep(1);
        await delay(400);
        setStep(2);
        await delay(400);
        setStep(3);
        await bootstrapAdmin({});
        setPhase("done");
        setStep(4);
        // Brief confirmation before showing the dashboard
        await delay(1400);
        setShowSetupScreen(false);
      } catch (e: unknown) {
        setPhase("error");
        setErrorMsg(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [status, bootstrapAdmin]);

  // ── Pass-through conditions ──────────────────────────────────────────────
  if (authLoading) return null;
  if (!isAuthenticated) return <>{children}</>;

  // Query not yet resolved
  if (!setupStatus) {
    return (
      <FullPage dir={dir}>
        <Spinner label={s.syncing} />
      </FullPage>
    );
  }

  // ── Convex auth misconfigured ─────────────────────────────────────────────
  // isAuthenticated=true (Clerk works) but Convex can't verify the JWT
  if (status === "auth_misconfigured") {
    return (
      <FullPage dir={dir}>
        <Card>
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="bg-destructive/10 rounded-full p-4">
              <IconAlertTriangle className="text-destructive h-10 w-10" />
            </div>
            <h1 className="text-foreground text-xl font-semibold">
              {s.misconfTitle}
            </h1>
            <p className="text-muted-foreground text-sm">{s.misconfDesc}</p>
            <code className="bg-muted text-muted-foreground mt-1 block w-full rounded-lg px-3 py-2 text-left text-xs font-mono">
              {s.misconfCmd}
            </code>
          </div>
        </Card>
      </FullPage>
    );
  }

  // ── Setup screen (running / done / error) ────────────────────────────────
  if (showSetupScreen || status === "setup_needed") {
    const steps = [s.step1, s.step2, s.step3];
    return (
      <FullPage dir={dir}>
        <Card>
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="bg-primary/10 rounded-full p-4">
              <IconShieldCheck className="text-primary h-10 w-10" />
            </div>
            <h1 className="text-foreground text-xl font-semibold">
              {s.setupTitle}
            </h1>
            <p className="text-muted-foreground text-sm">{s.setupDesc}</p>
          </div>

          {phase !== "error" ? (
            <div className="mt-6 space-y-3">
              {steps.map((label, i) => {
                const num = i + 1;
                const isDone = step > num || phase === "done";
                const isActive = phase === "running" && step === num;
                return (
                  <div key={i} className="flex items-center gap-3">
                    <StepIcon done={isDone} active={isActive} />
                    <span
                      className={`text-sm ${
                        isDone
                          ? "text-foreground font-medium"
                          : isActive
                            ? "text-foreground"
                            : "text-muted-foreground"
                      }`}
                    >
                      {label}
                    </span>
                  </div>
                );
              })}
              {phase === "done" && (
                <p className="text-primary mt-4 text-center text-sm font-medium">
                  {s.done}
                </p>
              )}
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              <div className="bg-destructive/5 border-destructive/20 rounded-lg border p-3 text-sm">
                <p className="text-destructive font-medium">{s.errTitle}</p>
                {errorMsg && (
                  <p className="text-muted-foreground mt-1 font-mono text-xs">
                    {s.errDetail} {errorMsg}
                  </p>
                )}
              </div>
              <button
                onClick={() => {
                  hasRun.current = false;
                  setPhase("idle");
                  setStep(0);
                  setErrorMsg(null);
                  // Keep showSetupScreen true so the screen stays visible
                  // and the effect re-fires naturally
                }}
                className="bg-primary text-primary-foreground hover:bg-primary/90 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
              >
                <IconRefresh className="h-4 w-4" />
                {s.retry}
              </button>
            </div>
          )}
        </Card>
      </FullPage>
    );
  }

  // ── Waiting for Clerk webhook to sync ────────────────────────────────────
  if (status === "syncing") {
    return (
      <FullPage dir={dir}>
        <Spinner label={s.syncing} />
      </FullPage>
    );
  }

  // ── Registered but waiting for admin to assign a role ───────────────────
  if (status === "pending_approval") {
    return (
      <FullPage dir={dir}>
        <Card>
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="bg-muted rounded-full p-4">
              <IconUserCircle className="text-muted-foreground h-10 w-10" />
            </div>
            <h1 className="text-foreground text-xl font-semibold">
              {s.pendingTitle}
            </h1>
            <p className="text-muted-foreground text-sm">{s.pendingDesc}</p>
          </div>
        </Card>
      </FullPage>
    );
  }

  // ── Ready — render the actual app ────────────────────────────────────────
  return <>{children}</>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function FullPage({
  children,
  dir,
}: {
  children: React.ReactNode;
  dir: string;
}) {
  return (
    <div
      dir={dir}
      className="bg-background flex min-h-screen w-full items-center justify-center px-4"
    >
      {children}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-border bg-card w-full max-w-md rounded-2xl border p-8 shadow-lg">
      {children}
    </div>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <IconLoader2 className="text-primary h-10 w-10 animate-spin" />
      <p className="text-muted-foreground max-w-xs text-sm">{label}</p>
    </div>
  );
}

function StepIcon({ done, active }: { done: boolean; active: boolean }) {
  return (
    <div
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors ${
        done
          ? "bg-primary border-primary"
          : active
            ? "border-primary"
            : "border-border"
      }`}
    >
      {done ? (
        <IconCheck className="text-primary-foreground h-3.5 w-3.5" />
      ) : active ? (
        <IconLoader2 className="text-primary h-3.5 w-3.5 animate-spin" />
      ) : null}
    </div>
  );
}
