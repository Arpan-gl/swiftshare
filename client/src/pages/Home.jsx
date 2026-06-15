import { useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSender } from '../hooks/useSender';
import { useHistory } from '../context/HistoryContext';
import { formatSize, getFileIcon, getMimeType } from '../utils/fileUtils';
import RadiatingBackground from '../components/RadiatingBackground';

export default function Home() {
  const [dragging, setDragging]     = useState(false);
  const [selectedFile, setSelected] = useState(null);
  const [uploading, setUploading]   = useState(false);
  const inputRef                    = useRef(null);
  const navigate                    = useNavigate();
  const { createSession }           = useSender();
  const { addTransfer }             = useHistory();

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    setSelected(file);
    setUploading(true);
    try {
      const result = await createSession(file);
      addTransfer({
        transferId: result.transferId,
        fileName:   file.name,
        fileSize:   file.size,
        createdAt:  Date.now(),
        expiresAt:  result.expiresAt,
        status:     'waiting',
        shareUrl:   result.shareUrl,
      });
      navigate(`/share/${result.transferId}`, {
        state: { file, shareUrl: result.shareUrl, transferId: result.transferId },
      });
    } catch (err) {
      console.error(err);
      setUploading(false);
    }
  }, [createSession, addTransfer, navigate]);

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <div className="page" id="home-page">
      {/* Radiating lines — idle, no active animation */}
      <RadiatingBackground isActive={false} progress={0} direction="up" />

      <div className="hero">
        <h1>
          Fast, secure, <em>limitless</em><br />file sharing.
        </h1>
        <p>
          No file size limit, no cloud storage — your file goes directly from
          your device to theirs over an encrypted peer-to-peer connection.
        </p>

        {/* Drop Zone */}
        <div
          id="drop-zone"
          className={`drop-zone${dragging ? ' dragging' : ''}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          {uploading ? (
            <>
              <div style={{ marginBottom: 12 }}>
                <div className="spinner spinner-dark" style={{ width: 32, height: 32, margin: '0 auto' }} />
              </div>
              <p className="dz-main">Creating secure session…</p>
              <p className="dz-sub">{selectedFile?.name}</p>
            </>
          ) : (
            <>
              <div className="dz-icon">
                {/* Cloud upload icon */}
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 14.899A7 7 0 1115.71 8h1.79a4.5 4.5 0 012.5 8.242" />
                  <path d="M12 12v9" />
                  <path d="M8 17l4-5 4 5" />
                </svg>
              </div>
              <p className="dz-main">Drop your file here</p>
              <p className="dz-sub">or click to browse · Any file, any size</p>
              <button
                className="btn-primary"
                id="select-files-btn"
                onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                Select file
              </button>
              <p style={{ marginTop: 14, fontSize: 12, color: 'var(--text-3)' }}>
                No sign-up required
              </p>
            </>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          style={{ display: 'none' }}
          onChange={(e) => handleFile(e.target.files[0])}
        />

        {/* Trust Bar */}
        <div className="trust-bar">
          {[
            { label: 'End-to-end encrypted', icon: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /> },
            { label: 'Peer-to-peer', icon: <><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></> },
            { label: 'No size limit', icon: <path d="M18.178 8c5.096 0 5.096 8 0 8-5.095 0-7.133-8-12.739-8-4.585 0-4.585 8 0 8 5.606 0 7.644-8 12.74-8z" /> },
            { label: 'SSL/DTLS encrypted', icon: <><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></> },
          ].map(({ label, icon }) => (
            <span className="trust-item" key={label}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {icon}
              </svg>
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Features Grid */}
      <div className="features-grid" id="features-section">
        {[
          {
            icon: <><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></>,
            title: 'Military-grade encryption',
            desc: 'Files are encrypted before they leave your device using DTLS-SRTP via WebRTC.',
          },
          {
            icon: <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />,
            title: 'Zero throttle',
            desc: 'Direct P2P connections mean you get your full bandwidth — no cloud bottleneck.',
          },
          {
            icon: <><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></>,
            title: 'Password-protected links',
            desc: 'Add an expiry time or password to any transfer link for extra security.',
          },
          {
            icon: <><path d="M3 12a9 9 0 1018 0A9 9 0 003 12z"/><polyline points="12 6 12 12 16 14"/></>,
            title: 'Resume support',
            desc: 'Interrupted transfers resume automatically using IndexedDB checkpoints.',
          },
        ].map(({ icon, title, desc }) => (
          <div className="feat-card" key={title}>
            <div className="fc-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {icon}
              </svg>
            </div>
            <h3>{title}</h3>
            <p>{desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
