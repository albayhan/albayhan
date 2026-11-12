/** Menü ve kartlar için küçük çizgi ikonlar */
const P = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
export const Icon = {
  wallet: (c = "") => <svg {...P} className={c}><path d="M3 7a2 2 0 0 1 2-2h13v4" /><path d="M3 7v10a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2z" /><circle cx="16" cy="14" r="1.2" fill="currentColor" /></svg>,
  globe: (c = "") => <svg {...P} className={c}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></svg>,
  bolt: (c = "") => <svg {...P} className={c}><path d="M13 2 4 14h7l-1 8 9-12h-7z" /></svg>,
  eye: (c = "") => <svg {...P} className={c}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>,
  scale: (c = "") => <svg {...P} className={c}><path d="M3 3v18h18" /><path d="m7 15 4-4 3 3 5-6" /></svg>,
  brain: (c = "") => <svg {...P} className={c}><path d="M4 19h16M6 15V9M10 15V5M14 15v-4M18 15V7" /></svg>,
  doc: (c = "") => <svg {...P} className={c}><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></svg>,
  search: (c = "") => <svg {...P} className={c}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>,
  logo: (c = "") => <svg width="28" height="28" viewBox="0 0 32 32" className={c}><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2563eb" /><stop offset="1" stopColor="#10b981" /></linearGradient></defs><rect width="32" height="32" rx="9" fill="url(#lg)" /><path d="M7 21l6-6 4 4 8-9" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /><circle cx="25" cy="10" r="2" fill="#fff" /></svg>,
};
