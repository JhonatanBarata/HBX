from __future__ import annotations

import argparse
import atexit
import ctypes
import os
import runpy
import shutil
import sqlite3
import sys
import time
from datetime import date, datetime
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent
APP_SCRIPT = APP_DIR / "hbx_owner_app.py"
DB_PATH = APP_DIR / "hbx_owner.db"
LEGACY_DB_PATH = APP_DIR / "hbx_master.db"
LOG_DIR = APP_DIR / "logs"
LOCK_PATH = APP_DIR / "hbx_owner.lock"
MUTEX_NAME = "Local\\HBXOWNER_LOCAL_PRO_SINGLE_INSTANCE"


def now_iso() -> str:
    return datetime.now().replace(microsecond=0).isoformat(sep=" ")


def today_str() -> str:
    return date.today().isoformat()


def ensure_dirs() -> None:
    LOG_DIR.mkdir(exist_ok=True)
    if not DB_PATH.exists() and LEGACY_DB_PATH.exists():
        shutil.copy2(LEGACY_DB_PATH, DB_PATH)


def log_line(message: str) -> None:
    ensure_dirs()
    path = LOG_DIR / f"startup-guard-{today_str()}.log"
    with path.open("a", encoding="utf-8") as log_file:
        log_file.write(f"[{now_iso()}] {message}\n")


def parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def session_is_stale(row: sqlite3.Row) -> bool:
    today = today_str()
    session_date = str(row["date"] or "")[:10]
    started_at = parse_dt(row["started_at"])
    started_date = started_at.date().isoformat() if started_at else session_date
    return session_date != today or started_date != today


def connect_db() -> sqlite3.Connection | None:
    if not DB_PATH.exists():
        return None
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def fetch_open_sessions(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    try:
        return list(
            conn.execute(
                """
                SELECT * FROM work_sessions
                WHERE status IN ('active', 'paused')
                ORDER BY id ASC
                """
            ).fetchall()
        )
    except sqlite3.Error as exc:
        log_line(f"Erro lendo work_sessions: {exc}")
        return []


def close_stale_sessions(dry_run: bool = False) -> list[str]:
    conn = connect_db()
    if conn is None:
        return ["DB ainda não existe; nada para corrigir."]

    actions: list[str] = []
    try:
        rows = fetch_open_sessions(conn)
        for row in rows:
            if not session_is_stale(row):
                actions.append(f"Sessão #{row['id']} é de hoje; mantida aberta.")
                continue

            session_id = int(row["id"])
            started_at = str(row["started_at"])
            session_date = str(row["date"] or "")[:10] or started_at[:10]
            stopped_at = f"{session_date} 23:59:59" if session_date else started_at
            existing_total = int(row["total_minutes"] or 0)
            previous_notes = str(row["notes"] or "")
            marker = f"[autofechado pelo launcher em {now_iso()}] sessão antiga detectada; total não recalculado."
            notes = (previous_notes + "\n" + marker).strip() if previous_notes else marker

            actions.append(
                f"Sessão antiga #{session_id} ({started_at}, status {row['status']}) será fechada sem gerar alerta falso."
            )

            if dry_run:
                continue

            conn.execute(
                "UPDATE work_breaks SET ended_at = started_at WHERE session_id = ? AND ended_at IS NULL",
                (session_id,),
            )
            conn.execute(
                """
                UPDATE work_sessions
                SET stopped_at = ?, total_minutes = ?, status = 'stopped', notes = ?
                WHERE id = ?
                """,
                (stopped_at, existing_total, notes, session_id),
            )
        if not dry_run:
            conn.commit()
    finally:
        conn.close()

    if not actions:
        actions.append("Nenhuma sessão aberta encontrada.")
    return actions


class SingleInstanceLock:
    def __init__(self) -> None:
        self.handle: int | None = None
        self.fd: int | None = None

    def acquire(self) -> bool:
        if os.name == "nt":
            kernel32 = ctypes.windll.kernel32
            self.handle = int(kernel32.CreateMutexW(None, False, MUTEX_NAME))
            already_exists = kernel32.GetLastError() == 183
            if already_exists:
                if self.handle:
                    kernel32.CloseHandle(self.handle)
                    self.handle = None
                return False
            atexit.register(self.release)
            return True

        try:
            self.fd = os.open(str(LOCK_PATH), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.write(self.fd, str(os.getpid()).encode("utf-8"))
        except FileExistsError:
            try:
                age_seconds = time.time() - LOCK_PATH.stat().st_mtime
                if age_seconds > 24 * 60 * 60:
                    LOCK_PATH.unlink(missing_ok=True)
                    return self.acquire()
            except OSError:
                pass
            return False
        atexit.register(self.release)
        return True

    def release(self) -> None:
        if os.name == "nt" and self.handle:
            ctypes.windll.kernel32.CloseHandle(self.handle)
            self.handle = None
            return
        if self.fd is not None:
            os.close(self.fd)
            self.fd = None
            LOCK_PATH.unlink(missing_ok=True)


def run_app(extra_args: list[str] | None = None) -> None:
    if not APP_SCRIPT.exists():
        raise FileNotFoundError(f"Arquivo principal não encontrado: {APP_SCRIPT}")
    sys.argv = [str(APP_SCRIPT), *(extra_args or [])]
    runpy.run_path(str(APP_SCRIPT), run_name="__main__")


def doctor(fix: bool) -> int:
    print("HBX Owner Doctor")
    print(f"Pasta: {APP_DIR}")
    print(f"Python: {sys.executable}")
    print(f"DB: {DB_PATH} ({'existe' if DB_PATH.exists() else 'não existe'})")
    print(f"App: {APP_SCRIPT} ({'existe' if APP_SCRIPT.exists() else 'não existe'})")
    print("\nSessões:")
    for action in close_stale_sessions(dry_run=not fix):
        print(f"- {action}")
    if not fix:
        print("\nNada foi alterado. Use --doctor --fix para aplicar o autofechamento das sessões antigas.")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Launcher seguro do HBX Owner Local Pro.")
    parser.add_argument("--doctor", action="store_true", help="mostra diagnóstico do app e do banco")
    parser.add_argument("--fix", action="store_true", help="corrige sessões antigas abertas; usado com --doctor")
    parser.add_argument("--init-db", action="store_true", help="inicializa o SQLite pelo app principal")
    args, app_args = parser.parse_known_args(argv)

    ensure_dirs()

    if args.doctor:
        return doctor(fix=args.fix)

    lock = SingleInstanceLock()
    if not lock.acquire():
        log_line("Segunda instância bloqueada; o HBX Owner já está aberto.")
        return 0

    for action in close_stale_sessions(dry_run=False):
        log_line(action)

    if args.init_db:
        run_app(["--init-db"])
    else:
        run_app(app_args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

