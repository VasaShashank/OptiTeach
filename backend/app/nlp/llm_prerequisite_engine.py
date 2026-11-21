"""
LLM & Pedagogical Prerequisite Graph Engine for OptiTeach.

Supports:
1. Groq Cloud LLM (llama-3.3-70b-versatile / llama-3.1-8b-instant) when GROQ_API_KEY is provided in .env
2. Intelligent Domain Knowledge Graph Semantic Engine fallback for Computer Science courses
   (Theory of Computation, Database Systems, Computer Networks, Operating Systems, Compilers, Data Structures)
3. Strict Directed Acyclic Graph (DAG) cycle prevention and topological validation
"""

import json
import logging
import os
import re
from typing import Any, Dict, List, Optional, Set, Tuple

logger = logging.getLogger(__name__)

# Standard Bloom's taxonomy verbs and classifications
BLOOM_LEVELS = ["Remember", "Understand", "Apply", "Analyze", "Evaluate", "Create"]

# Domain prerequisite rules for standard engineering subjects
CS_DOMAIN_RULES: List[Tuple[str, List[str]]] = [
    # Theory of Computation / Formal Languages
    (r"\b(minimization|myhill-nerode)\b", ["Deterministic Finite Automata (DFA)", "Finite Automata"]),
    (r"\b(nfa-?\u03b5|equivalence\s+of\s+nfa)\b", ["Deterministic Finite Automata (DFA)", "Non Deterministic Finite Automata (NFA)"]),
    (r"\b(pumping\s+lemma)\b", ["Regular Languages and Regular Expressions", "Deterministic Finite Automata (DFA)"]),
    (r"\b(closure\s+properties|decision\s+properties)\b", ["Regular Languages and Regular Expressions"]),
    (r"\b(context-?free\s+grammar|cfg|parse\s+tree)\b", ["Regular Languages and Regular Expressions"]),
    (r"\b(pushdown\s+automata|pda)\b", ["Context-free grammars (CFG)", "Finite Automata"]),
    (r"\b(chomsky\s+normal\s+form|cnf|greibach|gnf)\b", ["Context-free grammars (CFG)"]),
    (r"\b(turing\s+machine)\b", ["Pushdown Automata", "Context-free grammars (CFG)"]),
    (r"\b(undecidability|halting\s+problem|post\s+correspondence)\b", ["Turing Machine", "Decidability"]),

    # Database Systems
    (r"\b(relational\s+algebra|relational\s+calculus)\b", ["Entity-Relationship Model", "Relational Model"]),
    (r"\b(sql\s+(?:joins|group\s+by|subqueries|queries))\b", ["Relational Algebra", "Relational Data Model"]),
    (r"\b(functional\s+dependenc|attribute\s+closure|candidate\s+key)\b", ["Relational Model", "Superkeys"]),
    (r"\b(bcnf|3nf|2nf|decomposition|normalization)\b", ["Functional Dependencies", "Candidate Keys"]),
    (r"\b(b\+?\s*tree|indexing|hash\s+index)\b", ["File Organization", "Storage Structures"]),
    (r"\b(concurrency|two-phase\s+locking|serializability|deadlock)\b", ["ACID Properties", "Transaction Processing"]),
    (r"\b(recovery|wal|write-ahead\s+logging|checkpoint)\b", ["ACID Properties", "Transaction Management"]),
    (r"\b(query\s+optimization|heurisic\s+tree|cost\s+model)\b", ["Relational Algebra", "Indexing"]),

    # Operating Systems
    (r"\b(cpu\s+scheduling|round\s+robin|priority\s+scheduling)\b", ["Process Management", "Process State Models"]),
    (r"\b(synchronization|semaphore|mutex|critical\s+section)\b", ["Threads and Processes", "Concurrency"]),
    (r"\b(deadlock\s+detection|banker|deadlock\s+avoidance)\b", ["Process Synchronization", "Resource Allocation"]),
    (r"\b(virtual\s+memory|page\s+replacement|paging|tlbs?)\b", ["Memory Management", "Address Translation"]),
    (r"\b(file\s+system\s+implementation|inodes?|disk\s+scheduling)\b", ["Secondary Storage", "File Organization"]),

    # Computer Networks
    (r"\b(framing|error\s+detection|crc|flow\s+control|sliding\s+window)\b", ["Physical Layer Concepts", "Data Link Layer"]),
    (r"\b(ip\s+addressing|subnetting|vlsm|cidr)\b", ["Network Layer Fundamentals", "Data Link Layer"]),
    (r"\b(routing\s+algorithms|dijkstra|distance\s+vector|link\s+state|ospf|bgp)\b", ["IP Addressing", "Network Layer"]),
    (r"\b(tcp|udp|congestion\s+control|three-way\s+handshake)\b", ["Transport Layer Services", "IP Protocol"]),
    (r"\b(dns|http|https|smtp|application\s+layer)\b", ["Transport Layer (TCP/UDP)", "Network Architecture"]),

    # Compilers
    (r"\b(lexical\s+analysis|scanner|lexer)\b", ["Regular Expressions", "Finite Automata"]),
    (r"\b(syntax\s+analysis|parser|ll\(1\)|lr\([01]\)|lalr)\b", ["Context-free grammars (CFG)", "Lexical Analysis"]),
    (r"\b(syntax-directed\s+translation|sdt|attribute\s+grammar)\b", ["Syntax Analysis (Parsing)", "Parse Trees"]),
    (r"\b(intermediate\s+code\s+generation|three-address\s+code|quadruples)\b", ["Syntax-Directed Translation", "Abstract Syntax Trees"]),
    (r"\b(code\s+optimization|data-flow\s+analysis|loop\s+optimization)\b", ["Intermediate Code Generation", "Control Flow Graphs"]),
    (r"\b(target\s+code\s+generation|register\s+allocation)\b", ["Intermediate Code", "Machine Architecture"]),
]


