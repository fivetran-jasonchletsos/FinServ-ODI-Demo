import { HashRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import HoldingsPage from './pages/HoldingsPage';
import CompanyDetailPage from './pages/CompanyDetailPage';
import MacroPage from './pages/MacroPage';
import ComplaintsPage from './pages/ComplaintsPage';
import GeographicPage from './pages/GeographicPage';
import AgentPage from './pages/AgentPage';
import AboutAgentPage from './pages/AboutAgentPage';
import ArchitecturePage from './pages/ArchitecturePage';
import PipelinePage from './pages/PipelinePage';
import WatchlistPage from './pages/WatchlistPage';
import AboutPage from './pages/AboutPage';
import NotFoundPage from './pages/NotFoundPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, refetchOnWindowFocus: false, retry: 1 },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="/holdings" element={<HoldingsPage />} />
            <Route path="/companies/:cik" element={<CompanyDetailPage />} />
            <Route path="/macro" element={<MacroPage />} />
            <Route path="/macro/:seriesId" element={<MacroPage />} />
            <Route path="/complaints" element={<ComplaintsPage />} />
            <Route path="/geography" element={<GeographicPage />} />
            <Route path="/agent" element={<AgentPage />} />
            <Route path="/about-agent" element={<AboutAgentPage />} />
            <Route path="/architecture" element={<ArchitecturePage />} />
            <Route path="/pipeline" element={<PipelinePage />} />
            <Route path="/watchlist" element={<WatchlistPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </HashRouter>
    </QueryClientProvider>
  );
}
