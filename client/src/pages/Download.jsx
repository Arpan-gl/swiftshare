import { useParams } from 'react-router-dom';
import { useReceiver } from '../hooks/useReceiver';
import { formatSize, getFileIcon } from '../utils/fileUtils';

export default function Download() {
  const { transferId } = useParams();
  const { sessionMeta, status, progress, statusText, error, startDownload } = useReceiver(transferId);

  const isLoading = status === 'loading';
  const isConnecting = status === 'connecting';
  const isReceiving = status === 'receiving';
  const isVerifying = status === 'verifying';
  const isDone = status === 'done';
  const isActive = isConnecting || isReceiving || isVerifying;

  return (
    <div className="page">
      <div className="dl-wrap">
        {/* Badge */}
        <div className="dl-badge">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
          {isDone ? 'Download complete' : 'Ready to download'}
        </div>

        <h1 className="page-title">
          {isDone ? 'Download complete' : isActive ? 'Downloading…' : 'Ready to download'}
        </h1>
        <p className="page-sub">
          {isDone
            ? 'Your file has been saved to your device.'
            : isActive
              ? 'Your file is being transferred directly from the sender.'
              : 'Your secure file transfer is verified and ready for retrieval.'}
        </p>

        {/* Error */}
        {error && (
          <div className="alert alert-err">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            {error}
          </div>
        )}

        {/* File card */}
        {isLoading ? (
          <div className="file-card">
            <div className="fc-type">
              <div className="spinner spinner-dark" style={{ width: 20, height: 20 }} />
            </div>
            <div>
              <div className="fc-name" style={{ color: 'var(--text-3)' }}>Loading transfer info…</div>
            </div>
          </div>
        ) : sessionMeta ? (
          <div className="file-card">
            <div className="fc-type">{getFileIcon(sessionMeta.fileName)}</div>
            <div>
              <div className="fc-name">{sessionMeta.fileName}</div>
              <div className="fc-meta">
                {formatSize(sessionMeta.fileSize)} · Transfer by SwiftShare
                {progress > 0 && !isDone && ` · ${progress}% received`}
              </div>
            </div>
          </div>
        ) : null}

        {/* Progress bar */}
        {(isActive || isDone) && (
          <>
            <div className="dl-progress-wrap">
              <div className="dl-progress-bar" style={{ width: `${progress}%` }} />
            </div>
            <p className="dl-status-txt">{statusText}</p>
          </>
        )}

        {/* Download button */}
        <button
          className={`btn-dl${isDone ? ' done' : ''}`}
          disabled={isLoading || isActive || isDone || !!error}
          onClick={startDownload}
        >
          {isActive ? (
            <>
              <div className="spinner" />
              {isVerifying ? 'Verifying…' : isConnecting ? 'Connecting…' : 'Downloading…'}
            </>
          ) : isDone ? (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
              Download complete
            </>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download File
            </>
          )}
        </button>

        <p className="expire-note">
          Link expires in 48 hours · Download size limit: none · Auto-deletes after download
        </p>

        <div className="dl-trust">
          <div className="dl-trust-item">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
            End-to-end encrypted
          </div>
          <div className="dl-trust-item">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
            Full bandwidth speed
          </div>
          <div className="dl-trust-item">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
            Auto-deletes after download
          </div>
        </div>
      </div>
    </div>
  );
}
