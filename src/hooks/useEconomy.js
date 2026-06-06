import { useState, useCallback } from 'react';
import { STARTING_BALANCE } from '../services/economy.js';

const KEY = 'pkmon_economy_coins';

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw !== null ? Number(raw) : STARTING_BALANCE;
  } catch {
    return STARTING_BALANCE;
  }
}

function save(n) {
  try { localStorage.setItem(KEY, String(n)); } catch { /* ignore */ }
}

export function useEconomy() {
  const [coins, setCoins] = useState(load);

  const spend = useCallback((amount) => {
    setCoins((prev) => { const n = Math.max(0, prev - amount); save(n); return n; });
  }, []);

  const earn = useCallback((amount) => {
    setCoins((prev) => { const n = prev + amount; save(n); return n; });
  }, []);

  const setBalance = useCallback((amount) => {
    setCoins(() => {
      const n = Math.max(0, Number.isFinite(amount) ? Math.floor(amount) : 0);
      save(n);
      return n;
    });
  }, []);

  const reset = useCallback(() => { save(STARTING_BALANCE); setCoins(STARTING_BALANCE); }, []);

  return { coins, spend, earn, setBalance, reset };
}
