# Project Instructions

Read and follow `AGENTS.md` as the canonical project contract before every task. It defines scope, the Graphify -> CodeGraph -> Serena bootstrap, evidence routing, test-first implementation, adversarial review, ledger/changelog updates, and signed explicit-path commits.

Do not maintain a second copy of those rules here. If `AGENTS.md` changes, treat it as authoritative.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
