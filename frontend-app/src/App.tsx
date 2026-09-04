import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useState, useEffect } from "react";
import { Layout } from "./components/layout/Layout";
import { liveChannel } from "./lib/live";
import Hub from "./pages/Hub";
import Guard from "./pages/Guard";
import Kiosk from "./pages/Kiosk";
import Admin from "./pages/Admin";

function App() {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const ch = liveChannel(
      "/ws/lot/S1",
      () => {},
      () => setConnected(false),
      10000,
      (c) => setConnected(c)
    );
    return () => ch.stop();
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout connected={connected} />}>
          <Route path="/" element={<Hub />} />
          <Route path="/guard" element={<Guard />} />
          <Route path="/kiosk" element={<Kiosk />} />
          <Route path="/admin" element={<Admin />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
