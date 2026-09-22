import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rules from "../rules.md?raw";
import { Brand } from "./Brand";
export default function Rules({ onClose }: { onClose?: () => void }) {
  return (
    <div className="rules-page">
      <header>
        <Brand name="haven" />
        {onClose ? (
          <button onClick={onClose}>Back to the wheel ↗</button>
        ) : (
          <a className="button" href="/">
            Back to Haven Spin ↗
          </a>
        )}
      </header>
      <main>
        <p className="eyebrow">NFIH DEMO DAY · SEPTEMBER 22, 2026</p>
        <h1>
          Spin Your Way
          <br />
          to Haven
        </h1>
        <p className="rules-deck">Official contest rules</p>
        <Markdown skipHtml remarkPlugins={[remarkGfm]}>
          {rules}
        </Markdown>
      </main>
      <footer>Haven Workspace · info@havenworkspace.ca</footer>
    </div>
  );
}
