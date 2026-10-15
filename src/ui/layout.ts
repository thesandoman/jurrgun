/**
 * Screen-size layout, loaded last. Phones keep the floating bottom tab bar;
 * tablets get the same bar as a centred pill; laptops and desktops (1024px+)
 * get a left sidebar with the logo, and a wider content column.
 */
export const LAYOUT_CSS = `
.tabbar .tab-brand{display:none}
@media (min-width:700px) and (max-width:1023.98px){
  .tabbar{left:50%;right:auto;width:min(560px,calc(100% - 40px));transform:translateX(-50%)}
}
@media (min-width:1024px){
  :root{--side:236px}
  body:has(.tabbar){padding-left:var(--side);padding-bottom:0}
  .tabbar{top:0;bottom:0;left:0;right:auto;width:var(--side);transform:none;display:flex;flex-direction:column;align-items:stretch;gap:4px;padding:18px 14px;border-radius:0;box-shadow:none}
  .tabbar a{flex-direction:row;justify-content:flex-start;gap:12px;font-size:.95rem;padding:10px 14px;min-height:46px;border-radius:14px}
  .tabbar a.center{order:-1;margin:0 0 10px;min-height:50px;font-size:.95rem;padding:10px 14px;border-radius:14px;box-shadow:none}
  .tabbar a.center.on{box-shadow:0 0 0 3px var(--fresh)}
  .tabbar .tab-brand{order:-2;display:flex;align-items:center;gap:8px;margin:0 0 18px;padding:4px 10px;min-height:0;background:none;color:var(--on-deep);font-weight:800;font-size:1.2rem;letter-spacing:-.02em}
  .tabbar .tab-brand small{color:var(--lime);font-weight:600;font-size:.8rem;letter-spacing:0}
  .tabbar .tab-brand svg{width:30px;height:30px}
  body:has(.tabbar) .topbar{justify-content:flex-end}
  body:has(.tabbar) .topbar .brand{display:none}
  body:has(.tabbar) .flow-bar{bottom:0}
  .wrap{max-width:820px;padding:32px 40px 48px}
  .foot{max-width:820px}
}
`;
