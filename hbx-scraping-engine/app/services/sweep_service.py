from __future__ import annotations

import asyncio
import json
import sqlite3
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.config import DB_PATH, get_settings
from app.schemas import SearchRequest, SweepStartRequest, SweepStatusResponse
from app.services.search_service import SearchService


MASS_SEGMENT_SEEDS = [
    "empresas",
    "comercio",
    "servicos",
    "lojas",
    "telefone",
    "whatsapp",
    "restaurantes",
    "lanchonetes",
    "bares",
    "mercados",
    "supermercados",
    "padarias",
    "acougues",
    "farmacias",
    "oficinas mecanicas",
    "auto pecas",
    "borracharias",
    "lava rapido",
    "saloes de beleza",
    "barbearias",
    "cosmeticos",
    "perfumarias",
    "clinicas",
    "clinicas odontologicas",
    "clinicas veterinarias",
    "academias",
    "pet shops",
    "materiais de construcao",
    "madeireiras",
    "imobiliarias",
    "contabilidades",
    "advocacias",
    "assistencia tecnica",
    "informatica",
    "eletricas",
    "serralherias",
    "transportadoras",
    "hotels pousadas",
]

AC_CITIES = [
    "Acrelandia",
    "Assis Brasil",
    "Brasileia",
    "Bujari",
    "Capixaba",
    "Cruzeiro do Sul",
    "Epitaciolandia",
    "Feijo",
    "Jordao",
    "Mancio Lima",
    "Manoel Urbano",
    "Marechal Thaumaturgo",
    "Placido de Castro",
    "Porto Acre",
    "Porto Walter",
    "Rio Branco",
    "Rodrigues Alves",
    "Santa Rosa do Purus",
    "Sena Madureira",
    "Senador Guiomard",
    "Tarauaca",
    "Xapuri",
]

STATE_CITY_SEEDS: dict[str, list[str]] = {
    "AC": AC_CITIES,
}

TERMINAL_TASK_STATUSES = {"completed", "exhausted", "failed", "canceled"}
TERMINAL_CAMPAIGN_STATUSES = {"completed", "completed_insufficient_results", "failed", "canceled"}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso_now() -> str:
    return utc_now().isoformat()


def normalize_key(value: str | None) -> str:
    return " ".join(str(value or "").strip().lower().split())


def normalize_phone_digits(raw: str | None) -> str:
    digits = "".join(ch for ch in str(raw or "") if ch.isdigit())
    if digits.startswith("55") and len(digits) > 11:
        digits = digits[2:]
    return digits


def build_attempt_query(segment: str, city: str, state: str, attempt_number: int, base_query: str = "") -> str:
    safe_segment = " ".join(str(segment or "empresas").split())
    safe_city = " ".join(str(city or "").split())
    safe_state = str(state or "").strip().upper()
    if base_query:
        if attempt_number <= 1:
            return base_query
        if attempt_number == 2:
            return f"{base_query} whatsapp"
        return f"{base_query} telefone contato"
    if safe_segment in {"empresas", "comercio", "servicos", "lojas", "telefone", "whatsapp"}:
        if attempt_number <= 1:
            return f"{safe_segment} {safe_city} {safe_state} telefone"
        if attempt_number == 2:
            return f"{safe_segment} {safe_city} {safe_state} whatsapp"
        return f"{safe_segment} {safe_city} {safe_state} contato telefone"
    if attempt_number <= 1:
        return f"{safe_segment} {safe_city} {safe_state} telefone"
    if attempt_number == 2:
        return f"{safe_segment} {safe_city} {safe_state} whatsapp"
    return f"{safe_segment} {safe_city} {safe_state} contato telefone"


def should_stop_for_hour(stop_hour: int | None) -> bool:
    if stop_hour is None:
        return False
    hour = datetime.now().hour
    # Jornada noturna: roda à noite e pausa ao chegar no horário informado.
    return 8 <= hour < 18 and hour >= int(stop_hour)


