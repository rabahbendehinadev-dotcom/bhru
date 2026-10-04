import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { ShieldCheck, Zap, Briefcase, Eye, EyeOff, User, Lock } from 'lucide-react';
import { Logo, Card, Btn, Field, Badge } from '@/components/bhru/ui';
import { findAccount, loginAdminDemo, loginSubscriber, useStore } from '@/lib/store';

export function AuthFrame({ children, step }: { children: React.ReactNode; step?: string }) {
  return (
    <div className="grid min-h-[100dvh] place-items-center p-4">
      <div className="w-full max-w-[420px]">
        <div className="mb-5 flex items-center justify-between"><Logo sub="SaaS for Unlock Servers" size={38} />{step && <span className="text-[11px] text-muted-foreground">{step}</span>}</div>
        {children}
        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[11px] text-muted-foreground">
          <span>Secure<br />Demo sandbox</span><span>Fast setup<br />Two steps</span><span>Professional<br />Built for servers</span>
        </div>
      </div>
    </div>
  );
}

export default function Login() {
  const [, nav] = useLocation();
  const st = useStore();
  const [q, setQ] = useState('');
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const a = findAccount(q);
    if (!a) { setErr('No registered demo account matches that email or username.'); return; }
    loginSubscriber(a.id, 'login');
    nav('/');
  };
  return (
    <AuthFrame>
      <Card className="p-5">
        <div className="mb-1 flex items-center gap-2"><h1 className="text-[17px] font-semibold">Sign in to BHRU</h1><Badge tone="violet">Demo simulation</Badge></div>
        <p className="mb-4 text-[12.5px] text-muted-foreground">Sign-in is simulated: the account is selected by email or username and the password is not checked or stored.</p>
        <form onSubmit={submit} className="space-y-3">
          <Field label="Email or username" error={err}>
            <div className="relative"><User size={14} className="absolute left-2.5 top-2.5 text-muted-foreground" /><input className="input pl-8" value={q} onChange={(e) => { setQ(e.target.value); setErr(''); }} placeholder="fastunlock" data-testid="input-login-id" /></div>
          </Field>
          <Field label="Password (not verified in demo)">
            <div className="relative"><Lock size={14} className="absolute left-2.5 top-2.5 text-muted-foreground" />
              <input className="input px-8" type={show ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Any value" data-testid="input-login-password" />
              <button type="button" onClick={() => setShow(!show)} className="absolute right-2.5 top-2.5 text-muted-foreground" aria-label="Toggle password">{show ? <EyeOff size={14} /> : <Eye size={14} />}</button></div>
          </Field>
          <Btn v="primary" type="submit" className="w-full" data-testid="button-login">Sign in (demo)</Btn>
        </form>
        <div className="my-4 flex items-center gap-2 text-[11px] text-muted-foreground"><span className="h-px flex-1 bg-border" />Demo access<span className="h-px flex-1 bg-border" /></div>
        <div className="grid grid-cols-2 gap-2">
          <Btn onClick={() => { loginAdminDemo(); nav('/admin'); }} data-testid="button-demo-admin"><ShieldCheck size={14} /> Platform Admin</Btn>
          <Btn onClick={() => { loginSubscriber('sub-1', 'demo'); nav('/'); }} data-testid="button-demo-subscriber"><Briefcase size={14} /> Fast Unlock DZ</Btn>
        </div>
        <p className="mt-3 text-center text-[12px] text-muted-foreground">New to BHRU? <Link href="/register" className="font-medium text-brand" data-testid="link-register">Create an account</Link></p>
      </Card>
      <p className="mt-3 flex items-center justify-center gap-1 text-[11px] text-muted-foreground"><Zap size={11} /> {st.subscribers.length} demo accounts in this browser</p>
    </AuthFrame>
  );
}
