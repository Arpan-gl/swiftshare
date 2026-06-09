import { useEffect, useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useSender } from '../hooks/useSender';
import { useHistory } from '../context/HistoryContext';
import { formatSize, getFileIcon } from '../utils/fileUtils';

export default function Share() {
  const { transferId } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const { status, shareUrl: hookUrl, peers, error, primeTransfer, registerSender } = useSender();
  const { updateTransfer } = useHistory();
  const [copied, setCopied] = useState(false);

  const file = state?.file;
  const shareUrl = state?.shareUrl || hookUrl || window.location.href;

  // If page refreshed without state, redirect home
  useEffect(() => {
    if (!file && !transferId) navigate('/');
  }, [file, transferId, navigate]);

  // Register sender when this component mounts (handles refresh case)
  useEffect(() => {
    if (!transferId) return;
    primeTransfer(file, transferId, state?.shareUrl);
    registerSender(transferId);
  }, [file, transferId, state?.shareUrl, primeTransfer, registerSender]);

  useEffect(() => {
    if (status === 'done') {
      updateTransfer(transferId, { status: 'done' });
    }
  }, [status, transferId]);

  const copyUrl = () => {
    navigator.clipboard.writeText(shareUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const peerList = Object.entries(peers);
  const activePeers = peerList.filter(([, p]) => p.status !== 'disconnected');

  return (
    <div className="page">
      <div className="share-wrap">
        <h1 className="page-title">Your link is ready</h1>
        <p className="page-sub">
          Share this link — anyone with it can download the file directly from your device.
        </p>

        {file && (
          <div className="file-card">
            <div className="fc-type">{getFileIcon(file.name)}</div>
            <div>
              <div className="fc-name">{file.name}</div>
              <div className="fc-meta">{formatSize(file.size)} · Ready to send</div>
            </div>
          </div>
        )}

        <div className="url-row">
          <span title={shareUrl}>{shareUrl}</span>
          <button className="btn-copy" onClick={copyUrl}>
            {copied ? (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
                Copied!
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                Copy link
              </>
            )}
          </button>
        </div>
        <p className="url-note">Link expires in 48 hours · Transfers are end-to-end encrypted</p>

        {error && (
          <div className="alert alert-err">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            {error}
          </div>
        )}

        <div className="status-panel">
          <div className="sp-header">
            <span className="sp-header-title">Connection status</span>
            <span className="sp-header-sub">
              {peerList.length === 0
                ? 'Waiting for receiver…'
                : `${activePeers.length} receiver${activePeers.length !== 1 ? 's' : ''} connected`}
            </span>
          </div>
          <div className="sp-body">
            {peerList.length === 0 ? (
              <div className="waiting-state">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0119 12.55"/><path d="M5 12.55a10.94 10.94 0 015.17-2.39"/><path d="M10.71 5.05A16 16 0 0122.56 9"/><path d="M1.42 9a15.91 15.91 0 014.7-2.88"/><path d="M8.53 16.11a6 6 0 016.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>
                <strong>Waiting for someone to open the link…</strong>
                <span>Keep this tab open while sharing</span>
              </div>
            ) : (
              peerList.map(([id, peer]) => (
                <div className="peer-row" key={id}>
                  <div
                    className={`dot ${
                      peer.status === 'connected' || peer.status === 'done' ? 'dot-green'
                      : peer.status === 'disconnected' ? 'dot-gray'
                      : 'dot-amber'
                    }`}
                  />
                  <span className="peer-label">
                    {peer.status === 'done' ? 'Complete' : peer.status === 'disconnected' ? 'Left' : 'Receiver'}
                  </span>
                  <div className="peer-progress-wrap">
                    <div className="peer-progress-bar" style={{ width: `${peer.pct}%` }} />
                  </div>
                  <span className="peer-pct">
                    {peer.status === 'done' ? '✓' : `${peer.pct}%`}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div style={{ marginTop: 20, display: 'flex', gap: 12 }}>
          <button className="btn-ghost" onClick={() => navigate('/')}>
            + Share another file
          </button>
          {status === 'done' && (
            <button className="btn-primary" onClick={() => navigate('/history')}>
              View history
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
