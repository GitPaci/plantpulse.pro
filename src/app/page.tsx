import Link from 'next/link';

const VIEWS = [
  {
    href: '/wallboard',
    title: 'Wallboard',
    description: 'Manufacturing wallboard — read-only operator view with shift bands, batch timeline, and now-line.',
    icon: 'W',
  },
  {
    href: '/planner',
    title: 'Planner',
    description: 'Interactive planning view — create batch chains, edit stages, bulk shift, and manage schedules.',
    icon: 'P',
  },
  {
    href: '/inoculum',
    title: 'Inoculum Schedule',
    description: 'Month view of inoculation schedules — filter by equipment group (PRs, PFs, Fs) or view all.',
    icon: 'I',
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[var(--pp-surface)] flex flex-col">
      {/* Header */}
      <header className="bg-[var(--pp-pharma)] text-white py-16 px-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold tracking-tight mb-2">
            PlantPulse Scheduler
          </h1>
          <p className="text-white/70 text-lg">
            Planning for multistep batch chain processes (e.g., fermentation)
          </p>
        </div>
      </header>

      {/* Navigation cards */}
      <main className="max-w-4xl mx-auto w-full px-8 py-12 flex-1">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {VIEWS.map((view) => (
            <Link
              key={view.href}
              href={view.href}
              className="block bg-white rounded-lg border border-[var(--pp-border)] p-6 hover:shadow-md hover:border-[var(--pp-pharma)]/30 transition-all group"
            >
              <div className="w-10 h-10 rounded-lg bg-[var(--pp-pharma)] text-white flex items-center justify-center font-bold text-lg mb-4 group-hover:scale-105 transition-transform">
                {view.icon}
              </div>
              <h2 className="text-lg font-semibold text-[var(--pp-pharma)] mb-2">
                {view.title}
              </h2>
              <p className="text-sm text-[var(--pp-muted)] leading-relaxed">
                {view.description}
              </p>
            </Link>
          ))}
        </div>

        <div className="mt-12 text-center text-sm text-[var(--pp-muted)]">
          <p>Feels like a calm pharma control room.</p>
          <p className="mt-1">Free Edition — Demo Data</p>
        </div>
      </main>
    </div>
  );
}
