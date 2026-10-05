/** Subscriber-only wordmark: icon asset + live text, readable on both themes. Global Logo is untouched. */
export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <img src={`${import.meta.env.BASE_URL}brand/bhru-icon.png`} alt="BHRU" width={30} height={30} className="shrink-0 rounded-md object-contain" />
      <div className={`leading-none ${compact ? 'lg:hidden' : ''}`}>
        <div className="text-[18px] font-extrabold tracking-tight">BHRU</div>
        <div className="mt-0.5 text-[9.5px] text-[hsl(var(--text-secondary))]">Unlock Server Panel</div>
      </div>
    </div>
  );
}
