import { createContext, useContext, useState, useEffect } from 'react';

const HistoryContext = createContext(null);

const STORAGE_KEY = 'swiftshare_history';

export function HistoryProvider({ children }) {
  const [history, setHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  }, [history]);

  function addTransfer(entry) {
    setHistory(prev => [entry, ...prev].slice(0, 50));
  }

  function updateTransfer(transferId, updates) {
    setHistory(prev =>
      prev.map(t => t.transferId === transferId ? { ...t, ...updates } : t)
    );
  }

  function clearHistory() {
    setHistory([]);
  }

  return (
    <HistoryContext.Provider value={{ history, addTransfer, updateTransfer, clearHistory }}>
      {children}
    </HistoryContext.Provider>
  );
}

export function useHistory() {
  return useContext(HistoryContext);
}
