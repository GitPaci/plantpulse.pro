'use client';

// useNightMode — Wallboard night/day auto-switch hook
// Manages a dark, high-contrast TV-optimized mode for night shift operators.
//
// Behavior:
// - Persists preference in localStorage ('wallboard-night')
// - Auto-switches to night at 22:00 local, day at 05:00 local
// - Manual toggle is respected until the next scheduled boundary
// - Checks time once per minute via setInterval

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'wallboard-night';
const NIGHT_HOUR = 22; // 22:00 local → switch to night
const DAY_HOUR = 5;    // 05:00 local → switch to day
const CHECK_INTERVAL_MS = 60_000; // check every minute

/** Returns true if the given hour falls in the night window (22:00–04:59). */
function isNightHour(hour: number): boolean {
  return hour >= NIGHT_HOUR || hour < DAY_HOUR;
}

/** Returns true if the hour is exactly a boundary (22 or 5). */
function isBoundaryHour(hour: number): boolean {
  return hour === NIGHT_HOUR || hour === DAY_HOUR;
}

function readStoredMode(): boolean | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return null;
  } catch {
    return null;
  }
}

function writeStoredMode(night: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(night));
  } catch {
    // localStorage unavailable — ignore
  }
}

export function useNightMode() {
  const [nightMode, setNightMode] = useState<boolean>(() => {
    // Initialize: prefer stored value, else derive from current hour
    const stored = readStoredMode();
    if (stored !== null) return stored;
    return isNightHour(new Date().getHours());
  });

  // Track whether the user manually toggled (overrides auto-switch until next boundary)
  const [manualOverride, setManualOverride] = useState(false);

  // Manual toggle handler
  const toggle = useCallback(() => {
    setNightMode((prev) => {
      const next = !prev;
      writeStoredMode(next);
      return next;
    });
    setManualOverride(true);
  }, []);

  // Auto-switch timer: check every minute
  useEffect(() => {
    let lastCheckedHour = new Date().getHours();

    const interval = setInterval(() => {
      const now = new Date();
      const hour = now.getHours();

      // Only act when crossing a boundary hour
      if (isBoundaryHour(hour) && hour !== lastCheckedHour) {
        const shouldBeNight = isNightHour(hour);

        if (manualOverride) {
          // User overrode — release override at the next boundary
          setManualOverride(false);
        }

        // Apply the auto-switch (override was just cleared, or no override)
        setNightMode(shouldBeNight);
        writeStoredMode(shouldBeNight);
      }

      lastCheckedHour = hour;
    }, CHECK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [manualOverride]);

  return { nightMode, toggle } as const;
}
