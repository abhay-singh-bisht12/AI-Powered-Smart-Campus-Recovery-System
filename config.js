// Environment-aware API configuration
// Local Live Server (127.0.0.1/localhost) -> local Node backend
// Deployed frontend -> Render backend
(function () {
  const isLocalFrontend = ["localhost", "127.0.0.1"].includes(window.location.hostname);

  window.__API_BASE__ = isLocalFrontend
    ? "http://localhost:5000"
    : "https://ai-campus-recovery-server.onrender.com";
})();
