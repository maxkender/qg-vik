"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Handle, MarkerType, Position, ReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { motion } from "motion/react";
import { Check, Flag, Play, X } from "lucide-react";
import type { Actor, ProcessRow, ProcessStep } from "@/lib/types";
import { cn } from "@/lib/utils";

export const ACTOR: Record<Actor, { label: string; tone: string }> = {
  max: { label: "Max", tone: "bg-max-soft text-max" },
  adrien: { label: "Adrien", tone: "bg-adrien-soft text-adrien" },
  os: { label: "OS", tone: "bg-info-soft text-info" },
  hm: { label: "HM", tone: "bg-warn-soft text-warn" },
  poster: { label: "Posteur", tone: "bg-muted text-foreground" },
  claude: { label: "Claude", tone: "bg-now-soft text-now" },
  both: { label: "Les deux", tone: "bg-both-soft text-both" },
};

export function ActorBadge({ who }: { who: Actor }) {
  const a = ACTOR[who] ?? ACTOR.both;
  return <span className={cn("shrink-0 rounded-[5px] px-1.5 py-px text-[10px] font-bold tracking-wide uppercase", a.tone)}>{a.label}</span>;
}

type StepData = { step: ProcessStep; index: number; hasYes: boolean; hasNo: boolean };
type BranchData = { text: string; yes: boolean; index: number };

const W = 300;
const BRANCH_W = 250;
const GAP_X = 70;
const GAP_Y = 34;
// Hauteur estimée d'une carte selon la longueur du texte (React Flow a besoin des positions à l'avance).
const lines = (text: string | undefined, perLine: number) => (text ? Math.ceil(text.length / perLine) : 0);
const stepHeight = (s: ProcessStep) => 44 + lines(s.title, 30) * 21 + lines(s.desc, 44) * 18;
const branchHeight = (t: string) => 22 + lines(t, 36) * 18;

const appear = (index: number) => ({
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.28, delay: Math.min(index * 0.07, 0.7), ease: "easeOut" as const },
});
const hidden = "!size-1.5 !min-h-0 !min-w-0 !border-0 !bg-transparent";

function StepNode({ data }: NodeProps<Node<StepData>>) {
  const { step, index, hasYes, hasNo } = data;
  const gate = step.kind === "gate";
  return (
    <motion.div
      {...appear(index)}
      style={{ width: W }}
      className={cn(
        "glass rounded-2xl px-3.5 py-3 text-left",
        step.kind === "start" && "border-info/40",
        step.kind === "end" && "border-good/40",
        gate && "border-warn/45",
      )}
    >
      <Handle type="target" position={Position.Top} className={hidden} />
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            "num mt-px grid size-6 shrink-0 place-items-center text-[10.5px]",
            gate ? "rotate-45 rounded-[6px] border-[1.5px] border-warn text-warn" : "rounded-full border-[1.5px] border-line-strong text-muted-foreground",
            step.kind === "start" && "border-info text-info",
            step.kind === "end" && "border-good bg-good-soft text-good",
          )}
        >
          <span className={cn(gate && "-rotate-45")}>
            {step.kind === "start" ? <Play className="size-2.5 fill-current" aria-hidden /> : step.kind === "end" ? <Flag className="size-3" aria-hidden /> : index + 1}
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[13.5px] leading-[21px] font-semibold">{step.title}</p>
            <ActorBadge who={step.who} />
          </div>
          {step.desc && <p className="mt-0.5 text-[12.5px] leading-[18px] text-muted-foreground">{step.desc}</p>}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className={hidden} />
      {hasYes && <Handle id="yes" type="source" position={Position.Right} className={hidden} />}
      {hasNo && <Handle id="no" type="source" position={Position.Left} className={hidden} />}
    </motion.div>
  );
}

function BranchNode({ data }: NodeProps<Node<BranchData>>) {
  const Icon = data.yes ? Check : X;
  return (
    <motion.div
      {...appear(data.index + 1)}
      style={{ width: BRANCH_W }}
      className={cn("flex items-start gap-2 rounded-xl border px-3 py-2.5 text-[12.5px] leading-[18px]", data.yes ? "border-good/30 bg-good-soft text-good" : "border-bad/30 bg-bad-soft text-bad")}
    >
      <Handle type="target" position={data.yes ? Position.Left : Position.Right} className={hidden} />
      <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>{data.text}</span>
    </motion.div>
  );
}

const nodeTypes = { step: StepNode, branch: BranchNode };

