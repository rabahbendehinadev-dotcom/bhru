import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { ArrowRight, ArrowLeft } from 'lucide-react';
import { PublicShell } from '@/components/public-auth/PublicShell';
import { PaField, PaSelect } from '@/components/public-auth/Fields';
import { COUNTRIES, registerSubscriber, errorMessage } from '@/lib/store';

export default function Register() {
  const [, nav] = useLocation();
  const [step, setStep] = useState(1);
  const [f, setF] = useState({ owner: '', username: '', email: '', password: '', confirm: '', business: '', country: 'Algeria', phone: '' });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const previousStep = useRef(step);
  useEffect(() => {
    if (previousStep.current !== step) {
      heading.current?.focus();
      previousStep.current = step;
    }
  }, [step]);
  useEffect(() => {
    if (Object.keys(errs).length) {
      form.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus();
    }
  }, [errs]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const v1 = () => {
    const e: Record<string, string> = {};
    if (f.owner.trim().length < 2) e.owner = 'Enter your full name.';
    if (!/^[a-z0-9_.-]{3,}$/i.test(f.username)) e.username = 'At least 3 letters, numbers, dots or dashes.';
    if (!/^\S+@\S+\.\S+$/.test(f.email)) e.email = 'Enter a valid email address.';
    if (f.password.length < 12 || f.password.length > 128) e.password = 'Use 12 to 128 characters.';
    if (f.confirm !== f.password) e.confirm = 'Passwords do not match.';
    setErrs(e);
    return !Object.keys(e).length;
  };
  const submit = async () => {
    if (busy) return;
    const e: Record<string, string> = {};
    if (f.business.trim().length < 2) e.business = 'Enter your business or server name.';
    if (f.phone.trim().length < 6) e.phone = 'Enter a phone number.';
    setErrs(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      await registerSubscriber({ owner: f.owner.trim(), business: f.business.trim(), username: f.username.trim(), email: f.email.trim(), phone: f.phone.trim(), country: f.country, password: f.password });
      nav('/');
    } catch (error) { setErrs({ business: errorMessage(error) }); }
    finally { setBusy(false); }
  };
  const strength = Math.min(4, Math.floor(f.password.length / 3));
  return (
    <PublicShell mode="register">
      <div className="pa-steps" aria-label={`Step ${step} of 2`}>
        <span className={step >= 1 ? 'on' : ''}>1. Account</span><span className={step >= 2 ? 'on' : ''}>2. Business</span>
      </div>
      <h1 className="pa-h" ref={heading} tabIndex={-1}>{step === 1 ? 'Create your account' : 'Business information'}</h1>
      <p className="pa-sub">{step === 1 ? 'Owner account for your BHRU server. Use a strong, unique password.' : 'Used for your server and panel. Your account starts as Pending until approved.'}</p>
      {step === 1 ? (
        <form ref={form} className="pa-f" noValidate onSubmit={(e) => { e.preventDefault(); if (v1()) setStep(2); }}>
          <PaField label="Full name" name="name" required error={errs.owner} value={f.owner} onChange={set('owner')} autoComplete="name" data-testid="input-fullname" />
          <PaField label="Username" name="username" required error={errs.username} value={f.username} onChange={set('username')} autoComplete="username" autoCapitalize="none" spellCheck={false} data-testid="input-username" />
          <PaField label="Email address" name="email" required type="email" error={errs.email} value={f.email} onChange={set('email')} autoComplete="email" autoCapitalize="none" spellCheck={false} data-testid="input-email" />
          <PaField label="Password" name="password" required password error={errs.password} value={f.password} onChange={set('password')} autoComplete="new-password" data-testid="input-password"
            hint={<><div className="pa-meter" aria-hidden="true">{[0, 1, 2, 3].map((n) => <i key={n} className={n < strength ? 'on' : ''} />)}</div><p className="pa-password-hint">Use 12–128 characters.</p></>} />
          <PaField label="Confirm password" name="confirm-password" required password error={errs.confirm} value={f.confirm} onChange={set('confirm')} autoComplete="new-password" data-testid="input-confirm" />
          <button type="submit" className="pa-btn p w" data-testid="button-next">Next step <ArrowRight size={16} /></button>
        </form>
      ) : (
        <form ref={form} className="pa-f" noValidate aria-busy={busy} onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <PaField label="Business / server name" name="organization" required disabled={busy} error={errs.business} value={f.business} onChange={set('business')} autoComplete="organization" data-testid="input-business" />
          <PaSelect label="Country" name="country" required disabled={busy} value={f.country} onChange={set('country')} autoComplete="country-name" data-testid="select-country">{COUNTRIES.map((c) => <option key={c}>{c}</option>)}</PaSelect>
          <PaField label="Phone number" name="tel" required disabled={busy} type="tel" error={errs.phone} value={f.phone} onChange={set('phone')} placeholder="+213 555 000 000" autoComplete="tel" data-testid="input-phone" />
          <div className="pa-row">
            <button type="button" className="pa-btn" disabled={busy} onClick={() => setStep(1)}><ArrowLeft size={16} /> Back</button>
            <button type="submit" className="pa-btn p" disabled={busy} data-testid="button-create-account">{busy ? 'Creating...' : 'Create account'}</button>
          </div>
        </form>
      )}
      <p className="pa-swap">Already have an account? <Link href="/login">Sign in</Link></p>
    </PublicShell>
  );
}
