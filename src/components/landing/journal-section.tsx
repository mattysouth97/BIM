import type { ReactNode } from "react";

export function JournalSection({
  id,
  kicker,
  title,
  titleAlt,
  children,
}: {
  id: string;
  kicker: string;
  title: string;
  titleAlt: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="lj-section" aria-labelledby={`${id}-title`}>
      <header className="lj-section-head">
        <p className="lj-kicker">{kicker}</p>
        <div className="lj-section-titles">
          <h2 id={`${id}-title`} className="lj-h2">
            {title}
          </h2>
          <p className="lj-h2-alt">{titleAlt}</p>
        </div>
      </header>
      <hr className="lj-rule" />
      {children}
    </section>
  );
}
