/** Catalog-only overrides: no changes to product detail, cart or checkout styles. */
export const PUBLIC_CATALOG_STYLES = `
.cx-store{padding:32px 0 40px}
.cx-store>.wrap{width:calc(100% - 32px);max-width:1280px;margin-inline:auto;container-type:inline-size}
.cx-store .cx-head{gap:12px;margin-bottom:16px}
.cx-store .cx-head h2{font-size:clamp(23px,3vw,30px)}
.cx-store .cx-chips{gap:8px;margin-bottom:20px}
.cx-store .cx-chip{min-height:36px;padding-inline:12px;font-size:13px}
.cx-store .cx-grid{
  --catalog-columns:2;--catalog-gap:10px;
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(0,calc((100% - (var(--catalog-columns) - 1) * var(--catalog-gap)) / var(--catalog-columns))));
  gap:var(--catalog-gap);margin:0;padding:0;list-style:none;align-items:stretch
}
.cx-store .cx-card{
  min-width:0;border-radius:12px;box-shadow:0 1px 3px rgb(15 23 42 / .04);
  transition:transform .15s ease,border-color .15s ease,box-shadow .15s ease
}
.cx-store .cx-card:focus-within{border-color:var(--accent)}
.cx-store .cx-media{position:relative;aspect-ratio:4/3;overflow:hidden;background:#f6f7f9}
.cx-store .cx-media img{
  position:absolute;inset:0;width:100%;height:100%;max-width:100%;
  padding:12px;box-sizing:border-box;object-fit:contain;object-position:center;display:block
}
.cx-store .cx-media .cx-ph{position:absolute;inset:0;min-height:0;padding:12px;background:transparent;color:#64748b;font-size:12px}
.cx-store .cx-flag{left:7px;top:7px;font-size:10px;padding:2px 7px}
.cx-store .cx-body{
  display:grid;grid-template-columns:minmax(0,1fr);
  grid-template-rows:2.6em 1.2em minmax(21px,auto) 1.2em 40px;
  align-content:stretch;gap:5px;padding:10px;flex:1;font-size:13px
}
.cx-store .cx-name{
  grid-row:1;margin:0;font-size:13px;line-height:1.3;font-weight:650;letter-spacing:0;
  min-height:2.6em;max-height:2.6em;overflow:hidden;text-overflow:ellipsis;
  display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2
}
.cx-store .cx-name a:focus-visible{outline-offset:-2px}
.cx-store .cx-body>.cx-muted{
  grid-row:2;font-size:11px;line-height:1.2;margin:0;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis
}
.cx-store .cx-price{grid-row:3;gap:4px 7px;margin:0;align-items:baseline}
.cx-store .cx-price strong{font-size:17px;line-height:1.25;font-weight:750;letter-spacing:-.02em;overflow-wrap:anywhere}
.cx-store .cx-was{font-size:11px;line-height:1.2}
.cx-store .cx-body>.cx-ok,.cx-store .cx-body>.cx-out{
  grid-row:4;margin:0;font-size:11px;line-height:1.2;font-weight:400;color:var(--muted)
}
.cx-store .cx-body>.cx-btn{
  grid-row:5;align-self:end;width:100%;min-height:40px;height:40px;
  margin:0;padding:0 6px;border-radius:8px;font-size:12px;line-height:1.2
}
.cx-store .cx-empty{margin:16px 0;font-size:14px}
.cx-store .cx-more{margin-top:24px}
@container(min-width:600px){
  .cx-store .cx-grid{--catalog-columns:3;--catalog-gap:14px}
  .cx-store .cx-name{font-size:14px}
  .cx-store .cx-body{font-size:14px;grid-template-rows:2.6em 1.2em minmax(23px,auto) 1.2em 40px}
  .cx-store .cx-price strong{font-size:19px}
  .cx-store .cx-body>.cx-btn{font-size:13px}
}
@container(min-width:900px){
  .cx-store .cx-grid{--catalog-columns:4;--catalog-gap:16px}
}
@container(min-width:1160px){
  .cx-store .cx-grid{--catalog-columns:5}
}
@media(max-width:360px){
  .cx-store>.wrap{width:calc(100% - 24px)}
  .cx-store .cx-grid{--catalog-gap:8px}
  .cx-store .cx-body{padding:8px;gap:4px}
  .cx-store .cx-media img{padding:10px}
  .cx-store .cx-price strong{font-size:16px}
}
@media(hover:hover) and (pointer:fine){
  .cx-store .cx-card:hover{
    transform:translateY(-2px);border-color:color-mix(in srgb,var(--accent) 28%,var(--line));
    box-shadow:0 6px 16px rgb(15 23 42 / .08)
  }
}
@media(prefers-reduced-motion:reduce){
  .cx-store .cx-card{transition:none}
  .cx-store .cx-card:hover{transform:none}
}
`;
