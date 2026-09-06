"use client";

import { FormEvent, useRef, useState } from "react";

type User = { id: string; email: string };
type FieldErrors = Partial<Record<"email" | "password" | "confirmPassword" | "invitationToken" | "form", string>>;
type AuthErrorResponse = { error?: string; code?: string; debug?: string };

function formatAuthError(response: Response, data: AuthErrorResponse) {
  const message = data.error ?? "We couldn’t complete that request. Please try again.";
  const detail = data.code ?? "AUTH_UNKNOWN";
  if (process.env.NODE_ENV === "production") return data.code ? `${message} [${detail}]` : message;

  const debug = data.debug ? ` Debug: ${data.debug}` : "";
  if (data.code === "AUTH_INVALID_CREDENTIALS") {
    return `${message} [${response.status} · ${detail}] Check the exact email/password, and confirm this is the same local database where the account was created.${debug}`;
  }
  if (data.code === "AUTH_INVALID_ORIGIN") {
    return `${message} [${response.status} · ${detail}] Open the app from its local URL instead of a file, proxy, or different host.${debug}`;
  }
  if (data.code === "AUTH_RATE_LIMITED") {
    return `${message} [${response.status} · ${detail}] Retry after the displayed wait time.${debug}`;
  }
  return `${message} [${response.status} · ${detail}]${debug}`;
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 4.2A10.7 10.7 0 0 1 12 4c5.5 0 9.4 5.2 9.4 8s-1.5 4.4-3.7 5.9M6.2 6.2C4.1 7.7 2.6 10 2.6 12c0 2.8 3.9 8 9.4 8 1 0 1.9-.2 2.8-.5" /></svg> : <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M2.6 12S6.5 4 12 4s9.4 8 9.4 8-3.9 8-9.4 8-9.4-8-9.4-8Z" /><circle cx="12" cy="12" r="3" /></svg>;
}

