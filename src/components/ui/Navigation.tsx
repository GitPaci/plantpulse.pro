'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { usePlantPulseStore } from '@/lib/store';

const NAV_LINKS = [
  { href: '/wallboard', label: 'Wallboard' },
  { href: '/planner', label: 'Planner' },
  { href: '/inoculum', label: 'Schedule' },
];

export default function Navigation() {
  const pathname = usePathname();
  const resetViewToToday = usePlantPulseStore((s) => s.resetViewToToday);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        toggleRef.current && !toggleRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        toggleRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [menuOpen]);

  return (
    <nav className="nav-bar">
      <Link href="/" className="brand">
        PlantPulse
      </Link>

      {/* Desktop links */}
      <div className="nav-desktop-links">
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={pathname === link.href ? 'active' : ''}
            onClick={link.href === '/wallboard' ? () => resetViewToToday() : undefined}
          >
            {link.label}
          </Link>
        ))}
      </div>

      {/* Mobile hamburger */}
      <button
        ref={toggleRef}
        type="button"
        className="nav-mobile-toggle"
        onClick={() => setMenuOpen((v) => !v)}
        aria-label="Toggle navigation"
        aria-expanded={menuOpen}
        aria-controls="nav-mobile-menu"
      >
        <span aria-hidden="true">&#9776;</span>
      </button>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div id="nav-mobile-menu" ref={menuRef} className="nav-mobile-menu" role="navigation">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`nav-mobile-link ${pathname === link.href ? 'active' : ''}`}
              onClick={() => {
                if (link.href === '/wallboard') resetViewToToday();
                closeMenu();
              }}
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}
