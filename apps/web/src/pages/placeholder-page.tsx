import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export function PlaceholderPage({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <main className="standalone-page">
      <div className="standalone-grid" aria-hidden="true" />
      <Link to="/" className="back-link"><ArrowLeft size={17} />返回校园地图</Link>
      <section className="standalone-card">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <div className="standalone-copy">{children}</div>
      </section>
    </main>
  );
}
