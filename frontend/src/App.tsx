import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Summary from "./pages/Summary";
import NotFound from "./pages/NotFound";

const App = () => (
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/summary" element={<Summary />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  </BrowserRouter>
);

export default App;
