import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { ArrowRight, ArrowLeft } from 'lucide-react';
import { Card, Btn, Field } from '@/components/bhru/ui';
import { AuthFrame } from './login';
import { COUNTRIES, registerSubscriber, errorMessage } from '@/lib/store';
import { cn } from '@/lib/utils';

export default function Register() {
  const [, nav] = useLocation();
  const [step, setStep] = useState(1);
  const [f, setF] = useState({ owner: '', username: '', email: '', password: '', confirm: '', business: '', country: 'Algeria', phone: '' });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
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
    <AuthFrame step={`Step ${step} of 2`}>
      <div className="mb-3 flex items-center gap-2 text-[11px]">
        {['Account', 'Business'].map((l, i) => (
          <div key={l} className="flex flex-1 items-center gap-2"><span className={cn('grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold', step >= i + 1 ? 'bg-brand text-white' : 'bg-muted text-muted-foreground')}>{i + 1}</span><span className={step >= i + 1 ? '' : 'text-muted-foreground'}>{l}</span><span className={cn('h-0.5 flex-1', i === 0 && (step > 1 ? 'bg-brand' : 'bg-border'))} /></div>
        ))}
      </div>
      <Card className="p-5">
        <h1 className="text-[17px] font-semibold">{step === 1 ? 'Create your account' : 'Business information'}</h1>
        <p className="mb-4 text-[12.5px] text-muted-foreground">{step === 1 ? 'Owner account for your BHRU server. Use a strong, unique password.' : 'Used for your server and panel. Your account starts as Pending until approved.'}</p>
        {step === 1 ? (
          <div className="space-y-3">
            <Field label="Full name" error={errs.owner}><input className="input" value={f.owner} onChange={set('owner')} data-testid="input-fullname" /></Field>
            <Field label="Username" error={errs.username}><input className="input" value={f.username} onChange={set('username')} data-testid="input-username" /></Field>
            <Field label="Email address" error={errs.email}><input className="input" type="email" value={f.email} onChange={set('email')} data-testid="input-email" /></Field>
            <Field label="Password" error={errs.password}>
              <input className="input" type="password" value={f.password} onChange={set('password')} data-testid="input-password" />
              <div className="mt-1.5 flex gap-1">{[0, 1, 2, 3].map((n) => <span key={n} className={cn('h-1 flex-1 rounded', n < strength ? 'bg-ok' : 'bg-muted')} />)}</div>
            </Field>
            <Field label="Confirm password" error={errs.confirm}><input className="input" type="password" value={f.confirm} onChange={set('confirm')} data-testid="input-confirm" /></Field>
            <Btn v="brand" className="w-full" onClick={() => v1() && setStep(2)} data-testid="button-next">Next step <ArrowRight size={14} /></Btn>
          </div>
        ) : (
          <div className="space-y-3">
            <Field label="Business / server name" error={errs.business}><input className="input" value={f.business} onChange={set('business')} data-testid="input-business" /></Field>
            <Field label="Country"><select className="input" value={f.country} onChange={set('country')} data-testid="select-country">{COUNTRIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Phone number" error={errs.phone}><input className="input" value={f.phone} onChange={set('phone')} placeholder="+213 555 000 000" data-testid="input-phone" /></Field>
            <div className="grid grid-cols-2 gap-2"><Btn disabled={busy} onClick={() => setStep(1)}><ArrowLeft size={14} /> Back</Btn><Btn v="brand" disabled={busy} onClick={submit} data-testid="button-create-account">{busy ? 'Creating...' : 'Create account'}</Btn></div>
          </div>
        )}
        <p className="mt-4 text-center text-[12px] text-muted-foreground">Already have an account? <Link href="/login" className="font-medium text-brand">Sign in</Link></p>
      </Card>
    </AuthFrame>
  );
}