function layout(process: ProcessRow) {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const anyNo = process.steps.some((s) => s.no);
  const x0 = anyNo ? BRANCH_W + GAP_X : 0;
  let y = 0;
  process.steps.forEach((step, i) => {
    const h = stepHeight(step);
    const id = `s${i}`;
    nodes.push({ id, type: "step", position: { x: x0, y }, data: { step, index: i, hasYes: Boolean(step.yes), hasNo: Boolean(step.no) }, draggable: false, selectable: false });
    if (i > 0) {
      edges.push({
        id: `e${i}`,
        source: `s${i - 1}`,
        target: id,
        type: "smoothstep",
        animated: true,
        style: { stroke: "var(--line-strong)", strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "var(--faint)", width: 16, height: 16 },
      });
    }
    let extra = 0;
    if (step.yes) {
      const bh = branchHeight(step.yes);
      nodes.push({ id: `${id}y`, type: "branch", position: { x: x0 + W + GAP_X, y: y + Math.max(0, (h - bh) / 2) }, data: { text: step.yes, yes: true, index: i }, draggable: false, selectable: false });
      edges.push({ id: `${id}ye`, source: id, sourceHandle: "yes", target: `${id}y`, type: "smoothstep", animated: true, label: "oui", style: { stroke: "var(--good)", strokeWidth: 1.5 }, labelStyle: { fill: "var(--good)", fontSize: 11, fontWeight: 600 }, labelBgStyle: { fill: "var(--viz-surface)" }, labelBgPadding: [4, 2] });
      extra = Math.max(extra, bh - h);
    }
    if (step.no) {
      const bh = branchHeight(step.no);
      nodes.push({ id: `${id}n`, type: "branch", position: { x: x0 - GAP_X - BRANCH_W, y: y + Math.max(0, (h - bh) / 2) }, data: { text: step.no, yes: false, index: i }, draggable: false, selectable: false });
      edges.push({ id: `${id}ne`, source: id, sourceHandle: "no", target: `${id}n`, type: "smoothstep", animated: true, label: "non", style: { stroke: "var(--bad)", strokeWidth: 1.5 }, labelStyle: { fill: "var(--bad)", fontSize: 11, fontWeight: 600 }, labelBgStyle: { fill: "var(--viz-surface)" }, labelBgPadding: [4, 2] });
      extra = Math.max(extra, bh - h);
    }
    y += h + Math.max(0, extra) + GAP_Y;
  });
  const anyYes = process.steps.some((s) => s.yes);
  return { nodes, edges, height: y, width: x0 + W + (anyYes ? GAP_X + BRANCH_W : 0) };
}

/** Schéma animé d'un process : étapes en colonne, branches « oui » à droite et « non » à gauche. */
export function ProcessFlow({ process }: { process: ProcessRow }) {
  const { nodes, edges, height, width } = useMemo(() => layout(process), [process]);
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);

  // On cale le schéma en haut et au centre, réduit seulement s'il manque de la largeur.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setW(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const zoom = w ? Math.min(1, (w - 8) / width) : 1;
  return (
    <div ref={box} style={{ height: Math.ceil(height * zoom) + 16 }} className="w-full">
      {w > 0 && (
        <ReactFlow
          key={`${process.id}:${w}`}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          defaultViewport={{ x: Math.max(0, (w - width * zoom) / 2), y: 4, zoom }}
          minZoom={0.2}
          maxZoom={1}
          nodesDraggable={false}
          nodesConnectable={false}
          nodesFocusable={false}
          edgesFocusable={false}
          elementsSelectable={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          panOnDrag={false}
          panOnScroll={false}
          preventScrolling={false}
          proOptions={{ hideAttribution: true }}
          style={{ background: "transparent" }}
          aria-label={`Schéma du process « ${process.title} »`}
        />
      )}
    </div>
  );
}

/** Même contenu en liste simple : pour le téléphone et les lecteurs d'écran. */
export function ProcessList({ process }: { process: ProcessRow }) {
  return (
    <ol className="flex flex-col">
      {process.steps.map((s, i) => (
        <li key={i} className="relative pb-4 pl-9 last:pb-0">
          {i < process.steps.length - 1 && <span className="absolute top-6 bottom-0 left-[11px] w-px bg-line-strong" aria-hidden />}
          <span
            className={cn(
              "num absolute top-0 left-0 grid size-6 place-items-center rounded-full border-[1.5px] border-line-strong text-[10.5px] text-muted-foreground",
              s.kind === "start" && "border-info text-info",
              s.kind === "end" && "border-good bg-good-soft text-good",
              s.kind === "gate" && "rotate-45 rounded-[6px] border-warn text-warn",
            )}
          >
            <span className={cn(s.kind === "gate" && "-rotate-45")}>{i + 1}</span>
          </span>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px] leading-6 font-semibold">
            {s.title} <ActorBadge who={s.who} />
          </p>
          {s.desc && <p className="text-[13px] text-muted-foreground">{s.desc}</p>}
          {s.yes && <p className="mt-1.5 rounded-lg bg-good-soft px-2.5 py-1.5 text-[12.5px] text-good">{s.yes}</p>}
          {s.no && <p className="mt-1.5 rounded-lg bg-bad-soft px-2.5 py-1.5 text-[12.5px] text-bad">{s.no}</p>}
        </li>
      ))}
    </ol>
  );
}
