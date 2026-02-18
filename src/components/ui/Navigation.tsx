'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_LINKS = [
  { href: '/wallboard', label: 'Wallboard' },
  { href: '/planner', label: 'Planner' },
  { href: '/inoculum', label: 'Schedule' },
];

export default function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="nav-bar">
      <Link href="/" className="brand">
        PlantPulse
      </Link>
      {NAV_LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={pathname === link.href ? 'active' : ''}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
