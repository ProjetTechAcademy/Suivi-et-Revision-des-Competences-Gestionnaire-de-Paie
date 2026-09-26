"use client";

import { useMemo, useState } from "react";

export type MindMapNode = {
  id: string;
  label: string;
  emoji?: string;
  detail?: string;
  children?: MindMapNode[];
};

export type MindMapData = {
  title: string;
  root: MindMapNode;
};

function countNodes(node: MindMapNode): number {
  return 1 + (node.children ?? []).reduce((sum, child) => sum + countNodes(child), 0);
}

function Branch({
  node,
  depth,
  selected,
  onSelect,
}: {
  node: MindMapNode;
  depth: number;
  selected: string;
  onSelect: (node: MindMapNode) => void;
}) {
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = Boolean(node.children?.length);

  return <div className={`mindBranch depth-${Math.min(depth, 4)}`}>
    <div className="mindNodeRow">
      <button
        className={`mindNode ${selected === node.id ? "selected" : ""}`}
        onClick={() => onSelect(node)}
        type="button"
      >
        <span className="mindEmoji">{node.emoji || (depth === 0 ? "🧠" : "•")}</span>
        <span>{node.label}</span>
      </button>
      {hasChildren && <button className="mindToggle" type="button" onClick={() => setOpen((value) => !value)} aria-label={open ? "Replier" : "Déplier"}>{open ? "−" : "+"}</button>}
    </div>
    {open && hasChildren && <div className="mindChildren">{node.children!.map((child) => <Branch key={child.id} node={child} depth={depth + 1} selected={selected} onSelect={onSelect} />)}</div>}
  </div>;
}

export default function MindMapPanel({ data, onClose }: { data: MindMapData; onClose: () => void }) {
  const [selectedNode, setSelectedNode] = useState<MindMapNode>(data.root);
  const total = useMemo(() => countNodes(data.root), [data]);

  return <div className="overlayShell" role="dialog" aria-modal="true" aria-label="Carte mentale">
    <section className="premiumModal mindMapModal">
      <header className="premiumModalHeader">
        <div>
          <span className="eyebrow">CARTE MENTALE INTERACTIVE</span>
          <h2>{data.title}</h2>
          <p>{total} repères • Cliquez sur un nœud pour l’explorer, +/− pour déplier les branches.</p>
        </div>
        <button className="modalClose" onClick={onClose} type="button" aria-label="Fermer">×</button>
      </header>
      <div className="mindMapWorkspace">
        <div className="mindCanvas">
          <Branch node={data.root} depth={0} selected={selectedNode.id} onSelect={setSelectedNode} />
        </div>
        <aside className="mindDetail">
          <span className="mindDetailIcon">{selectedNode.emoji || "✦"}</span>
          <h3>{selectedNode.label}</h3>
          <p>{selectedNode.detail || "Sélectionnez une branche pour afficher son explication."}</p>
          {selectedNode.children?.length ? <small>{selectedNode.children.length} sous-thème{selectedNode.children.length > 1 ? "s" : ""}</small> : <small>Point terminal de la carte</small>}
        </aside>
      </div>
    </section>
  </div>;
}
