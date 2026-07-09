"use client";

import { useSignIn } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useCallback, useState } from "react";

type Step = "credentials" | "mfa";

type SecondFactorKind = "totp" | "email_code";

function inputClassName(invalid: boolean) {
  return [
    "w-full rounded-[0.625rem] border bg-background/50 px-3 py-2.5 text-sm text-foreground shadow-sm transition-[color,box-shadow]",
    "placeholder:text-muted-foreground",
    "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
    invalid ? "border-destructive" : "border-border",
  ].join(" ");
}

function clerkErrorMessage(err: { longMessage?: string; message?: string } | null): string | null {
  if (!err) return null;
  return err.longMessage ?? err.message ?? null;
}

function pickSecondFactor(
  factors: { strategy: string; safe_identifier?: string }[] | null | undefined,
): { kind: SecondFactorKind; maskedDestination?: string } | null {
  if (!factors?.length) return null;
  if (factors.some((f) => f.strategy === "totp")) {
    return { kind: "totp" };
  }
  const emailFactor = factors.find((f) => f.strategy === "email_code");
  if (emailFactor && "safe_identifier" in emailFactor && emailFactor.safe_identifier) {
    return { kind: "email_code", maskedDestination: String(emailFactor.safe_identifier) };
  }
  if (emailFactor) {
    return { kind: "email_code" };
  }
  return null;
}

