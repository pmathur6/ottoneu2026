import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import TopNav from "@/components/TopNav";
import Standings from "@/pages/Standings";
import Rosters from "@/pages/Rosters";
import Trade from "@/pages/Trade";
import TeamProduction from "@/pages/TeamProduction";
import PlayerFlow from "@/pages/PlayerFlow";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <TopNav />
        <main className="container py-6">
          <Routes>
            <Route path="/" element={<Standings />} />
            <Route path="/rosters" element={<Rosters />} />
            <Route path="/trade" element={<Trade />} />
            <Route path="/team-production" element={<TeamProduction />} />
            <Route path="/player-flow" element={<PlayerFlow />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
