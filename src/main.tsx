import React, { Component, type ReactNode } from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/manrope/latin-400.css";
import "@fontsource/manrope/latin-500.css";
import "@fontsource/manrope/latin-600.css";
import "@fontsource/manrope/latin-700.css";
import "@fontsource/oxanium/latin-500.css";
import "@fontsource/oxanium/latin-600.css";
import "./styles.css";
import App from "./App";
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="loading">
        <h1>Let’s get you back to Haven.</h1>
        <p>
          Please ask booth staff to reload. Recorded entries and prizes remain
          on this device.
        </p>
        <button onClick={() => location.reload()}>Reload app</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Boundary>
      <App />
    </Boundary>
  </React.StrictMode>,
);
