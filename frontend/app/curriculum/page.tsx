"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  Plus,
  X,
  Network,
  ListTree,
  Sparkles,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Info,
  ChevronRight,
  BookOpen,
  Award,
  Layers,
  ArrowRight,
  Zap,
} from "lucide-react";
import { APIError, coursesAPI, curriculumAPI } from "@/lib/api";
import type { BuilderConcept, BuilderUnit, ConceptType, Course } from "@/lib/types";

const CONCEPT_TYPES: { id: ConceptType; label: string }[] = [
  { id: "conceptual", label: "Idea to understand" },
  { id: "procedural", label: "Procedure to follow" },
  { id: "problem_solving", label: "Problems to solve" },
  { id: "analytical", label: "Analysis" },
  { id: "practical", label: "Hands-on practice" },
  { id: "revision", label: "Revision" },
];

const BLOOM_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Remember: { bg: "rgba(59, 130, 246, 0.12)", text: "#2563eb", border: "rgba(59, 130, 246, 0.3)" },
  Understand: { bg: "rgba(16, 185, 129, 0.12)", text: "#059669", border: "rgba(16, 185, 129, 0.3)" },
  Apply: { bg: "rgba(245, 158, 11, 0.12)", text: "#d97706", border: "rgba(245, 158, 11, 0.3)" },
  Analyze: { bg: "rgba(239, 68, 68, 0.12)", text: "#dc2626", border: "rgba(239, 68, 68, 0.3)" },
  Evaluate: { bg: "rgba(139, 92, 246, 0.12)", text: "#7c3aed", border: "rgba(139, 92, 246, 0.3)" },
  Create: { bg: "rgba(236, 72, 153, 0.12)", text: "#db2777", border: "rgba(236, 72, 153, 0.3)" },
};

const UNIT_ACCENTS = [
  "#2563eb", // Unit 1 Blue
  "#7c3aed", // Unit 2 Purple
  "#059669", // Unit 3 Emerald
  "#d97706", // Unit 4 Amber
  "#dc2626", // Unit 5 Red
  "#0891b2", // Unit 6 Cyan
];

type Layout = { unitId: string; topicIds: string[] }[];
type CurriculumView = "graph" | "builder";
type RichConcept = BuilderConcept & { topic: string; unit: number; unitTitle: string; bloom_level?: string };

