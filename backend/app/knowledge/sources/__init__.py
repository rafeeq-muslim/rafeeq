"""Source normalizers (KNW-02). Raw files live outside the repo in
~/.local/share/rafeeq/sources/<source_id>/ (override with RAFEEQ_DATA_DIR);
output JSONL goes to ~/.local/share/rafeeq/corpus/<source_id>.jsonl.

Each module exposes `iter_passages(raw_dir: Path) -> Iterator[dict]` and a
`__main__` (`uv run python -m app.knowledge.sources.<id> [--fetch]`).
Only sources whose mode in docs/agents/sources.md allows it may be normalized.
"""