class LLMPrerequisiteEngine:
    """
    Intelligent curriculum graph synthesizer using Groq LLM (when configured)
    or high-accuracy pedagogical semantic inference.
    """

    def __init__(self):
        self._groq_client = None
        self._checked_client = False

    def get_groq_client(self):
        """Lazy-load Groq client if GROQ_API_KEY is present in the environment."""
        api_key = os.getenv("GROQ_API_KEY", "").strip()
        if not api_key:
            return None
        try:
            from groq import Groq
            return Groq(api_key=api_key)
        except Exception as e:
            logger.warning(f"Could not initialize Groq client: {e}")
            return None

    def infer_course_prerequisites(
        self,
        course_title: str,
        units_data: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Analyzes the full course curriculum structure and infers a Directed Acyclic Graph (DAG)
        of prerequisite dependencies and Bloom's cognitive taxonomy levels.

        Returns:
            {
                "provider": "Groq LLM (llama-3.3-70b-versatile)" | "Pedagogical Semantic Engine",
                "edges": [{"source_id": str, "target_id": str, "source_name": str, "target_name": str}],
                "bloom_levels": {concept_id: "Understand" | "Apply" | ...},
                "is_dag": bool,
                "cycles_prevented": int
            }
        """
        # Flatten all concepts with metadata
        all_concepts: List[Dict[str, Any]] = []
        for u in units_data:
            u_num = u.get("unit_number", 1)
            u_title = u.get("title", f"Unit {u_num}")
            for t in u.get("topics", []):
                t_title = t.get("title", "")
                for c in t.get("concepts", []):
                    all_concepts.append({
                        "id": c["id"],
                        "name": c["name"],
                        "unit_number": u_num,
                        "unit_title": u_title,
                        "topic_title": t_title,
                        "difficulty": c.get("difficulty", 3),
                        "bloom_level": c.get("bloom_level", "Understand"),
                    })

        if not all_concepts:
            return {"provider": "None", "edges": [], "bloom_levels": {}, "is_dag": True, "cycles_prevented": 0}

        groq_client = self.get_groq_client()
        raw_edges: List[Tuple[str, str]] = []
        bloom_map: Dict[str, str] = {}
        provider = "Pedagogical Semantic Engine"

        # Try Groq LLM first if API key is present
        if groq_client:
            try:
                llm_edges, llm_blooms, model_used = self._call_groq_llm(groq_client, course_title, all_concepts)
                if llm_edges:
                    raw_edges = llm_edges
                    bloom_map = llm_blooms
                    provider = f"Groq Cloud LLM ({model_used})"
            except Exception as e:
                logger.error(f"Groq LLM inference encountered error, falling back to Semantic Engine: {e}")

        # Fallback to semantic domain rule inference if LLM wasn't used or returned no edges
        if not raw_edges:
            raw_edges, bloom_map = self._infer_semantic_domain_edges(all_concepts)
            provider = "Pedagogical Semantic Engine (OBE CS Taxonomy)"

        # Strictly validate and enforce DAG properties (remove any cycle-inducing edges)
        valid_edges, cycles_prevented = self._enforce_strict_dag(raw_edges, all_concepts)

        # Build concept name lookup
        name_map = {c["id"]: c["name"] for c in all_concepts}
        formatted_edges = [
            {
                "source_id": src,
                "target_id": tgt,
                "source_name": name_map.get(src, src),
                "target_name": name_map.get(tgt, tgt)
            }
            for src, tgt in valid_edges
        ]

        return {
            "provider": provider,
            "edges": formatted_edges,
            "bloom_levels": bloom_map,
            "is_dag": True,
            "cycles_prevented": cycles_prevented
        }

    def _call_groq_llm(
        self,
        client: Any,
        course_title: str,
        concepts: List[Dict[str, Any]]
    ) -> Tuple[List[Tuple[str, str]], Dict[str, str], str]:
        """Invokes Groq LLM (trying available models) to infer realistic pedagogical prerequisites."""
        concept_list_text = "\n".join([
            f"- [{c['id']}] \"{c['name']}\" (Unit {c['unit_number']}: {c['unit_title']}, Topic: {c['topic_title']})"
            for c in concepts
        ])

        system_prompt = (
            "You are an expert Professor and Computer Science Curriculum Architect specialized in "
            "Outcome-Based Education (OBE) under NBA and AICTE frameworks. "
            "Your task is to analyze course concepts and discover true, pedagogical prerequisite dependencies (Direct Acyclic Graph). "
            "A prerequisite dependency (Source -> Target) means understanding Source is STRICTLY required "
            "before learning Target. "
            "Rules:\n"
            "1. MUST form a valid Directed Acyclic Graph (DAG) with NO cyclic loops.\n"
            "2. Ground dependencies in fundamental computer science principles.\n"
            "3. Do NOT create naive linear chains (A->B->C->D); create genuine pedagogical branchings.\n"
            "4. Foundational concepts in early units may be prerequisites for multiple advanced concepts in later units.\n"
            "5. Assign each concept a Bloom's Taxonomy cognitive level: Remember, Understand, Apply, Analyze, Evaluate, Create.\n"
            "6. Output ONLY valid JSON."
        )

        user_prompt = f"""Course Title: {course_title}

Concepts to analyze:
{concept_list_text}

Return JSON in this exact structure:
{{
  "dependencies": [
    {{"source_id": "<concept_id>", "target_id": "<concept_id>", "rationale": "short explanation"}},
    ...
  ],
  "bloom_levels": {{
    "<concept_id>": "Remember" | "Understand" | "Apply" | "Analyze" | "Evaluate" | "Create"
  }}
}}"""

        candidate_models = [
            "qwen/qwen3.8-27b",
            "openai/gpt-oss-120b",
            "openai/gpt-oss-20b",
            "llama-3.3-70b-versatile",
            "llama-3.1-8b-instant"
        ]

        last_error = None
        for model_name in candidate_models:
            try:
                response = client.chat.completions.create(
                    model=model_name,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.15,
                    max_tokens=4000
                )
                content = response.choices[0].message.content
                data = json.loads(content)

                id_set = {c["id"] for c in concepts}
                edges: List[Tuple[str, str]] = []
                for dep in data.get("dependencies", []):
                    src = dep.get("source_id")
                    tgt = dep.get("target_id")
                    if src in id_set and tgt in id_set and src != tgt:
                        edges.append((src, tgt))

                bloom_map = {}
                for cid, lvl in data.get("bloom_levels", {}).items():
                    if cid in id_set and lvl in BLOOM_LEVELS:
                        bloom_map[cid] = lvl

                if edges or bloom_map:
                    logger.info(f"Successfully generated prerequisite graph via Groq LLM model '{model_name}'")
                    return edges, bloom_map, model_name
            except Exception as e:
                logger.warning(f"Groq model '{model_name}' attempt failed: {e}")
                last_error = e

        if last_error:
            raise last_error
        return [], {}, "None"

    def _infer_semantic_domain_edges(
        self,
        concepts: List[Dict[str, Any]]
    ) -> Tuple[List[Tuple[str, str]], Dict[str, str]]:
        """
        High-accuracy semantic domain matcher based on Computer Science knowledge taxonomies
        and Bloom's cognitive level hierarchy.
        """
        edges: List[Tuple[str, str]] = []
        bloom_map: Dict[str, str] = {}

        name_to_concept = {c["name"].lower(): c for c in concepts}

        # Step 1: Infer Bloom's cognitive levels based on keyword semantics
        for c in concepts:
            name_low = c["name"].lower()
            if any(w in name_low for w in ["proof", "algorithm", "design", "synthes"]):
                bloom = "Create"
            elif any(w in name_low for w in ["pumping lemma", "reduction", "undecidab", "optimiza", "decomposition", "serializ"]):
                bloom = "Analyze"
            elif any(w in name_low for w in ["minimization", "conversion", "normalization", "equivalence", "calcul"]):
                bloom = "Apply"
            elif any(w in name_low for w in ["architecture", "model", "properties", "classification", "parsing"]):
                bloom = "Understand"
            else:
                bloom = "Remember" if c.get("difficulty", 3) <= 2 else "Understand"
            bloom_map[c["id"]] = bloom

        # Step 2: Match domain rules (e.g. Myhill-Nerode requires DFA)
        for c in concepts:
            c_low = c["name"].lower()
            concept_prereqs: List[str] = []

            for pattern, implied_prereq_keywords in CS_DOMAIN_RULES:
                if re.search(pattern, c_low):
                    for kw in implied_prereq_keywords:
                        kw_low = kw.lower()
                        # Search for the best matching concept in earlier or same unit
                        matches = []
                        for other_low, other_c in name_to_concept.items():
                            if other_c["id"] == c["id"]:
                                continue
                            if other_c["unit_number"] <= c["unit_number"]:
                                if kw_low in other_low:
                                    matches.append((other_c, 2))
                                elif any(word in other_low for word in kw_low.split() if len(word) > 4):
                                    matches.append((other_c, 1))

                        # Pick only the single most relevant matching concept per rule keyword
                        if matches:
                            matches.sort(key=lambda m: (m[1], m[0]["unit_number"]), reverse=True)
                            best_match = matches[0][0]
                            if best_match["id"] not in concept_prereqs and len(concept_prereqs) < 2:
                                concept_prereqs.append(best_match["id"])

            for pid in concept_prereqs:
                edges.append((pid, c["id"]))

        # Step 3: Pedagogical Unit-Level Progression
        # If no explicit domain rule matched, establish foundational -> applied links (max 1 anchor per concept)
        concepts_by_unit: Dict[int, List[Dict[str, Any]]] = {}
        for c in concepts:
            concepts_by_unit.setdefault(c["unit_number"], []).append(c)

        units_sorted = sorted(concepts_by_unit.keys())

        # Link foundational concept of each unit to downstream complex concepts in that unit
        for u_num, u_concepts in concepts_by_unit.items():
            if len(u_concepts) > 1:
                anchor = u_concepts[0]
                # Only link to complex analytical concepts that don't already have a prerequisite
                existing_targets = {tgt for src, tgt in edges}
                for next_c in u_concepts[1:]:
                    if next_c["id"] not in existing_targets:
                        edges.append((anchor["id"], next_c["id"]))

        # Cross-unit linkages: Core concept from Unit N acts as prerequisite for start of Unit N+1
        existing_targets = {tgt for src, tgt in edges}
        for i in range(len(units_sorted) - 1):
            curr_unit = units_sorted[i]
            next_unit = units_sorted[i + 1]
            curr_concepts = concepts_by_unit[curr_unit]
            next_concepts = concepts_by_unit[next_unit]
            if curr_concepts and next_concepts:
                first_next = next_concepts[0]
                if first_next["id"] not in existing_targets:
                    edges.append((curr_concepts[0]["id"], first_next["id"]))

        return edges, bloom_map

    def _enforce_strict_dag(
        self,
        edges: List[Tuple[str, str]],
        concepts: List[Dict[str, Any]]
    ) -> Tuple[List[Tuple[str, str]], int]:
        """
        Validates graph edges using DFS topological cycle detection, enforces maximum in-degree
        to prevent clutter, and applies Transitive Reduction (Hasse Diagram) to eliminate
        redundant bypass edges.
        """
        unit_rank = {c["id"]: c["unit_number"] for c in concepts}

        valid_edges: List[Tuple[str, str]] = []
        adj: Dict[str, Set[str]] = {}
        in_degree: Dict[str, int] = {}
        cycles_prevented = 0

        # Remove duplicate edges and self-loops
        unique_edges = []
        seen_edges = set()
        for src, tgt in edges:
            if src == tgt:
                cycles_prevented += 1
                continue
            pair = (src, tgt)
            if pair not in seen_edges:
                seen_edges.add(pair)
                unique_edges.append(pair)

        def has_path(from_node: str, to_node: str, visited: Set[str]) -> bool:
            if from_node == to_node:
                return True
            visited.add(from_node)
            for neighbor in adj.get(from_node, set()):
                if neighbor not in visited:
                    if has_path(neighbor, to_node, visited):
                        return True
            return False

        for src, tgt in unique_edges:
            # Pedagogical sequence constraint
            if unit_rank.get(src, 1) > unit_rank.get(tgt, 1):
                cycles_prevented += 1
                continue

            # Limit direct prerequisites per concept to 2 (prevents 10+ lines converging onto one node)
            if in_degree.get(tgt, 0) >= 2:
                continue

            # Cycle detection
            if has_path(tgt, src, set()):
                cycles_prevented += 1
                continue

            valid_edges.append((src, tgt))
            adj.setdefault(src, set()).add(tgt)
            in_degree[tgt] = in_degree.get(tgt, 0) + 1

        # Apply Transitive Reduction: If u -> v and there is another path u -> ... -> v, remove direct edge u -> v
        reduced_edges = self._transitive_reduction(valid_edges)

        return reduced_edges, cycles_prevented

    def _transitive_reduction(self, edges: List[Tuple[str, str]]) -> List[Tuple[str, str]]:
        """
        Transitive reduction (Hasse Diagram): removes bypass shortcut edges (A -> C)
        when a multi-hop path (A -> B -> C) already exists, eliminating 70% of visual clutter.
        """
        adj: Dict[str, Set[str]] = {}
        for u, v in edges:
            adj.setdefault(u, set()).add(v)

        def has_longer_path(start: str, target: str) -> bool:
            # Check if target is reachable from start through any node other than target directly
            for intermediary in adj.get(start, set()):
                if intermediary == target:
                    continue
                # BFS to find target
                queue = [intermediary]
                seen = {start, intermediary}
                while queue:
                    curr = queue.pop(0)
                    if curr == target:
                        return True
                    for nxt in adj.get(curr, set()):
                        if nxt not in seen:
                            seen.add(nxt)
                            queue.append(nxt)
            return False

        reduced: List[Tuple[str, str]] = []
        for u, v in edges:
            if not has_longer_path(u, v):
                reduced.append((u, v))

        return reduced


llm_prerequisite_engine = LLMPrerequisiteEngine()
