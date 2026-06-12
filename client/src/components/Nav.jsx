import { Link, useLocation } from 'react-router-dom';

export default function Nav() {
  const { pathname } = useLocation();

  return (
    <nav className="nav" id="main-nav">
      <Link to="/" className="nav-logo" id="nav-logo">
        Swift<span>Share</span>
      </Link>
      <div className="nav-links">
        <Link to="/" className={pathname === '/' ? 'active' : ''} id="nav-transfer">
          Transfer
        </Link>
        <Link to="/history" className={pathname === '/history' ? 'active' : ''} id="nav-history">
          History
        </Link>
      </div>
      <Link to="/" className="btn-primary" id="nav-upload-btn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        Upload
      </Link>
    </nav>
  );
}
