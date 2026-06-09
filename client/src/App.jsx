import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { HistoryProvider } from './context/HistoryContext';
import Nav from './components/Nav';
import Home from './pages/Home';
import Share from './pages/Share';
import Download from './pages/Download';
import History from './pages/History';

export default function App() {
  return (
    <HistoryProvider>
      <BrowserRouter>
        <Nav />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/share/:transferId" element={<Share />} />
          <Route path="/download/:transferId" element={<Download />} />
          <Route path="/history" element={<History />} />
        </Routes>
      </BrowserRouter>
    </HistoryProvider>
  );
}
