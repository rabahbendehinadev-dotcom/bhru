import { useId, useState, type ReactNode, type InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  label: string; error?: string; icon?: ReactNode; password?: boolean; hint?: ReactNode; children?: ReactNode;
};

export function PaField({ label, error, icon, password, hint, children, className, ...rest }: Props) {
  const id = useId();
  const [show, setShow] = useState(false);
  const eid = `${id}-e`;
  const hid = `${id}-hint`;
  return (
    <div className="pa-fld">
      <label htmlFor={id}>{label}</label>
      <div className="pa-in">
        {icon}
        <input id={id} {...rest} type={password ? (show ? 'text' : 'password') : rest.type}
          className={`${icon ? '' : 'nolead'} ${password ? 'trail' : ''} ${className ?? ''}`}
          aria-invalid={error ? true : undefined} aria-describedby={[hint ? hid : '', error ? eid : ''].filter(Boolean).join(' ') || undefined} />
        {password && (
          <button type="button" className="pa-eye" onClick={() => setShow(!show)} aria-pressed={show}
            aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
        )}
      </div>
      {hint && <div id={hid}>{hint}</div>}
      {error && <p className="pa-err" id={eid} role="alert">{error}</p>}
      {children}
    </div>
  );
}

export function PaSelect({ label, children, ...rest }: { label: string; children: ReactNode } & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'id'>) {
  const id = useId();
  return (
    <div className="pa-fld">
      <label htmlFor={id}>{label}</label>
      <div className="pa-in"><select id={id} className="nolead" {...rest}>{children}</select></div>
    </div>
  );
}
