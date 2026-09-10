import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useState, useEffect } from "react";
import { Layout } from "./components/layout/Layout";
import { liveChannel } from "./lib/live";
import { getToken } from "./lib/auth";
import Hub from "./pages/Hub";
import FieldSuite from "./pages/FieldSuite";
import Guard from "./pages/Guard";
import Kiosk from "./pages/Kiosk";
import Admin from "./pages/Admin";

function App() {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const ch = liveChannel(
      "/ws/admin",
      () => {},
      () => setConnected(false),
      10000,
      (c) => setConnected(c),
      getToken()
    );
    return () => ch.stop();
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout connected={connected} />}>
          <Route path="/" element={<Hub />} />
          <Route path="/field" element={<FieldSuite />} />
          <Route path="/kiosk" element={<Kiosk />} />
          <Route path="/guard" element={<div className="p-6 max-w-6xl mx-auto"><Guard /></div>} />
          <Route path="/admin" element={<Admin />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
