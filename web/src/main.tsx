import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { loadRuntime } from "./config";
import App from "./App";
import "./styles.css";
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="fatal">
        <h1>Signal interrupted.</h1>
        <p>
          The interface could not continue. Your saved recovery record remains
          in this browser.
        </p>
        <button onClick={() => location.reload()}>Reload terminal</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
const root = createRoot(document.getElementById("root")!);
root.render(
  <main className="fatal">
    <h1>SOREN</h1>
    <p role="status">Verifying the deployment manifest…</p>
  </main>,
);
loadRuntime()
  .then((runtime) =>
    root.render(
      <Boundary>
        <App runtime={runtime} />
      </Boundary>,
    ),
  )
  .catch((e) =>
    root.render(
      <main className="fatal">
        <h1>Signal interrupted.</h1>
        <p role="alert">
          {e instanceof Error ? e.message : "Could not verify this deployment."}
        </p>
        <button onClick={() => location.reload()}>Retry verification</button>
      </main>,
    ),
  );
