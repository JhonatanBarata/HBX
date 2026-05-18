import json
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.schemas import SearchRequest


class Storage:
    def __init__(self, db_path: Path, cache_ttl_hours: int) -> None:
        self.db_path = db_path
        self.cache_ttl = timedelta(hours=cache_ttl_hours)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS search_runs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    city TEXT NOT NULL,
                    state TEXT NOT NULL,
                    segment TEXT NOT NULL,
                    target_type TEXT NOT NULL DEFAULT 'pj',
                    limit_value INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    result_json TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS contacts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    search_run_id INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    phone TEXT NOT NULL,
                    phone_digits TEXT NOT NULL,
                    rating REAL,
                    reviews INTEGER,
                    address TEXT,
                    website TEXT,
                    source TEXT,
                    score INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(search_run_id) REFERENCES search_runs(id)
                )
                """
            )
            columns = {row["name"] for row in conn.execute("PRAGMA table_info(search_runs)").fetchall()}
            if "target_type" not in columns:
                conn.execute("ALTER TABLE search_runs ADD COLUMN target_type TEXT NOT NULL DEFAULT 'pj'")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_search_runs_key ON search_runs(city, state, segment, target_type, limit_value, created_at)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone_digits)")

    def _key(self, request: SearchRequest) -> tuple[str, str, str, str, int]:
        return (request.city.lower(), request.state.upper(), request.segment.lower(), request.targetType, request.limit)

    def get_cached(self, request: SearchRequest) -> dict | None:
        threshold = datetime.now(timezone.utc) - self.cache_ttl
        city, state, segment, target_type, limit = self._key(request)
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT result_json FROM search_runs
                WHERE lower(city)=? AND upper(state)=? AND lower(segment)=? AND target_type=? AND limit_value=? AND created_at >= ?
                ORDER BY created_at DESC LIMIT 1
                """,
                (city, state, segment, target_type, limit, threshold.isoformat()),
            ).fetchone()
        if not row:
            return None
        try:
            return json.loads(row["result_json"])
        except json.JSONDecodeError:
            return None

    def save_run(self, request: SearchRequest, response: dict) -> None:
        now = datetime.now(timezone.utc).isoformat()
        with self._connect() as conn:
            cursor = conn.execute(
                """
                INSERT INTO search_runs(city, state, segment, target_type, limit_value, created_at, result_json)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (request.city, request.state, request.segment, request.targetType, request.limit, now, json.dumps(response, ensure_ascii=False)),
            )
            run_id = int(cursor.lastrowid)
            for item in response.get("results", []):
                conn.execute(
                    """
                    INSERT INTO contacts(search_run_id, name, phone, phone_digits, rating, reviews, address, website, source, score, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        run_id,
                        item["name"],
                        item["phone"],
                        item["phoneDigits"],
                        item.get("rating"),
                        item.get("reviews"),
                        item.get("address"),
                        item.get("website"),
                        item.get("source"),
                        int(item.get("score") or 0),
                        now,
                    ),
                )