export function SignInView() {
  const t = useTranslations("signIn");
  const router = useRouter();
  const { signIn, fetchStatus } = useSignIn();

  const [step, setStep] = useState<Step>("credentials");
  const [secondFactor, setSecondFactor] = useState<SecondFactorKind | null>(null);
  const [mfaDestination, setMfaDestination] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const clearError = useCallback(() => setFormError(null), []);

  const finalizeAndGoHome = useCallback(async () => {
    if (!signIn) return;
    const { error: finErr } = await signIn.finalize();
    const finMsg = clerkErrorMessage(finErr);
    if (finMsg) {
      setFormError(finMsg);
      return;
    }
    router.replace("/");
  }, [router, signIn]);

  const enterSecondFactorStep = useCallback(
    async (picked: { kind: SecondFactorKind; maskedDestination?: string }) => {
      if (!signIn) return false;
      setSecondFactor(picked.kind);
      setMfaDestination(picked.maskedDestination ?? null);
      setMfaCode("");
      clearError();

      if (picked.kind === "email_code") {
        const { error } = await signIn.mfa.sendEmailCode();
        const msg = clerkErrorMessage(error);
        if (msg) {
          setFormError(msg);
          setSecondFactor(null);
          await signIn.reset();
          return false;
        }
      }

      setStep("mfa");
      return true;
    },
    [clearError, signIn],
  );

  const onCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signIn || fetchStatus !== "idle") return;
    clearError();
    setSubmitting(true);
    const trimmed = email.trim();
    try {
      const { error: createErr } = await signIn.create({ identifier: trimmed });
      const createMsg = clerkErrorMessage(createErr);
      if (createMsg) {
        setFormError(createMsg);
        return;
      }

      const { error: pwErr } = await signIn.password({ password });
      const pwMsg = clerkErrorMessage(pwErr);
      if (pwMsg) {
        setFormError(pwMsg);
        return;
      }

      if (signIn.status === "complete" && signIn.createdSessionId) {
        await finalizeAndGoHome();
        return;
      }

      if (signIn.status === "needs_second_factor") {
        const picked = pickSecondFactor(signIn.supportedSecondFactors);
        if (picked) {
          await enterSecondFactorStep(picked);
          return;
        }
        setFormError(t("form.errors.unsupportedSecondFactor"));
        return;
      }

      if (signIn.status === "needs_new_password") {
        setFormError(t("form.errors.needsNewPassword"));
        return;
      }

      setFormError(t("form.errors.generic"));
    } finally {
      setSubmitting(false);
    }
  };

  const onMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signIn || fetchStatus !== "idle" || !secondFactor) return;
    clearError();
    setSubmitting(true);
    try {
      const code = mfaCode.trim().replace(/\s/g, "");
      const { error: mfaErr } =
        secondFactor === "totp"
          ? await signIn.mfa.verifyTOTP({ code })
          : await signIn.mfa.verifyEmailCode({ code });
      const mfaMsg = clerkErrorMessage(mfaErr);
      if (mfaMsg) {
        setFormError(mfaMsg);
        return;
      }

      if (signIn.status === "complete" && signIn.createdSessionId) {
        await finalizeAndGoHome();
        return;
      }

      setFormError(t("form.errors.generic"));
    } finally {
      setSubmitting(false);
    }
  };

  const onResendEmailCode = async () => {
    if (!signIn || fetchStatus !== "idle" || secondFactor !== "email_code") return;
    clearError();
    setResending(true);
    try {
      const { error } = await signIn.mfa.sendEmailCode();
      const msg = clerkErrorMessage(error);
      if (msg) {
        setFormError(msg);
        return;
      }
      setFormError(null);
    } finally {
      setResending(false);
    }
  };

  const resetFlow = async () => {
    await signIn?.reset();
    setStep("credentials");
    setSecondFactor(null);
    setMfaDestination(null);
    setMfaCode("");
    clearError();
  };

  const busy = fetchStatus === "fetching" || !signIn;

  const mfaTitle =
    secondFactor === "email_code" ? t("form.emailCodeTitle") : t("form.twoFactorTitle");
  const mfaHint =
    secondFactor === "email_code"
      ? t("form.emailCodeHint", {
          email: mfaDestination ?? (email.trim() || "—"),
        })
      : t("form.twoFactorHint");

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_55%_at_50%_-15%,oklch(0.35_0.02_264/0.35),transparent)] dark:bg-[radial-gradient(ellipse_90%_55%_at_50%_-15%,oklch(0.45_0.08_264/0.25),transparent)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,oklch(0.985_0_0/0.03),transparent_40%)] dark:bg-[linear-gradient(to_bottom,oklch(1_0_0/0.04),transparent_35%)]"
      />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:items-stretch">
        <aside className="hidden flex-col justify-between border-border/60 px-10 py-12 lg:flex lg:border-e">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              {t("panelBadge")}
            </p>
            <h1 className="mt-6 max-w-md text-3xl font-semibold leading-tight tracking-tight text-foreground md:text-4xl">
              {t("headline")}
            </h1>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
              {t("tagline")}
            </p>
          </div>
          <p className="text-xs text-muted-foreground/80">{t("brand")}</p>
        </aside>

        <main className="flex flex-1 flex-col justify-center px-6 py-10 sm:px-10 lg:px-12">
          <div className="mx-auto w-full max-w-[400px] space-y-8">
            <div className="text-center lg:hidden">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                {t("panelBadge")}
              </p>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
                {t("headline")}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">{t("tagline")}</p>
            </div>

            <div className="rounded-[0.625rem] border border-border/80 bg-card/90 p-6 shadow-none backdrop-blur-md sm:p-8">
              {busy && step === "credentials" ? (
                <p className="py-8 text-center text-sm text-muted-foreground">{t("form.loading")}</p>
              ) : step === "credentials" ? (
                <form className="space-y-5" onSubmit={onCredentialsSubmit} noValidate>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground" htmlFor="sign-in-email">
                      {t("form.emailLabel")}
                    </label>
                    <input
                      id="sign-in-email"
                      name="email"
                      type="email"
                      autoComplete="username"
                      required
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        clearError();
                      }}
                      placeholder={t("form.emailPlaceholder")}
                      className={inputClassName(!!formError)}
                      disabled={submitting}
                    />
                  </div>
                  <div className="space-y-2">
                    <label
                      className="text-sm font-medium text-foreground"
                      htmlFor="sign-in-password"
                    >
                      {t("form.passwordLabel")}
                    </label>
                    <input
                      id="sign-in-password"
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        clearError();
                      }}
                      placeholder={t("form.passwordPlaceholder")}
                      className={inputClassName(!!formError)}
                      disabled={submitting}
                    />
                  </div>

                  {formError ? (
                    <p className="text-sm text-destructive" role="alert">
                      {formError}
                    </p>
                  ) : null}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full rounded-[0.625rem] bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-50"
                  >
                    {submitting ? t("form.submitting") : t("form.submit")}
                  </button>
                </form>
              ) : (
                <form className="space-y-5" onSubmit={onMfaSubmit} noValidate>
                  <div className="space-y-1">
                    <h2 className="text-lg font-semibold tracking-tight text-foreground">{mfaTitle}</h2>
                    <p className="text-sm text-muted-foreground">{mfaHint}</p>
                  </div>
                  <div className="space-y-2">
                    <label className="sr-only" htmlFor="sign-in-mfa-code">
                      {mfaTitle}
                    </label>
                    <input
                      id="sign-in-mfa-code"
                      name="mfa-code"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={12}
                      required
                      value={mfaCode}
                      onChange={(e) => {
                        setMfaCode(e.target.value);
                        clearError();
                      }}
                      placeholder="000000"
                      className={inputClassName(!!formError)}
                      disabled={submitting}
                    />
                  </div>

                  {secondFactor === "email_code" ? (
                    <button
                      type="button"
                      disabled={resending || submitting}
                      onClick={() => void onResendEmailCode()}
                      className="text-sm font-medium text-primary underline-offset-4 hover:underline disabled:opacity-50"
                    >
                      {resending ? t("form.resendingCode") : t("form.resendCode")}
                    </button>
                  ) : null}

                  {formError ? (
                    <p className="text-sm text-destructive" role="alert">
                      {formError}
                    </p>
                  ) : null}

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <button
                      type="button"
                      disabled={submitting || resending}
                      onClick={() => void resetFlow()}
                      className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                    >
                      {t("form.back")}
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full rounded-[0.625rem] bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-50 sm:w-auto sm:min-w-[140px]"
                    >
                      {submitting ? t("form.submitting") : t("form.twoFactorSubmit")}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
