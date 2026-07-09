"use client";

import { useEffect, useRef, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useLocale } from "next-intl";
import {
  IconCheck,
  IconLoader2,
  IconRefresh,
  IconShieldCheck,
  IconUserCircle,
} from "@tabler/icons-react";
import { api } from "@/convex/_generated/api";

// ---------------------------------------------------------------------------
// Inline strings — avoids translation-file changes for a one-time screen
// ---------------------------------------------------------------------------
const T = {
  ar: {
    syncing: "جارٍ المزامنة…",
    setupTitle: "تهيئة بيئة العمل",
    setupDesc: "يُنشأ الآن حساب المدير العام وبيئة العمل الافتراضية.",
    step1: "إنشاء دور المدير العام",
    step2: "إنشاء مجموعة العمل الافتراضية",
    step3: "تعيين الصلاحيات وربط الحساب",
    done: "اكتملت التهيئة بنجاح! جارٍ التوجيه…",
    errTitle: "فشلت عملية التهيئة",
    retry: "إعادة المحاولة",
    pendingTitle: "بانتظار موافقة المدير",
    pendingDesc:
      "تم تسجيل حسابك. يرجى الانتظار حتى يقوم المدير بتفعيل حسابك وتعيين دورك في النظام.",
  },
  en: {
    syncing: "Syncing account…",
    setupTitle: "Initializing Workspace",
    setupDesc: "Creating your Super Admin account and default workspace.",
    step1: "Creating Super Admin role",
    step2: "Creating default workspace",
    step3: "Assigning permissions & linking account",
    done: "Workspace ready! Redirecting…",
    errTitle: "Initialization failed",
    retry: "Retry",
    pendingTitle: "Awaiting Admin Approval",
    pendingDesc:
      "Your account has been registered. Please wait for the administrator to activate your account and assign your role.",
  },
} as const;

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
  // Keep setup screen visible for 1.5 s after done so user sees confirmation
  const [showSetupScreen, setShowSetupScreen] = useState(false);
  const hasRun = useRef(false);

  const status = setupStatus?.status;

  // Trigger bootstrap exactly once when setup is needed
  useEffect(() => {
    if (status !== "setup_needed" || hasRun.current) return;
    hasRun.current = true;
    setShowSetupScreen(true);
    setPhase("running");

    (async () => {
      try {
        setStep(1);
        await delay(450);
        setStep(2);
        await delay(450);
        setStep(3);
        await bootstrapAdmin({});
        setPhase("done");
        setStep(4);
        // Hold the success screen briefly before handing off to the dashboard
        await delay(1600);
        setShowSetupScreen(false);
      } catch (e: unknown) {
        setPhase("error");
        setErrorMsg(e instanceof Error ? e.message : "Unknown error");
      }
    })();
  }, [status, bootstrapAdmin]);

  // ── Pass-through conditions ──────────────────────────────────────────────
  // 1. Auth is still loading → nothing to gate yet
  if (authLoading) return null;

  // 2. Not authenticated (middleware handles redirect) or fully ready
  if (!isAuthenticated) return <>{children}</>;

  // 3. Query not yet resolved — show spinner
  if (!setupStatus) return <FullPage dir={dir}><Spinner label={s.syncing} /></FullPage>;

  // 4. Setup screen active (running / done / error)
  if (showSetupScreen || status === "setup_needed") {
    const steps = [s.step1, s.step2, s.step3];
    return (
      <FullPage dir={dir}>
        <Card>
          {/* Icon + title */}
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="bg-primary/10 rounded-full p-4">
              <IconShieldCheck className="text-primary h-10 w-10" />
            </div>
            <h1 className="text-foreground text-xl font-semibold">
              {s.setupTitle}
            </h1>
            <p className="text-muted-foreground text-sm">{s.setupDesc}</p>
          </div>

          {/* Steps */}
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
            <div className="mt-6 space-y-4">
              <p className="text-destructive text-center text-sm">
                {s.errTitle}: {errorMsg}
              </p>
              <button
                onClick={() => {
                  hasRun.current = false;
                  setPhase("idle");
                  setStep(0);
                  setErrorMsg(null);
                  setShowSetupScreen(false);
                }}
                className="bg-primary text-primary-foreground flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
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

  // 5. Syncing (webhook hasn't fired yet)
  if (status === "syncing") {
    return (
      <FullPage dir={dir}>
        <Spinner label={s.syncing} />
      </FullPage>
    );
  }

  // 6. Registered but waiting for admin approval
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

  // 7. Ready — render the actual app
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
      <p className="text-muted-foreground text-sm">{label}</p>
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