export default function AuthForm({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [invitationToken, setInvitationToken] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmationRef = useRef<HTMLInputElement>(null);
  const invitationRef = useRef<HTMLInputElement>(null);
  const signingUp = mode === "sign-up";

  function validate() {
    const next: FieldErrors = {};
    if (!email.trim()) next.email = "Enter your email address.";
    else if (!/^\S+@\S+\.\S+$/.test(email.trim())) next.email = "Enter a valid email address.";
    if (!password) next.password = "Enter your password.";
    else if (signingUp && password.length < 12) next.password = "Use at least 12 characters.";
    if (signingUp && !confirmPassword) next.confirmPassword = "Confirm your password.";
    else if (signingUp && password !== confirmPassword) next.confirmPassword = "Passwords do not match.";
    setErrors(next);
    if (next.email) emailRef.current?.focus();
    else if (next.password) passwordRef.current?.focus();
    else if (next.confirmPassword) confirmationRef.current?.focus();
    else if (next.invitationToken) invitationRef.current?.focus();
    return Object.keys(next).length === 0;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const response = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: email.trim(), password, ...(signingUp && invitationToken.trim() ? { invitationToken: invitationToken.trim() } : {}) }) });
      const data: AuthErrorResponse & { user?: User } = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401) throw new Error(formatAuthError(response, data));
        if (response.status === 409) throw new Error(`${formatAuthError(response, data)} Try signing in instead.`);
        if (response.status === 429) {
          const wait = Number(response.headers.get("Retry-After") ?? 60);
          throw new Error(`${formatAuthError(response, data)} Try again in about ${Math.max(1, Math.ceil(wait / 60))} minute${wait > 60 ? "s" : ""}.`);
        }
        if (response.status >= 500) throw new Error(formatAuthError(response, data));
        throw new Error(formatAuthError(response, data));
      }
      if (!data.user) throw new Error("The server returned success without a user record. [200 · AUTH_MISSING_USER]");
      onAuthenticated(data.user);
    } catch (caught) { setErrors({ form: caught instanceof Error ? caught.message : "We couldn’t complete that request. Please try again." }); }
    finally { setSubmitting(false); }
  }

  function switchMode() {
    setMode(signingUp ? "sign-in" : "sign-up");
    setErrors({});
    setPassword("");
    setConfirmPassword("");
    setInvitationToken("");
    setShowPassword(false);
    setShowConfirmation(false);
    setCapsLock(false);
    requestAnimationFrame(() => emailRef.current?.focus());
  }

  return <main className="auth-page">
    <section className="auth-showcase" aria-hidden="true">
      <div className="brand"><span className="brand-mark"><i /><i /><i /></span>Papertrail</div>
      <div className="showcase-copy"><p className="section-kicker">Employee timekeeping</p><h1>Time that keeps work moving.</h1><p>Clock in, stay focused, and leave a clean record for every shift.</p></div>
      <div className="showcase-note"><span className="note-dot" /> Private by default. Accurate by design.<small>— Papertrail</small></div>
    </section>
    <section className="auth-panel"><div className="auth-card">
      <div className="mobile-brand"><span className="brand-mark"><i /><i /><i /></span>Papertrail</div>
      <p className="section-kicker">{signingUp ? "Join your workplace" : "Welcome back"}</p>
      <h2>{signingUp ? "Create your employee account" : "Sign in to Papertrail"}</h2>
      <p className="auth-subtitle">{signingUp ? "Use the invitation token from your administrator if your workplace has already been set up." : "Enter your details to continue."}</p>
      <form className="auth-form" noValidate onSubmit={submit}>
        <fieldset disabled={submitting}>
          <label>Email address<input aria-describedby={errors.email ? "email-error" : undefined} aria-invalid={Boolean(errors.email)} autoCapitalize="none" autoComplete="email" autoFocus inputMode="email" onChange={(event) => { setEmail(event.target.value); setErrors((current) => ({ ...current, email: undefined, form: undefined })); }} placeholder="you@example.com" ref={emailRef} spellCheck={false} type="email" value={email} />{errors.email && <span id="email-error" className="field-error">{errors.email}</span>}</label>
          <label>Password<div className="password-input"><input aria-describedby={errors.password ? "password-error" : undefined} aria-invalid={Boolean(errors.password)} autoComplete={signingUp ? "new-password" : "current-password"} minLength={signingUp ? 12 : undefined} onKeyDown={(event) => setCapsLock(event.getModifierState("CapsLock"))} onKeyUp={(event) => setCapsLock(event.getModifierState("CapsLock"))} onChange={(event) => { setPassword(event.target.value); setErrors((current) => ({ ...current, password: undefined, form: undefined })); }} placeholder={signingUp ? "At least 12 characters" : "Your password"} ref={passwordRef} type={showPassword ? "text" : "password"} value={password} /><button aria-label={showPassword ? "Hide password" : "Show password"} className="password-toggle" onClick={() => setShowPassword((shown) => !shown)} type="button"><EyeIcon open={showPassword} /></button></div>{capsLock && <span className="caps-warning">Caps Lock is on</span>}{errors.password && <span id="password-error" className="field-error">{errors.password}</span>}</label>
          {signingUp && <label>Confirm password<div className="password-input"><input aria-describedby={errors.confirmPassword ? "confirmation-error" : undefined} aria-invalid={Boolean(errors.confirmPassword)} autoComplete="new-password" minLength={12} onChange={(event) => { setConfirmPassword(event.target.value); setErrors((current) => ({ ...current, confirmPassword: undefined, form: undefined })); }} placeholder="Re-enter your password" ref={confirmationRef} type={showConfirmation ? "text" : "password"} value={confirmPassword} /><button aria-label={showConfirmation ? "Hide confirmation password" : "Show confirmation password"} className="password-toggle" onClick={() => setShowConfirmation((shown) => !shown)} type="button"><EyeIcon open={showConfirmation} /></button></div>{errors.confirmPassword && <span id="confirmation-error" className="field-error">{errors.confirmPassword}</span>}</label>}
          {signingUp && <label>Invitation token <span className="auth-optional">Optional for the first workspace only</span><input aria-describedby={errors.invitationToken ? "invitation-error" : undefined} aria-invalid={Boolean(errors.invitationToken)} autoCapitalize="none" autoComplete="off" onChange={(event) => { setInvitationToken(event.target.value); setErrors((current) => ({ ...current, invitationToken: undefined, form: undefined })); }} placeholder="Paste your invitation token" ref={invitationRef} spellCheck={false} type="text" value={invitationToken} />{errors.invitationToken && <span id="invitation-error" className="field-error">{errors.invitationToken}</span>}</label>}
          {signingUp && <div className="password-rules" aria-live="polite"><span className={password.length >= 12 ? "met" : ""}>✓ 12 or more characters</span><span className={confirmPassword.length > 0 && password === confirmPassword ? "met" : ""}>✓ Passwords match</span></div>}
          {errors.form && <p className="auth-error" role="alert">{errors.form}</p>}
          <button className="auth-submit" type="submit">{submitting ? <><i className="auth-spinner" />{signingUp ? "Creating account…" : "Signing in…"}</> : signingUp ? "Create account" : "Sign in"}</button>
        </fieldset>
      </form>
      <p className="auth-switch">{signingUp ? "Already have an account?" : "Need to join your workplace?"} <button disabled={submitting} onClick={switchMode} type="button">{signingUp ? "Sign in" : "Create an account"}</button></p>
    </div></section>
  </main>;
}
