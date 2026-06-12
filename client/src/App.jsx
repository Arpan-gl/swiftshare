import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { HistoryProvider } from './context/HistoryContext';
import Nav from './components/Nav';
import Home from './pages/Home';
import Share from './pages/Share';
import Download from './pages/Download';
import History from './pages/History';

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <div className="page-transition" key={location.pathname}>
      <Routes location={location}>
        <Route path="/" element={<Home />} />
        <Route path="/share/:transferId" element={<Share />} />
        <Route path="/download/:transferId" element={<Download />} />
        <Route path="/history" element={<History />} />
      </Routes>
    </div>
  );
}

export default function App() {
  return (
    <HistoryProvider>
      <BrowserRouter>
        <div className="app-bg" aria-hidden="true" />
        <Nav />
        <AnimatedRoutes />
      </BrowserRouter>
    </HistoryProvider>
  );
}
