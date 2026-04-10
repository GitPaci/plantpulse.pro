'use client';

import Link from 'next/link';
import { useEffect } from 'react';

function useScrollReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('.pp-reveal');
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('pp-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
}

function GanttPreview() {
  const rows = [
    {
      label: 'F-2',
      bars: [{ left: '0%', width: '38%', color: '#5CADFF', delay: '0ms' }],
    },
    {
      label: 'F-3',
      bars: [{ left: '42%', width: '40%', color: '#FF9900', delay: '80ms' }],
    },
    {
      label: 'PF-1',
      bars: [
        { left: '8%', width: '22%', color: '#0066FF', delay: '160ms' },
        { left: '56%', width: '22%', color: '#05FFFF', delay: '220ms' },
      ],
    },
    {
      label: 'PF-2',
      bars: [{ left: '30%', width: '20%', color: '#57EBFF', delay: '300ms' }],
    },
    {
      label: 'PR-1',
      bars: [
        { left: '0%', width: '15%', color: '#66CCFF', delay: '380ms' },
        { left: '48%', width: '14%', color: '#5CADFF', delay: '440ms' },
      ],
    },
    {
      label: 'PR-2',
      bars: [
        { left: '20%', width: '14%', color: '#FF9900', delay: '460ms' },
        { left: '66%', width: '14%', color: '#0066FF', delay: '520ms' },
      ],
    },
  ];
  return (
    <div className="pp-gantt-preview" aria-hidden="true">
      <div className="pp-now-line" />
      {rows.map((row) => (
        <div key={row.label} className="pp-gantt-row">
          <span className="pp-gantt-label">{row.label}</span>
          <div className="pp-gantt-track">
            {row.bars.map((bar, i) => (
              <div
                key={i}
                className="pp-gantt-bar"
                style={{
                  left: bar.left,
                  width: bar.width,
                  background: bar.color,
                  animationDelay: bar.delay,
                }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const PROBLEMS = [
  {
    icon: '📋',
    text: 'Batch schedules buried in Excel macros that break when you change a cell',
  },
  {
    icon: '🔄',
    text: 'Re-planning a shifted batch means manually updating 10 downstream rows',
  },
  {
    icon: '📺',
    text: 'The wallboard PowerPoint has to be re-exported every morning by one person',
  },
];

const PERSONAS = [
  {
    role: 'Shift Operator',
    icon: '👷',
    need: 'Needs to see exactly what is running right now, which team owns each vessel, and what checkpoint tasks are pending — at a glance, from across the room.',
    cta: 'View Wallboard',
    href: '/wallboard',
  },
  {
    role: 'Production Planner',
    icon: '📐',
    need: 'Needs to create and adjust multi-stage fermentation chains, resolve vessel conflicts, and shift schedules without breaking downstream batches.',
    cta: 'Open Planner',
    href: '/planner',
  },
  {
    role: 'Alignment',
    icon: '🔍',
    need: 'Needs a clean monthly schedule view, export-ready for review meetings, with no surprise overlaps or shutdown conflicts.',
    cta: 'View Schedule',
    href: '/inoculum',
  },
];

const FEATURES = [
  {
    href: '/wallboard',
    title: 'Wallboard',
    subtitle: 'For operators',
    description:
      'Live manufacturing display with shift bands, batch timeline, team assignments, and now-line. Designed for a TV screen at the end of the production floor.',
    color: '#0066FF',
    letter: 'W',
  },
  {
    href: '/planner',
    title: 'Planner',
    subtitle: 'For schedulers',
    description:
      'Interactive timeline for creating batch chains, editing stages, bulk time-shifting, and managing vessel assignments across your entire seed train.',
    color: '#FF9900',
    letter: 'P',
  },
  {
    href: '/inoculum',
    title: 'Schedule',
    subtitle: 'For QA & supervisors',
    description:
      'Month-at-a-glance view filtered by equipment group. Export to PDF for printable plans and review meetings.',
    color: '#00AA44',
    letter: 'S',
  },
];

const TRUST = [
  {
    label: 'Browser-only',
    detail: 'Runs entirely in your browser — no server process, no cloud account',
  },
  {
    label: 'Zero network calls',
    detail: 'No fetch, no API, no database. All data stays in memory',
  },
  {
    label: 'No cookies',
    detail: 'No session tracking, no persistent identifiers',
  },
  {
    label: 'No telemetry',
    detail: 'No analytics, no usage reporting, no third-party scripts',
  },
];

const SEED_TRAIN = [
  { label: 'Inoculum', short: 'INO', dur: '24 h', color: '#57EBFF', textColor: '#0c3050' },
  { label: 'Seed n-2', short: 'n-2', dur: '48 h', color: '#5CADFF', textColor: '#0c3050' },
  { label: 'Seed n-1', short: 'n-1', dur: '55 h', color: '#0066FF', textColor: '#ffffff' },
  { label: 'Production', short: 'PRD', dur: 'variable', color: '#1a365d', textColor: '#ffffff' },
];

export default function HomePage() {
  useScrollReveal();

  return (
    <div className="pp-landing">

      {/* ── Top nav ── */}
      <nav className="pp-landing-nav">
        <span className="pp-landing-brand">PlantPulse</span>
        <div className="pp-landing-nav-links">
          <Link href="/wallboard">Wallboard</Link>
          <Link href="/planner">Planner</Link>
          <Link href="/inoculum">Schedule</Link>
        </div>
        <Link href="/planner" className="pp-landing-nav-cta">
          Open App →
        </Link>
      </nav>

      {/* ── Hero ── */}
      <section className="pp-hero">
        <div className="pp-hero-content">
          <div className="pp-hero-badge pp-hero-anim" style={{ animationDelay: '0ms' }}>
            Free Edition · Demo Data · Browser-Only
          </div>
          <h1 className="pp-hero-title pp-hero-anim" style={{ animationDelay: '80ms' }}>
            The scheduling tool<br />
            <span className="pp-hero-accent">pharma fermentation</span><br />
            has been waiting for.
          </h1>
          <p className="pp-hero-sub pp-hero-anim" style={{ animationDelay: '180ms' }}>
            PlantPulse turns complex multi-stage batch chains into a calm,
            readable wallboard. Built for fermentation — propagators,
            pre-fermenters, fermenters — and the teams who run them around the clock.
          </p>
          <div className="pp-hero-actions pp-hero-anim" style={{ animationDelay: '280ms' }}>
            <Link href="/planner" className="pp-btn-primary">Open Planner</Link>
            <Link href="/wallboard" className="pp-btn-ghost">View Wallboard</Link>
          </div>
        </div>
        <div className="pp-hero-visual pp-hero-anim" style={{ animationDelay: '360ms' }}>
          <GanttPreview />
          <div className="pp-hero-visual-label">Live batch timeline · Wallboard view</div>
        </div>
      </section>

      {/* ── Problem ── */}
      <section className="pp-section pp-section-light">
        <div className="pp-container">
          <div className="pp-reveal pp-reveal-delay-0">
            <p className="pp-eyebrow">Why PlantPulse exists</p>
            <h2 className="pp-section-title">
              Fermentation scheduling is complex.<br />
              Your tools shouldn&apos;t make it harder.
            </h2>
          </div>
          <p className="pp-section-sub pp-reveal pp-reveal-delay-1">
            Fermentation runs span multiple days and overlap across vessels — from flask inoculum 
            through pre-seed and seed stages to the main fermenter — with shift ownership, checkpoints,
            and documentation requirements. Managing this in Excel macros 
            and PowerPoint slides create invisible risk.
          </p>
          <div className="pp-problem-list pp-reveal pp-reveal-delay-2">
            {PROBLEMS.map((p, i) => (
              <div key={i} className="pp-problem-item">
                <span className="pp-problem-icon">{p.icon}</span>
                <span className="pp-problem-text">{p.text}</span>
              </div>
            ))}
          </div>
          <div className="pp-reveal pp-reveal-delay-3">
            <div className="pp-callout">
              <span className="pp-callout-line" />
              <p>
                PlantPulse was born directly from a real legacy VBA system used at a fermentation
                facility — same data model, same vessel hierarchy, same shift rotation logic —
                rebuilt as a browser-native tool that anyone on the team can open.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Who ── */}
      <section className="pp-section pp-section-dark">
        <div className="pp-container">
          <div className="pp-reveal pp-reveal-delay-0">
            <p className="pp-eyebrow pp-eyebrow-light">Who it&apos;s for</p>
            <h2 className="pp-section-title pp-title-light">
              Built for everyone in the plant,<br />not just the planner.
            </h2>
          </div>
          <div className="pp-persona-grid">
            {PERSONAS.map((p, i) => (
              <div key={i} className={`pp-persona-card pp-reveal pp-reveal-delay-${i}`}>
                <div className="pp-persona-icon">{p.icon}</div>
                <h3 className="pp-persona-role">{p.role}</h3>
                <p className="pp-persona-need">{p.need}</p>
                <Link href={p.href} className="pp-persona-link">
                  {p.cta} →
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="pp-section pp-section-light">
        <div className="pp-container">
          <div className="pp-reveal pp-reveal-delay-0">
            <p className="pp-eyebrow">Three views, one system</p>
            <h2 className="pp-section-title">
              Right information for the right person,<br />in the right format.
            </h2>
          </div>
          <div className="pp-feature-grid">
            {FEATURES.map((f, i) => (
              <Link
                key={f.href}
                href={f.href}
                className={`pp-feature-card pp-reveal pp-reveal-delay-${i}`}
              >
                <div className="pp-feature-icon" style={{ background: f.color }}>
                  {f.letter}
                </div>
                <div className="pp-feature-subtitle">{f.subtitle}</div>
                <h3 className="pp-feature-title">{f.title}</h3>
                <p className="pp-feature-desc">{f.description}</p>
                <span className="pp-feature-cta">Open {f.title} →</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Seed train visual ── */}
      <section className="pp-section pp-section-mid">
        <div className="pp-container">
          <div className="pp-reveal pp-reveal-delay-0">
            <p className="pp-eyebrow">How it models your process</p>
            <h2 className="pp-section-title">
              The full seed train,<br />visualised and governed.
            </h2>
          </div>
          <p className="pp-section-sub pp-reveal pp-reveal-delay-1">
            PlantPulse understands that fermentation is a chain — each stage feeds into the next,
            with different vessels, durations, and team handoffs at every step. Auto-scheduling
            back-calculates the entire chain from your target production start.
          </p>
          <div className="pp-train-visual pp-reveal pp-reveal-delay-2" aria-hidden="true">
            {SEED_TRAIN.map((stage, i, arr) => (
              <div key={stage.label} className="pp-train-step">
                <div
                  className="pp-train-block"
                  style={{ background: stage.color, color: stage.textColor }}
                >
                  <span className="pp-train-short">{stage.short}</span>
                  <span className="pp-train-label">{stage.label}</span>
                  <span className="pp-train-dur">{stage.dur}</span>
                </div>
                {i < arr.length - 1 && <div className="pp-train-arrow">→</div>}
              </div>
            ))}
          </div>
          <p className="pp-train-note pp-reveal pp-reveal-delay-3">
            Vessel assignments, durations, and stage counts are fully configurable.
            Preloaded demo configuration with multiple products and production lines.
          </p>
        </div>
      </section>

      {/* ── Trust / Privacy ── */}
      <section className="pp-section pp-section-dark">
        <div className="pp-container">
          <div className="pp-reveal pp-reveal-delay-0">
            <p className="pp-eyebrow pp-eyebrow-light">Privacy by design</p>
            <h2 className="pp-section-title pp-title-light">
              Your batch data never<br />leaves your browser.
            </h2>
          </div>
          <p className="pp-section-sub pp-sub-light pp-reveal pp-reveal-delay-1">
            The Free Edition makes four verifiable guarantees. No exceptions.
          </p>
          <div className="pp-trust-grid">
            {TRUST.map((t, i) => (
              <div key={i} className={`pp-trust-item pp-reveal pp-reveal-delay-${i}`}>
                <div className="pp-trust-check">✓</div>
                <div>
                  <div className="pp-trust-label">{t.label}</div>
                  <div className="pp-trust-detail">{t.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="pp-section pp-section-cta">
        <div className="pp-container pp-cta-inner">
          <div className="pp-reveal pp-reveal-delay-0">
            <h2 className="pp-cta-title">Ready to replace the spreadsheet?</h2>
            <p className="pp-cta-sub">
              No account needed. No install. Open the app and load demo data in seconds.
            </p>
          </div>
          <div className="pp-cta-actions pp-reveal pp-reveal-delay-1">
            <Link href="/planner" className="pp-btn-primary pp-btn-lg">
              Open Planner
            </Link>
            <Link href="/wallboard" className="pp-btn-ghost pp-btn-lg">
              View Wallboard
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="pp-landing-footer">
        <div className="pp-container pp-footer-inner">
          <div className="pp-footer-brand">
            <span className="pp-footer-logo">PlantPulse</span>
            <span className="pp-footer-tagline">Feels like a calm pharma control room.</span>
          </div>
          <div className="pp-footer-links">
            <Link href="/wallboard">Wallboard</Link>
            <Link href="/planner">Planner</Link>
            <Link href="/inoculum">Schedule</Link>
          </div>
          <div className="pp-footer-trust">
            <span>Browser-only</span>
            <span aria-hidden="true">·</span>
            <span>No cookies</span>
            <span aria-hidden="true">·</span>
            <span>No telemetry</span>
            <span aria-hidden="true">·</span>
            <span>Free Edition</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
