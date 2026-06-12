import { useHistory } from '../context/HistoryContext';
import { formatSize, formatRelativeTime, getFileIcon } from '../utils/fileUtils';

export default function History() {
  const { history, clearHistory } = useHistory();

  const isExpired = (entry) => entry.expiresAt && Date.now() > entry.expiresAt;

  const getStatusPill = (entry) => {
    if (isExpired(entry)) return <span className="status-pill pill-expired">Expired</span>;
    if (entry.status === 'done') return <span className="status-pill pill-done">✓ Complete</span>;
    return <span className="status-pill pill-waiting">Waiting</span>;
  };

  return (
    <div className="page" id="history-page">
      <div className="history-wrap">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <h1 className="page-title">Transfer history</h1>
            <p className="page-sub" style={{ marginBottom: 0 }}>All your active and past transfers.</p>
          </div>
          {history.length > 0 && (
            <button className="btn-ghost" onClick={clearHistory} style={{ fontSize: 12 }} id="clear-history-btn">
              Clear all
            </button>
          )}
        </div>

        {history.length === 0 ? (
          <div className="history-empty" id="history-empty-state">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3, margin: '0 auto 12px' }} aria-hidden="true">
              <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
            <p>No transfers yet. Share a file to get started.</p>
          </div>
        ) : (
          <div className="history-table" id="history-table">
            <div className="history-row header">
              <span>File</span>
              <span className="col-size">Size</span>
              <span className="col-date">Shared</span>
              <span>Status</span>
            </div>
            {history.map((entry, i) => (
              <div
                className="history-row"
                key={entry.transferId}
                style={{ animationDelay: `${i * 0.04}s` }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <span style={{ fontSize: 18 }}>{getFileIcon(entry.fileName)}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-1)' }}>
                      {entry.fileName}
                    </div>
                    {entry.shareUrl && !isExpired(entry) && (
                      <a
                        href={entry.shareUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontSize: 11, color: 'var(--accent)' }}
                      >
                        Open link ↗
                      </a>
                    )}
                  </div>
                </div>
                <span className="col-size" style={{ fontSize: 13, color: 'var(--text-3)' }}>
                  {formatSize(entry.fileSize)}
                </span>
                <span className="col-date" style={{ fontSize: 12, color: 'var(--text-3)' }}>
                  {formatRelativeTime(entry.createdAt)}
                </span>
                <span>{getStatusPill(entry)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