class SweepService:
    def __init__(self, search_service: SearchService, db_path: Path | None = None) -> None:
        self.search_service = search_service
        self.settings = get_settings()
        self.db_path = db_path or DB_PATH
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()
        self._runner_tasks: dict[str, asyncio.Task] = {}
        self._db_lock = asyncio.Lock()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=30000")
        return conn

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS sweep_campaigns (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    state TEXT NOT NULL,
                    mode TEXT NOT NULL DEFAULT 'mass_data',
                    target_type TEXT NOT NULL DEFAULT 'pj',
                    status TEXT NOT NULL DEFAULT 'queued',
                    batch_size INTEGER NOT NULL DEFAULT 20,
                    max_workers INTEGER NOT NULL DEFAULT 4,
                    max_attempts_per_task INTEGER NOT NULL DEFAULT 3,
                    stop_at_hour INTEGER,
                    redline INTEGER NOT NULL DEFAULT 1,
                    city_count INTEGER NOT NULL DEFAULT 0,
                    task_count INTEGER NOT NULL DEFAULT 0,
                    found_count INTEGER NOT NULL DEFAULT 0,
                    duplicate_count INTEGER NOT NULL DEFAULT 0,
                    rejected_count INTEGER NOT NULL DEFAULT 0,
                    error_count INTEGER NOT NULL DEFAULT 0,
                    last_city TEXT,
                    last_segment TEXT,
                    last_query TEXT,
                    last_error TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    started_at TEXT,
                    paused_at TEXT,
                    finished_at TEXT,
                    request_json TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS sweep_tasks (
                    id TEXT PRIMARY KEY,
                    campaign_id TEXT NOT NULL,
                    state TEXT NOT NULL,
                    city TEXT NOT NULL,
                    city_key TEXT NOT NULL,
                    segment TEXT NOT NULL,
                    segment_key TEXT NOT NULL,
                    base_query TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'queued',
                    attempt_count INTEGER NOT NULL DEFAULT 0,
                    max_attempts INTEGER NOT NULL DEFAULT 3,
                    found_count INTEGER NOT NULL DEFAULT 0,
                    duplicate_count INTEGER NOT NULL DEFAULT 0,
                    rejected_count INTEGER NOT NULL DEFAULT 0,
                    error_count INTEGER NOT NULL DEFAULT 0,
                    last_query TEXT,
                    last_error TEXT,
                    locked_by TEXT,
                    locked_until TEXT,
                    next_run_at TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    started_at TEXT,
                    finished_at TEXT,
                    FOREIGN KEY(campaign_id) REFERENCES sweep_campaigns(id)
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS sweep_contacts (
                    id TEXT PRIMARY KEY,
                    campaign_id TEXT NOT NULL,
                    task_id TEXT,
                    name TEXT NOT NULL,
                    phone TEXT NOT NULL,
                    phone_digits TEXT NOT NULL,
                    city TEXT,
                    state TEXT,
                    segment TEXT,
                    query_used TEXT,
                    rating REAL,
                    reviews INTEGER,
                    address TEXT,
                    website TEXT,
                    source TEXT,
                    score INTEGER,
                    created_at TEXT NOT NULL,
                    raw_json TEXT NOT NULL,
                    FOREIGN KEY(campaign_id) REFERENCES sweep_campaigns(id),
                    FOREIGN KEY(task_id) REFERENCES sweep_tasks(id)
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS sweep_events (
                    id TEXT PRIMARY KEY,
                    campaign_id TEXT NOT NULL,
                    task_id TEXT,
                    event_type TEXT NOT NULL,
                    message TEXT NOT NULL,
                    payload_json TEXT,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(campaign_id) REFERENCES sweep_campaigns(id)
                )
                """
            )
            conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_sweep_contacts_campaign_phone ON sweep_contacts(campaign_id, phone_digits)")
            conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_sweep_tasks_unique ON sweep_tasks(campaign_id, city_key, segment_key, base_query)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_sweep_tasks_queue ON sweep_tasks(campaign_id, status, next_run_at, created_at)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_sweep_contacts_facets ON sweep_contacts(campaign_id, city, state, segment, source)")

    async def start_campaign(self, request: SweepStartRequest) -> SweepStatusResponse:
        campaign_id = str(uuid4())
        state = request.state.strip().upper()
        cities = self._resolve_cities(request)
        segments = self._resolve_segments(request)
        now = iso_now()
        name = request.name or f"Massa de Dados {state}"
        task_count = len(cities) * len(segments)

        async with self._db_lock:
            with self._connect() as conn:
                conn.execute(
                    """
                    INSERT INTO sweep_campaigns(
                        id, name, state, mode, target_type, status, batch_size, max_workers,
                        max_attempts_per_task, stop_at_hour, redline, city_count, task_count,
                        created_at, updated_at, request_json
                    ) VALUES (?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        campaign_id,
                        name,
                        state,
                        request.mode,
                        request.targetType,
                        request.batchSize,
                        request.maxWorkers,
                        request.maxAttemptsPerTask,
                        request.stopAtHour,
                        1 if request.redline else 0,
                        len(cities),
                        task_count,
                        now,
                        now,
                        request.model_dump_json(),
                    ),
                )
                for city in cities:
                    city_key = normalize_key(city)
                    for segment in segments:
                        segment_key = normalize_key(segment)
                        base_query = build_attempt_query(segment, city, state, 1)
                        conn.execute(
                            """
                            INSERT OR IGNORE INTO sweep_tasks(
                                id, campaign_id, state, city, city_key, segment, segment_key, base_query,
                                status, max_attempts, created_at, updated_at
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?)
                            """,
                            (
                                str(uuid4()),
                                campaign_id,
                                state,
                                city,
                                city_key,
                                segment,
                                segment_key,
                                base_query,
                                request.maxAttemptsPerTask,
                                now,
                                now,
                            ),
                        )
                self._event(conn, campaign_id, None, "campaign_created", f"Campanha criada com {len(cities)} cidades e {task_count} tarefas.", {
                    "cities": cities,
                    "segmentCount": len(segments),
                    "redline": request.redline,
                })

        await self.resume_campaign(campaign_id)
        return await self.status(campaign_id)

    async def resume_campaign(self, campaign_id: str) -> None:
        if campaign_id in self._runner_tasks and not self._runner_tasks[campaign_id].done():
            return
        async with self._db_lock:
            with self._connect() as conn:
                row = conn.execute("SELECT status FROM sweep_campaigns WHERE id=?", (campaign_id,)).fetchone()
                if not row:
                    raise ValueError("campanha nao encontrada")
                if row["status"] in TERMINAL_CAMPAIGN_STATUSES:
                    return
                conn.execute(
                    """
                    UPDATE sweep_campaigns
                    SET status='running', started_at=COALESCE(started_at, ?), paused_at=NULL, updated_at=?
                    WHERE id=?
                    """,
                    (iso_now(), iso_now(), campaign_id),
                )
                conn.execute(
                    """
                    UPDATE sweep_tasks
                    SET status='queued', locked_by=NULL, locked_until=NULL, updated_at=?
                    WHERE campaign_id=? AND status='running' AND (locked_until IS NULL OR locked_until <= ?)
                    """,
                    (iso_now(), campaign_id, iso_now()),
                )
                self._event(conn, campaign_id, None, "campaign_resumed", "Campanha retomada de onde parou.")
        self._runner_tasks[campaign_id] = asyncio.create_task(self._run_campaign(campaign_id))

    async def pause_campaign(self, campaign_id: str, reason: str = "Campanha pausada.") -> SweepStatusResponse:
        async with self._db_lock:
            with self._connect() as conn:
                conn.execute(
                    """
                    UPDATE sweep_campaigns
                    SET status='paused', paused_at=?, updated_at=?, last_error=NULL
                    WHERE id=? AND status NOT IN ('completed','completed_insufficient_results','failed','canceled')
                    """,
                    (iso_now(), iso_now(), campaign_id),
                )
                conn.execute(
                    """
                    UPDATE sweep_tasks
                    SET status='queued', locked_by=NULL, locked_until=NULL, updated_at=?
                    WHERE campaign_id=? AND status='running'
                    """,
                    (iso_now(), campaign_id),
                )
                self._event(conn, campaign_id, None, "campaign_paused", reason)
        task = self._runner_tasks.get(campaign_id)
        if task and not task.done():
            task.cancel()
        return await self.status(campaign_id)

    async def cancel_campaign(self, campaign_id: str) -> SweepStatusResponse:
        async with self._db_lock:
            with self._connect() as conn:
                conn.execute(
                    """
                    UPDATE sweep_campaigns
                    SET status='canceled', finished_at=?, updated_at=?
                    WHERE id=?
                    """,
                    (iso_now(), iso_now(), campaign_id),
                )
                conn.execute(
                    """
                    UPDATE sweep_tasks
                    SET status='canceled', locked_by=NULL, locked_until=NULL, finished_at=?, updated_at=?
                    WHERE campaign_id=? AND status NOT IN ('completed','exhausted','failed','canceled')
                    """,
                    (iso_now(), iso_now(), campaign_id),
                )
                self._event(conn, campaign_id, None, "campaign_canceled", "Campanha cancelada pelo usuario.")
        task = self._runner_tasks.get(campaign_id)
        if task and not task.done():
            task.cancel()
        return await self.status(campaign_id)

    async def resume_incomplete_campaigns(self) -> None:
        async with self._db_lock:
            with self._connect() as conn:
                rows = conn.execute(
                    """
                    SELECT id FROM sweep_campaigns
                    WHERE status IN ('running','queued')
                    ORDER BY created_at ASC
                    """
                ).fetchall()
        for row in rows:
            await self.resume_campaign(row["id"])

    async def _run_campaign(self, campaign_id: str) -> None:
        row = await self._campaign_row(campaign_id)
        if not row:
            return
        max_workers = max(1, min(int(row["max_workers"] or 4), 12))
        if not bool(row["redline"]):
            max_workers = min(max_workers, 2)
        workers = [asyncio.create_task(self._worker_loop(campaign_id, f"M{i + 1}")) for i in range(max_workers)]
        try:
            await asyncio.gather(*workers)
        except asyncio.CancelledError:
            for worker in workers:
                worker.cancel()
            raise
        finally:
            await self._maybe_finalize_campaign(campaign_id)

    async def _worker_loop(self, campaign_id: str, worker_id: str) -> None:
        while True:
            campaign = await self._campaign_row(campaign_id)
            if not campaign or campaign["status"] != "running":
                return
            if should_stop_for_hour(campaign["stop_at_hour"]):
                await self.pause_campaign(campaign_id, "Janela noturna encerrada; campanha pausada para continuar depois.")
                return
            task = await self._acquire_task(campaign_id, worker_id)
            if not task:
                return
            await self._process_task_attempt(campaign_id, task, worker_id)
            await asyncio.sleep(0.05)

    async def _acquire_task(self, campaign_id: str, worker_id: str) -> sqlite3.Row | None:
        locked_until = (utc_now() + timedelta(minutes=12)).isoformat()
        async with self._db_lock:
            with self._connect() as conn:
                conn.execute(
                    """
                    UPDATE sweep_tasks
                    SET status='queued', locked_by=NULL, locked_until=NULL, updated_at=?
                    WHERE campaign_id=? AND status='running' AND locked_until IS NOT NULL AND locked_until <= ?
                    """,
                    (iso_now(), campaign_id, iso_now()),
                )
                row = conn.execute(
                    """
                    SELECT * FROM sweep_tasks
                    WHERE campaign_id=?
                      AND status='queued'
                      AND (next_run_at IS NULL OR next_run_at <= ?)
                    ORDER BY created_at ASC
                    LIMIT 1
                    """,
                    (campaign_id, iso_now()),
                ).fetchone()
                if not row:
                    return None
                updated = conn.execute(
                    """
                    UPDATE sweep_tasks
                    SET status='running', locked_by=?, locked_until=?, started_at=COALESCE(started_at, ?), updated_at=?
                    WHERE id=? AND status='queued'
                    """,
                    (worker_id, locked_until, iso_now(), iso_now(), row["id"]),
                )
                if updated.rowcount < 1:
                    return None
                return conn.execute("SELECT * FROM sweep_tasks WHERE id=?", (row["id"],)).fetchone()

    async def _process_task_attempt(self, campaign_id: str, task: sqlite3.Row, worker_id: str) -> None:
        attempt_number = int(task["attempt_count"] or 0) + 1
        query = build_attempt_query(task["segment"], task["city"], task["state"], attempt_number, task["base_query"])
        await self._mark_task_attempt_started(campaign_id, task["id"], query)
        try:
            excluded = await self._campaign_phone_digits(campaign_id)
            response = await self.search_service.search(
                SearchRequest(
                    city=task["city"],
                    state=task["state"],
                    segment=task["segment"],
                    query=query,
                    targetType="pj",
                    limit=int((await self._campaign_row(campaign_id))["batch_size"] or 20),
                    fresh=True,
                    excludePhoneDigits=excluded,
                )
            )
            new_count, duplicate_count, rejected_count = await self._save_results(campaign_id, task, query, [item.model_dump() for item in response.results])
            await self._finish_task_attempt(campaign_id, task, query, new_count, duplicate_count, rejected_count, response.status, worker_id)
        except Exception as error:
            await self._mark_task_error(campaign_id, task, query, error, worker_id)

    async def _mark_task_attempt_started(self, campaign_id: str, task_id: str, query: str) -> None:
        async with self._db_lock:
            with self._connect() as conn:
                conn.execute(
                    """
                    UPDATE sweep_campaigns
                    SET last_query=?, updated_at=?
                    WHERE id=?
                    """,
                    (query, iso_now(), campaign_id),
                )
                conn.execute(
                    """
                    UPDATE sweep_tasks
                    SET last_query=?, updated_at=?
                    WHERE id=?
                    """,
                    (query, iso_now(), task_id),
                )

    async def _finish_task_attempt(
        self,
        campaign_id: str,
        task: sqlite3.Row,
        query: str,
        new_count: int,
        duplicate_count: int,
        rejected_count: int,
        upstream_status: str,
        worker_id: str,
    ) -> None:
        attempt_count = int(task["attempt_count"] or 0) + 1
        max_attempts = int(task["max_attempts"] or 3)
        next_status = "queued" if attempt_count < max_attempts else ("completed" if int(task["found_count"] or 0) + new_count > 0 else "exhausted")
        next_run_at = (utc_now() + timedelta(seconds=2)).isoformat() if next_status == "queued" else None
        finished_at = iso_now() if next_status in TERMINAL_TASK_STATUSES else None
        event_type = "task_batch_success" if new_count > 0 else "task_batch_empty"
        message = f"{task['city']} / {task['segment']} / tentativa {attempt_count}: {new_count} novos, {duplicate_count} duplicados."
        async with self._db_lock:
            with self._connect() as conn:
                conn.execute(
                    """
                    UPDATE sweep_tasks
                    SET status=?, attempt_count=?, found_count=found_count+?, duplicate_count=duplicate_count+?,
                        rejected_count=rejected_count+?, last_query=?, locked_by=NULL, locked_until=NULL,
                        next_run_at=?, finished_at=COALESCE(?, finished_at), updated_at=?
                    WHERE id=?
                    """,
                    (
                        next_status,
                        attempt_count,
                        new_count,
                        duplicate_count,
                        rejected_count,
                        query,
                        next_run_at,
                        finished_at,
                        iso_now(),
                        task["id"],
                    ),
                )
                conn.execute(
                    """
                    UPDATE sweep_campaigns
                    SET found_count=found_count+?, duplicate_count=duplicate_count+?, rejected_count=rejected_count+?,
                        last_city=?, last_segment=?, last_query=?, last_error=NULL, updated_at=?
                    WHERE id=?
                    """,
                    (new_count, duplicate_count, rejected_count, task["city"], task["segment"], query, iso_now(), campaign_id),
                )
                self._event(conn, campaign_id, task["id"], event_type, message, {
                    "workerId": worker_id,
                    "query": query,
                    "newCount": new_count,
                    "duplicateCount": duplicate_count,
                    "rejectedCount": rejected_count,
                    "upstreamStatus": upstream_status,
                    "nextStatus": next_status,
                })

    async def _mark_task_error(self, campaign_id: str, task: sqlite3.Row, query: str, error: Exception, worker_id: str) -> None:
        attempt_count = int(task["attempt_count"] or 0) + 1
        max_attempts = int(task["max_attempts"] or 3)
        message = str(error)[:500]
        next_status = "queued" if attempt_count < max_attempts else "failed"
        delay = min(180, 10 * attempt_count)
        next_run_at = (utc_now() + timedelta(seconds=delay)).isoformat() if next_status == "queued" else None
        finished_at = iso_now() if next_status == "failed" else None
        async with self._db_lock:
            with self._connect() as conn:
                conn.execute(
                    """
                    UPDATE sweep_tasks
                    SET status=?, attempt_count=?, error_count=error_count+1, last_error=?, last_query=?,
                        locked_by=NULL, locked_until=NULL, next_run_at=?, finished_at=COALESCE(?, finished_at), updated_at=?
                    WHERE id=?
                    """,
                    (next_status, attempt_count, message, query, next_run_at, finished_at, iso_now(), task["id"]),
                )
                conn.execute(
                    """
                    UPDATE sweep_campaigns
                    SET error_count=error_count+1, last_city=?, last_segment=?, last_query=?, last_error=?, updated_at=?
                    WHERE id=?
                    """,
                    (task["city"], task["segment"], query, message, iso_now(), campaign_id),
                )
                self._event(conn, campaign_id, task["id"], "task_error", f"Erro controlado em {task['city']} / {task['segment']}: {message}", {
                    "workerId": worker_id,
                    "query": query,
                    "attempt": attempt_count,
                    "nextStatus": next_status,
                })

    async def _save_results(self, campaign_id: str, task: sqlite3.Row, query: str, results: list[dict[str, Any]]) -> tuple[int, int, int]:
        new_count = 0
        duplicate_count = 0
        rejected_count = 0
        now = iso_now()
        async with self._db_lock:
            with self._connect() as conn:
                for item in results:
                    phone_digits = normalize_phone_digits(item.get("phoneDigits") or item.get("phone"))
                    if not phone_digits or not item.get("name"):
                        rejected_count += 1
                        continue
                    try:
                        conn.execute(
                            """
                            INSERT INTO sweep_contacts(
                                id, campaign_id, task_id, name, phone, phone_digits, city, state, segment,
                                query_used, rating, reviews, address, website, source, score, created_at, raw_json
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            """,
                            (
                                str(uuid4()),
                                campaign_id,
                                task["id"],
                                str(item.get("name") or "").strip(),
                                str(item.get("phone") or "").strip(),
                                phone_digits,
                                task["city"],
                                task["state"],
                                task["segment"],
                                query,
                                item.get("rating"),
                                item.get("reviews"),
                                item.get("address"),
                                item.get("website"),
                                item.get("source"),
                                int(item.get("score") or 0),
                                now,
                                json.dumps(item, ensure_ascii=False),
                            ),
                        )
                        new_count += 1
                    except sqlite3.IntegrityError:
                        duplicate_count += 1
        return new_count, duplicate_count, rejected_count

    async def _campaign_phone_digits(self, campaign_id: str) -> list[str]:
        async with self._db_lock:
            with self._connect() as conn:
                rows = conn.execute("SELECT phone_digits FROM sweep_contacts WHERE campaign_id=?", (campaign_id,)).fetchall()
        return [row["phone_digits"] for row in rows if row["phone_digits"]]

    async def _campaign_row(self, campaign_id: str) -> sqlite3.Row | None:
        async with self._db_lock:
            with self._connect() as conn:
                return conn.execute("SELECT * FROM sweep_campaigns WHERE id=?", (campaign_id,)).fetchone()

    async def _maybe_finalize_campaign(self, campaign_id: str) -> None:
        async with self._db_lock:
            with self._connect() as conn:
                campaign = conn.execute("SELECT * FROM sweep_campaigns WHERE id=?", (campaign_id,)).fetchone()
                if not campaign or campaign["status"] in TERMINAL_CAMPAIGN_STATUSES or campaign["status"] == "paused":
                    return
                open_tasks = conn.execute(
                    """
                    SELECT COUNT(*) AS count FROM sweep_tasks
                    WHERE campaign_id=? AND status NOT IN ('completed','exhausted','failed','canceled')
                    """,
                    (campaign_id,),
                ).fetchone()["count"]
                if open_tasks > 0:
                    return
                found_count = int(campaign["found_count"] or 0)
                status = "completed" if found_count > 0 else "completed_insufficient_results"
                conn.execute(
                    """
                    UPDATE sweep_campaigns
                    SET status=?, finished_at=?, updated_at=?
                    WHERE id=?
                    """,
                    (status, iso_now(), iso_now(), campaign_id),
                )
                self._event(conn, campaign_id, None, "campaign_finished", f"Campanha finalizada com {found_count} contatos únicos.")

    async def status(self, campaign_id: str) -> SweepStatusResponse:
        async with self._db_lock:
            with self._connect() as conn:
                campaign = conn.execute("SELECT * FROM sweep_campaigns WHERE id=?", (campaign_id,)).fetchone()
                if not campaign:
                    raise ValueError("campanha nao encontrada")
                task_rows = conn.execute("SELECT status, city, segment, found_count FROM sweep_tasks WHERE campaign_id=?", (campaign_id,)).fetchall()
                recent_contacts = conn.execute(
                    """
                    SELECT name, phone, phone_digits, city, state, segment, website, source, score, created_at
                    FROM sweep_contacts WHERE campaign_id=?
                    ORDER BY created_at DESC LIMIT 30
                    """,
                    (campaign_id,),
                ).fetchall()
                events = conn.execute(
                    """
                    SELECT event_type, message, created_at
                    FROM sweep_events WHERE campaign_id=?
                    ORDER BY created_at DESC LIMIT 40
                    """,
                    (campaign_id,),
                ).fetchall()
                city_rows = conn.execute(
                    """
                    SELECT city,
                           COUNT(*) AS total,
                           SUM(CASE WHEN status IN ('completed','exhausted','failed','canceled') THEN 1 ELSE 0 END) AS done,
                           SUM(found_count) AS found,
                           SUM(CASE WHEN status='running' THEN 1 ELSE 0 END) AS running
                    FROM sweep_tasks WHERE campaign_id=? GROUP BY city ORDER BY city ASC
                    """,
                    (campaign_id,),
                ).fetchall()
                facet_rows = conn.execute(
                    """
                    SELECT city, segment, COUNT(*) AS count
                    FROM sweep_contacts WHERE campaign_id=?
                    GROUP BY city, segment
                    """,
                    (campaign_id,),
                ).fetchall()

        task_counts = Counter(row["status"] for row in task_rows)
        cities = []
        for row in city_rows:
            total = int(row["total"] or 0)
            done = int(row["done"] or 0)
            running = int(row["running"] or 0)
            if done >= total and total > 0:
                status = "finished"
            elif running > 0:
                status = "running"
            elif done > 0:
                status = "partial"
            else:
                status = "queued"
            cities.append({
                "city": row["city"],
                "status": status,
                "totalTasks": total,
                "finishedTasks": done,
                "foundCount": int(row["found"] or 0),
            })

        city_facets: dict[str, int] = defaultdict(int)
        segment_facets: dict[str, int] = defaultdict(int)
        for row in facet_rows:
            if row["city"]:
                city_facets[row["city"]] += int(row["count"] or 0)
            if row["segment"]:
                segment_facets[row["segment"]] += int(row["count"] or 0)

        return SweepStatusResponse(
            id=campaign["id"],
            name=campaign["name"],
            state=campaign["state"],
            mode=campaign["mode"],
            status=campaign["status"],
            batchSize=int(campaign["batch_size"] or 20),
            maxWorkers=int(campaign["max_workers"] or 4),
            maxAttemptsPerTask=int(campaign["max_attempts_per_task"] or 3),
            redline=bool(campaign["redline"]),
            cityCount=int(campaign["city_count"] or 0),
            taskCount=int(campaign["task_count"] or 0),
            foundCount=int(campaign["found_count"] or 0),
            duplicateCount=int(campaign["duplicate_count"] or 0),
            rejectedCount=int(campaign["rejected_count"] or 0),
            errorCount=int(campaign["error_count"] or 0),
            taskStatusCounts=dict(task_counts),
            lastCity=campaign["last_city"],
            lastSegment=campaign["last_segment"],
            lastQuery=campaign["last_query"],
            lastError=campaign["last_error"],
            createdAt=campaign["created_at"],
            updatedAt=campaign["updated_at"],
            startedAt=campaign["started_at"],
            pausedAt=campaign["paused_at"],
            finishedAt=campaign["finished_at"],
            cities=cities,
            facets={
                "cities": sorted([{"label": key, "count": value} for key, value in city_facets.items()], key=lambda item: item["label"]),
                "segments": sorted([{"label": key, "count": value} for key, value in segment_facets.items()], key=lambda item: item["label"]),
            },
            recentContacts=[dict(row) for row in recent_contacts],
            events=[dict(row) for row in events],
        )

    async def list_campaigns(self) -> dict[str, Any]:
        async with self._db_lock:
            with self._connect() as conn:
                rows = conn.execute(
                    """
                    SELECT id, name, state, status, found_count, city_count, task_count, last_city, last_segment,
                           created_at, updated_at, finished_at
                    FROM sweep_campaigns ORDER BY created_at DESC LIMIT 50
                    """
                ).fetchall()
        return {"items": [dict(row) for row in rows]}

    def _resolve_cities(self, request: SweepStartRequest) -> list[str]:
        if request.cities:
            return self._unique_clean(request.cities)
        if request.city:
            return self._unique_clean([request.city])
        cities = STATE_CITY_SEEDS.get(request.state.strip().upper(), [])
        if cities:
            return cities
        raise ValueError("Envie city/cities ou cadastre a lista de cidades desse estado no SweepService.")

    def _resolve_segments(self, request: SweepStartRequest) -> list[str]:
        if request.segments:
            return self._unique_clean(request.segments)
        if request.segment:
            return self._unique_clean([request.segment])
        return MASS_SEGMENT_SEEDS

    def _unique_clean(self, values: list[str]) -> list[str]:
        seen: set[str] = set()
        cleaned: list[str] = []
        for value in values or []:
            item = " ".join(str(value or "").split())
            key = normalize_key(item)
            if item and key not in seen:
                seen.add(key)
                cleaned.append(item)
        return cleaned

    def _event(self, conn: sqlite3.Connection, campaign_id: str, task_id: str | None, event_type: str, message: str, payload: dict[str, Any] | None = None) -> None:
        conn.execute(
            """
            INSERT INTO sweep_events(id, campaign_id, task_id, event_type, message, payload_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (str(uuid4()), campaign_id, task_id, event_type, message, json.dumps(payload or {}, ensure_ascii=False), iso_now()),
        )