export default function CurriculumPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState("");
  const [units, setUnits] = useState<BuilderUnit[] | null>(null);
  const [layout, setLayout] = useState<Layout>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragTopic, setDragTopic] = useState<string | null>(null);
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // View state: Graph vs Builder
  const [view, setView] = useState<CurriculumView>("graph");

  // Graph display controls (decluttering)
  const [arrowDisplayMode, setArrowDisplayMode] = useState<"focused" | "all">("focused");
  const [graphUnitFilter, setGraphUnitFilter] = useState<string>("all");
  const [graphSearch, setGraphSearch] = useState<string>("");
  const [inferringPrereqs, setInferringPrereqs] = useState(false);

  useEffect(() => {
    coursesAPI.list().then((c) => {
      setCourses(c);
      const wanted = new URLSearchParams(window.location.search).get("course");
      const start = c.find((x) => x.id === wanted) || c[0];
      if (start) setCourseId(start.id);
    }).catch(() => setCourses([]));
  }, []);

  const load = useCallback(async () => {
    if (!courseId) return;
    const s = await curriculumAPI.get(courseId);
    setUnits(s.units);
    setLayout(s.units.map((u) => ({ unitId: u.id, topicIds: u.topics.map((t) => t.id) })));
  }, [courseId]);

  useEffect(() => {
    setSelectedId(null);
    load().catch(() => setUnits([]));
  }, [load]);

  const topicsById = useMemo(() => new Map((units || []).flatMap((u) => u.topics.map((t) => [t.id, t] as const))), [units]);

  const concepts: RichConcept[] = useMemo(() => {
    return (units || []).flatMap((u) =>
      u.topics.flatMap((t) =>
        t.concepts.map((c) => ({
          ...c,
          topic: t.title,
          unit: u.unit_number,
          unitTitle: u.title,
          bloom_level: (c as { bloom_level?: string }).bloom_level || (c.difficulty >= 4 ? "Analyze" : c.difficulty === 3 ? "Apply" : "Understand"),
        }))
      )
    );
  }, [units]);

  const conceptById = useMemo(() => new Map(concepts.map((c) => [c.id, c])), [concepts]);
  const selected = selectedId ? conceptById.get(selectedId) || null : null;

  const savedLayout = useMemo(() => JSON.stringify((units || []).map((u) => u.topics.map((t) => t.id))), [units]);
  const dirty = JSON.stringify(layout.map((u) => u.topicIds)) !== savedLayout;

  // Selected course object
  const currentCourse = courses.find((c) => c.id === courseId);

  // Reordering helpers
  const moveTopic = (topicId: string, toUnit: string, toIndex: number) => {
    setLayout((prev) => {
      const next = prev.map((u) => ({ ...u, topicIds: u.topicIds.filter((id) => id !== topicId) }));
      const target = next.find((u) => u.unitId === toUnit)!;
      target.topicIds.splice(Math.min(toIndex, target.topicIds.length), 0, topicId);
      return next;
    });
  };

  const nudge = (topicId: string, direction: -1 | 1) => {
    const ui = layout.findIndex((u) => u.topicIds.includes(topicId));
    const ti = layout[ui].topicIds.indexOf(topicId);
    const within = ti + direction;
    if (within >= 0 && within < layout[ui].topicIds.length) {
      moveTopic(topicId, layout[ui].unitId, within);
    } else if (layout[ui + direction]) {
      const neighbour = layout[ui + direction];
      moveTopic(topicId, neighbour.unitId, direction === 1 ? 0 : neighbour.topicIds.length);
    }
  };

  const saveLayout = async () => {
    setSaving(true);
    try {
      const s = await curriculumAPI.saveLayout(courseId, layout.map((u) => ({ unit_id: u.unitId, topic_ids: u.topicIds })));
      setUnits(s.units);
      setStatus({ tone: "ok", text: "Teaching order saved." });
    } catch (err) {
      setStatus({ tone: "error", text: err instanceof Error ? err.message : "Could not save the order" });
    }
    setSaving(false);
  };

  // AI Prerequisite Inference Handler
  const handleInferPrerequisites = async () => {
    if (!courseId) return;
    setInferringPrereqs(true);
    try {
      const res = await curriculumAPI.inferPrerequisites(courseId);
      setStatus({
        tone: "ok",
        text: `✨ AI Prerequisite Graph Mapped! Engine: ${res.provider}. Established ${res.edges_count} pedagogical dependency links (${res.cycles_prevented} cycles prevented).`,
      });
      await load();
    } catch (err) {
      setStatus({
        tone: "error",
        text: err instanceof Error ? err.message : "Failed to run AI prerequisite inference.",
      });
    } finally {
      setInferringPrereqs(false);
    }
  };

  // Graph KPI Calculations
  const graphMetrics = useMemo(() => {
    if (!concepts.length) return { totalConcepts: 0, totalEdges: 0, bottlenecks: [] };
    let totalEdges = 0;
    const downstreamCount: Record<string, number> = {};

    for (const c of concepts) {
      totalEdges += c.prerequisite_ids.length;
      for (const p of c.prerequisite_ids) {
        downstreamCount[p] = (downstreamCount[p] || 0) + 1;
      }
    }

    const bottlenecks = Object.entries(downstreamCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id, count]) => ({
        concept: conceptById.get(id),
        count,
      }))
      .filter((b) => b.concept !== undefined);

    return { totalConcepts: concepts.length, totalEdges, bottlenecks };
  }, [concepts, conceptById]);

  // Directed Edges for Visual SVG Graph
  const graphEdges = useMemo(() => {
    const list: { sourceId: string; targetId: string }[] = [];
    for (const c of concepts) {
      for (const pid of c.prerequisite_ids) {
        if (conceptById.has(pid)) {
          list.push({ sourceId: pid, targetId: c.id });
        }
      }
    }
    return list;
  }, [concepts, conceptById]);

  // Highlight sets when a concept is selected
  const { upstreamSet, downstreamSet } = useMemo(() => {
    if (!selectedId) return { upstreamSet: new Set<string>(), downstreamSet: new Set<string>() };
    const up = new Set<string>();
    const down = new Set<string>();

    // Recursively collect upstream prerequisites
    const traceUp = (id: string) => {
      const c = conceptById.get(id);
      if (!c) return;
      for (const pid of c.prerequisite_ids) {
        if (!up.has(pid)) {
          up.add(pid);
          traceUp(pid);
        }
      }
    };

    // Recursively collect downstream dependents
    const traceDown = (id: string) => {
      for (const c of concepts) {
        if (c.prerequisite_ids.includes(id) && !down.has(c.id)) {
          down.add(c.id);
          traceDown(c.id);
        }
      }
    };

    traceUp(selectedId);
    traceDown(selectedId);
    return { upstreamSet: up, downstreamSet: down };
  }, [selectedId, concepts, conceptById]);

  if (!courses.length && units === null) return <div className="skeleton" style={{ height: 360 }} />;

  return (
    <div className="animate-fade-in" style={{ display: "grid", gap: 20, paddingBottom: 40 }}>
      {/* Page Header with Course Selector, View Switcher & AI Mapping Trigger */}
      <header className="page-header" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.8rem", fontWeight: 700, color: "var(--primary)", textTransform: "uppercase", marginBottom: 4 }}>
            <span>Outcome-Based Education (OBE) &middot; Concept Knowledge Graph</span>
          </div>
          <h1 style={{ margin: 0, fontSize: "1.75rem", fontWeight: 800 }}>
            {view === "graph" ? "Curriculum Prerequisite Graph (DAG)" : "Curriculum Builder & Outline"}
          </h1>
          <p style={{ margin: "4px 0 0", color: "var(--pencil)", fontSize: "0.95rem" }}>
            {view === "graph"
              ? "Interactive Directed Acyclic Graph showing prerequisite concept dependencies, Bloom's cognitive taxonomy, and learning pathways."
              : "Reorder instructional topics and configure difficulty, Bloom level, and prerequisite anchors."}
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {/* Course Selector */}
          {courses.length > 1 && (
            <select
              className="select"
              aria-label="Course"
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              style={{ fontWeight: 600, minWidth: 220 }}
            >
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} {c.title}
                </option>
              ))}
            </select>
          )}

          {/* View Toggle */}
          <div style={{ display: "inline-flex", background: "var(--canvas-subtle)", padding: 3, borderRadius: "var(--radius-md)", border: "1px solid var(--rule)" }}>
            <button
              type="button"
              className={view === "graph" ? "btn btn-primary" : "btn btn-ghost"}
              style={{ fontSize: "0.85rem", padding: "6px 14px", fontWeight: 700 }}
              onClick={() => setView("graph")}
            >
              <Network size={15} /> Graph View (DAG)
            </button>
            <button
              type="button"
              className={view === "builder" ? "btn btn-primary" : "btn btn-ghost"}
              style={{ fontSize: "0.85rem", padding: "6px 14px", fontWeight: 700 }}
              onClick={() => setView("builder")}
            >
              <ListTree size={15} /> Outline Builder
            </button>
          </div>

          {/* AI Prerequisite Inference Button */}
          <button
            type="button"
            className="btn btn-secondary"
            style={{ fontWeight: 700, borderColor: "var(--primary)", color: "var(--primary)" }}
            onClick={handleInferPrerequisites}
            disabled={inferringPrereqs || !units || units.length === 0}
            title="Auto-infer deep prerequisite graph using Groq LLM (when configured) or Pedagogical Semantic Engine"
          >
            <Sparkles size={15} className={inferringPrereqs ? "animate-spin" : ""} />
            {inferringPrereqs ? "Inferring Graph..." : "✨ AI Auto-Map Graph"}
          </button>

          {dirty && view === "builder" && (
            <button type="button" className="btn btn-ghost" onClick={load}>
              Discard changes
            </button>
          )}
          {view === "builder" && (
            <button type="button" className="btn btn-primary" disabled={!dirty || saving} onClick={saveLayout}>
              {saving ? "Saving…" : "Save order"}
            </button>
          )}
        </div>
      </header>

      {status && (
        <div
          role={status.tone === "error" ? "alert" : "status"}
          style={{
            padding: "10px 16px",
            borderRadius: "var(--radius-sm)",
            fontSize: "0.875rem",
            fontWeight: 500,
            background: status.tone === "error" ? "rgba(239, 68, 68, 0.1)" : "rgba(16, 185, 129, 0.1)",
            color: status.tone === "error" ? "var(--redpen)" : "var(--greenpen)",
            border: `1px solid ${status.tone === "error" ? "rgba(239, 68, 68, 0.3)" : "rgba(16, 185, 129, 0.3)"}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span>{status.text}</span>
          <button type="button" onClick={() => setStatus(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit" }}>
            <X size={15} />
          </button>
        </div>
      )}

      {!units ? (
        <div className="skeleton" style={{ height: 420 }} />
      ) : units.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--pencil)" }}>
          <BookOpen size={40} style={{ margin: "0 auto 12px", opacity: 0.5 }} />
          <p style={{ margin: 0, fontSize: "1.1rem" }}>This course has no curriculum yet.</p>
          <p style={{ fontSize: "0.85rem", marginTop: 4 }}>Import a syllabus to generate units, topics, and prerequisite links.</p>
        </div>
      ) : view === "graph" ? (
        // ══════════════════════════════════════════════════════════════
        // VIEW 1: INTERACTIVE CONCEPT PREREQUISITE GRAPH (DAG)
        // ══════════════════════════════════════════════════════════════
        <div style={{ display: "grid", gap: 18 }}>
          {/* Graph KPI & Filter Bar */}
          <div className="card" style={{ padding: "14px 20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14 }}>
              {/* Metrics */}
              <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
                <div>
                  <span style={{ fontSize: "0.75rem", color: "var(--pencil)", textTransform: "uppercase", fontWeight: 600 }}>Total Concepts</span>
                  <div style={{ fontSize: "1.25rem", fontWeight: 800 }}>{graphMetrics.totalConcepts}</div>
                </div>
                <div style={{ borderLeft: "1px solid var(--rule)", paddingLeft: 20 }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--pencil)", textTransform: "uppercase", fontWeight: 600 }}>Prerequisite Links</span>
                  <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--primary)" }}>{graphMetrics.totalEdges} DAG Edges</div>
                </div>
                <div style={{ borderLeft: "1px solid var(--rule)", paddingLeft: 20 }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--pencil)", textTransform: "uppercase", fontWeight: 600 }}>Curriculum Depth</span>
                  <div style={{ fontSize: "1.25rem", fontWeight: 800 }}>{units.length} Unit Modules</div>
                </div>
                {graphMetrics.bottlenecks.length > 0 && (
                  <div style={{ borderLeft: "1px solid var(--rule)", paddingLeft: 20 }}>
                    <span style={{ fontSize: "0.75rem", color: "var(--pencil)", textTransform: "uppercase", fontWeight: 600 }}>Key Foundational Concept</span>
                    <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--accent)" }}>
                      {graphMetrics.bottlenecks[0].concept?.name} ({graphMetrics.bottlenecks[0].count} dependents)
                    </div>
                  </div>
                )}
              </div>

              {/* Arrow View Mode & Filters */}
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                {/* Arrow Display Mode: Focused vs All */}
                <div style={{ display: "inline-flex", background: "var(--canvas-subtle)", padding: 2, borderRadius: "var(--radius-sm)", border: "1px solid var(--rule)" }}>
                  <button
                    type="button"
                    className={arrowDisplayMode === "focused" ? "btn btn-primary" : "btn btn-ghost"}
                    style={{ fontSize: "0.75rem", padding: "4px 10px", fontWeight: 700 }}
                    onClick={() => setArrowDisplayMode("focused")}
                    title="Clean mode: Shows arrows ONLY for the selected concept to eliminate spaghetti clutter"
                  >
                    🎯 Focus on Selection
                  </button>
                  <button
                    type="button"
                    className={arrowDisplayMode === "all" ? "btn btn-primary" : "btn btn-ghost"}
                    style={{ fontSize: "0.75rem", padding: "4px 10px", fontWeight: 700 }}
                    onClick={() => setArrowDisplayMode("all")}
                    title="Overview: Shows all prerequisite arrows simultaneously"
                  >
                    🕸️ Show All Arrows
                  </button>
                </div>

                <div style={{ width: 170 }}>
                  <input
                    type="text"
                    className="input"
                    placeholder="Search concept..."
                    value={graphSearch}
                    onChange={(e) => setGraphSearch(e.target.value)}
                    style={{ fontSize: "0.85rem", padding: "5px 10px" }}
                  />
                </div>

                <select
                  className="select"
                  value={graphUnitFilter}
                  onChange={(e) => setGraphUnitFilter(e.target.value)}
                  style={{ fontSize: "0.85rem", width: "auto" }}
                >
                  <option value="all">All Units ({units.length})</option>
                  {units.map((u) => (
                    <option key={u.id} value={String(u.unit_number)}>
                      Unit {u.unit_number}: {u.title.slice(0, 24)}...
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Color Meaning & Status Banner */}
          <div
            style={{
              padding: "10px 16px",
              background: "var(--canvas-subtle)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--rule)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: "0.82rem",
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 700, color: "var(--ink)" }}>Arrow Color Meaning:</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--greenpen)", fontWeight: 700 }}>
                <span style={{ width: 16, height: 3, background: "#10b981", borderRadius: 2 }} />
                🟢 Green Arrow: Upstream Prerequisite (Must learn this first &rarr; points INTO concept)
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--primary)", fontWeight: 700 }}>
                <span style={{ width: 16, height: 3, background: "#3b82f6", borderRadius: 2 }} />
                🔵 Blue Arrow: Downstream Dependent (Unlocked by this &rarr; points OUT to next topic)
              </span>
            </div>

            <div style={{ color: "var(--pencil)", fontSize: "0.78rem" }}>
              {selectedId ? (
                <span>Click another node to switch focus, or click outside to deselect</span>
              ) : (
                <span>💡 Click any concept card to trace its clean prerequisite pathway</span>
              )}
            </div>
          </div>

          {/* Visual Graph View Area + Right Inspector */}
          <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr 340px" : "1fr", gap: 18, alignItems: "start" }}>
            {/* SVG Interactive Multi-Unit Columnar DAG */}
            <div
              className="card"
              style={{
                padding: 24,
                overflowX: "auto",
                background: "radial-gradient(ellipse at top, rgba(30, 41, 59, 0.04) 0%, transparent 70%)",
                minHeight: 520,
              }}
            >
              <VisualCurriculumDAG
                units={units}
                concepts={concepts}
                edges={graphEdges}
                selectedId={selectedId}
                conceptById={conceptById}
                arrowMode={arrowDisplayMode}
                unitFilter={graphUnitFilter}
                searchQuery={graphSearch}
                onSelectConcept={(id) => setSelectedId(id === selectedId ? null : id)}
              />
            </div>

            {/* Concept Details & Prerequisite Link Inspector */}
            {selected && (
              <aside className="card builder-panel animate-fade-in" aria-label="Concept details" style={{ padding: 20 }}>
                <ConceptPanel
                  key={selected.id}
                  courseId={courseId}
                  concept={selected}
                  allConcepts={concepts}
                  onChanged={async (message) => {
                    await load();
                    setStatus({ tone: "ok", text: message });
                  }}
                  onError={(text) => setStatus({ tone: "error", text })}
                  onClose={() => setSelectedId(null)}
                />
              </aside>
            )}
          </div>
        </div>
      ) : (
        // ══════════════════════════════════════════════════════════════
        // VIEW 2: OUTLINE & REORDER BUILDER (Original Drag-and-Drop)
        // ══════════════════════════════════════════════════════════════
        <div className="builder-grid">
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {layout.map((entry, ui) => {
              const unit = units.find((u) => u.id === entry.unitId)!;
              return (
                <section
                  key={unit.id}
                  aria-label={`Unit ${unit.unit_number}`}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragTopic) moveTopic(dragTopic, unit.id, entry.topicIds.length);
                    setDragTopic(null);
                  }}
                >
                  <h2 className="section-title" style={{ marginBottom: 8 }}>
                    Unit {unit.unit_number}: {unit.title}
                  </h2>
                  {entry.topicIds.length === 0 && <div className="builder-empty">Drop a topic here</div>}
                  <ol className="builder-topics">
                    {entry.topicIds.map((tid, ti) => {
                      const topic = topicsById.get(tid)!;
                      const first = ui === 0 && ti === 0;
                      const last = ui === layout.length - 1 && ti === entry.topicIds.length - 1;
                      return (
                        <li
                          key={tid}
                          draggable
                          className={`builder-topic${dragTopic === tid ? " is-dragging" : ""}`}
                          onDragStart={() => setDragTopic(tid)}
                          onDragEnd={() => setDragTopic(null)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.stopPropagation();
                            if (dragTopic && dragTopic !== tid) moveTopic(dragTopic, unit.id, ti);
                            setDragTopic(null);
                          }}
                        >
                          <div className="builder-topic__head">
                            <GripVertical size={16} aria-hidden="true" style={{ color: "var(--pencil-light)", cursor: "grab", flexShrink: 0 }} />
                            <strong style={{ flex: 1 }}>{topic.title}</strong>
                            <span style={{ color: "var(--pencil)", fontSize: "0.85rem" }}>{topic.allocated_minutes} min</span>
                            {topic.status === "completed" && <span className="badge badge-success">Taught</span>}
                            <button
                              type="button"
                              className="btn btn-ghost"
                              style={{ padding: 4 }}
                              disabled={first}
                              onClick={() => nudge(tid, -1)}
                              title="Move earlier"
                            >
                              <ArrowUp size={16} />
                              <span className="visually-hidden">Move {topic.title} earlier</span>
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              style={{ padding: 4 }}
                              disabled={last}
                              onClick={() => nudge(tid, 1)}
                              title="Move later"
                            >
                              <ArrowDown size={16} />
                              <span className="visually-hidden">Move {topic.title} later</span>
                            </button>
                          </div>
                          <div className="builder-concepts">
                            {topic.concepts.map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => setSelectedId(c.id)}
                                className={`builder-concept${selectedId === c.id ? " is-selected" : ""}`}
                                aria-pressed={selectedId === c.id}
                              >
                                {c.name}
                              </button>
                            ))}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              );
            })}
          </div>

          <aside className="card builder-panel" aria-label="Concept details">
            {!selected ? (
              <p style={{ color: "var(--pencil)" }}>Select a concept to edit it.</p>
            ) : (
              <ConceptPanel
                key={selected.id}
                courseId={courseId}
                concept={selected}
                allConcepts={concepts}
                onChanged={async (message) => {
                  await load();
                  setStatus({ tone: "ok", text: message });
                }}
                onError={(text) => setStatus({ tone: "error", text })}
                onClose={() => setSelectedId(null)}
              />
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// COMPONENT: VISUAL CURRICULUM DAG (Interactive Topological SVG Graph)
// ═════════════════════════════════════════════════════════════════════
function VisualCurriculumDAG({
  units,
  concepts,
  edges,
  selectedId,
  conceptById,
  arrowMode,
  unitFilter,
  searchQuery,
  onSelectConcept,
}: {
  units: BuilderUnit[];
  concepts: RichConcept[];
  edges: { sourceId: string; targetId: string }[];
  selectedId: string | null;
  conceptById: Map<string, RichConcept>;
  arrowMode: "focused" | "all";
  unitFilter: string;
  searchQuery: string;
  onSelectConcept: (id: string) => void;
}) {
  const filteredUnits = useMemo(() => {
    if (unitFilter === "all") return units;
    return units.filter((u) => String(u.unit_number) === unitFilter);
  }, [units, unitFilter]);

  // Node positions: Each unit is a column, concepts are stacked vertically inside each unit
  const COLUMN_WIDTH = 270;
  const COLUMN_GAP = 70;
  const NODE_HEIGHT = 80;
  const NODE_GAP = 14;
  const HEADER_OFFSET = 60;

  // Compute node coordinates (x, y) for every concept
  const nodeCoords = useMemo(() => {
    const coords: Record<string, { x: number; y: number; width: number; height: number; unitNum: number }> = {};

    filteredUnits.forEach((u, colIdx) => {
      const colX = colIdx * (COLUMN_WIDTH + COLUMN_GAP) + 20;
      let currY = HEADER_OFFSET + 10;

      const unitConcepts = concepts.filter((c) => c.unit === u.unit_number);
      unitConcepts.forEach((c) => {
        coords[c.id] = {
          x: colX,
          y: currY,
          width: COLUMN_WIDTH,
          height: NODE_HEIGHT,
          unitNum: u.unit_number,
        };
        currY += NODE_HEIGHT + NODE_GAP;
      });
    });

    return coords;
  }, [filteredUnits, concepts]);

  // Overall SVG dimensions
  const svgWidth = Math.max(900, filteredUnits.length * (COLUMN_WIDTH + COLUMN_GAP) + 40);
  const maxConceptsInCol = Math.max(
    1,
    ...filteredUnits.map((u) => concepts.filter((c) => c.unit === u.unit_number).length)
  );
  const svgHeight = Math.max(500, HEADER_OFFSET + maxConceptsInCol * (NODE_HEIGHT + NODE_GAP) + 60);

  return (
    <div style={{ position: "relative", width: svgWidth, minHeight: svgHeight, userSelect: "none" }}>
      {/* SVG Arrowhead Markers & Prerequisite Curves */}
      <svg
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: svgWidth,
          height: svgHeight,
          pointerEvents: "none",
          zIndex: 1,
        }}
      >
        <defs>
          <marker id="arrow-default" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <polygon points="0 0, 8 4, 0 8" fill="var(--pencil-light)" opacity="0.6" />
          </marker>
          <marker id="arrow-upstream" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">
            <polygon points="0 0, 9 4.5, 0 9" fill="#10b981" />
          </marker>
          <marker id="arrow-downstream" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">
            <polygon points="0 0, 9 4.5, 0 9" fill="#3b82f6" />
          </marker>
        </defs>

        {edges.map((edge, idx) => {
          const src = nodeCoords[edge.sourceId];
          const tgt = nodeCoords[edge.targetId];
          if (!src || !tgt) return null;

          const isDirectPrereq = selectedId !== null && edge.targetId === selectedId;
          const isDirectDependent = selectedId !== null && edge.sourceId === selectedId;

          // In "focused" mode: when a concept is clicked, HIDE all unrelated background lines!
          if (arrowMode === "focused" && selectedId !== null) {
            if (!isDirectPrereq && !isDirectDependent) {
              return null;
            }
          }

          const isDimmed = selectedId !== null && !isDirectPrereq && !isDirectDependent;

          // Compute smooth cubic Bezier curve points
          let startX: number;
          let startY: number;
          let endX: number;
          let endY: number;

          if (src.x === tgt.x) {
            // Same column (intra-unit prerequisite)
            startX = src.x + src.width;
            startY = src.y + src.height / 2;
            endX = tgt.x + tgt.width;
            endY = tgt.y + tgt.height / 2;
            const curveOffset = 30;
            const pathD = `M ${startX} ${startY} C ${startX + curveOffset} ${startY}, ${endX + curveOffset} ${endY}, ${endX} ${endY}`;
            return (
              <path
                key={idx}
                d={pathD}
                fill="none"
                stroke={isDirectPrereq ? "#10b981" : isDirectDependent ? "#3b82f6" : "rgba(148, 163, 184, 0.3)"}
                strokeWidth={isDirectPrereq || isDirectDependent ? 3 : 1.2}
                strokeDasharray={isDirectPrereq || isDirectDependent ? undefined : "3 3"}
                opacity={isDimmed ? 0.08 : isDirectPrereq || isDirectDependent ? 1 : 0.35}
                markerEnd={`url(#arrow-${isDirectPrereq ? "upstream" : isDirectDependent ? "downstream" : "default"})`}
              />
            );
          }

          // Cross-unit prerequisite curve (flows left to right)
          startX = src.x + src.width;
          startY = src.y + src.height / 2;
          endX = tgt.x;
          endY = tgt.y + tgt.height / 2;
          const dx = Math.max(30, (endX - startX) / 2);
          const pathD = `M ${startX} ${startY} C ${startX + dx} ${startY}, ${endX - dx} ${endY}, ${endX} ${endY}`;

          return (
            <path
              key={idx}
              d={pathD}
              fill="none"
              stroke={isDirectPrereq ? "#10b981" : isDirectDependent ? "#3b82f6" : "rgba(148, 163, 184, 0.3)"}
              strokeWidth={isDirectPrereq || isDirectDependent ? 3 : 1.2}
              strokeDasharray={isDirectPrereq || isDirectDependent ? undefined : "4 3"}
              opacity={isDimmed ? 0.08 : isDirectPrereq || isDirectDependent ? 1 : 0.35}
              markerEnd={`url(#arrow-${isDirectPrereq ? "upstream" : isDirectDependent ? "downstream" : "default"})`}
            />
          );
        })}
      </svg>

      {/* Unit Columns & Concept Nodes */}
      <div style={{ display: "flex", gap: COLUMN_GAP, paddingLeft: 20 }}>
        {filteredUnits.map((u, uIdx) => {
          const unitConcepts = concepts.filter((c) => c.unit === u.unit_number);
          const accentColor = UNIT_ACCENTS[uIdx % UNIT_ACCENTS.length];

          return (
            <div key={u.id} style={{ width: COLUMN_WIDTH, flexShrink: 0, position: "relative", zIndex: 2 }}>
              {/* Unit Column Header */}
              <div
                style={{
                  height: HEADER_OFFSET,
                  borderBottom: `3px solid ${accentColor}`,
                  paddingBottom: 8,
                  marginBottom: 10,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span
                    style={{
                      background: accentColor,
                      color: "#ffffff",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      padding: "2px 6px",
                      borderRadius: 4,
                    }}
                  >
                    Unit {u.unit_number}
                  </span>
                  <span style={{ fontSize: "0.75rem", color: "var(--pencil)", fontWeight: 600 }}>
                    {unitConcepts.length} concepts
                  </span>
                </div>
                <h3
                  style={{
                    margin: "4px 0 0",
                    fontSize: "0.95rem",
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                  title={u.title}
                >
                  {u.title}
                </h3>
              </div>

              {/* Stack of Concept Nodes in this Unit */}
              <div style={{ display: "flex", flexDirection: "column", gap: NODE_GAP }}>
                {unitConcepts.map((c) => {
                  const isSelected = selectedId === c.id;
                  const isDirectPrereq = selectedId !== null && (conceptById.get(selectedId)?.prerequisite_ids || []).includes(c.id);
                  const isDirectDependent = selectedId !== null && c.prerequisite_ids.includes(selectedId);
                  const isDimmed = selectedId !== null && !isSelected && !isDirectPrereq && !isDirectDependent;

                  // Search match
                  const isSearchMatch = searchQuery.trim() && c.name.toLowerCase().includes(searchQuery.toLowerCase());

                  // Bloom colors
                  const bloomLvl = c.bloom_level || "Understand";
                  const bStyle = BLOOM_COLORS[bloomLvl] || BLOOM_COLORS.Understand;

                  return (
                    <div
                      key={c.id}
                      onClick={() => onSelectConcept(c.id)}
                      style={{
                        height: NODE_HEIGHT,
                        padding: "10px 14px",
                        background: isSelected
                          ? "rgba(37, 99, 235, 0.12)"
                          : isDirectPrereq
                          ? "rgba(16, 185, 129, 0.12)"
                          : isDirectDependent
                          ? "rgba(59, 130, 246, 0.08)"
                          : "var(--canvas)",
                        border: isSelected
                          ? "2px solid var(--primary)"
                          : isDirectPrereq
                          ? "2px solid #10b981"
                          : isDirectDependent
                          ? "2px solid #3b82f6"
                          : isSearchMatch
                          ? "2px solid #f59e0b"
                          : "1px solid var(--rule)",
                        borderRadius: "var(--radius-sm)",
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                        opacity: isDimmed ? 0.35 : 1,
                        transform: isSelected ? "scale(1.02)" : "none",
                        transition: "all 0.15s ease",
                        boxShadow: isSelected
                          ? "0 4px 12px rgba(37, 99, 235, 0.2)"
                          : isDirectPrereq
                          ? "0 4px 12px rgba(16, 185, 129, 0.2)"
                          : "none",
                      }}
                    >
                      {/* Concept Title & Prerequisite Indicators */}
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
                          <span
                            style={{
                              fontSize: "0.85rem",
                              fontWeight: isSelected ? 800 : 700,
                              lineHeight: 1.3,
                              color: isSelected ? "var(--primary)" : isDirectPrereq ? "var(--greenpen)" : isDirectDependent ? "var(--primary)" : "var(--ink)",
                            }}
                          >
                            {c.name}
                          </span>
                          {isDirectPrereq && (
                            <span style={{ fontSize: "0.65rem", background: "rgba(16, 185, 129, 0.2)", color: "var(--greenpen)", padding: "1px 4px", borderRadius: 3, fontWeight: 700, flexShrink: 0 }}>
                              Prerequisite
                            </span>
                          )}
                          {isDirectDependent && (
                            <span style={{ fontSize: "0.65rem", background: "rgba(59, 130, 246, 0.2)", color: "var(--primary)", padding: "1px 4px", borderRadius: 3, fontWeight: 700, flexShrink: 0 }}>
                              Dependent
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Badges: Bloom Level & Difficulty */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                        <span
                          style={{
                            fontSize: "0.7rem",
                            fontWeight: 700,
                            padding: "1px 6px",
                            borderRadius: 3,
                            background: bStyle.bg,
                            color: bStyle.text,
                            border: `1px solid ${bStyle.border}`,
                          }}
                        >
                          {bloomLvl}
                        </span>

                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.75rem", color: "var(--pencil)" }}>
                          <span>Diff {c.difficulty}/5</span>
                          {c.prerequisite_ids.length > 0 && (
                            <span
                              style={{
                                background: "var(--canvas-subtle)",
                                padding: "1px 5px",
                                borderRadius: 3,
                                fontWeight: 700,
                                fontSize: "0.68rem",
                              }}
                              title={`${c.prerequisite_ids.length} Direct Prerequisites`}
                            >
                              &larr; {c.prerequisite_ids.length}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// COMPONENT: CONCEPT DETAILS & PREREQUISITE LINKAGE INSPECTOR
// ═════════════════════════════════════════════════════════════════════
function ConceptPanel({
  courseId,
  concept,
  allConcepts,
  onChanged,
  onError,
  onClose,
}: {
  courseId: string;
  concept: RichConcept;
  allConcepts: RichConcept[];
  onChanged: (message: string) => Promise<void>;
  onError: (message: string) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    difficulty: concept.difficulty,
    importance: concept.importance,
    concept_type: concept.concept_type,
  });
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState(false);
  const byId = new Map(allConcepts.map((c) => [c.id, c]));

  // Everything this concept already depends on, directly or indirectly
  const upstream = (id: string, seen = new Set<string>()): Set<string> => {
    for (const p of byId.get(id)?.prerequisite_ids || []) {
      if (!seen.has(p)) {
        seen.add(p);
        upstream(p, seen);
      }
    }
    return seen;
  };

  const directPrereqs = (concept.prerequisite_ids || [])
    .map((pid) => byId.get(pid))
    .filter((c): c is RichConcept => c !== undefined);

  const dependents = allConcepts.filter((c) => c.prerequisite_ids.includes(concept.id));

  // Adding X as a prerequisite loops back if X already (indirectly) depends on this concept
  const candidates = allConcepts
    .filter((c) => c.id !== concept.id && !concept.prerequisite_ids.includes(c.id))
    .map((c) => ({ ...c, loops: upstream(c.id).has(concept.id) }));

  const changed =
    form.difficulty !== concept.difficulty ||
    form.importance !== concept.importance ||
    form.concept_type !== concept.concept_type;

  const run = async (action: () => Promise<string>) => {
    setBusy(true);
    try {
      await onChanged(await action());
    } catch (err) {
      onError(err instanceof APIError || err instanceof Error ? err.message : "Something went wrong");
    }
    setBusy(false);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, borderBottom: "1px solid var(--rule)", paddingBottom: 12, marginBottom: 14 }}>
        <div>
          <span className="badge badge-primary" style={{ fontSize: "0.75rem", fontWeight: 700 }}>
            Unit {concept.unit} &middot; {concept.bloom_level}
          </span>
          <h2 style={{ fontSize: "1.15rem", fontWeight: 800, margin: "4px 0 2px" }}>{concept.name}</h2>
          <p style={{ color: "var(--pencil)", fontSize: "0.8rem", margin: 0 }}>Topic: {concept.topic}</p>
        </div>
        <button type="button" className="btn btn-ghost" style={{ padding: 4, alignSelf: "flex-start" }} onClick={onClose}>
          <X size={18} />
          <span className="visually-hidden">Close</span>
        </button>
      </div>

      {/* Direct Prerequisite Links */}
      <section style={{ marginBottom: 18 }}>
        <h3 style={{ fontSize: "0.9rem", fontWeight: 700, margin: "0 0 6px", display: "flex", alignItems: "center", gap: 6 }}>
          <ArrowRight size={14} color="#10b981" /> Upstream Prerequisites ({directPrereqs.length})
        </h3>
        <p style={{ fontSize: "0.75rem", color: "var(--pencil)", margin: "0 0 10px" }}>
          Students must understand these concepts before learning {concept.name}.
        </p>

        {directPrereqs.length === 0 ? (
          <p style={{ fontSize: "0.8rem", color: "var(--pencil)", fontStyle: "italic", margin: "6px 0 10px" }}>
            No prerequisites defined (Foundational anchor concept).
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 10px", display: "grid", gap: 6 }}>
            {directPrereqs.map((p) => (
              <li
                key={p.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "6px 10px",
                  background: "rgba(16, 185, 129, 0.08)",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid rgba(16, 185, 129, 0.2)",
                  fontSize: "0.8rem",
                }}
              >
                <div>
                  <strong style={{ display: "block" }}>{p.name}</strong>
                  <span style={{ fontSize: "0.7rem", color: "var(--pencil)" }}>Unit {p.unit} &middot; {p.bloom_level}</span>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ padding: 2, color: "var(--redpen)" }}
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await curriculumAPI.removePrerequisite(courseId, concept.id, p.id);
                      return `Removed ${p.name} as prerequisite.`;
                    })
                  }
                  title="Remove prerequisite link"
                >
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Add Prerequisite Dropdown */}
        <div style={{ display: "flex", gap: 6 }}>
          <select
            className="select"
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            disabled={busy}
            style={{ fontSize: "0.8rem", flex: 1 }}
          >
            <option value="">+ Add Prerequisite Concept...</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id} disabled={c.loops}>
                {c.name} (Unit {c.unit}){c.loops ? " — would create a cycle" : ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: "6px 10px", fontSize: "0.8rem" }}
            disabled={!adding || busy}
            onClick={() => {
              const target = byId.get(adding)!;
              run(async () => {
                await curriculumAPI.addPrerequisite(courseId, concept.id, target.id);
                setAdding("");
                return `Linked ${target.name} as a prerequisite for ${concept.name}.`;
              });
            }}
          >
            Add
          </button>
        </div>
      </section>

      {/* Downstream Concepts Unlocked */}
      <section style={{ marginBottom: 18, borderTop: "1px solid var(--rule)", paddingTop: 14 }}>
        <h3 style={{ fontSize: "0.9rem", fontWeight: 700, margin: "0 0 6px", display: "flex", alignItems: "center", gap: 6 }}>
          <Zap size={14} color="#3b82f6" /> Concepts Enabled by this ({dependents.length})
        </h3>
        <p style={{ fontSize: "0.75rem", color: "var(--pencil)", margin: "0 0 10px" }}>
          Concepts that depend directly on mastering this topic.
        </p>
        {dependents.length === 0 ? (
          <p style={{ fontSize: "0.8rem", color: "var(--pencil)", fontStyle: "italic", margin: 0 }}>
            Terminal curriculum topic (no downstream dependencies).
          </p>
        ) : (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {dependents.map((d) => (
              <span
                key={d.id}
                style={{
                  fontSize: "0.75rem",
                  padding: "3px 8px",
                  borderRadius: 4,
                  background: "rgba(59, 130, 246, 0.1)",
                  border: "1px solid rgba(59, 130, 246, 0.25)",
                  color: "#2563eb",
                  fontWeight: 600,
                }}
              >
                {d.name} (Unit {d.unit})
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Adjust Difficulty & Pedagogical Attributes */}
      <section style={{ borderTop: "1px solid var(--rule)", paddingTop: 14 }}>
        <h3 style={{ fontSize: "0.9rem", fontWeight: 700, margin: "0 0 10px" }}>
          Pedagogical Attributes
        </h3>

        <div style={{ display: "grid", gap: 10, fontSize: "0.85rem" }}>
          <div>
            <label className="label" style={{ fontSize: "0.75rem", marginBottom: 2 }}>
              Difficulty (1 = Easiest, 5 = Hardest)
            </label>
            <input
              type="range"
              min={1}
              max={5}
              value={form.difficulty}
              onChange={(e) => setForm({ ...form, difficulty: Number(e.target.value) })}
              style={{ width: "100%" }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "var(--pencil)" }}>
              <span>Level 1</span>
              <span>Level {form.difficulty}</span>
              <span>Level 5</span>
            </div>
          </div>

          <div>
            <label className="label" style={{ fontSize: "0.75rem", marginBottom: 2 }}>
              OBE Importance (1 - 5)
            </label>
            <input
              type="range"
              min={1}
              max={5}
              value={form.importance}
              onChange={(e) => setForm({ ...form, importance: Number(e.target.value) })}
              style={{ width: "100%" }}
            />
          </div>

          <div>
            <label className="label" style={{ fontSize: "0.75rem", marginBottom: 2 }}>
              Pedagogical Classification
            </label>
            <select
              className="select"
              value={form.concept_type}
              onChange={(e) => setForm({ ...form, concept_type: e.target.value as ConceptType })}
              style={{ fontSize: "0.8rem" }}
            >
              {CONCEPT_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {changed && (
            <button
              type="button"
              className="btn btn-primary"
              style={{ width: "100%", marginTop: 6 }}
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const res = await curriculumAPI.updateConcept(courseId, concept.id, form);
                  return `Updated ${concept.name}. Topic time adjusted: ${res.allocated_minutes_before} min \u2192 ${res.allocated_minutes_after} min.`;
                })
              }
            >
              Save Concept Attributes
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
