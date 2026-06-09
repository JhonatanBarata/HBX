from __future__ import annotations

import argparse
import atexit
import base64
import csv
import ctypes
import html as html_lib
import importlib
import json
import os
import re
import shlex
import shutil
import sqlite3
import subprocess
import sys
import threading
import time
import tkinter as tk
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import winsound
import webbrowser
from datetime import date, datetime, timedelta
from pathlib import Path
from tkinter import filedialog, font as tkfont
from tkinter import messagebox, simpledialog, ttk


def resolve_app_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


APP_DIR = resolve_app_dir()
HBX_REPO_DIR = (
    APP_DIR.parents[1]
    if APP_DIR.name == "windows-app" and APP_DIR.parent.name == "hbx-owner" and len(APP_DIR.parents) > 1
    else APP_DIR
)
HBX_OWNER_WORKSPACE_DIR = APP_DIR.parent if APP_DIR.name == "windows-app" else HBX_REPO_DIR / "hbx-owner"
OPS_CONTROL_DIR = HBX_REPO_DIR / "ops-control"
LOCAL_LAB_DIR = HBX_REPO_DIR / "hbx-local-lab"
LOCAL_LAB_URL = "http://127.0.0.1:3098"
OPS_CONTROL_SCRIPT_PATH = OPS_CONTROL_DIR / "open-hbx-ops-control.ps1"
OPS_CONTROL_ENV_PATH = HBX_REPO_DIR / ".env.ops-control"
OPS_CONTROL_COMPOSE_PATH = HBX_REPO_DIR / "docker-compose.ops.yml"
APP_TITLE = "HBX Owner Local Pro"
APP_MUTEX_NAME = "Local\\HBXOWNER_LOCAL_PRO_APP_INSTANCE"
ICON_PATH = APP_DIR / "assets" / "hbx-owner.ico"
CONFIG_PATH = APP_DIR / "config.json"
DB_PATH = APP_DIR / "hbx_owner.db"
LEGACY_DB_PATH = APP_DIR / "hbx_master.db"
POINT_LOG_PATH = APP_DIR / "hbx-ponto.csv"
DAY_STATE_PATH = APP_DIR / "hbx-dia.json"
DAY_PLAN_PATH = APP_DIR / "hbx-plano.md"
MEMORY_PATH = APP_DIR / "hbx-memoria.md"
INSTALL_SCRIPT_PATH = APP_DIR / "install-hbx-owner.ps1"
UNINSTALL_SCRIPT_PATH = APP_DIR / "uninstall-hbx-owner.ps1"
SELF_CHECK_SCRIPT_PATH = APP_DIR / "self-check-hbx-owner.ps1"

TAB_NAMES = (
    "Hoje",
    "Execução",
    "Tickets",
    "Kanban",
    "Git",
    "Branches",
    "Alinhamento",
    "ChatGPT",
    "Relatórios",
    "Ops Control",
    "Config",
)
SAFE_GIT_COMMANDS = {
    ("status", "--short"),
    ("log", "-1", "--pretty=format:%H%n%s%n%cd"),
    ("show", "--stat", "--oneline", "--summary", "HEAD"),
}
SAFE_LOCAL_COMMANDS = {
    "py_compile": {
        "label": "Python compile do app",
        "description": "Valida sintaxe do hbx_owner_app.py.",
        "command": ("{python}", "-m", "py_compile", "hbx_owner_app.py"),
        "timeout": 20,
    },
    "app_no_gui": {
        "label": "Smoke no-gui",
        "description": "Executa inicialização sem abrir janela.",
        "command": ("{python}", "hbx_owner_app.py", "--no-gui"),
        "timeout": 20,
    },
    "init_db": {
        "label": "Inicializar SQLite",
        "description": "Cria/atualiza tabelas locais.",
        "command": ("{python}", "hbx_owner_app.py", "--init-db"),
        "timeout": 20,
    },
    "self_check": {
        "label": "Self-check HBX Owner",
        "description": "Valida Python, SQLite e scripts locais; grava log em logs.",
        "command": ("powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(SELF_CHECK_SCRIPT_PATH)),
        "timeout": 60,
    },
    "git_status": {
        "label": "Git status curto",
        "description": "Mostra mudanças locais sem alterar arquivos.",
        "command": ("git", "status", "--short"),
        "timeout": 20,
    },
    "git_last_commit": {
        "label": "Último commit",
        "description": "Mostra hash, mensagem e data do último commit.",
        "command": ("git", "log", "-1", "--pretty=format:%H%n%s%n%cd"),
        "timeout": 20,
    },
    "focus_scan": {
        "label": "Scan foco HBX",
        "description": "Procura termos de entrega, P0, demo e outbound no workspace.",
        "command": ("rg", "-n", "P0|Recovery|demo|outbound|TODO|FIXME", "."),
        "timeout": 25,
    },
}
KANBAN_LANES = (
    "BACKLOG",
    "HOJE",
    "FAZENDO",
    "AGUARDANDO CODEX",
    "TESTAR",
    "REVISAR COM CHATGPT",
    "FEITO",
    "ARQUIVADO",
)
KANBAN_BOARD_LANES = (
    "HOJE",
    "FAZENDO",
    "AGUARDANDO CODEX",
    "TESTAR",
    "REVISAR COM CHATGPT",
    "FEITO",
)

DEFAULT_CONFIG = {
    "repo_path": str(HBX_REPO_DIR),
    "planned_hours": 8,
    "boss_mode": False,
    "hours_available": 8,
    "chatgpt_app_id": "OpenAI.ChatGPT-Desktop_2p2nqsd0c76g0!ChatGPT",
    "chatgpt_fallback_url": "",
    "chatgpt_auto_focus_delay_seconds": 5,
    "chatgpt_auto_model_mode": "Pro",
    "chatgpt_auto_new_chat": True,
    "chatgpt_auto_send_enter": True,
    "chatgpt_auto_extra_keys": "",
    "chatgpt_auto_monitor_minutes": 0,
    "chatgpt_auto_poll_seconds": 20,
    "pdf_automation_url": "",
    "pdf_automation_timeout_seconds": 90,
    "usage_hud_enabled": False,
    "usage_hud_window_hours": 5,
    "owner_backend_url": "http://127.0.0.1:3000",
    "owner_tickets_secret": "",
    "owner_local_agent_url": "http://127.0.0.1:3107",
    "owner_local_agent_token": "",
    "pr_lab_base_branch": "master",
    "pr_lab_worktree_dir": str(HBX_REPO_DIR / ".worktrees"),
    "pr_lab_localhost_url": "http://127.0.0.1:3000",
    "alignment_runtime_url": "http://127.0.0.1:3000",
    "alignment_container_filter": "hbx",
    "alignment_vps_ssh_target": "",
    "alignment_vps_repo_path": "",
    "codex_max_parallel_dispatches": 1,
    "codex_cli_path": "codex",
    "codex_sandbox_mode": "danger-full-access",
    "codex_model": "",
    "codex_model_fast": "",
    "codex_model_deep": "",
    "codex_worktree_dir": str(HBX_REPO_DIR / ".worktrees"),
    "unique_goal": "",
    "technical_task": "",
    "commercial_task": "",
    "blocker": "",
    "not_today": "",
}

THEME = {
    "bg": "#f3f6fb",
    "panel": "#f7f9fc",
    "card": "#ffffff",
    "card_alt": "#eef3f8",
    "lane": "#f7f9fd",
    "lane_hover": "#eaf3ff",
    "text": "#1b2430",
    "muted": "#667085",
    "line": "#dbe4ef",
    "header": "#edf4fb",
    "brand": "#17233a",
    "accent": "#2764d8",
    "accent_hover": "#1f56bd",
    "success": "#13795b",
    "warning": "#b7791f",
    "danger": "#b42318",
    "soft_success": "#e8f6f1",
    "soft_warning": "#fff6dd",
    "soft_danger": "#fff0f0",
    "input": "#fbfdff",
}

PRIORITY_ACCENTS = {
    "Crítica": "#dc2626",
    "Alta": "#ea580c",
    "Média": "#2563eb",
    "Baixa": "#64748b",
}

LANE_LABELS = {
    "BACKLOG": "Backlog",
    "HOJE": "Hoje",
    "FAZENDO": "Fazendo",
    "AGUARDANDO CODEX": "Codex",
    "TESTAR": "Testar",
    "REVISAR COM CHATGPT": "ChatGPT",
    "FEITO": "Feito",
    "ARQUIVADO": "Arquivo",
}

LANE_ACCENTS = {
    "BACKLOG": "#64748b",
    "HOJE": "#2563eb",
    "FAZENDO": "#16a34a",
    "AGUARDANDO CODEX": "#7c3aed",
    "TESTAR": "#0891b2",
    "REVISAR COM CHATGPT": "#ca8a04",
    "FEITO": "#15803d",
    "ARQUIVADO": "#475569",
}

LANE_TINTS = {
    "HOJE": "#eff6ff",
    "FAZENDO": "#ecfdf3",
    "AGUARDANDO CODEX": "#f5f0ff",
    "TESTAR": "#ecfeff",
    "REVISAR COM CHATGPT": "#fff8e1",
    "FEITO": "#edfdf6",
}

LANE_SUBTITLES = {
    "HOJE": "Entrada",
    "FAZENDO": "Execução",
    "AGUARDANDO CODEX": "Automação",
    "TESTAR": "Validação",
    "REVISAR COM CHATGPT": "Revisão",
    "FEITO": "Entrega",
}

FOCUS_KEYWORDS = (
    "recovery",
    "p0",
    "bug",
    "erro",
    "corrigir",
    "cobrança",
    "cobranca",
    "pagamento",
    "demo",
    "outbound",
    "follow-up",
    "followup",
    "whatsapp",
    "vendas",
    "retorno",
    "cliente",
    "lead",
    "commit",
    "teste",
    "build",
)

FUGA_KEYWORDS = (
    "feature nova",
    "radar",
    "refactor",
    "refator",
    "ui",
    "visual",
    "marketing amplo",
    "landing",
    "design bonito",
    "arquitetura",
    "reescrever",
)

CHATGPT_ACTION_VERBS = (
    "abrir",
    "adicionar",
    "ajustar",
    "automatizar",
    "bloquear",
    "conectar",
    "configurar",
    "corrigir",
    "criar",
    "definir",
    "documentar",
    "enriquecer",
    "expor",
    "formalizar",
    "garantir",
    "gerar",
    "implementar",
    "integrar",
    "mapear",
    "migrar",
    "modelar",
    "monitorar",
    "normalizar",
    "padronizar",
    "persistir",
    "proteger",
    "refinar",
    "registrar",
    "remover",
    "revisar",
    "rodar",
    "salvar",
    "separar",
    "testar",
    "tornar",
    "transformar",
    "validar",
    "vincular",
)

CHATGPT_ACTION_SECTION_HINTS = (
    "checklist",
    "sprints prioritários",
    "sprints prioritarios",
    "prioridade imediata",
    "próximos cards",
    "proximos cards",
    "próximos passos",
    "proximos passos",
    "próximas ações",
    "proximas acoes",
    "ações recomendadas",
    "acoes recomendadas",
    "plano de ação",
    "plano de acao",
    "plano",
    "entregas",
    "ordem recomendada",
    "cards sugeridos",
    "tarefas",
    "pendências",
    "pendencias",
    "backlog",
    "escopo",
)

CHATGPT_NON_ACTION_PREFIXES = (
    "resumo",
    "contexto",
    "fontes",
    "conectores",
    "base principal",
    "observação",
    "observacao",
    "diagnóstico",
    "diagnostico",
    "leitura",
)

CHATGPT_GAP_MARKERS = (
    "fraco em",
    "falta de",
    "faltam",
    "falta ",
    "lacuna em",
    "lacunas em",
    "pendente",
    "pendências",
    "pendencias",
)

AUTOCARD_JSON_START = "HBX_CARDS_JSON_START"
AUTOCARD_JSON_END = "HBX_CARDS_JSON_END"
PDF_TEXT_MAX_CHARS = 35000
PDF_MIN_TEXT_CHARS = 1200
PDF_AUTOMATION_MAX_BYTES = 25 * 1024 * 1024
URGENCY_LEVELS = ("Baixa", "Normal", "Alta", "Crítica")
CARD_CODEX_MODEL_DEFAULT = ""
UNSUPPORTED_CODEX_MODEL_VALUES = {"5.5"}
INTELLIGENCE_LEVELS = ("Média", "High", "Extra high")

AUTOCARD_HIGH_PRIORITY_TERMS = (
    "ticket",
    "cliente",
    "technical_support",
    "whatsapp",
    "p0",
    "bug",
)

AUTOCARD_SENSITIVE_TERMS = (
    "deploy",
    "publish",
    "migration",
    "migrations",
    "migração",
    "migracao",
    "auth",
    "billing",
    "secrets",
    "segredo",
    "pagamento",
    "payment",
)

PRIORITY_RANK = {"Crítica": 4, "Alta": 3, "Média": 2, "Baixa": 1}
LANE_RANK = {
    "FAZENDO": 0,
    "HOJE": 1,
    "TESTAR": 2,
    "REVISAR COM CHATGPT": 3,
    "AGUARDANDO CODEX": 4,
    "BACKLOG": 5,
    "ARQUIVADO": 99,
    "FEITO": 99,
}


class SingleInstanceGuard:
    def __init__(self) -> None:
        self.handle: int | None = None

    def acquire(self) -> bool:
        if sys.platform != "win32":
            return True

        kernel32 = ctypes.windll.kernel32
        self.handle = int(kernel32.CreateMutexW(None, False, APP_MUTEX_NAME))
        already_exists = kernel32.GetLastError() == 183
        if already_exists:
            self.release()
            focus_existing_window()
            return False

        atexit.register(self.release)
        return True

    def release(self) -> None:
        if self.handle and sys.platform == "win32":
            ctypes.windll.kernel32.CloseHandle(self.handle)
            self.handle = None


def focus_existing_window() -> None:
    if sys.platform != "win32":
        return

    user32 = ctypes.windll.user32
    found: dict[str, int] = {}

    def enum_window(hwnd: int, _lparam: int) -> bool:
        if not user32.IsWindowVisible(hwnd):
            return True
        title_length = user32.GetWindowTextLengthW(hwnd)
        if title_length <= 0:
            return True
        title = ctypes.create_unicode_buffer(title_length + 1)
        user32.GetWindowTextW(hwnd, title, title_length + 1)
        if title.value == APP_TITLE:
            found["hwnd"] = int(hwnd)
            return False
        return True

    callback = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)(enum_window)
    user32.EnumWindows(callback, 0)
    hwnd = found.get("hwnd")
    if hwnd:
        user32.ShowWindow(hwnd, 3)
        user32.SetForegroundWindow(hwnd)


def sqlite_db_is_usable(path: Path) -> bool:
    try:
        conn = sqlite3.connect(path)
        result = conn.execute("PRAGMA integrity_check").fetchone()
        conn.close()
    except sqlite3.Error:
        return False
    return bool(result and result[0] == "ok")


def migrate_legacy_db() -> None:
    if DB_PATH.exists() or not LEGACY_DB_PATH.exists():
        return
    if not sqlite_db_is_usable(LEGACY_DB_PATH):
        return
    shutil.copy2(LEGACY_DB_PATH, DB_PATH)


def ensure_app_dirs() -> None:
    migrate_legacy_db()
    for name in ("exports", "logs", "prompts", "reports"):
        (APP_DIR / name).mkdir(exist_ok=True)


def ensure_operational_files() -> None:
    if not POINT_LOG_PATH.exists():
        POINT_LOG_PATH.write_text("data,hora,evento\n", encoding="utf-8")

    if not DAY_STATE_PATH.exists():
        day_state = {
            "date": today_str(),
            "status": "pre-start",
            "started_at": "",
            "stopped_at": "",
            "hours_available": DEFAULT_CONFIG["hours_available"],
            "unique_goal": "",
            "technical_task": "",
            "commercial_task": "",
            "blocker": "",
            "not_today": "",
            "last_event": "created",
            "updated_at": now_iso(),
        }
        DAY_STATE_PATH.write_text(json.dumps(day_state, indent=2, ensure_ascii=False), encoding="utf-8")

    if not DAY_PLAN_PATH.exists():
        DAY_PLAN_PATH.write_text(
            (
                "# Plano HBX do dia\n\n"
                "Meta única:\n\n"
                "Tarefa técnica:\n\n"
                "Tarefa comercial:\n\n"
                "Impedimento:\n\n"
                "Não fazer hoje:\n"
                "- Feature nova fora de Recovery/P0/demo/outbound\n"
                "- Radar por curiosidade\n"
                "- Refactor bonito sem entrega\n"
                "- Marketing amplo sem ação comercial direta\n"
            ),
            encoding="utf-8",
        )

    if not MEMORY_PATH.exists():
        MEMORY_PATH.write_text(
            (
                "# Memória HBX Owner\n\n"
                "## Objetivo atual\n"
                "Monetizar o HBX ASAP com Recovery, P0 técnico, demo e outbound.\n\n"
                "## Regras fixas\n"
                "- Não trocar monetização por feature nova.\n"
                "- Não abrir Radar como fuga.\n"
                "- Não fazer refactor cosmético antes de entrega verificável.\n"
                "- Converter o dia em venda, demo, cobrança, correção P0 ou prova técnica.\n\n"
                "## Últimos avanços\n"
                "-\n\n"
                "## Pendências\n"
                "-\n"
            ),
            encoding="utf-8",
        )


def append_point_event(event: str) -> None:
    ensure_operational_files()
    now = datetime.now()
    with POINT_LOG_PATH.open("a", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow([now.strftime("%Y-%m-%d"), now.strftime("%H:%M:%S"), event])


def read_day_state() -> dict:
    ensure_operational_files()
    try:
        data = json.loads(DAY_STATE_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        data = {}
    if data.get("date") != today_str():
        data = {"date": today_str(), "status": "pre-start"}
    return data


def update_day_state(**updates: object) -> None:
    data = read_day_state()
    data.update(updates)
    data["updated_at"] = now_iso()
    DAY_STATE_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def load_config() -> dict:
    if CONFIG_PATH.exists():
        try:
            data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            data = {}
    else:
        data = {}
    return {**DEFAULT_CONFIG, **data}


def save_config(data: dict) -> None:
    CONFIG_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def now_iso() -> str:
    return datetime.now().replace(microsecond=0).isoformat(sep=" ")


def today_str() -> str:
    return date.today().isoformat()


def normalize_codex_model_value(value: object) -> str:
    model = str(value or "").strip()
    if model in UNSUPPORTED_CODEX_MODEL_VALUES:
        return ""
    return model


def parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value)


def minutes_between(start: str, end: str | None = None) -> int:
    start_dt = parse_iso(start)
    end_dt = parse_iso(end) or datetime.now()
    if not start_dt:
        return 0
    return max(0, int((end_dt - start_dt).total_seconds() // 60))


class Database:
    def __init__(self, path: Path = DB_PATH) -> None:
        self.path = path
        self.conn = sqlite3.connect(self.path)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA foreign_keys = ON")

    def close(self) -> None:
        self.conn.close()

    def init_schema(self) -> None:
        self.conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS work_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL,
                started_at TEXT NOT NULL,
                stopped_at TEXT,
                planned_hours REAL NOT NULL DEFAULT 8,
                total_minutes INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'active',
                retroactive INTEGER NOT NULL DEFAULT 0,
                notes TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS work_breaks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL,
                started_at TEXT NOT NULL,
                ended_at TEXT,
                reason TEXT NOT NULL DEFAULT '',
                FOREIGN KEY (session_id) REFERENCES work_sessions(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS checkpoints (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER,
                checkpoint_type TEXT NOT NULL,
                created_at TEXT NOT NULL,
                message TEXT NOT NULL DEFAULT '',
                user_note TEXT NOT NULL DEFAULT '',
                FOREIGN KEY (session_id) REFERENCES work_sessions(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS kanban_cards (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                module TEXT NOT NULL DEFAULT '',
                type TEXT NOT NULL DEFAULT '',
                priority TEXT NOT NULL DEFAULT 'Média',
                urgency_level TEXT NOT NULL DEFAULT '',
                intelligence_level TEXT NOT NULL DEFAULT '',
                codex_model_override TEXT NOT NULL DEFAULT '',
                execution_timeout_seconds INTEGER NOT NULL DEFAULT 0,
                research_path TEXT NOT NULL DEFAULT '',
                lane TEXT NOT NULL DEFAULT 'BACKLOG',
                acceptance_criteria TEXT NOT NULL DEFAULT '',
                test_command TEXT NOT NULL DEFAULT '',
                codex_prompt TEXT NOT NULL DEFAULT '',
                chatgpt_prompt TEXT NOT NULL DEFAULT '',
                commit_sha TEXT NOT NULL DEFAULT '',
                estimate_minutes INTEGER NOT NULL DEFAULT 0,
                actual_minutes INTEGER NOT NULL DEFAULT 0,
                blocked_reason TEXT NOT NULL DEFAULT '',
                ticket_code TEXT NOT NULL DEFAULT '',
                ticket_backend_id TEXT NOT NULL DEFAULT '',
                ticket_customer TEXT NOT NULL DEFAULT '',
                ticket_origin TEXT NOT NULL DEFAULT '',
                ticket_category TEXT NOT NULL DEFAULT '',
                ticket_classification TEXT NOT NULL DEFAULT '',
                ticket_status TEXT NOT NULL DEFAULT '',
                ticket_dispatch_status TEXT NOT NULL DEFAULT '',
                ticket_codex_run_id TEXT NOT NULL DEFAULT '',
                ticket_codex_run_url TEXT NOT NULL DEFAULT '',
                ticket_github_issue_url TEXT NOT NULL DEFAULT '',
                ticket_github_pr_number TEXT NOT NULL DEFAULT '',
                ticket_github_branch TEXT NOT NULL DEFAULT '',
                ticket_synced_at TEXT NOT NULL DEFAULT '',
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                done_at TEXT
            );

            CREATE TABLE IF NOT EXISTS card_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                card_id INTEGER NOT NULL,
                event_type TEXT NOT NULL,
                message TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                FOREIGN KEY (card_id) REFERENCES kanban_cards(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS git_snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL,
                commit_sha TEXT NOT NULL DEFAULT '',
                commit_message TEXT NOT NULL DEFAULT '',
                status_short TEXT NOT NULL DEFAULT '',
                diff_stat TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS chatgpt_exchanges (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL,
                card_id INTEGER,
                prompt TEXT NOT NULL DEFAULT '',
                response TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                FOREIGN KEY (card_id) REFERENCES kanban_cards(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS daily_reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL,
                html_path TEXT NOT NULL DEFAULT '',
                pdf_path TEXT NOT NULL DEFAULT '',
                summary_text TEXT NOT NULL DEFAULT '',
                next_plan_text TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS local_runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL,
                command_key TEXT NOT NULL DEFAULT '',
                command_text TEXT NOT NULL DEFAULT '',
                cwd TEXT NOT NULL DEFAULT '',
                returncode INTEGER NOT NULL DEFAULT 0,
                output TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS codex_dispatches (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                card_id INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'queued',
                branch TEXT NOT NULL DEFAULT '',
                worktree_path TEXT NOT NULL DEFAULT '',
                prompt_path TEXT NOT NULL DEFAULT '',
                output_path TEXT NOT NULL DEFAULT '',
                last_message_path TEXT NOT NULL DEFAULT '',
                base_sha TEXT NOT NULL DEFAULT '',
                commit_sha TEXT NOT NULL DEFAULT '',
                model TEXT NOT NULL DEFAULT '',
                intelligence_level TEXT NOT NULL DEFAULT '',
                process_id INTEGER NOT NULL DEFAULT 0,
                error TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                started_at TEXT,
                finished_at TEXT,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (card_id) REFERENCES kanban_cards(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS codex_dispatches_card_id_idx
            ON codex_dispatches(card_id, created_at);

            CREATE INDEX IF NOT EXISTS codex_dispatches_status_idx
            ON codex_dispatches(status, updated_at);

            CREATE TABLE IF NOT EXISTS ai_usage_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL,
                usage_type TEXT NOT NULL DEFAULT '',
                model TEXT NOT NULL DEFAULT '',
                context TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS ai_usage_events_type_created_idx
            ON ai_usage_events(usage_type, created_at);
            """
        )
        self.ensure_kanban_ticket_columns()
        self.ensure_codex_dispatch_columns()
        self.conn.commit()

    def ensure_kanban_ticket_columns(self) -> None:
        columns = {row["name"] for row in self.conn.execute("PRAGMA table_info(kanban_cards)").fetchall()}
        required = {
            "ticket_code": "TEXT NOT NULL DEFAULT ''",
            "ticket_backend_id": "TEXT NOT NULL DEFAULT ''",
            "ticket_customer": "TEXT NOT NULL DEFAULT ''",
            "ticket_origin": "TEXT NOT NULL DEFAULT ''",
            "ticket_category": "TEXT NOT NULL DEFAULT ''",
            "ticket_classification": "TEXT NOT NULL DEFAULT ''",
            "ticket_status": "TEXT NOT NULL DEFAULT ''",
            "ticket_dispatch_status": "TEXT NOT NULL DEFAULT ''",
            "ticket_codex_run_id": "TEXT NOT NULL DEFAULT ''",
            "ticket_codex_run_url": "TEXT NOT NULL DEFAULT ''",
            "ticket_github_issue_url": "TEXT NOT NULL DEFAULT ''",
            "ticket_github_pr_number": "TEXT NOT NULL DEFAULT ''",
            "ticket_github_branch": "TEXT NOT NULL DEFAULT ''",
            "ticket_synced_at": "TEXT NOT NULL DEFAULT ''",
            "urgency_level": "TEXT NOT NULL DEFAULT ''",
            "intelligence_level": "TEXT NOT NULL DEFAULT ''",
            "codex_model_override": "TEXT NOT NULL DEFAULT ''",
            "execution_timeout_seconds": "INTEGER NOT NULL DEFAULT 0",
            "research_path": "TEXT NOT NULL DEFAULT ''",
        }
        for name, definition in required.items():
            if name not in columns:
                self.conn.execute(f"ALTER TABLE kanban_cards ADD COLUMN {name} {definition}")
        self.conn.execute("UPDATE kanban_cards SET type = 'Operacional' WHERE lower(type) = 'modo' || ' ia'")
        self.conn.execute("UPDATE kanban_cards SET lane = 'HOJE' WHERE lane = 'BACKLOG'")
        self.conn.execute("UPDATE kanban_cards SET lane = 'HOJE' WHERE lane = 'AGUARDANDO DONO'")
        self.conn.execute("UPDATE kanban_cards SET lane = 'HOJE' WHERE lane = 'BLOQUEADO'")
        self.conn.execute(
            """
            UPDATE kanban_cards
            SET intelligence_level = CASE
                WHEN intelligence_level IN ('Local rápido', 'Local rapido') THEN 'Média'
                WHEN intelligence_level IN ('Spark rápido', 'Spark rapido') THEN 'High'
                WHEN intelligence_level IN ('Spark longo', 'Revisão humana') THEN 'Extra high'
                ELSE intelligence_level
            END
            WHERE intelligence_level IN ('Local rápido', 'Local rapido', 'Spark rápido', 'Spark rapido', 'Spark longo', 'Revisão humana')
            """
        )
        self.conn.execute(
            """
            UPDATE kanban_cards
            SET codex_model_override = ''
            WHERE codex_model_override IN ('5.5')
            """
        )
        self.conn.execute(
            """
            UPDATE kanban_cards
            SET urgency_level = CASE
                WHEN priority = 'Crítica' THEN 'Crítica'
                WHEN priority = 'Alta' OR lane IN ('HOJE', 'AGUARDANDO CODEX') THEN 'Alta'
                WHEN priority = 'Baixa' THEN 'Baixa'
                ELSE 'Normal'
            END
            WHERE urgency_level = ''
            """
        )
        self.conn.execute(
            """
            UPDATE kanban_cards
            SET intelligence_level = CASE
                WHEN lower(title || ' ' || description || ' ' || module || ' ' || type || ' ' || blocked_reason)
                        GLOB '*deploy*'
                    OR lower(title || ' ' || description || ' ' || module || ' ' || type || ' ' || blocked_reason)
                        GLOB '*publish*'
                    OR lower(title || ' ' || description || ' ' || module || ' ' || type || ' ' || blocked_reason)
                        GLOB '*migration*'
                    OR lower(title || ' ' || description || ' ' || module || ' ' || type || ' ' || blocked_reason)
                        GLOB '*migração*'
                    OR lower(title || ' ' || description || ' ' || module || ' ' || type || ' ' || blocked_reason)
                        GLOB '*migracao*'
                    OR lower(title || ' ' || description || ' ' || module || ' ' || type || ' ' || blocked_reason)
                        GLOB '*auth*'
                    OR lower(title || ' ' || description || ' ' || module || ' ' || type || ' ' || blocked_reason)
                        GLOB '*billing*'
                    OR lower(title || ' ' || description || ' ' || module || ' ' || type || ' ' || blocked_reason)
                        GLOB '*secret*'
                    OR lower(title || ' ' || description || ' ' || module || ' ' || type || ' ' || blocked_reason)
                        GLOB '*pagamento*'
                    THEN 'Extra high'
                WHEN priority = 'Crítica' THEN 'Extra high'
                WHEN priority = 'Alta' OR lane IN ('HOJE', 'AGUARDANDO CODEX') THEN 'High'
                ELSE 'Média'
            END
            WHERE intelligence_level = ''
            """
        )
        self.conn.execute(
            """
            UPDATE kanban_cards
            SET execution_timeout_seconds = CASE
                WHEN intelligence_level = 'Extra high' THEN 300
                WHEN intelligence_level = 'High' THEN 180
                ELSE 120
            END
            WHERE execution_timeout_seconds = 0
            """
        )
        self.conn.execute(
            """
            UPDATE kanban_cards
            SET research_path = 'Pesquisar primeiro com rg pelo título do card, módulo e termos-chave antes de editar qualquer arquivo.'
            WHERE research_path = ''
            """
        )
        self.conn.execute("CREATE INDEX IF NOT EXISTS kanban_cards_ticket_code_idx ON kanban_cards(ticket_code)")

    def ensure_codex_dispatch_columns(self) -> None:
        columns = {row["name"] for row in self.conn.execute("PRAGMA table_info(codex_dispatches)").fetchall()}
        required = {
            "model": "TEXT NOT NULL DEFAULT ''",
            "intelligence_level": "TEXT NOT NULL DEFAULT ''",
        }
        for name, definition in required.items():
            if name not in columns:
                self.conn.execute(f"ALTER TABLE codex_dispatches ADD COLUMN {name} {definition}")

    def execute(self, sql: str, params: tuple = ()) -> sqlite3.Cursor:
        cur = self.conn.execute(sql, params)
        self.conn.commit()
        return cur

    def fetchone(self, sql: str, params: tuple = ()) -> sqlite3.Row | None:
        return self.conn.execute(sql, params).fetchone()

    def fetchall(self, sql: str, params: tuple = ()) -> list[sqlite3.Row]:
        return list(self.conn.execute(sql, params).fetchall())


def create_work_session(db: Database, planned_hours: float, notes: str = "", source: str = "app") -> tuple[int | None, str]:
    current = db.fetchone(
        """
        SELECT id FROM work_sessions
        WHERE status IN ('active', 'paused')
        ORDER BY started_at DESC
        LIMIT 1
        """
    )
    if current:
        return None, f"Já existe expediente aberto: sessão #{current['id']}."

    started_at = now_iso()
    cur = db.execute(
        """
        INSERT INTO work_sessions
        (date, started_at, planned_hours, status, retroactive, notes, created_at)
        VALUES (?, ?, ?, 'active', 0, ?, ?)
        """,
        (today_str(), started_at, planned_hours, notes.strip(), started_at),
    )
    session_id = int(cur.lastrowid)
    append_point_event(f"HBX_WORK_STARTED_{planned_hours}H")
    update_day_state(
        status="active",
        started_at=started_at,
        stopped_at="",
        hours_available=planned_hours,
        unique_goal=notes.strip(),
        last_event=f"{source}_start_work",
        active_session_id=session_id,
    )
    return session_id, f"Expediente iniciado: sessão #{session_id}, {planned_hours}h planejadas."


class HbxOwnerApp(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title(APP_TITLE)
        self.geometry("1360x820")
        self.minsize(1120, 680)
        self.apply_window_icon()
        self.after(0, self.maximize_window)
        self.config_data = load_config()
        self.db = Database()
        self.db.init_schema()
        self.active_session_id: int | None = None
        self.current_card_id: int | None = None
        self.selected_card_id: int | None = None
        self.selected_lane: str | None = None
        self.kanban_lane_frames: dict[str, tk.Frame] = {}
        self.kanban_lane_headers: dict[str, tk.Frame] = {}
        self.kanban_card_widgets: dict[int, tk.Frame] = {}
        self.kanban_card_ids: dict[str, list[int]] = {}
        self.kanban_lane_count_vars: dict[str, tk.StringVar] = {}
        self.kanban_lane_canvases: dict[str, tk.Canvas] = {}
        self.kanban_summary_vars: dict[str, tk.StringVar] = {}
        self.kanban_drag: dict[str, object] | None = None
        self.codex_processes: dict[int, subprocess.Popen] = {}
        self.selected_card_var = tk.StringVar(value="Nenhum card selecionado.")
        self.current_card_var = tk.StringVar(value="Card atual não definido.")
        self.git_repo_var = tk.StringVar(value=self.config_data.get("repo_path") or str(APP_DIR))
        self.last_commit_sha = ""
        self.last_commit_message = ""
        self.boss_mode_var = tk.BooleanVar(value=bool(self.config_data.get("boss_mode")))
        self.config_entries: dict[str, tk.StringVar] = {}
        self.ops_status_var = tk.StringVar(value="Ops Control pronto para consultar.")
        self.ops_runtime_var = tk.StringVar(value="-")
        self.ops_local_cockpit_var = tk.StringVar(value="-")
        self.ops_vps_cockpit_var = tk.StringVar(value="-")
        self.ops_containers_var = tk.StringVar(value="-")
        self.ops_docker_var = tk.StringVar(value="-")
        self.ops_local_lab_var = tk.StringVar(value="api local -")
        self.ops_updated_var = tk.StringVar(value="-")
        self.ops_panel_url_var = tk.StringVar(value="Painel IP: carregando...")
        self.ops_tree: ttk.Treeview | None = None
        self.ops_events_text: tk.Text | None = None
        self.radar_engine_status_var = tk.StringVar(value="Motores locais: aguardando agent local.")
        self.radar_engine_total_var = tk.StringVar(value="-")
        self.radar_engine_running_var = tk.StringVar(value="-")
        self.radar_engine_stopped_var = tk.StringVar(value="-")
        self.radar_engine_agent_var = tk.StringVar(value="-")
        self.radar_engine_selected_var = tk.StringVar(value="Nenhum motor selecionado.")
        self.radar_engine_tree: ttk.Treeview | None = None
        self.radar_engine_events_text: tk.Text | None = None
        self.execution_command_var = tk.StringVar(value="py_compile")
        self.execution_status_var = tk.StringVar(value="Nenhuma execução local ainda.")
        self.last_execution_output = ""
        self.last_chatgpt_prompt = ""
        self.autocard_auto_create_var = tk.BooleanVar(value=True)
        self.autocard_status_var = tk.StringVar(value="Autocard pronto.")
        self.chatgpt_pdf_path_var = tk.StringVar(value="Nenhum PDF selecionado.")
        self.chatgpt_last_research_prompt = ""
        self.codex_model_var = tk.StringVar(value=str(self.config_data.get("codex_model") or ""))
        self.intelligence_status_var = tk.StringVar(value="Inteligência: carregando.")
        self.owner_tickets_status_var = tk.StringVar(value="Tickets: aguardando atualização.")
        self.owner_ticket_filter_var = tk.StringVar(value="todos")
        self.owner_ticket_selected_var = tk.StringVar(value="Nenhum ticket selecionado.")
        self.owner_tickets_tree: ttk.Treeview | None = None
        self.owner_ticket_detail_text: tk.Text | None = None
        self.owner_tickets_cache: list[dict] = []
        self.pr_lab_status_var = tk.StringVar(value="Branches: aguardando listagem.")
        self.pr_lab_selected_var = tk.StringVar(value="Nenhum PR ou branch selecionado.")
        self.pr_lab_branch_filter_var = tk.StringVar(value="owner/")
        self.pr_lab_tree: ttk.Treeview | None = None
        self.pr_lab_output: tk.Text | None = None
        self.pr_lab_items: dict[str, dict] = {}
        self.alignment_status_var = tk.StringVar(value="Alinhamento: aguardando verificação.")
        self.alignment_local_var = tk.StringVar(value="-")
        self.alignment_worktrees_var = tk.StringVar(value="-")
        self.alignment_remote_var = tk.StringVar(value="-")
        self.alignment_runtime_var = tk.StringVar(value="-")
        self.alignment_tree: ttk.Treeview | None = None
        self.alignment_output: tk.Text | None = None
        self.alignment_last_report = ""
        self.today_status_var = tk.StringVar(value="Sem expediente aberto.")
        self.today_elapsed_var = tk.StringVar(value="0 min")
        self.today_break_var = tk.StringVar(value="Sem pausa aberta.")
        self.today_plan_var = tk.StringVar(value=self.config_data.get("unique_goal") or "Meta única não definida.")
        self.dashboard_progress_var = tk.StringVar(value="0%")
        self.dashboard_seated_var = tk.StringVar(value="0 min")
        self.dashboard_card_var = tk.StringVar(value="Nenhum card atual.")
        self.dashboard_commits_var = tk.StringVar(value="0")
        self.dashboard_done_var = tk.StringVar(value="0")
        self.dashboard_blocked_var = tk.StringVar(value="0")
        self.dashboard_health_var = tk.StringVar(value="saudável")
        self.usage_hud_window: tk.Toplevel | None = None
        self.usage_hud_date_var = tk.StringVar(value=today_str())
        self.usage_hud_window_var = tk.StringVar(value="5H LOCAL")
        self.usage_hud_counts_var = tk.StringVar(value="CARD 0  NORM 0")

        self.font_family = self.resolve_font_family()
        self.configure(bg=THEME["bg"])
        self.apply_visual_theme()
        self.columnconfigure(0, weight=1)
        self.rowconfigure(1, weight=1)

        self.build_app_header()
        self.notebook = ttk.Notebook(self)
        self.notebook.grid(row=1, column=0, sticky="nsew", padx=14, pady=(0, 14))

        self.tabs: dict[str, ttk.Frame] = {}
        for name in TAB_NAMES:
            frame = ttk.Frame(self.notebook, padding=(14, 12), style="App.TFrame")
            frame.columnconfigure(0, weight=1)
            self.notebook.add(frame, text=name)
            self.tabs[name] = frame
            if name == "Hoje":
                self._build_today_tab(frame)
            elif name == "Ops Control":
                self._build_ops_control_tab(frame)
            elif name == "Execução":
                self._build_execution_tab(frame)
            elif name == "Tickets":
                self._build_tickets_tab(frame)
            elif name == "Kanban":
                self._build_kanban_tab(frame)
            elif name == "Git":
                self._build_git_tab(frame)
            elif name == "Branches":
                self._build_pr_lab_tab(frame)
            elif name == "Alinhamento":
                self._build_alignment_tab(frame)
            elif name == "ChatGPT":
                self._build_chatgpt_tab(frame)
            elif name == "Relatórios":
                self._build_reports_tab(frame)
            elif name == "Config":
                self._build_config_tab(frame)
            else:
                self._build_placeholder_tab(frame, name)

        self.protocol("WM_DELETE_WINDOW", self.on_close)
        self.refresh_today()
        self.refresh_usage_hud()
        self.after(30_000, self._tick)

    def resolve_font_family(self) -> str:
        families = set(tkfont.families(self))
        if "Segoe UI Variable" in families:
            return "Segoe UI Variable"
        return "Plus Jakarta Sans" if "Plus Jakarta Sans" in families else "Segoe UI"

    def apply_visual_theme(self) -> None:
        style = ttk.Style(self)
        try:
            style.theme_use("clam")
        except tk.TclError:
            pass

        body = (self.font_family, 10)
        body_bold = (self.font_family, 10, "bold")
        title = (self.font_family, 20, "bold")
        small = (self.font_family, 9)

        style.configure(".", font=body, background=THEME["bg"], foreground=THEME["text"])
        style.configure("App.TFrame", background=THEME["bg"])
        style.configure("Header.TFrame", background=THEME["header"])
        style.configure("Card.TFrame", background=THEME["card"], relief="solid", borderwidth=1)
        style.configure("CardAlt.TFrame", background=THEME["card_alt"], relief="solid", borderwidth=1)
        style.configure("Toolbar.TFrame", background=THEME["bg"])
        style.configure("Lane.TFrame", background=THEME["card"], relief="solid", borderwidth=1)

        style.configure("TLabel", background=THEME["bg"], foreground=THEME["text"])
        style.configure("Muted.TLabel", background=THEME["bg"], foreground=THEME["muted"], font=small)
        style.configure("Title.TLabel", background=THEME["bg"], foreground=THEME["text"], font=title)
        style.configure("HeaderTitle.TLabel", background=THEME["header"], foreground=THEME["text"], font=(self.font_family, 22, "bold"))
        style.configure("HeaderSub.TLabel", background=THEME["header"], foreground=THEME["muted"], font=(self.font_family, 10))
        style.configure("Card.TLabel", background=THEME["card"], foreground=THEME["text"])
        style.configure("CardMuted.TLabel", background=THEME["card"], foreground=THEME["muted"], font=small)
        style.configure("CardAlt.TLabel", background=THEME["card_alt"], foreground=THEME["text"])
        style.configure("CardAltMuted.TLabel", background=THEME["card_alt"], foreground=THEME["muted"], font=small)
        style.configure("CardValue.TLabel", background=THEME["card"], foreground=THEME["text"], font=(self.font_family, 17, "bold"))
        style.configure("Metric.TLabel", background=THEME["card"], foreground=THEME["text"], font=(self.font_family, 23, "bold"))
        style.configure("LaneTitle.TLabel", background=THEME["card"], foreground=THEME["text"], font=body_bold)

        style.configure("TButton", font=body_bold, padding=(12, 8), background=THEME["card"], foreground=THEME["text"], borderwidth=1)
        style.map("TButton", background=[("active", THEME["card_alt"])], foreground=[("disabled", THEME["muted"])])
        style.configure("Accent.TButton", background=THEME["accent"], foreground="#ffffff", borderwidth=0)
        style.map("Accent.TButton", background=[("active", THEME["accent_hover"])], foreground=[("active", "#ffffff")])
        style.configure("Success.TButton", background=THEME["success"], foreground="#ffffff", borderwidth=0)
        style.map("Success.TButton", background=[("active", "#126c3f")], foreground=[("active", "#ffffff")])
        style.configure("Danger.TButton", background=THEME["danger"], foreground="#ffffff", borderwidth=0)
        style.map("Danger.TButton", background=[("active", "#991b1b")], foreground=[("active", "#ffffff")])
        style.configure("Warning.TButton", background=THEME["warning"], foreground="#ffffff", borderwidth=0)
        style.map("Warning.TButton", background=[("active", "#92400e")], foreground=[("active", "#ffffff")])

        style.configure("TEntry", padding=(8, 7), fieldbackground=THEME["input"], foreground=THEME["text"], bordercolor=THEME["line"])
        style.configure("TCombobox", padding=(8, 7), fieldbackground=THEME["input"], foreground=THEME["text"])
        style.configure("TNotebook", background=THEME["bg"], borderwidth=0)
        style.configure("TNotebook.Tab", padding=(17, 9), background=THEME["panel"], foreground=THEME["muted"], font=(self.font_family, 9, "bold"))
        style.map(
            "TNotebook.Tab",
            background=[("selected", THEME["card"]), ("active", THEME["card_alt"])],
            foreground=[("selected", THEME["text"]), ("active", THEME["text"])],
        )
        style.configure(
            "Treeview",
            background=THEME["card"],
            fieldbackground=THEME["card"],
            foreground=THEME["text"],
            rowheight=30,
            borderwidth=0,
            font=(self.font_family, 9),
        )
        style.configure(
            "Treeview.Heading",
            background=THEME["card_alt"],
            foreground=THEME["text"],
            font=(self.font_family, 9, "bold"),
            padding=(8, 7),
        )
        style.map("Treeview", background=[("selected", "#dbeafe")], foreground=[("selected", THEME["text"])])
        style.configure("Modern.TLabelframe", background=THEME["card"], bordercolor=THEME["line"], relief="solid")
        style.configure("Modern.TLabelframe.Label", background=THEME["card"], foreground=THEME["text"], font=body_bold)

    def usage_hud_enabled(self) -> bool:
        value = self.config_data.get("usage_hud_enabled", DEFAULT_CONFIG["usage_hud_enabled"])
        if isinstance(value, bool):
            return value
        return str(value).strip().lower() in ("1", "true", "sim", "yes", "on")

    def usage_hud_window_hours(self) -> int:
        try:
            value = int(float(str(self.config_data.get("usage_hud_window_hours", DEFAULT_CONFIG["usage_hud_window_hours"]))))
        except (TypeError, ValueError):
            value = int(DEFAULT_CONFIG["usage_hud_window_hours"])
        return max(1, min(value, 24))

    def build_usage_hud(self) -> None:
        if not self.usage_hud_enabled():
            return
        hud = tk.Toplevel(self)
        hud.title("HBX uso")
        hud.transient(self)
        hud.configure(bg="#f7f9fc", highlightthickness=1, highlightbackground="#dbe4ef")
        hud.resizable(False, False)
        hud.geometry(f"124x74+{max(8, self.winfo_screenwidth() - 280)}+72")
        hud.bind("<Double-Button-1>", lambda _event: self.refresh_usage_hud())

        tk.Label(
            hud,
            textvariable=self.usage_hud_date_var,
            bg="#f7f9fc",
            fg="#2563eb",
            font=(self.font_family, 8),
        ).pack(fill="x", pady=(7, 1))
        tk.Label(
            hud,
            textvariable=self.usage_hud_window_var,
            bg="#f7f9fc",
            fg="#0f172a",
            font=(self.font_family, 8, "bold"),
        ).pack(fill="x", pady=(0, 1))
        tk.Label(
            hud,
            textvariable=self.usage_hud_counts_var,
            bg="#f7f9fc",
            fg="#334155",
            font=(self.font_family, 7, "bold"),
        ).pack(fill="x", pady=(0, 5))
        self.usage_hud_window = hud

    def record_ai_usage_event(self, usage_type: str, model: str = "", context: str = "") -> None:
        clean_type = re.sub(r"[^a-z0-9_-]+", "", str(usage_type or "").lower())[:40]
        if clean_type not in ("spark", "normal"):
            return
        self.db.execute(
            """
            INSERT INTO ai_usage_events (date, usage_type, model, context, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (today_str(), clean_type, str(model or "")[:120], str(context or "")[:240], now_iso()),
        )

    def count_ai_usage_events(self, usage_type: str, since: str) -> int:
        row = self.db.fetchone(
            """
            SELECT COUNT(*) AS total
            FROM ai_usage_events
            WHERE usage_type = ? AND created_at >= ?
            """,
            (usage_type, since),
        )
        return int(row["total"] or 0) if row else 0

    def refresh_usage_hud(self) -> None:
        if not self.usage_hud_enabled():
            if self.usage_hud_window:
                self.usage_hud_window.destroy()
                self.usage_hud_window = None
        elif self.usage_hud_window and not self.usage_hud_window.winfo_exists():
            self.usage_hud_window = None
        elif self.usage_hud_window is None:
            self.build_usage_hud()
        hours = self.usage_hud_window_hours()
        since = (datetime.now() - timedelta(hours=hours)).replace(microsecond=0).isoformat(sep=" ")
        spark_count = self.count_ai_usage_events("spark", since)
        normal_count = self.count_ai_usage_events("normal", since)
        self.usage_hud_date_var.set(today_str())
        self.usage_hud_window_var.set(f"{hours}H LOCAL")
        self.usage_hud_counts_var.set(f"CARD {spark_count}  NORM {normal_count}")

    def build_app_header(self) -> None:
        header = ttk.Frame(self, style="Header.TFrame", padding=(18, 12, 18, 10))
        header.grid(row=0, column=0, sticky="ew")
        header.columnconfigure(1, weight=1)

        brand = ttk.Frame(header, style="Header.TFrame")
        brand.grid(row=0, column=0, sticky="w")
        mark = tk.Label(
            brand,
            text="HBX",
            bg=THEME["brand"],
            fg="#ffffff",
            padx=13,
            pady=9,
            font=(self.font_family, 11, "bold"),
        )
        mark.grid(row=0, column=0, rowspan=2, sticky="nsw", padx=(0, 12))
        ttk.Label(brand, text="HBX Owner", style="HeaderTitle.TLabel").grid(row=0, column=1, sticky="w")
        ttk.Label(
            brand,
            text="Recovery + P0 técnico + demo + outbound",
            style="HeaderSub.TLabel",
        ).grid(row=1, column=1, sticky="w", pady=(2, 0))

        usage = ttk.Frame(header, style="Header.TFrame")
        usage.grid(row=0, column=1, sticky="e", padx=(18, 14))
        ttk.Label(usage, textvariable=self.usage_hud_window_var, style="HeaderSub.TLabel").grid(row=0, column=0, sticky="e")
        ttk.Label(usage, textvariable=self.usage_hud_counts_var, style="HeaderSub.TLabel").grid(row=1, column=0, sticky="e")

        status = ttk.Frame(header, style="CardAlt.TFrame", padding=(12, 8))
        status.grid(row=0, column=2, sticky="e")
        runtime_label = "EXE / SQLite" if getattr(sys, "frozen", False) else "Dev / SQLite"
        ttk.Label(status, text=today_str(), style="CardAltMuted.TLabel").grid(row=0, column=0, sticky="e")
        ttk.Label(status, text=runtime_label, style="CardAlt.TLabel").grid(row=1, column=0, sticky="e")

    def apply_window_icon(self) -> None:
        if not ICON_PATH.exists():
            return
        try:
            self.iconbitmap(default=str(ICON_PATH))
        except tk.TclError:
            pass

    def page_title(self, frame: ttk.Frame, title: str, subtitle: str = "") -> None:
        header = ttk.Frame(frame, style="App.TFrame")
        header.grid(row=0, column=0, sticky="ew")
        ttk.Label(header, text=title, style="Title.TLabel").grid(row=0, column=0, sticky="w")
        if subtitle:
            ttk.Label(header, text=subtitle, style="Muted.TLabel").grid(row=1, column=0, sticky="w", pady=(3, 0))

    def card_frame(self, parent: tk.Misc, padding: tuple[int, int] = (14, 12)) -> ttk.Frame:
        return ttk.Frame(parent, style="Card.TFrame", padding=padding)

    def style_text_widget(self, widget: tk.Text) -> None:
        widget.configure(
            bg=THEME["input"],
            fg=THEME["text"],
            insertbackground=THEME["accent"],
            selectbackground="#bfdbfe",
            selectforeground=THEME["text"],
            relief="flat",
            borderwidth=0,
            padx=12,
            pady=10,
            font=(self.font_family, 10),
        )

    def style_listbox(self, listbox: tk.Listbox) -> None:
        listbox.configure(
            bg=THEME["input"],
            fg=THEME["text"],
            selectbackground="#dbeafe",
            selectforeground=THEME["text"],
            highlightthickness=1,
            highlightbackground=THEME["line"],
            highlightcolor=THEME["accent"],
            relief="flat",
            borderwidth=0,
            font=(self.font_family, 9),
        )

    def _build_placeholder_tab(self, frame: ttk.Frame, name: str) -> None:
        self.page_title(frame, name)

        body = ttk.Label(
            frame,
            text="Camada inicial criada. A funcionalidade desta aba será adicionada nos próximos commits.",
            wraplength=720,
        )
        body.grid(row=1, column=0, sticky="nw", pady=(16, 0))

    def _build_radar_engines_panel(self, parent: ttk.Frame, row: int) -> None:
        panel = tk.Frame(parent, bg=THEME["card"], highlightthickness=1, highlightbackground=THEME["line"])
        panel.grid(row=row, column=0, sticky="nsew", pady=(12, 0))
        panel.columnconfigure(0, weight=1)
        panel.rowconfigure(2, weight=1)

        header = tk.Frame(panel, bg=THEME["card"], padx=14, pady=12)
        header.grid(row=0, column=0, sticky="ew")
        header.columnconfigure(0, weight=1)
        tk.Label(
            header,
            text="Motores locais do Radar",
            bg=THEME["card"],
            fg=THEME["text"],
            font=(self.font_family, 12, "bold"),
            anchor="w",
        ).grid(row=0, column=0, sticky="w")
        tk.Label(
            header,
            textvariable=self.radar_engine_status_var,
            bg=THEME["card"],
            fg=THEME["muted"],
            font=(self.font_family, 10),
            anchor="w",
        ).grid(row=1, column=0, sticky="w", pady=(4, 0))
        tk.Label(
            header,
            textvariable=self.radar_engine_selected_var,
            bg=THEME["card"],
            fg=THEME["accent"],
            font=(self.font_family, 9, "bold"),
            anchor="w",
        ).grid(row=2, column=0, sticky="w", pady=(6, 0))

        actions = tk.Frame(header, bg=THEME["card"])
        actions.grid(row=0, column=1, rowspan=3, sticky="e")
        ttk.Button(actions, text="Atualizar motores", command=self.refresh_radar_engines, style="Success.TButton").grid(
            row=0, column=0, padx=(0, 8)
        )
        ttk.Button(actions, text="Iniciar motor", command=self.start_selected_radar_engine).grid(row=0, column=1, padx=8)
        ttk.Button(actions, text="Parar container", command=self.stop_selected_radar_engine, style="Danger.TButton").grid(
            row=0, column=2, padx=8
        )
        ttk.Button(actions, text="Logs do motor", command=self.show_selected_radar_engine_logs).grid(row=0, column=3, padx=(8, 0))

        metrics = ttk.Frame(panel, style="App.TFrame")
        metrics.grid(row=1, column=0, sticky="ew", padx=12, pady=(0, 12))
        for col in range(4):
            metrics.columnconfigure(col, weight=1)
        self.ops_metric_card(metrics, 0, "Total", self.radar_engine_total_var, "#2563eb")
        self.ops_metric_card(metrics, 1, "Rodando", self.radar_engine_running_var, "#16a34a")
        self.ops_metric_card(metrics, 2, "Parados", self.radar_engine_stopped_var, "#b42318")
        self.ops_metric_card(metrics, 3, "Agent", self.radar_engine_agent_var, "#0e7490")

        body = tk.Frame(panel, bg=THEME["card"])
        body.grid(row=2, column=0, sticky="nsew", padx=12, pady=(0, 12))
        body.columnconfigure(0, weight=3)
        body.columnconfigure(2, weight=2)
        body.rowconfigure(1, weight=1)
        tk.Label(
            body,
            text="Containers hbx-engine-*",
            bg=THEME["card"],
            fg=THEME["text"],
            font=(self.font_family, 11, "bold"),
            anchor="w",
        ).grid(row=0, column=0, sticky="ew", pady=(0, 8))
        tk.Label(
            body,
            text="Eventos do motor",
            bg=THEME["card"],
            fg=THEME["text"],
            font=(self.font_family, 11, "bold"),
            anchor="w",
        ).grid(row=0, column=2, sticky="ew", pady=(0, 8), padx=(12, 0))

        columns = ("name", "state", "cpu", "memory", "mem_percent", "ports")
        tree = ttk.Treeview(body, columns=columns, show="headings", height=8)
        headings = {
            "name": "Motor",
            "state": "Estado",
            "cpu": "CPU",
            "memory": "Memória",
            "mem_percent": "Mem %",
            "ports": "Portas",
        }
        widths = {
            "name": 170,
            "state": 100,
            "cpu": 75,
            "memory": 150,
            "mem_percent": 80,
            "ports": 280,
        }
        for column in columns:
            tree.heading(column, text=headings[column])
            tree.column(column, width=widths[column], anchor="w" if column in {"name", "state", "ports"} else "e")
        tree.tag_configure("running", foreground=THEME["success"])
        tree.tag_configure("stopped", foreground=THEME["danger"])
        tree.tag_configure("other", foreground=THEME["muted"])
        tree.grid(row=1, column=0, sticky="nsew")
        tree_scroll = ttk.Scrollbar(body, orient="vertical", command=tree.yview)
        tree_scroll.grid(row=1, column=1, sticky="ns")
        tree.configure(yscrollcommand=tree_scroll.set)
        tree.bind("<<TreeviewSelect>>", self.on_radar_engine_selected)
        self.radar_engine_tree = tree

        self.radar_engine_events_text = tk.Text(body, height=8, wrap="word")
        self.style_text_widget(self.radar_engine_events_text)
        self.radar_engine_events_text.grid(row=1, column=2, sticky="nsew", padx=(12, 0))
        events_scroll = ttk.Scrollbar(body, orient="vertical", command=self.radar_engine_events_text.yview)
        events_scroll.grid(row=1, column=3, sticky="ns")
        self.radar_engine_events_text.configure(yscrollcommand=events_scroll.set)
        self.set_radar_engine_events(
            "Motores locais consolidados no Ops Control.\n"
            "Use Atualizar motores para consultar o agent local sem sair do Ops Control."
        )
        self.after(350, self.refresh_radar_engines)

    def owner_local_agent_url(self) -> str:
        return str(self.config_data.get("owner_local_agent_url") or DEFAULT_CONFIG["owner_local_agent_url"]).strip().rstrip("/")

    def owner_local_agent_token(self) -> str:
        return str(os.environ.get("HBX_OWNER_LOCAL_TOKEN") or self.config_data.get("owner_local_agent_token") or "").strip()

    def owner_local_agent_request(self, path: str, method: str = "GET", payload: dict | None = None, timeout: int = 12) -> dict:
        base_url = self.owner_local_agent_url()
        token = self.owner_local_agent_token()
        if not base_url:
            raise RuntimeError("Configure owner_local_agent_url em Config.")
        if not token:
            raise RuntimeError("Configure HBX_OWNER_LOCAL_TOKEN no Windows ou owner_local_agent_token em Config.")
        data = None
        headers = {
            "Accept": "application/json",
            "Authorization": f"Bearer {token}",
        }
        if payload is not None:
            data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            headers["Content-Type"] = "application/json; charset=utf-8"
        url = f"{base_url}{path}"
        request = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                raw = response.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:500]
            raise RuntimeError(f"Agent respondeu {exc.code}: {detail}") from exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise RuntimeError(f"Agent local indisponível: {exc}") from exc
        try:
            return json.loads(raw or "{}")
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"Resposta inválida do agent local: {raw[:300]}") from exc

    def set_radar_engine_events(self, text: str) -> None:
        if not self.radar_engine_events_text:
            return
        self.radar_engine_events_text.configure(state="normal")
        self.radar_engine_events_text.delete("1.0", tk.END)
        self.radar_engine_events_text.insert(tk.END, text)
        self.radar_engine_events_text.configure(state="disabled")

    def refresh_radar_engines(self) -> None:
        self.radar_engine_status_var.set("Consultando motores no agent local...")
        self.radar_engine_agent_var.set("consultando")

        def worker() -> None:
            try:
                payload = self.owner_local_agent_request("/radar/engines/status")
                self.after(0, lambda: self.apply_radar_engine_snapshot(payload))
            except RuntimeError as exc:
                self.after(0, lambda: self.apply_radar_engine_error(str(exc)))

        threading.Thread(target=worker, daemon=True).start()

    def apply_radar_engine_error(self, message: str) -> None:
        self.radar_engine_agent_var.set("falha")
        self.radar_engine_status_var.set("Motores locais com alerta.")
        self.set_radar_engine_events(
            f"{message}\n\n"
            "Inicie o agent com:\n"
            "$env:HBX_OWNER_LOCAL_TOKEN=\"token-local-forte\"\n"
            "npm run owner:agent"
        )

    def apply_radar_engine_snapshot(self, payload: dict) -> None:
        engines = payload.get("engines") if isinstance(payload, dict) else []
        if not isinstance(engines, list):
            engines = []
        summary = payload.get("summary") if isinstance(payload, dict) else {}
        if not isinstance(summary, dict):
            summary = {}
        self.radar_engine_total_var.set(str(summary.get("total", len(engines))))
        self.radar_engine_running_var.set(str(summary.get("running", 0)))
        self.radar_engine_stopped_var.set(str(summary.get("stopped", 0)))
        self.radar_engine_agent_var.set("online" if payload.get("ok") else "alerta")
        self.radar_engine_status_var.set(f"Motores atualizados às {datetime.now().strftime('%H:%M:%S')}.")
        if self.radar_engine_tree:
            for item in self.radar_engine_tree.get_children():
                self.radar_engine_tree.delete(item)
            for engine in engines:
                state = str(engine.get("state") or "")
                tag = "running" if state == "running" else "stopped" if state in {"exited", "created"} else "other"
                self.radar_engine_tree.insert(
                    "",
                    tk.END,
                    values=(
                        engine.get("name", "-"),
                        self.state_label(state),
                        engine.get("cpu", "-"),
                        engine.get("memory", "-"),
                        engine.get("memPercent", "-"),
                        engine.get("ports", "-"),
                    ),
                    tags=(tag,),
                )
        errors = [str(item) for item in (payload.get("errors") or []) if str(item).strip()]
        if errors:
            self.set_radar_engine_events("\n".join(errors))
        else:
            self.set_radar_engine_events(
                "Consulta local concluída. Os motores locais agora ficam consolidados no Ops Control."
            )

    def selected_radar_engine_name(self) -> str:
        if not self.radar_engine_tree:
            return ""
        selected = self.radar_engine_tree.selection()
        if not selected:
            return ""
        values = self.radar_engine_tree.item(selected[0], "values")
        return str(values[0]) if values else ""

    def on_radar_engine_selected(self, _event: tk.Event | None = None) -> None:
        name = self.selected_radar_engine_name()
        self.radar_engine_selected_var.set(f"Selecionado: {name}" if name else "Nenhum motor selecionado.")

    def run_radar_engine_action(self, action: str, confirm_message: str = "") -> None:
        name = self.selected_radar_engine_name()
        if not name:
            messagebox.showwarning("Ops Control", "Selecione um motor primeiro.")
            return
        if confirm_message and not messagebox.askyesno("Ops Control", confirm_message):
            return
        self.radar_engine_status_var.set(f"Executando {action} em {name}...")

        def worker() -> None:
            try:
                payload = self.owner_local_agent_request(
                    f"/radar/engines/{urllib.parse.quote(name)}/{action}",
                    method="POST",
                    payload={"confirm": True} if action == "stop" else {},
                    timeout=15,
                )
                run = payload.get("run") if isinstance(payload, dict) else {}
                message = f"Ação enviada para {name}. Run: {run.get('id') or '-'}"
                self.after(0, lambda: self.finish_radar_engine_action(message))
            except RuntimeError as exc:
                self.after(0, lambda: self.apply_radar_engine_error(str(exc)))

        threading.Thread(target=worker, daemon=True).start()

    def finish_radar_engine_action(self, message: str) -> None:
        self.radar_engine_status_var.set(message)
        self.set_radar_engine_events(message)
        self.after(800, self.refresh_radar_engines)

    def start_selected_radar_engine(self) -> None:
        self.run_radar_engine_action("start", "Iniciar este container pode consumir memória local. Continuar?")

    def stop_selected_radar_engine(self) -> None:
        self.run_radar_engine_action(
            "stop",
            "Parar container local não substitui o dreno de lease no backend. Use apenas se o motor estiver ocioso ou se você já drenou a tarefa no fluxo operacional. Continuar?",
        )

    def show_selected_radar_engine_logs(self) -> None:
        name = self.selected_radar_engine_name()
        if not name:
            messagebox.showwarning("Ops Control", "Selecione um motor primeiro.")
            return
        self.radar_engine_status_var.set(f"Buscando logs de {name}...")

        def worker() -> None:
            try:
                payload = self.owner_local_agent_request(f"/radar/engines/{urllib.parse.quote(name)}/logs", timeout=20)
                log = str(payload.get("log") or f"Sem logs recentes para {name}.")
                self.after(0, lambda: self.finish_radar_engine_logs(name, log))
            except RuntimeError as exc:
                self.after(0, lambda: self.apply_radar_engine_error(str(exc)))

        threading.Thread(target=worker, daemon=True).start()

    def finish_radar_engine_logs(self, name: str, log: str) -> None:
        self.radar_engine_status_var.set(f"Logs de {name} carregados.")
        self.set_radar_engine_events(log)

    def _build_ops_control_tab(self, frame: ttk.Frame) -> None:
        self.page_title(frame, "Ops Control", "Cockpit Local x VPS do scraping Radar")
        frame.columnconfigure(0, weight=1)
        frame.rowconfigure(3, weight=2)
        frame.rowconfigure(4, weight=2)
        frame.rowconfigure(5, weight=1)

        hero = tk.Frame(frame, bg=THEME["card"], highlightthickness=1, highlightbackground=THEME["line"])
        hero.grid(row=1, column=0, sticky="ew", pady=(14, 12))
        hero.columnconfigure(0, weight=1)
        hero_body = tk.Frame(hero, bg=THEME["card"], padx=18, pady=14)
        hero_body.grid(row=0, column=0, sticky="ew")
        hero_body.columnconfigure(0, weight=1)

        tk.Label(
            hero_body,
            text="Ops Control - Cockpit Local x VPS",
            bg=THEME["card"],
            fg=THEME["text"],
            font=(self.font_family, 18, "bold"),
            anchor="w",
        ).grid(row=0, column=0, sticky="w")
        tk.Label(
            hero_body,
            textvariable=self.ops_status_var,
            bg=THEME["card"],
            fg=THEME["muted"],
            font=(self.font_family, 10),
            anchor="w",
        ).grid(row=1, column=0, sticky="w", pady=(4, 0))
        tk.Label(
            hero_body,
            textvariable=self.ops_panel_url_var,
            bg=THEME["card"],
            fg=THEME["accent"],
            font=(self.font_family, 9, "bold"),
            anchor="w",
        ).grid(row=2, column=0, sticky="w", pady=(6, 0))

        actions = tk.Frame(hero_body, bg=THEME["card"])
        actions.grid(row=0, column=1, rowspan=3, sticky="e")
        ttk.Button(actions, text="Abrir cockpit", command=self.open_ops_control_web, style="Accent.TButton").grid(
            row=0, column=0, padx=(0, 8)
        )
        ttk.Button(actions, text="Iniciar painel", command=self.start_ops_control_native, style="Success.TButton").grid(
            row=0, column=1, padx=8
        )
        ttk.Button(actions, text="API local", command=self.start_local_lab_api, style="Success.TButton").grid(
            row=0, column=2, padx=8
        )
        ttk.Button(actions, text="Atualizar", command=self.refresh_ops_control).grid(row=0, column=3, padx=8)
        ttk.Button(actions, text="Reiniciar", command=self.restart_ops_control_native, style="Warning.TButton").grid(
            row=0, column=4, padx=8
        )
        ttk.Button(actions, text="Logs", command=self.show_selected_ops_logs).grid(row=0, column=5, padx=8)
        ttk.Button(actions, text="Pasta", command=lambda: self.open_local_folder(OPS_CONTROL_DIR)).grid(
            row=0, column=6, padx=(8, 0)
        )

        metrics = ttk.Frame(frame, style="App.TFrame")
        metrics.grid(row=2, column=0, sticky="ew", pady=(0, 12))
        for col in range(7):
            metrics.columnconfigure(col, weight=1)
        self.ops_metric_card(metrics, 0, "Painel", self.ops_runtime_var, "#0e7490")
        self.ops_metric_card(metrics, 1, "Local", self.ops_local_cockpit_var, "#2563eb")
        self.ops_metric_card(metrics, 2, "VPS", self.ops_vps_cockpit_var, "#16a34a")
        self.ops_metric_card(metrics, 3, "Containers", self.ops_containers_var, "#7c3aed")
        self.ops_metric_card(metrics, 4, "API Local", self.ops_local_lab_var, "#0f766e")
        self.ops_metric_card(metrics, 5, "Docker", self.ops_docker_var, "#b45309")
        self.ops_metric_card(metrics, 6, "Atualizado", self.ops_updated_var, "#64748b")

        table_panel = tk.Frame(frame, bg=THEME["card"], highlightthickness=1, highlightbackground=THEME["line"])
        table_panel.grid(row=3, column=0, sticky="nsew")
        table_panel.columnconfigure(0, weight=1)
        table_panel.rowconfigure(1, weight=1)
        tk.Label(
            table_panel,
            text="Containers monitorados",
            bg=THEME["card"],
            fg=THEME["text"],
            font=(self.font_family, 12, "bold"),
            anchor="w",
            padx=14,
            pady=10,
        ).grid(row=0, column=0, sticky="ew")
        columns = ("name", "state", "cpu", "memory", "ports")
        tree = ttk.Treeview(table_panel, columns=columns, show="headings", height=11)
        tree.heading("name", text="Container")
        tree.heading("state", text="Status")
        tree.heading("cpu", text="CPU")
        tree.heading("memory", text="Memória")
        tree.heading("ports", text="Portas")
        tree.column("name", width=280, anchor="w")
        tree.column("state", width=110, anchor="w")
        tree.column("cpu", width=80, anchor="e")
        tree.column("memory", width=150, anchor="e")
        tree.column("ports", width=420, anchor="w")
        tree.tag_configure("running", foreground=THEME["success"])
        tree.tag_configure("stopped", foreground=THEME["danger"])
        tree.tag_configure("other", foreground=THEME["muted"])
        tree.grid(row=1, column=0, sticky="nsew", padx=12, pady=(0, 12))
        tree_scroll = ttk.Scrollbar(table_panel, orient="vertical", command=tree.yview)
        tree_scroll.grid(row=1, column=1, sticky="ns", pady=(0, 12))
        tree.configure(yscrollcommand=tree_scroll.set)
        self.ops_tree = tree

        self._build_radar_engines_panel(frame, row=4)

        events_panel = tk.Frame(frame, bg=THEME["card"], highlightthickness=1, highlightbackground=THEME["line"])
        events_panel.grid(row=5, column=0, sticky="nsew", pady=(12, 0))
        events_panel.columnconfigure(0, weight=1)
        events_panel.rowconfigure(1, weight=1)
        tk.Label(
            events_panel,
            text="Eventos recentes",
            bg=THEME["card"],
            fg=THEME["text"],
            font=(self.font_family, 12, "bold"),
            anchor="w",
            padx=14,
            pady=10,
        ).grid(row=0, column=0, sticky="ew")
        self.ops_events_text = tk.Text(events_panel, height=7, wrap="word")
        self.style_text_widget(self.ops_events_text)
        self.ops_events_text.grid(row=1, column=0, sticky="nsew", padx=12, pady=(0, 12))
        events_scroll = ttk.Scrollbar(events_panel, orient="vertical", command=self.ops_events_text.yview)
        events_scroll.grid(row=1, column=1, sticky="ns", pady=(0, 12))
        self.ops_events_text.configure(yscrollcommand=events_scroll.set)
        self.set_ops_events("Ops Control carregado como cockpit Local x VPS.\nClique em Atualizar para consultar scraping, Docker e banco pelo ops-control.")
        self.ops_panel_url_var.set(f"Cockpit: {self.ops_control_panel_url()}")
        self.after(250, self.refresh_ops_control)

    def ops_metric_card(self, parent: ttk.Frame, col: int, label: str, var: tk.StringVar, accent: str) -> None:
        card = tk.Frame(parent, bg=THEME["card"], highlightthickness=1, highlightbackground=THEME["line"])
        card.grid(row=0, column=col, sticky="ew", padx=(0 if col == 0 else 8, 0))
        card.columnconfigure(0, weight=1)
        tk.Frame(card, bg=accent, height=3).grid(row=0, column=0, sticky="ew")
        body = tk.Frame(card, bg=THEME["card"], padx=12, pady=10)
        body.grid(row=1, column=0, sticky="ew")
        tk.Label(
            body,
            text=label,
            bg=THEME["card"],
            fg=THEME["muted"],
            font=(self.font_family, 8, "bold"),
            anchor="w",
        ).grid(row=0, column=0, sticky="w")
        tk.Label(
            body,
            textvariable=var,
            bg=THEME["card"],
            fg=THEME["text"],
            font=(self.font_family, 15, "bold"),
            anchor="w",
        ).grid(row=1, column=0, sticky="w", pady=(4, 0))

    def hidden_creation_flags(self) -> int:
        return subprocess.CREATE_NO_WINDOW if sys.platform.startswith("win") else 0

    def run_hidden_command(self, command: list[str], cwd: Path, timeout: int = 20) -> tuple[bool, str]:
        try:
            result = subprocess.run(
                command,
                cwd=cwd,
                capture_output=True,
                text=True,
                timeout=timeout,
                check=False,
                creationflags=self.hidden_creation_flags(),
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            return False, str(exc)
        output = "\n".join(part for part in (result.stdout.strip(), result.stderr.strip()) if part)
        return result.returncode == 0, output

    def read_ops_env_public_value(self, key: str) -> str:
        if not OPS_CONTROL_ENV_PATH.exists():
            return ""
        try:
            lines = OPS_CONTROL_ENV_PATH.read_text(encoding="utf-8").splitlines()
        except OSError:
            return ""
        prefix = f"{key}="
        for line in lines:
            item = line.strip()
            if not item or item.startswith("#") or not item.startswith(prefix):
                continue
            return item.split("=", 1)[1].strip().strip('"').strip("'")
        return ""

    def ops_control_panel_url(self) -> str:
        configured = (
            self.read_ops_env_public_value("OPS_CONTROL_PANEL_URL")
            or self.read_ops_env_public_value("OPS_CONTROL_PUBLIC_URL")
            or self.read_ops_env_public_value("OPS_CONTROL_URL")
        )
        if configured:
            return configured
        port = self.read_ops_env_public_value("OPS_CONTROL_PORT") or "3099"
        return f"http://127.0.0.1:{port}"

    def ops_control_api_url(self, path: str) -> str:
        base = self.ops_control_panel_url().rstrip("/")
        clean_path = path if path.startswith("/") else f"/{path}"
        return f"{base}{clean_path}"

    def read_ops_control_token(self) -> str:
        return str(os.environ.get("OPS_CONTROL_TOKEN") or self.read_ops_env_public_value("OPS_CONTROL_TOKEN") or "").strip()

    def ops_compose_command(self, action: str) -> list[str]:
        return [
            "docker",
            "compose",
            "--env-file",
            str(OPS_CONTROL_ENV_PATH),
            "-f",
            str(OPS_CONTROL_COMPOSE_PATH),
            "--project-directory",
            str(HBX_REPO_DIR),
            action,
            "ops-control",
        ]

    def start_ops_control_native(self) -> None:
        if not self.ops_control_files_ready():
            return
        self.ops_status_var.set("Iniciando Ops Control em background...")
        self.ops_panel_url_var.set(f"Cockpit: {self.ops_control_panel_url()}")

        def worker() -> None:
            command = self.ops_compose_command("up")
            command.insert(-1, "-d")
            command.insert(-1, "--build")
            ok, output = self.run_hidden_command(command, HBX_REPO_DIR, timeout=120)
            self.after(0, lambda: self.finish_ops_action("iniciar", ok, output))

        threading.Thread(target=worker, daemon=True).start()

    def restart_ops_control_native(self) -> None:
        if not self.ops_control_files_ready():
            return
        self.ops_status_var.set("Reiniciando Ops Control em background...")

        def worker() -> None:
            ok, output = self.run_hidden_command(self.ops_compose_command("restart"), HBX_REPO_DIR, timeout=60)
            self.after(0, lambda: self.finish_ops_action("reiniciar", ok, output))

        threading.Thread(target=worker, daemon=True).start()

    def ops_control_files_ready(self) -> bool:
        missing = [
            str(path)
            for path in (OPS_CONTROL_DIR, OPS_CONTROL_COMPOSE_PATH, OPS_CONTROL_ENV_PATH)
            if not path.exists()
        ]
        if missing:
            message = "Ops Control incompleto:\n" + "\n".join(missing)
            self.ops_status_var.set("Ops Control incompleto.")
            self.set_ops_events(message)
            messagebox.showwarning("Ops Control", message)
            return False
        return True

    def finish_ops_action(self, action: str, ok: bool, output: str) -> None:
        status = "OK" if ok else "falhou"
        self.ops_status_var.set(f"Operação {action}: {status}.")
        message = output if ok else self.friendly_docker_error(output)
        self.set_ops_events(message or f"Operação {action} concluída.")
        if ok and action == "iniciar":
            self.open_ops_control_web()
        self.refresh_ops_control()

    def fetch_local_lab_status(self) -> dict:
        request = urllib.request.Request(f"{LOCAL_LAB_URL}/health", method="GET")
        try:
            with urllib.request.urlopen(request, timeout=2) as response:
                raw = response.read().decode("utf-8", errors="replace")
            payload = json.loads(raw or "{}")
            return {
                "up": response.status == 200 and bool(payload.get("ok")),
                "url": LOCAL_LAB_URL,
                "message": "api local up" if payload.get("ok") else "api local alerta",
            }
        except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError):
            return {"up": False, "url": LOCAL_LAB_URL, "message": "api local off"}

    def start_local_lab_api(self) -> None:
        current = self.fetch_local_lab_status()
        if current.get("up"):
            self.ops_local_lab_var.set("api local up")
            self.ops_status_var.set("API local já está rodando.")
            self.set_ops_events(f"API local ativa em {LOCAL_LAB_URL}.")
            return
        if not (LOCAL_LAB_DIR / "server.js").exists():
            message = f"Local Lab não encontrado:\n{LOCAL_LAB_DIR}"
            self.ops_local_lab_var.set("api local falha")
            self.ops_status_var.set("API local não encontrada.")
            self.set_ops_events(message)
            messagebox.showwarning("API local", message)
            return
        self.ops_local_lab_var.set("subindo")
        self.ops_status_var.set("Subindo API local 3098...")

        def worker() -> None:
            APP_DIR.joinpath("logs").mkdir(parents=True, exist_ok=True)
            log_path = APP_DIR / "logs" / "hbx-local-lab.log"
            try:
                log_file = log_path.open("a", encoding="utf-8")
                node_bin = shutil.which("node") or "node"
                process = subprocess.Popen(
                    [node_bin, "server.js"],
                    cwd=LOCAL_LAB_DIR,
                    stdout=log_file,
                    stderr=log_file,
                    stdin=subprocess.DEVNULL,
                    creationflags=self.hidden_creation_flags(),
                    env={
                        **os.environ,
                        "HBX_LOCAL_LAB_HOST": "127.0.0.1",
                        "HBX_LOCAL_LAB_PORT": "3098",
                    },
                )
                log_file.close()
            except OSError as exc:
                self.after(0, lambda: self.finish_local_lab_start(False, str(exc)))
                return
            time.sleep(1.2)
            status = self.fetch_local_lab_status()
            detail = f"pid={process.pid} log={log_path}" if status.get("up") else f"pid={process.pid}; health ainda indisponível"
            self.after(0, lambda: self.finish_local_lab_start(bool(status.get("up")), detail))

        threading.Thread(target=worker, daemon=True).start()

    def finish_local_lab_start(self, ok: bool, detail: str) -> None:
        self.ops_local_lab_var.set("api local up" if ok else "api local off")
        self.ops_status_var.set("API local 3098 ativa." if ok else "API local não respondeu ainda.")
        self.set_ops_events(
            f"API local: {'up' if ok else 'off'} em {LOCAL_LAB_URL}.\n{detail}\n\n"
            "Se o cockpit já estava aberto, clique em Iniciar painel ou Reiniciar para o container reler o .env.ops-control."
        )
        self.refresh_ops_control()

    def refresh_ops_control(self) -> None:
        self.ops_status_var.set("Consultando cockpit Local x VPS...")

        def worker() -> None:
            snapshot = self.collect_ops_snapshot()
            self.after(0, lambda: self.apply_ops_snapshot(snapshot))

        threading.Thread(target=worker, daemon=True).start()

    def collect_ops_snapshot(self) -> dict:
        ps_ok, ps_output = self.run_hidden_command(
            [
                "docker",
                "ps",
                "-a",
                "--format",
                "{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.State}}\t{{.Ports}}",
            ],
            HBX_REPO_DIR,
            timeout=25,
        )
        stats_ok, stats_output = self.run_hidden_command(
            [
                "docker",
                "stats",
                "--no-stream",
                "--format",
                "{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.PIDs}}",
            ],
            HBX_REPO_DIR,
            timeout=35,
        )
        containers = self.parse_docker_rows(ps_output if ps_ok else "")
        stats = self.parse_docker_stats(stats_output if stats_ok else "")
        for container in containers:
            item_stats = stats.get(container["name"], {})
            container["cpu"] = item_stats.get("cpu", "-")
            container["memory"] = item_stats.get("memory", "-")
            container["mem_percent"] = item_stats.get("mem_percent", "-")
        running = sum(1 for item in containers if item.get("state") == "running")
        ops_state = self.find_container_state(containers, ("ops-control", "hbx-owner-ops-control", "hbx-master-ops-control"))
        cockpit, cockpit_error = self.fetch_ops_radar_cockpit()
        errors = []
        if not ps_ok:
            errors.append(self.friendly_docker_error(ps_output or "Docker ps falhou."))
        if ps_ok and not stats_ok:
            errors.append(self.friendly_docker_error(stats_output or "Docker stats indisponível."))
        if not OPS_CONTROL_ENV_PATH.exists():
            errors.append(".env.ops-control não encontrado na raiz do repo.")
        if cockpit_error:
            errors.append(cockpit_error)
        local_lab = self.fetch_local_lab_status()
        return {
            "containers": containers,
            "running": running,
            "total": len(containers),
            "ops_state": ops_state,
            "local_lab": local_lab,
            "docker_ok": ps_ok,
            "cockpit": cockpit,
            "errors": errors,
            "updated_at": datetime.now().strftime("%H:%M:%S"),
        }

    def fetch_ops_radar_cockpit(self) -> tuple[dict | None, str]:
        token = self.read_ops_control_token()
        if not token:
            return None, "OPS_CONTROL_TOKEN não configurado para consultar /api/radar-cockpit."
        url = self.ops_control_api_url("/api/radar-cockpit")
        request = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
        try:
            with urllib.request.urlopen(request, timeout=8) as response:
                raw = response.read().decode("utf-8", errors="replace")
            return json.loads(raw), ""
        except urllib.error.HTTPError as exc:
            if exc.code == 401:
                return None, "Token do Ops Control inválido para consultar o cockpit."
            return None, f"Cockpit Local x VPS respondeu HTTP {exc.code}."
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            return None, f"Cockpit Local x VPS indisponível: {exc}"
        except json.JSONDecodeError:
            return None, "Cockpit Local x VPS respondeu JSON inválido."

    def parse_docker_rows(self, output: str) -> list[dict]:
        rows = []
        for line in output.splitlines():
            parts = line.split("\t")
            if len(parts) < 4:
                continue
            name, image, status, state = parts[:4]
            ports = parts[4] if len(parts) > 4 else ""
            rows.append(
                {
                    "name": name,
                    "image": image,
                    "status": status,
                    "state": state,
                    "ports": ports,
                    "cpu": "-",
                    "memory": "-",
                }
            )
        return rows

    def friendly_docker_error(self, output: str) -> str:
        normalized = output.lower()
        if "dockerdesktoplinuxengine" in normalized or "pipe/docker" in normalized or "cannot connect to the docker daemon" in normalized:
            return "Docker Desktop não está ativo. Abra o Docker Desktop e clique em Atualizar."
        if "is not recognized" in normalized or "não é reconhecido" in normalized:
            return "Docker não encontrado no PATH do Windows."
        if "error during connect" in normalized:
            return "Docker não respondeu à consulta local. Verifique se o Docker Desktop terminou de iniciar."
        return output.strip().splitlines()[0] if output.strip() else "Docker indisponível."

    def parse_docker_stats(self, output: str) -> dict[str, dict[str, str]]:
        rows: dict[str, dict[str, str]] = {}
        for line in output.splitlines():
            parts = line.split("\t")
            if len(parts) < 5:
                continue
            name, cpu, memory, mem_percent, pids = parts[:5]
            rows[name] = {"cpu": cpu, "memory": memory, "mem_percent": mem_percent, "pids": pids}
        return rows

    def find_container_state(self, containers: list[dict], candidates: tuple[str, ...]) -> str:
        for container in containers:
            name = str(container.get("name", "")).lower()
            image = str(container.get("image", "")).lower()
            if any(candidate in name or candidate in image for candidate in candidates):
                return str(container.get("state") or "unknown")
        return "not_found"

    def state_label(self, state: str) -> str:
        return {
            "running": "rodando",
            "exited": "parado",
            "created": "criado",
            "restarting": "reiniciando",
            "not_found": "ausente",
            "unknown": "desconhecido",
        }.get(state, state or "-")

    def apply_ops_snapshot(self, snapshot: dict) -> None:
        containers = sorted(
            snapshot["containers"],
            key=lambda item: (
                0 if "ops-control" in str(item.get("name", "")).lower() else 1,
                0 if item.get("state") == "running" else 1,
                str(item.get("name", "")).lower(),
            ),
        )
        ops_state = str(snapshot["ops_state"])
        self.ops_runtime_var.set(self.state_label(ops_state))
        cockpit = snapshot.get("cockpit") if isinstance(snapshot.get("cockpit"), dict) else None
        self.apply_ops_cockpit_metrics(cockpit)
        self.ops_containers_var.set(f"{snapshot['running']} / {snapshot['total']}")
        self.ops_docker_var.set("online" if snapshot["docker_ok"] else "falha")
        local_lab = snapshot.get("local_lab") if isinstance(snapshot.get("local_lab"), dict) else {}
        self.ops_local_lab_var.set("api local up" if local_lab.get("up") else "api local off")
        self.ops_updated_var.set(str(snapshot["updated_at"]))
        if self.ops_tree:
            for item in self.ops_tree.get_children():
                self.ops_tree.delete(item)
            for container in containers:
                state = str(container.get("state") or "")
                tag = "running" if state == "running" else "stopped" if state in {"exited", "created"} else "other"
                self.ops_tree.insert(
                    "",
                    tk.END,
                    values=(
                        container.get("name", "-"),
                        self.state_label(state),
                        container.get("cpu", "-"),
                        container.get("memory", "-"),
                        container.get("ports", "-"),
                    ),
                    tags=(tag,),
                )
        cockpit_summary = self.format_ops_cockpit_summary(cockpit)
        errors = snapshot.get("errors") or []
        if errors:
            self.ops_status_var.set("Ops Control consultado com alertas.")
            message = "\n\n".join(part for part in [cockpit_summary, "\n".join(str(error) for error in errors)] if part)
            self.set_ops_events(message)
        else:
            self.ops_status_var.set("Cockpit Local x VPS atualizado.")
            self.set_ops_events(cockpit_summary or "Consulta concluída. Selecione um container e clique em Logs para ver eventos recentes.")

    def apply_ops_cockpit_metrics(self, cockpit: dict | None) -> None:
        environments = cockpit.get("environments") if isinstance(cockpit, dict) else {}
        self.ops_local_cockpit_var.set(self.ops_environment_metric(environments.get("localhost") if isinstance(environments, dict) else None))
        self.ops_vps_cockpit_var.set(self.ops_environment_metric(environments.get("vps") if isinstance(environments, dict) else None))

    def ops_environment_metric(self, data: dict | None) -> str:
        if not isinstance(data, dict):
            return "offline"
        if data.get("available") is False:
            return "config"
        working = data.get("workingNow") if isinstance(data.get("workingNow"), dict) else {}
        status = str(working.get("status") or "").lower()
        if status in {"running", "queued", "sleeping", "partial_error", "locked"}:
            return "trabalhando"
        backend = data.get("services", {}).get("backend", {}) if isinstance(data.get("services"), dict) else {}
        if str(backend.get("state") or "").lower() == "running":
            return "pronto"
        return "alerta"

    def format_ops_cockpit_summary(self, cockpit: dict | None) -> str:
        if not isinstance(cockpit, dict):
            return ""
        environments = cockpit.get("environments") if isinstance(cockpit.get("environments"), dict) else {}
        lines = ["Cockpit Local x VPS"]
        for key, label in (("localhost", "Local"), ("vps", "VPS")):
            data = environments.get(key)
            if not isinstance(data, dict):
                lines.append(f"{label}: sem dados.")
                continue
            if data.get("available") is False:
                lines.append(f"{label}: indisponível - {data.get('message') or 'sem detalhe'}")
                continue
            working = data.get("workingNow") if isinstance(data.get("workingNow"), dict) else {}
            engines = data.get("engineSummary") if isinstance(data.get("engineSummary"), dict) else {}
            stock = data.get("leadStock") if isinstance(data.get("leadStock"), dict) else {}
            title = working.get("title") or "sem scraping ativo"
            query = working.get("query") or working.get("subtitle") or ""
            lines.append(
                f"{label}: {self.ops_environment_metric(data)} | {title} | motores {engines.get('running', 0)}/{engines.get('total', 0)} | "
                f"email 24h {stock.get('withEmail24h', 0)} | bloqueios {data.get('blocked24h', 0)}"
            )
            if query:
                lines.append(f"  query/contexto: {query}")
        return "\n".join(lines)

    def selected_ops_container_name(self) -> str:
        if not self.ops_tree:
            return ""
        selected = self.ops_tree.selection()
        if not selected:
            return ""
        values = self.ops_tree.item(selected[0], "values")
        return str(values[0]) if values else ""

    def show_selected_ops_logs(self) -> None:
        name = self.selected_ops_container_name()
        if not name:
            self.ops_status_var.set("Selecione um container para ver logs.")
            return
        self.ops_status_var.set(f"Buscando eventos de {name}...")

        def worker() -> None:
            ok, output = self.run_hidden_command(["docker", "logs", "--tail", "120", name], HBX_REPO_DIR, timeout=25)
            text = output if output else f"Sem eventos recentes para {name}."
            self.after(0, lambda: self.finish_ops_logs(name, ok, text))

        threading.Thread(target=worker, daemon=True).start()

    def finish_ops_logs(self, name: str, ok: bool, text: str) -> None:
        self.ops_status_var.set(f"Eventos de {name}: {'OK' if ok else 'com alerta'}.")
        self.set_ops_events(text)

    def set_ops_events(self, text: str) -> None:
        if not self.ops_events_text:
            return
        self.ops_events_text.configure(state="normal")
        self.ops_events_text.delete("1.0", tk.END)
        self.ops_events_text.insert(tk.END, text)
        self.ops_events_text.configure(state="disabled")

    def open_local_folder(self, path: Path) -> None:
        if not path.exists():
            self.ops_status_var.set(f"Pasta não encontrada: {path}")
            messagebox.showwarning("Ops Control", f"Pasta não encontrada:\n{path}")
            return
        try:
            subprocess.Popen(["explorer.exe", str(path)], creationflags=self.hidden_creation_flags())
        except OSError as exc:
            self.ops_status_var.set(f"Não consegui abrir pasta: {exc}")
            return
        self.ops_status_var.set(f"Pasta aberta: {path}")

    def open_ops_control_web(self) -> None:
        url = self.ops_control_panel_url()
        self.ops_panel_url_var.set(f"Cockpit: {url}")
        webbrowser.open(url)
        self.ops_status_var.set(f"Cockpit Local x VPS aberto: {url}")

    def _build_today_tab(self, frame: ttk.Frame) -> None:
        self.page_title(frame, "Hoje", "Ponto, foco e execução")
        frame.columnconfigure(0, weight=2)
        frame.columnconfigure(1, weight=1)
        frame.rowconfigure(3, weight=1)

        status_panel = self.card_frame(frame, padding=(18, 16))
        status_panel.grid(row=1, column=0, columnspan=2, sticky="ew", pady=(18, 14))
        status_panel.columnconfigure(0, weight=1)

        ttk.Label(status_panel, text="Status do expediente", style="CardMuted.TLabel").grid(row=0, column=0, sticky="w")
        ttk.Label(status_panel, textvariable=self.today_status_var, style="CardValue.TLabel", wraplength=780).grid(
            row=1, column=0, sticky="w", pady=(4, 0)
        )
        self.dashboard_health_label = tk.Label(
            status_panel,
            textvariable=self.dashboard_health_var,
            bg=THEME["success"],
            fg="#ffffff",
            padx=14,
            pady=7,
            font=(self.font_family, 10, "bold"),
        )
        self.dashboard_health_label.grid(row=0, column=1, rowspan=2, sticky="e", padx=(16, 0))

        actions = ttk.Frame(status_panel, style="Card.TFrame")
        actions.grid(row=2, column=0, columnspan=2, sticky="ew", pady=(16, 0))
        action_buttons = (
            ("START WORK", self.start_work, "Success.TButton"),
            ("PAUSA", self.start_break, "Warning.TButton"),
            ("RETOMAR", self.resume_break, "Accent.TButton"),
            ("STOP WORK", self.stop_work, "Danger.TButton"),
            ("FECHAR DIA", self.close_day, "Accent.TButton"),
        )
        for index, (text, command, style_name) in enumerate(action_buttons):
            ttk.Button(actions, text=text, command=command, style=style_name).grid(
                row=0, column=index, padx=(0, 8), pady=(0, 2), sticky="w"
            )

        metrics = ttk.Frame(frame, style="App.TFrame")
        metrics.grid(row=2, column=0, columnspan=2, sticky="ew", pady=(0, 14))
        for col in range(3):
            metrics.columnconfigure(col, weight=1)

        metric_data = (
            ("Progresso", self.dashboard_progress_var),
            ("Tempo líquido", self.today_elapsed_var),
            ("Tempo sentado", self.dashboard_seated_var),
            ("Commits hoje", self.dashboard_commits_var),
            ("Cards feitos", self.dashboard_done_var),
            ("Falhas Codex", self.dashboard_blocked_var),
        )
        for index, (label, var) in enumerate(metric_data):
            card = self.card_frame(metrics, padding=(14, 12))
            card.grid(row=index // 3, column=index % 3, sticky="ew", padx=(0 if index % 3 == 0 else 8, 0), pady=(0, 8))
            ttk.Label(card, text=label, style="CardMuted.TLabel").grid(row=0, column=0, sticky="w")
            ttk.Label(card, textvariable=var, style="Metric.TLabel").grid(row=1, column=0, sticky="w", pady=(4, 0))

        plan_panel = self.card_frame(frame, padding=(18, 16))
        plan_panel.grid(row=3, column=0, sticky="nsew", padx=(0, 8))
        plan_panel.columnconfigure(0, weight=1)
        ttk.Label(plan_panel, text="Plano do dia", style="CardMuted.TLabel").grid(row=0, column=0, sticky="w")
        ttk.Label(plan_panel, textvariable=self.today_plan_var, style="CardValue.TLabel", wraplength=700).grid(
            row=1, column=0, sticky="w", pady=(4, 14)
        )
        ttk.Label(plan_panel, text="Pausa", style="CardMuted.TLabel").grid(row=2, column=0, sticky="w")
        ttk.Label(plan_panel, textvariable=self.today_break_var, style="Card.TLabel", wraplength=700).grid(
            row=3, column=0, sticky="w", pady=(4, 14)
        )
        ttk.Label(plan_panel, text="Card atual", style="CardMuted.TLabel").grid(row=4, column=0, sticky="w")
        ttk.Label(plan_panel, textvariable=self.dashboard_card_var, style="Card.TLabel", wraplength=700).grid(
            row=5, column=0, sticky="w", pady=(4, 0)
        )

        guard_panel = self.card_frame(frame, padding=(18, 16))
        guard_panel.grid(row=3, column=1, sticky="nsew", padx=(8, 0))
        ttk.Label(guard_panel, text="Foco permitido", style="CardMuted.TLabel").grid(row=0, column=0, sticky="w")
        ttk.Label(
            guard_panel,
            text="Recovery / P0 técnico / demo / outbound",
            style="CardValue.TLabel",
            wraplength=320,
        ).grid(row=1, column=0, sticky="w", pady=(4, 14))
        ttk.Label(guard_panel, text="Fuga provável", style="CardMuted.TLabel").grid(row=2, column=0, sticky="w")
        ttk.Label(
            guard_panel,
            text="Feature nova, Radar por curiosidade, refactor bonito ou marketing amplo.",
            style="Card.TLabel",
            wraplength=320,
        ).grid(row=3, column=0, sticky="w", pady=(4, 0))

    def _build_execution_tab(self, frame: ttk.Frame) -> None:
        self.page_title(frame, "Execução", "Diagnósticos locais seguros")
        frame.columnconfigure(0, weight=1)
        frame.columnconfigure(1, weight=2)
        frame.rowconfigure(2, weight=1)

        controls = self.card_frame(frame, padding=(16, 14))
        controls.grid(row=1, column=0, sticky="nsew", padx=(0, 8), pady=(18, 12))
        controls.columnconfigure(0, weight=1)

        ttk.Label(controls, text="Comando seguro", style="CardMuted.TLabel").grid(row=0, column=0, sticky="w")
        ttk.Combobox(
            controls,
            textvariable=self.execution_command_var,
            values=tuple(SAFE_LOCAL_COMMANDS.keys()),
            state="readonly",
        ).grid(row=1, column=0, sticky="ew", pady=(4, 12))

        ttk.Label(
            controls,
            text="Só roda comandos permitidos no app. Não há campo de comando livre.",
            style="Card.TLabel",
            wraplength=340,
        ).grid(row=2, column=0, sticky="w", pady=(0, 12))

        command_help = "\n".join(
            f"- {key}: {spec['description']}" for key, spec in SAFE_LOCAL_COMMANDS.items()
        )
        ttk.Label(controls, text=command_help, style="Card.TLabel", wraplength=340).grid(
            row=3, column=0, sticky="w", pady=(0, 16)
        )

        buttons = (
            ("Rodar selecionado", self.run_selected_local_command, "Accent.TButton"),
            ("Sequência básica", self.run_basic_check_sequence, "Success.TButton"),
            ("Abrir terminal", self.open_project_terminal, "TButton"),
            ("Abrir pasta", self.open_project_folder, "TButton"),
            ("Salvar falha em Hoje", self.save_execution_as_blocker, "TButton"),
        )
        for row, (text, command, style_name) in enumerate(buttons, start=4):
            ttk.Button(controls, text=text, command=command, style=style_name).grid(
                row=row, column=0, sticky="ew", pady=(0, 8)
            )

        status = self.card_frame(frame, padding=(16, 14))
        status.grid(row=1, column=1, sticky="nsew", padx=(8, 0), pady=(18, 12))
        status.columnconfigure(0, weight=1)
        ttk.Label(status, text="Status", style="CardMuted.TLabel").grid(row=0, column=0, sticky="w")
        ttk.Label(status, textvariable=self.execution_status_var, style="CardValue.TLabel", wraplength=700).grid(
            row=1, column=0, sticky="w", pady=(4, 12)
        )
        ttk.Label(status, text="Uso", style="CardMuted.TLabel").grid(row=2, column=0, sticky="w")
        ttk.Label(
            status,
            text=(
                "Rode a sequência básica para validar o Owner e o repositório local. "
                "Execução de card, dispatch Codex, teste e commit ficam no Kanban."
            ),
            style="Card.TLabel",
            wraplength=700,
        ).grid(row=3, column=0, sticky="w", pady=(4, 0))

        output_frame = ttk.LabelFrame(frame, text="Saída local", padding=8, style="Modern.TLabelframe")
        output_frame.grid(row=2, column=0, columnspan=2, sticky="nsew")
        output_frame.columnconfigure(0, weight=1)
        output_frame.rowconfigure(0, weight=1)
        self.execution_output = tk.Text(output_frame, height=22, wrap="word")
        self.style_text_widget(self.execution_output)
        self.execution_output.grid(row=0, column=0, sticky="nsew")
        scroll = ttk.Scrollbar(output_frame, orient="vertical", command=self.execution_output.yview)
        scroll.grid(row=0, column=1, sticky="ns")
        self.execution_output.configure(yscrollcommand=scroll.set)

    def set_execution_output(self, text: str) -> None:
        self.last_execution_output = text
        if not hasattr(self, "execution_output"):
            return
        self.execution_output.delete("1.0", tk.END)
        self.execution_output.insert(tk.END, text)

    def repo_path(self) -> Path:
        return Path(self.git_repo_var.get().strip() or self.config_data.get("repo_path") or APP_DIR)

    def local_command(self, command_key: str) -> tuple[list[str], int, str]:
        if command_key not in SAFE_LOCAL_COMMANDS:
            raise ValueError(f"Comando local bloqueado: {command_key}")
        spec = SAFE_LOCAL_COMMANDS[command_key]
        command = [sys.executable if part == "{python}" else str(part) for part in spec["command"]]
        return command, int(spec["timeout"]), str(spec["label"])

    def run_selected_local_command(self) -> None:
        self.run_local_command(self.execution_command_var.get().strip() or "py_compile")

    def run_local_command(self, command_key: str) -> tuple[bool, str]:
        try:
            command, timeout, label = self.local_command(command_key)
        except ValueError as exc:
            output = str(exc)
            self.execution_status_var.set(output)
            self.set_execution_output(output)
            return False, output

        cwd = self.repo_path()
        if not cwd.exists():
            output = f"repo_path não existe: {cwd}"
            self.execution_status_var.set(output)
            self.set_execution_output(output)
            return False, output

        started = now_iso()
        try:
            result = subprocess.run(command, cwd=cwd, capture_output=True, text=True, timeout=timeout, check=False)
            returncode = int(result.returncode)
            output = ((result.stdout or "") + (result.stderr or "")).strip() or "(sem saída)"
        except (OSError, subprocess.TimeoutExpired) as exc:
            returncode = 124
            output = str(exc)

        command_text = " ".join(command)
        report = (
            f"{label}\n"
            f"Comando: {command_text}\n"
            f"CWD: {cwd}\n"
            f"Início: {started}\n"
            f"Return code: {returncode}\n\n"
            f"{output}"
        )
        self.db.execute(
            """
            INSERT INTO local_runs (date, command_key, command_text, cwd, returncode, output, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (today_str(), command_key, command_text, str(cwd), returncode, output[:8000], now_iso()),
        )
        self.execution_status_var.set(f"{label}: {'OK' if returncode == 0 else 'falhou'}")
        self.set_execution_output(report)
        return returncode == 0, report

    def run_basic_check_sequence(self) -> None:
        reports: list[str] = []
        all_ok = True
        for command_key in ("py_compile", "app_no_gui", "git_status"):
            ok, report = self.run_local_command(command_key)
            all_ok = all_ok and ok
            reports.append(report)
        separator = "\n\n" + ("=" * 72) + "\n\n"
        final = separator.join(reports)
        self.execution_status_var.set(f"Sequência básica: {'OK' if all_ok else 'com falha'}")
        self.set_execution_output(final)

    def open_project_terminal(self) -> None:
        cwd = self.repo_path()
        try:
            subprocess.Popen(["powershell.exe", "-NoExit"], cwd=cwd)
        except OSError as exc:
            self.execution_status_var.set(f"Não consegui abrir terminal: {exc}")
            return
        self.execution_status_var.set(f"Terminal aberto em {cwd}")

    def open_project_folder(self) -> None:
        cwd = self.repo_path()
        try:
            subprocess.Popen(["explorer.exe", str(cwd)])
        except OSError as exc:
            self.execution_status_var.set(f"Não consegui abrir pasta: {exc}")
            return
        self.execution_status_var.set(f"Pasta aberta: {cwd}")

    def card_title_exists(self, title: str) -> bool:
        target_key = self.normalize_card_title_key(title)
        if not target_key:
            return False
        rows = self.db.fetchall(
            """
            SELECT title FROM kanban_cards
            WHERE lane NOT IN ('ARQUIVADO')
            """
        )
        return any(self.normalize_card_title_key(row["title"]) == target_key for row in rows)

    def save_execution_as_blocker(self) -> None:
        if not self.last_execution_output:
            self.execution_status_var.set("Não há saída local para salvar em card.")
            return
        card_id = self.insert_kanban_card(
            {
                "title": f"Revisar falha local: {self.execution_command_var.get() or 'execução'}",
                "description": self.last_execution_output[:1200],
                "module": "Execução local",
                "type": "Falha",
                "priority": "Alta",
                "lane": "HOJE",
                "blocked_reason": "",
            },
            source="Execução",
        )
        self.refresh_kanban()
        self.execution_status_var.set(f"Falha salva em Hoje: #{card_id}")

    def _build_reports_tab(self, frame: ttk.Frame) -> None:
        self.page_title(frame, "Relatórios", "Fechamento, export e backup")

        buttons = ttk.Frame(frame, style="Toolbar.TFrame")
        buttons.grid(row=1, column=0, sticky="w", pady=(12, 10))
        ttk.Button(buttons, text="Gerar relatório HTML", command=self.close_day, style="Accent.TButton").grid(
            row=0, column=0, padx=(0, 8)
        )
        ttk.Button(buttons, text="Abrir pasta reports", command=lambda: webbrowser.open((APP_DIR / "reports").as_uri())).grid(
            row=0, column=1, padx=8
        )
        ttk.Button(buttons, text="Copiar plano de amanhã", command=self.copy_next_day_plan).grid(
            row=0, column=2, padx=8
        )
        ttk.Button(buttons, text="Exportar sessões CSV", command=self.export_sessions_csv).grid(
            row=0, column=3, padx=8
        )
        ttk.Button(buttons, text="Exportar cards CSV", command=self.export_cards_csv).grid(row=0, column=4, padx=8)
        ttk.Button(buttons, text="Exportar relatórios JSON", command=self.export_reports_json).grid(
            row=0, column=5, padx=8
        )
        ttk.Button(buttons, text="Backup SQLite", command=self.backup_sqlite).grid(row=0, column=6, padx=8)
        ttk.Button(buttons, text="Gerar relatório semanal", command=self.generate_weekly_report).grid(
            row=0, column=7, padx=8
        )

        output_frame = ttk.LabelFrame(frame, text="Fechamento", padding=8, style="Modern.TLabelframe")
        output_frame.grid(row=2, column=0, sticky="nsew")
        output_frame.columnconfigure(0, weight=1)
        output_frame.rowconfigure(0, weight=1)
        frame.rowconfigure(2, weight=1)

        self.report_output = tk.Text(output_frame, height=24, wrap="word")
        self.style_text_widget(self.report_output)
        self.report_output.grid(row=0, column=0, sticky="nsew")
        scroll = ttk.Scrollbar(output_frame, orient="vertical", command=self.report_output.yview)
        scroll.grid(row=0, column=1, sticky="ns")
        self.report_output.configure(yscrollcommand=scroll.set)

    def set_report_output(self, text: str) -> None:
        if not hasattr(self, "report_output"):
            return
        self.report_output.delete("1.0", tk.END)
        self.report_output.insert(tk.END, text)

    def export_table_csv(self, table: str, filename: str) -> Path:
        allowed = {"work_sessions", "kanban_cards"}
        if table not in allowed:
            raise ValueError("Tabela não permitida para export CSV.")
        rows = self.db.fetchall(f"SELECT * FROM {table} ORDER BY id")
        path = APP_DIR / "exports" / filename
        with path.open("w", newline="", encoding="utf-8-sig") as csv_file:
            if not rows:
                csv_file.write("")
                return path
            writer = csv.DictWriter(csv_file, fieldnames=list(rows[0].keys()))
            writer.writeheader()
            for row in rows:
                writer.writerow(dict(row))
        return path

    def export_sessions_csv(self) -> None:
        path = self.export_table_csv("work_sessions", f"work_sessions-{today_str()}.csv")
        self.set_report_output(f"Sessões exportadas:\n{path}")
        messagebox.showinfo("Export", f"Sessões CSV exportadas em:\n{path}")

    def export_cards_csv(self) -> None:
        path = self.export_table_csv("kanban_cards", f"kanban_cards-{today_str()}.csv")
        self.set_report_output(f"Cards exportados:\n{path}")
        messagebox.showinfo("Export", f"Cards CSV exportados em:\n{path}")

    def export_reports_json(self) -> None:
        rows = self.db.fetchall("SELECT * FROM daily_reports ORDER BY id")
        path = APP_DIR / "exports" / f"daily_reports-{today_str()}.json"
        data = [dict(row) for row in rows]
        path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
        self.set_report_output(f"Relatórios exportados:\n{path}")
        messagebox.showinfo("Export", f"Relatórios JSON exportados em:\n{path}")

    def backup_sqlite(self) -> None:
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        path = APP_DIR / "exports" / f"hbx_owner-{stamp}.db"
        dest = sqlite3.connect(path)
        try:
            self.db.conn.backup(dest)
        finally:
            dest.close()
        self.set_report_output(f"Backup SQLite criado:\n{path}")
        messagebox.showinfo("Backup", f"Backup SQLite criado em:\n{path}")

    def _build_tickets_tab(self, frame: ttk.Frame) -> None:
        self.page_title(frame, "Tickets", "Cards de atendimento técnico que precisam de ação")
        frame.columnconfigure(0, weight=1)
        frame.rowconfigure(3, weight=1)

        toolbar = ttk.Frame(frame, style="Toolbar.TFrame")
        toolbar.grid(row=1, column=0, sticky="ew", pady=(12, 8))
        toolbar.columnconfigure(7, weight=1)

        ttk.Label(toolbar, text="Status", style="Muted.TLabel").grid(row=0, column=0, sticky="w", padx=(0, 8))
        ttk.Combobox(
            toolbar,
            textvariable=self.owner_ticket_filter_var,
            values=("todos", "new", "triage", "waiting_codex", "in_progress", "done"),
            state="readonly",
            width=18,
        ).grid(row=0, column=1, sticky="w", padx=(0, 8))
        ttk.Button(toolbar, text="Atualizar", command=self.refresh_owner_tickets, style="Accent.TButton").grid(
            row=0, column=2, sticky="w", padx=8
        )
        ttk.Button(
            toolbar,
            text="Abrir card",
            command=self.open_selected_ticket_card,
            style="Success.TButton",
        ).grid(row=0, column=3, sticky="w", padx=8)
        ttk.Button(
            toolbar,
            text="Registrar dispatch",
            command=self.open_selected_ticket_dispatch_dialog,
            style="Warning.TButton",
        ).grid(row=0, column=4, sticky="w", padx=8)
        ttk.Button(toolbar, text="Copiar prompt", command=self.copy_selected_ticket_codex_prompt).grid(
            row=0, column=5, sticky="w", padx=8
        )
        ttk.Button(toolbar, text="Abrir Kanban", command=lambda: self.notebook.select(self.tabs["Kanban"])).grid(
            row=0, column=6, sticky="w", padx=8
        )

        status = self.card_frame(frame, padding=(12, 10))
        status.grid(row=2, column=0, sticky="ew", pady=(0, 10))
        status.columnconfigure(0, weight=1)
        ttk.Label(status, textvariable=self.owner_tickets_status_var, style="Card.TLabel").grid(row=0, column=0, sticky="w")
        ttk.Label(status, textvariable=self.owner_ticket_selected_var, style="CardMuted.TLabel").grid(
            row=1, column=0, sticky="w", pady=(3, 0)
        )

        body = ttk.Frame(frame, style="App.TFrame")
        body.grid(row=3, column=0, sticky="nsew")
        body.columnconfigure(0, weight=3)
        body.columnconfigure(1, weight=2)
        body.rowconfigure(0, weight=1)

        table_panel = ttk.LabelFrame(body, text="Fila Owner", padding=8, style="Modern.TLabelframe")
        table_panel.grid(row=0, column=0, sticky="nsew", padx=(0, 8))
        table_panel.columnconfigure(0, weight=1)
        table_panel.rowconfigure(0, weight=1)

        columns = ("ticket", "cliente", "origem", "categoria", "classificacao", "status", "dispatch", "acao")
        tree = ttk.Treeview(table_panel, columns=columns, show="headings", height=18)
        headings = {
            "ticket": "Ticket",
            "cliente": "Cliente",
            "origem": "Origem",
            "categoria": "Categoria",
            "classificacao": "Classificação",
            "status": "Status",
            "dispatch": "Dispatch",
            "acao": "Ação",
        }
        widths = {
            "ticket": 142,
            "cliente": 160,
            "origem": 110,
            "categoria": 150,
            "classificacao": 130,
            "status": 120,
            "dispatch": 132,
            "acao": 150,
        }
        for column in columns:
            tree.heading(column, text=headings[column])
            tree.column(column, width=widths[column], anchor="w")
        tree.grid(row=0, column=0, sticky="nsew")
        tree_scroll = ttk.Scrollbar(table_panel, orient="vertical", command=tree.yview)
        tree_scroll.grid(row=0, column=1, sticky="ns")
        tree.configure(yscrollcommand=tree_scroll.set)
        tree.bind("<<TreeviewSelect>>", self.on_owner_ticket_selected)
        self.owner_tickets_tree = tree

        detail_panel = ttk.LabelFrame(body, text="Detalhe", padding=8, style="Modern.TLabelframe")
        detail_panel.grid(row=0, column=1, sticky="nsew", padx=(8, 0))
        detail_panel.columnconfigure(0, weight=1)
        detail_panel.rowconfigure(0, weight=1)
        self.owner_ticket_detail_text = tk.Text(detail_panel, height=18, wrap="word")
        self.style_text_widget(self.owner_ticket_detail_text)
        self.owner_ticket_detail_text.grid(row=0, column=0, sticky="nsew")
        detail_scroll = ttk.Scrollbar(detail_panel, orient="vertical", command=self.owner_ticket_detail_text.yview)
        detail_scroll.grid(row=0, column=1, sticky="ns")
        self.owner_ticket_detail_text.configure(yscrollcommand=detail_scroll.set)
        self.set_owner_ticket_detail("Atualize para sincronizar backend ou ver cards-ticket locais.")

    def owner_backend_url(self) -> str:
        return str(self.config_data.get("owner_backend_url") or DEFAULT_CONFIG["owner_backend_url"]).strip().rstrip("/")

    def owner_tickets_secret(self) -> str:
        return str(os.environ.get("HBX_OWNER_TICKETS_SECRET") or self.config_data.get("owner_tickets_secret") or "").strip()

    def owner_ticket_status_filter(self) -> str:
        value = self.owner_ticket_filter_var.get().strip()
        return "" if value == "todos" else value

    def owner_ticket_cache_key(self, ticket: dict) -> str:
        return str(
            ticket.get("cacheKey")
            or ticket.get("cardId")
            or ticket.get("ticketCode")
            or ticket.get("id")
            or ""
        )

    def owner_tickets_request(self, path: str, method: str = "GET", payload: dict | None = None) -> dict:
        base_url = self.owner_backend_url()
        secret = self.owner_tickets_secret()
        if not base_url:
            raise RuntimeError("Configure owner_backend_url em Config.")
        if not secret:
            raise RuntimeError("Configure owner_tickets_secret localmente ou HBX_OWNER_TICKETS_SECRET.")

        url = f"{base_url}{path}"
        data = None
        headers = {
            "Accept": "application/json",
            "x-owner-secret": secret,
        }
        if payload is not None:
            data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            headers["Content-Type"] = "application/json; charset=utf-8"
        request = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=12) as response:
                raw = response.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:500]
            raise RuntimeError(f"Backend respondeu {exc.code}: {detail}") from exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise RuntimeError(f"Backend indisponível: {exc}") from exc
        try:
            return json.loads(raw or "{}")
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"Resposta inválida do backend: {raw[:300]}") from exc

    def refresh_owner_tickets(self) -> None:
        status = self.owner_ticket_status_filter()
        query = f"?status={urllib.parse.quote(status)}" if status else ""
        try:
            payload = self.owner_tickets_request(f"/owner/tickets{query}")
        except RuntimeError as exc:
            total = self.load_local_ticket_cards(status)
            message = f"{exc} Mostrando {total} card(s)-ticket locais."
            self.owner_tickets_status_var.set(message)
            self.set_owner_ticket_detail(message)
            return

        tickets = payload.get("tickets") if isinstance(payload, dict) else []
        if not isinstance(tickets, list):
            tickets = []
        synced = self.sync_owner_ticket_cards([ticket for ticket in tickets if isinstance(ticket, dict)])
        visible = self.load_local_ticket_cards(status)
        self.owner_tickets_status_var.set(f"Tickets sincronizados como cards: {visible} visíveis, {synced} atualizados.")

    def load_local_ticket_cards(self, status: str = "", selected_key: str | None = None) -> int:
        if status:
            rows = self.db.fetchall(
                """
                SELECT * FROM kanban_cards
                WHERE (ticket_code <> '' OR LOWER(type) LIKE '%ticket%')
                  AND lane <> 'ARQUIVADO'
                  AND ticket_status = ?
                ORDER BY updated_at DESC, id DESC
                """,
                (status,),
            )
        else:
            rows = self.db.fetchall(
                """
                SELECT * FROM kanban_cards
                WHERE (ticket_code <> '' OR LOWER(type) LIKE '%ticket%')
                  AND lane <> 'ARQUIVADO'
                ORDER BY updated_at DESC, id DESC
                """
            )
        self.owner_tickets_cache = [self.ticket_from_card_row(row) for row in rows]
        self.populate_owner_tickets_tree(selected_key)
        return len(self.owner_tickets_cache)

    def sync_owner_ticket_cards(self, tickets: list[dict]) -> int:
        synced = 0
        for ticket in tickets:
            if self.upsert_owner_ticket_card(ticket):
                synced += 1
        if synced:
            self.refresh_kanban()
        return synced

    def ticket_from_card_row(self, card: sqlite3.Row) -> dict:
        ticket_code = card["ticket_code"] or f"CARD-{card['id']}"
        return {
            "cacheKey": f"card:{card['id']}",
            "cardId": int(card["id"]),
            "id": card["ticket_backend_id"] or f"card:{card['id']}",
            "ticketCode": ticket_code,
            "originChannel": card["ticket_origin"],
            "origin": card["ticket_origin"],
            "category": card["ticket_category"],
            "classification": card["ticket_classification"],
            "status": card["ticket_status"],
            "priority": card["priority"],
            "customerName": card["ticket_customer"],
            "title": card["title"],
            "description": card["description"],
            "codexDispatchStatus": card["ticket_dispatch_status"],
            "codexRunId": card["ticket_codex_run_id"],
            "codexRunUrl": card["ticket_codex_run_url"],
            "githubIssueUrl": card["ticket_github_issue_url"],
            "githubPrNumber": card["ticket_github_pr_number"],
            "githubBranch": card["ticket_github_branch"],
            "lane": card["lane"],
            "updatedAt": card["updated_at"],
            "jobs": [],
        }

    def ticket_initial_lane(self, ticket: dict) -> str:
        status = str(ticket.get("status") or "").strip()
        dispatch = str(ticket.get("codexDispatchStatus") or "").strip()
        classification = str(ticket.get("classification") or "").upper()
        if status == "done" or dispatch == "done":
            return "FEITO"
        if classification == "BUG_BLOCKED" or dispatch == "failed":
            return "HOJE"
        if dispatch == "pr_open":
            return "TESTAR"
        if status == "in_progress" or dispatch in ("dispatched", "running"):
            return "FAZENDO"
        if status == "waiting_codex":
            return "AGUARDANDO CODEX"
        if status in ("new", "triage"):
            return "HOJE"
        return "HOJE"

    def ticket_synced_lane(self, ticket: dict, current_lane: str | None = None) -> str:
        suggested = self.ticket_initial_lane(ticket)
        if current_lane == "ARQUIVADO":
            return current_lane
        if suggested in ("FEITO", "TESTAR", "FAZENDO"):
            return suggested
        if current_lane in KANBAN_LANES and current_lane not in ("BACKLOG", ""):
            return current_lane
        return suggested

    def ticket_card_title(self, ticket: dict) -> str:
        ticket_code = str(ticket.get("ticketCode") or ticket.get("id") or "").strip()
        raw_title = str(ticket.get("title") or ticket.get("description") or "ticket de cliente").strip()
        if ticket_code and raw_title.startswith(ticket_code):
            return raw_title[:180]
        return f"{ticket_code} - {raw_title}"[:180] if ticket_code else raw_title[:180]

    def ticket_card_description(self, ticket: dict) -> str:
        ticket_code = str(ticket.get("ticketCode") or ticket.get("id") or "-")
        return (
            f"Ticket: {ticket_code}\n"
            f"Cliente: {self.ticket_customer_label(ticket)}\n"
            f"Origem: {ticket.get('originChannel') or ticket.get('origin') or '-'}\n"
            f"Categoria: {ticket.get('category') or '-'}\n"
            f"Classificação: {ticket.get('classification') or '-'}\n"
            f"Status ticket: {ticket.get('status') or '-'}\n"
            f"Dispatch: {self.ticket_dispatch_label(ticket)}\n\n"
            f"{ticket.get('description') or ticket.get('lastCustomerMessage') or ticket.get('title') or ''}"
        )

    def ticket_to_card_data(self, ticket: dict, current_lane: str | None = None) -> dict:
        priority = str(ticket.get("priority") or "Alta")
        ticket_code = str(ticket.get("ticketCode") or ticket.get("id") or "").strip()
        base = {
            "title": self.ticket_card_title(ticket),
            "description": self.ticket_card_description(ticket),
            "module": "Retorno",
            "type": "Ticket cliente",
            "priority": priority,
            "lane": self.ticket_synced_lane(ticket, current_lane),
        }
        urgency_level, intelligence_level = self.suggest_card_execution_controls(base)
        return {
            **base,
            "urgency_level": urgency_level,
            "intelligence_level": intelligence_level,
            "codex_model_override": CARD_CODEX_MODEL_DEFAULT,
            "execution_timeout_seconds": self.card_execution_timeout(base),
            "research_path": self.infer_research_path_from_text("Retorno", base["description"]),
            "priority": priority,
            "acceptance_criteria": "Ticket do cliente resolvido ou encaminhado com evidência registrada.",
            "test_command": "cd backend && npm run build",
            "codex_prompt": self.selected_ticket_codex_prompt(ticket),
            "chatgpt_prompt": "Revisar se o ticket cobre causa, impacto e aceite.",
            "estimate_minutes": 60 if priority in ("Alta", "Crítica") else 30,
            "blocked_reason": "",
            "ticket_code": ticket_code,
            "ticket_backend_id": str(ticket.get("id") or "").strip(),
            "ticket_customer": self.ticket_customer_label(ticket),
            "ticket_origin": str(ticket.get("originChannel") or ticket.get("origin") or "").strip(),
            "ticket_category": str(ticket.get("category") or "").strip(),
            "ticket_classification": str(ticket.get("classification") or "").strip(),
            "ticket_status": str(ticket.get("status") or "").strip(),
            "ticket_dispatch_status": self.ticket_dispatch_label(ticket),
            "ticket_codex_run_id": str(ticket.get("codexRunId") or "").strip(),
            "ticket_codex_run_url": str(ticket.get("codexRunUrl") or "").strip(),
            "ticket_github_issue_url": str(ticket.get("githubIssueUrl") or "").strip(),
            "ticket_github_pr_number": str(ticket.get("githubPrNumber") or "").strip(),
            "ticket_github_branch": str(ticket.get("githubBranch") or "").strip(),
            "ticket_synced_at": now_iso(),
        }

    def upsert_owner_ticket_card(self, ticket: dict) -> int | None:
        ticket_code = str(ticket.get("ticketCode") or ticket.get("id") or "").strip()
        if not ticket_code:
            return None
        existing = self.db.fetchone(
            """
            SELECT * FROM kanban_cards
            WHERE ticket_code = ?
            ORDER BY id DESC
            LIMIT 1
            """,
            (ticket_code,),
        )
        data = self.ticket_to_card_data(ticket, existing["lane"] if existing else None)
        if existing:
            done_at = existing["done_at"]
            if data["lane"] == "FEITO" and not done_at:
                done_at = now_iso()
            elif data["lane"] != "FEITO":
                done_at = None
            sort_order = existing["sort_order"]
            if data["lane"] != existing["lane"]:
                sort_order = self.next_lane_sort_order(data["lane"])
            self.db.execute(
                """
                UPDATE kanban_cards
                SET title = ?, description = ?, module = ?, type = ?, priority = ?,
                    urgency_level = ?, intelligence_level = ?, codex_model_override = ?,
                    execution_timeout_seconds = ?, research_path = ?, lane = ?,
                    acceptance_criteria = ?, test_command = ?, codex_prompt = ?, chatgpt_prompt = ?,
                    estimate_minutes = ?, blocked_reason = ?, ticket_backend_id = ?, ticket_customer = ?,
                    ticket_origin = ?, ticket_category = ?, ticket_classification = ?, ticket_status = ?,
                    ticket_dispatch_status = ?, ticket_codex_run_id = ?, ticket_codex_run_url = ?,
                    ticket_github_issue_url = ?, ticket_github_pr_number = ?, ticket_github_branch = ?,
                    ticket_synced_at = ?, sort_order = ?, updated_at = ?, done_at = ?
                WHERE id = ?
                """,
                (
                    data["title"],
                    data["description"],
                    data["module"],
                    data["type"],
                    data["priority"],
                    data["urgency_level"],
                    data["intelligence_level"],
                    data["codex_model_override"],
                    data["execution_timeout_seconds"],
                    data["research_path"],
                    data["lane"],
                    data["acceptance_criteria"],
                    data["test_command"],
                    data["codex_prompt"],
                    data["chatgpt_prompt"],
                    data["estimate_minutes"],
                    data["blocked_reason"],
                    data["ticket_backend_id"],
                    data["ticket_customer"],
                    data["ticket_origin"],
                    data["ticket_category"],
                    data["ticket_classification"],
                    data["ticket_status"],
                    data["ticket_dispatch_status"],
                    data["ticket_codex_run_id"],
                    data["ticket_codex_run_url"],
                    data["ticket_github_issue_url"],
                    data["ticket_github_pr_number"],
                    data["ticket_github_branch"],
                    data["ticket_synced_at"],
                    sort_order,
                    now_iso(),
                    done_at,
                    existing["id"],
                ),
            )
            if data["lane"] != existing["lane"] or data["ticket_status"] != existing["ticket_status"]:
                self.db.execute(
                    "INSERT INTO card_events (card_id, event_type, message, created_at) VALUES (?, 'ticket_sync', ?, ?)",
                    (existing["id"], f"Ticket sincronizado: {ticket_code}.", now_iso()),
                )
            return int(existing["id"])

        card_id = self.insert_kanban_card(data, source="Ticket cliente")
        self.db.execute(
            "INSERT INTO card_events (card_id, event_type, message, created_at) VALUES (?, 'ticket_sync', ?, ?)",
            (card_id, f"Ticket sincronizado como card: {ticket_code}.", now_iso()),
        )
        return card_id

    def merge_ticket_dispatch_payload(self, ticket: dict, payload: dict) -> dict:
        updated = dict(ticket)
        for key in (
            "codexDispatchStatus",
            "codexRunId",
            "codexRunUrl",
            "githubIssueUrl",
            "githubPrNumber",
            "githubBranch",
            "status",
        ):
            value = payload.get(key)
            if value not in (None, ""):
                updated[key] = value
        dispatch = payload.get("codexDispatchStatus")
        if dispatch == "done":
            updated["status"] = "done"
        elif dispatch in ("dispatched", "running", "pr_open"):
            updated["status"] = "in_progress"
        elif dispatch == "failed":
            updated["status"] = "triage"
        elif dispatch == "prompt_copied":
            updated["status"] = "waiting_codex"
        return updated

    def open_selected_ticket_card(self) -> None:
        ticket = self.selected_owner_ticket()
        if not ticket:
            messagebox.showwarning("Tickets", "Selecione um ticket primeiro.")
            return
        card_id = int(ticket.get("cardId") or 0)
        if not card_id:
            synced = self.upsert_owner_ticket_card(ticket)
            card_id = int(synced or 0)
        if not card_id:
            messagebox.showwarning("Tickets", "Não consegui localizar ou criar o card deste ticket.")
            return
        self.refresh_kanban()
        self.selected_card_id = card_id
        self.select_card(card_id)
        self.notebook.select(self.tabs["Kanban"])
        self.owner_tickets_status_var.set(f"Ticket aberto como card #{card_id}.")

    def populate_owner_tickets_tree(self, selected_code: str | None = None) -> None:
        if not self.owner_tickets_tree:
            return
        tree = self.owner_tickets_tree
        for item in tree.get_children():
            tree.delete(item)
        for ticket in self.owner_tickets_cache:
            ticket_code = str(ticket.get("ticketCode") or ticket.get("id") or "")
            if not ticket_code:
                continue
            cache_key = self.owner_ticket_cache_key(ticket)
            tree.insert(
                "",
                "end",
                iid=cache_key,
                values=(
                    ticket_code,
                    self.ticket_customer_label(ticket),
                    str(ticket.get("originChannel") or ticket.get("origin") or "-"),
                    str(ticket.get("category") or "-"),
                    str(ticket.get("classification") or "-"),
                    str(ticket.get("status") or "-"),
                    self.ticket_dispatch_label(ticket),
                    self.ticket_action_label(ticket),
                ),
            )
        if self.owner_tickets_cache:
            target = selected_code or self.owner_ticket_cache_key(self.owner_tickets_cache[0])
            if target:
                tree.selection_set(target)
                tree.focus(target)
                selected_ticket = self.selected_owner_ticket()
                if selected_ticket:
                    self.show_owner_ticket_detail(selected_ticket)

    def on_owner_ticket_selected(self, _event: tk.Event | None = None) -> None:
        ticket = self.selected_owner_ticket()
        if not ticket:
            self.owner_ticket_selected_var.set("Nenhum ticket selecionado.")
            self.set_owner_ticket_detail("")
            return
        self.show_owner_ticket_detail(ticket)

    def selected_owner_ticket(self) -> dict | None:
        if not self.owner_tickets_tree:
            return None
        selected = self.owner_tickets_tree.selection()
        if not selected:
            return None
        key = str(selected[0])
        for ticket in self.owner_tickets_cache:
            if self.owner_ticket_cache_key(ticket) == key:
                return ticket
        return None

    def ticket_customer_label(self, ticket: dict) -> str:
        return str(ticket.get("customerName") or ticket.get("customerPhone") or ticket.get("customerEmail") or "-")

    def ticket_action_label(self, ticket: dict) -> str:
        dispatch = str(ticket.get("codexDispatchStatus") or "")
        status = str(ticket.get("status") or "")
        if ticket.get("cardId"):
            if status == "done":
                return "card concluído"
            if dispatch == "pr_open":
                return "testar card"
            return "abrir card"
        if dispatch == "pr_open":
            return "acompanhar PR"
        if dispatch in ("dispatched", "running"):
            return "acompanhar Codex"
        if dispatch == "failed":
            return "triagem técnica"
        if status == "waiting_codex":
            return "criar task Codex"
        if status == "triage":
            return "triagem técnica"
        if status == "in_progress":
            return "acompanhar execução"
        if status == "done":
            return "validar fechamento"
        return "avaliar"

    def ticket_dispatch_label(self, ticket: dict) -> str:
        return str(ticket.get("codexDispatchStatus") or "not_dispatched")

    def show_owner_ticket_detail(self, ticket: dict) -> None:
        ticket_code = str(ticket.get("ticketCode") or ticket.get("id") or "-")
        self.owner_ticket_selected_var.set(
            f"{ticket_code} | {self.ticket_customer_label(ticket)} | {ticket.get('category') or '-'} | {ticket.get('status') or '-'}"
        )
        jobs = ticket.get("jobs") if isinstance(ticket.get("jobs"), list) else []
        job_lines = [
            f"- {job.get('id')}: {job.get('type')} / {job.get('status')} / {job.get('branch')}"
            for job in jobs
            if isinstance(job, dict)
        ]
        detail = (
            f"Ticket: {ticket_code}\n"
            f"Card local: #{ticket.get('cardId') or '-'}\n"
            f"Cliente: {self.ticket_customer_label(ticket)}\n"
            f"Origem: {ticket.get('originChannel') or ticket.get('origin') or '-'}\n"
            f"Categoria: {ticket.get('category') or '-'}\n"
            f"Classificação: {ticket.get('classification') or '-'}\n"
            f"Status: {ticket.get('status') or '-'}\n"
            f"Prioridade: {ticket.get('priority') or '-'}\n"
            f"Dispatch: {self.ticket_dispatch_label(ticket)}\n"
            f"Codex run: {ticket.get('codexRunId') or '-'}\n"
            f"Codex URL: {ticket.get('codexRunUrl') or '-'}\n"
            f"GitHub issue: {ticket.get('githubIssueUrl') or '-'}\n"
            f"GitHub PR: {ticket.get('githubPrNumber') or '-'}\n"
            f"Branch: {ticket.get('githubBranch') or '-'}\n"
            f"Ação: {self.ticket_action_label(ticket)}\n\n"
            f"Título:\n{ticket.get('title') or '-'}\n\n"
            f"Descrição:\n{ticket.get('description') or '-'}\n\n"
            f"Última mensagem do cliente:\n{ticket.get('lastCustomerMessage') or '-'}\n\n"
            f"Jobs:\n{chr(10).join(job_lines) if job_lines else '-'}"
        )
        self.set_owner_ticket_detail(detail)

    def set_owner_ticket_detail(self, text: str) -> None:
        if not self.owner_ticket_detail_text:
            return
        self.owner_ticket_detail_text.delete("1.0", tk.END)
        self.owner_ticket_detail_text.insert(tk.END, text)

    def selected_ticket_codex_prompt(self, ticket: dict) -> str:
        ticket_code = str(ticket.get("ticketCode") or ticket.get("id") or "-")
        return (
            f"## {ticket_code} — Resolver ticket técnico HBX\n\n"
            "Leia AGENTS.md primeiro.\n\n"
            f"Cliente: {self.ticket_customer_label(ticket)}\n"
            f"Origem: {ticket.get('originChannel') or ticket.get('origin') or '-'}\n"
            f"Categoria: {ticket.get('category') or '-'}\n"
            f"Classificação: {ticket.get('classification') or '-'}\n"
            f"Status: {ticket.get('status') or '-'}\n"
            f"Prioridade: {ticket.get('priority') or '-'}\n\n"
            f"Problema:\n{ticket.get('description') or ticket.get('title') or '-'}\n\n"
            "Objetivo:\n"
            "Investigar e aplicar a menor correção no worktree local, mantendo o fluxo Radar -> Vendas -> WhatsApp -> Retorno e a aprovação registrada no Owner.\n\n"
            "Entrega:\n"
            "- resumo técnico\n"
            "- arquivos alterados\n"
            "- comandos locais rodados\n"
            "- risco residual\n"
        )

    def copy_selected_ticket_codex_prompt(self) -> None:
        ticket = self.selected_owner_ticket()
        if not ticket:
            messagebox.showwarning("Tickets", "Selecione um ticket primeiro.")
            return
        prompt = self.selected_ticket_codex_prompt(ticket)
        self.copy_text(prompt)
        path = self.save_prompt_file("owner-ticket-codex", prompt)
        self.owner_tickets_status_var.set(f"Prompt copiado e salvo em {path}")
        self.set_owner_ticket_detail(prompt)
        self.register_owner_ticket_dispatch(ticket, {"codexDispatchStatus": "prompt_copied"}, silent=True)

    def open_selected_ticket_dispatch_dialog(self) -> None:
        ticket = self.selected_owner_ticket()
        if not ticket:
            messagebox.showwarning("Tickets", "Selecione um ticket primeiro.")
            return

        win = tk.Toplevel(self)
        win.title("Registrar dispatch Codex")
        win.transient(self)
        win.grab_set()
        win.resizable(False, False)
        win.configure(padx=16, pady=16, bg=THEME["bg"])

        fields = [
            ("codexDispatchStatus", "Dispatch", ticket.get("codexDispatchStatus") or "dispatched"),
            ("codexRunId", "Codex run id", ticket.get("codexRunId") or ""),
            ("codexRunUrl", "Codex run URL", ticket.get("codexRunUrl") or ""),
            ("githubIssueUrl", "GitHub issue URL", ticket.get("githubIssueUrl") or ""),
            ("githubPrNumber", "GitHub PR número", ticket.get("githubPrNumber") or ""),
            ("githubBranch", "GitHub branch", ticket.get("githubBranch") or ""),
            ("note", "Nota", ""),
        ]
        values: dict[str, tk.StringVar] = {}
        for row, (key, label, initial) in enumerate(fields):
            ttk.Label(win, text=label).grid(row=row, column=0, sticky="w", padx=(0, 10), pady=5)
            var = tk.StringVar(value=str(initial or ""))
            values[key] = var
            if key == "codexDispatchStatus":
                widget = ttk.Combobox(
                    win,
                    textvariable=var,
                    values=("prompt_copied", "dispatched", "running", "pr_open", "done", "failed"),
                    state="readonly",
                    width=52,
                )
            else:
                widget = ttk.Entry(win, textvariable=var, width=56)
            widget.grid(row=row, column=1, sticky="ew", pady=5)

        def submit() -> None:
            payload = {key: var.get().strip() for key, var in values.items() if var.get().strip()}
            if not payload.get("codexDispatchStatus"):
                payload["codexDispatchStatus"] = "dispatched"
            if self.register_owner_ticket_dispatch(ticket, payload):
                win.destroy()

        buttons = ttk.Frame(win, style="Toolbar.TFrame")
        buttons.grid(row=len(fields), column=0, columnspan=2, sticky="e", pady=(12, 0))
        ttk.Button(buttons, text="Cancelar", command=win.destroy).grid(row=0, column=0, padx=(0, 8))
        ttk.Button(buttons, text="Salvar dispatch", command=submit, style="Success.TButton").grid(row=0, column=1)

    def register_owner_ticket_dispatch(self, ticket: dict, payload: dict, silent: bool = False) -> bool:
        ticket_code = str(ticket.get("ticketCode") or ticket.get("id") or "").strip()
        if not ticket_code:
            if not silent:
                messagebox.showwarning("Tickets", "Ticket sem código para registrar dispatch.")
            return False

        local_ticket = self.merge_ticket_dispatch_payload(ticket, payload)
        local_card_id = self.upsert_owner_ticket_card(local_ticket)
        self.load_local_ticket_cards(self.owner_ticket_status_filter(), f"card:{local_card_id}" if local_card_id else None)
        self.refresh_kanban()

        path = f"/owner/tickets/{urllib.parse.quote(ticket_code, safe='')}/dispatch"
        try:
            response = self.owner_tickets_request(path, method="POST", payload=payload)
        except RuntimeError as exc:
            self.owner_tickets_status_var.set(f"Dispatch salvo no card local. Backend não atualizado: {exc}")
            if not silent:
                messagebox.showwarning("Tickets", f"Dispatch salvo no card local.\nBackend não atualizado:\n{exc}")
            return True

        updated = response.get("ticket") if isinstance(response, dict) else None
        if isinstance(updated, dict):
            updated_card_id = self.upsert_owner_ticket_card(updated)
            self.load_local_ticket_cards(
                self.owner_ticket_status_filter(),
                f"card:{updated_card_id}" if updated_card_id else f"card:{local_card_id}" if local_card_id else None,
            )
            self.refresh_kanban()
        message = f"Dispatch registrado para {ticket_code}."
        self.owner_tickets_status_var.set(message)
        if not silent:
            messagebox.showinfo("Tickets", message)
        return True

    def replace_owner_ticket_cache(self, ticket: dict) -> None:
        key = str(ticket.get("ticketCode") or ticket.get("id") or "")
        if not key:
            return
        card_id = self.upsert_owner_ticket_card(ticket)
        self.load_local_ticket_cards(self.owner_ticket_status_filter(), f"card:{card_id}" if card_id else None)

    def replace_owner_ticket_cache_legacy(self, ticket: dict) -> None:
        key = str(ticket.get("ticketCode") or ticket.get("id") or "")
        if not key:
            return
        replaced = False
        next_cache: list[dict] = []
        for current in self.owner_tickets_cache:
            current_key = str(current.get("ticketCode") or current.get("id") or "")
            if current_key == key:
                next_cache.append(ticket)
                replaced = True
            else:
                next_cache.append(current)
        if not replaced:
            next_cache.insert(0, ticket)
        self.owner_tickets_cache = next_cache

    def create_codex_task_from_selected_ticket(self) -> None:
        self.open_selected_ticket_card()

    def open_tickets_tab(self) -> None:
        self.notebook.select(self.tabs["Tickets"])
        if not self.owner_tickets_cache:
            self.load_local_ticket_cards(self.owner_ticket_status_filter())

    def kanban_action_button(
        self,
        parent: tk.Misc,
        text: str,
        command,
        bg: str,
        fg: str = "#ffffff",
        active_bg: str | None = None,
    ) -> tk.Button:
        button = tk.Button(
            parent,
            text=text,
            command=command,
            bg=bg,
            fg=fg,
            activebackground=active_bg or bg,
            activeforeground=fg,
            relief="flat",
            bd=0,
            padx=13,
            pady=7,
            cursor="hand2",
            font=(self.font_family, 9, "bold"),
        )
        return button

    def kanban_metric_tile(
        self,
        parent: tk.Misc,
        key: str,
        label: str,
        accent: str,
        bg: str,
        column: int,
    ) -> None:
        tile = tk.Frame(parent, bg=bg, highlightthickness=1, highlightbackground="#dbe4ef", padx=10, pady=8)
        tile.grid(row=0, column=column, sticky="ew", padx=(0, 8))
        tile.columnconfigure(1, weight=1)
        self.kanban_summary_vars[key] = tk.StringVar(value="0")
        tk.Frame(tile, bg=accent, width=3).grid(row=0, column=0, rowspan=2, sticky="ns", padx=(0, 8))
        tk.Label(
            tile,
            textvariable=self.kanban_summary_vars[key],
            bg=bg,
            fg="#162033",
            font=(self.font_family, 18, "bold"),
        ).grid(row=0, column=1, sticky="w")
        tk.Label(
            tile,
            text=label,
            bg=bg,
            fg=THEME["muted"],
            font=(self.font_family, 8, "bold"),
        ).grid(row=1, column=1, sticky="w", pady=(1, 0))

    def _build_kanban_tab(self, frame: ttk.Frame) -> None:
        frame.rowconfigure(1, weight=1)
        surface = tk.Frame(frame, bg="#f7f9fc", highlightthickness=1, highlightbackground="#dbe7f3")
        surface.grid(row=0, column=0, rowspan=2, sticky="nsew")
        surface.columnconfigure(0, weight=1)
        surface.rowconfigure(2, weight=1)

        header = tk.Frame(surface, bg="#f7f9fc", padx=18, pady=14)
        header.grid(row=0, column=0, sticky="ew")
        header.columnconfigure(1, weight=1)

        date_panel = tk.Frame(header, bg="#17233a", padx=14, pady=10, highlightthickness=1, highlightbackground="#243b64")
        date_panel.grid(row=0, column=0, sticky="nsw", padx=(0, 14))
        tk.Label(
            date_panel,
            text=datetime.now().strftime("%d").zfill(2),
            bg="#17233a",
            fg="#ffffff",
            font=(self.font_family, 24, "bold"),
        ).grid(row=0, column=0, sticky="w")
        tk.Label(
            date_panel,
            text=datetime.now().strftime("%b").upper(),
            bg="#17233a",
            fg="#d9e8ff",
            font=(self.font_family, 9, "bold"),
        ).grid(row=1, column=0, sticky="w")

        title_area = tk.Frame(header, bg="#f7f9fc")
        title_area.grid(row=0, column=1, sticky="ew")
        title_area.columnconfigure(0, weight=1)
        tk.Label(
            title_area,
            text="Agenda operacional",
            bg="#f7f9fc",
            fg=THEME["text"],
            font=(self.font_family, 20, "bold"),
            anchor="w",
        ).grid(row=0, column=0, sticky="w")
        tk.Label(
            title_area,
            textvariable=self.selected_card_var,
            bg="#f7f9fc",
            fg=THEME["muted"],
            font=(self.font_family, 9),
            anchor="w",
        ).grid(row=1, column=0, sticky="ew", pady=(3, 0))

        actions = tk.Frame(header, bg="#ffffff", highlightthickness=1, highlightbackground="#dbe4ef", padx=6, pady=6)
        actions.grid(row=0, column=2, sticky="e", padx=(14, 0))
        self.kanban_action_button(actions, "Novo", self.create_card, THEME["accent"], active_bg=THEME["accent_hover"]).grid(row=0, column=0, padx=(0, 6))
        self.kanban_action_button(actions, "Codex", self.dispatch_selected_card_to_codex, THEME["success"], active_bg="#0f6b4f").grid(row=0, column=1, padx=(0, 6))
        self.kanban_action_button(actions, "Tudo Hoje", self.move_waiting_cards_to_today, THEME["warning"], active_bg="#92400e").grid(row=0, column=2, padx=(0, 6))
        self.kanban_action_button(actions, "Ordenar #", lambda: self.apply_kanban_order("id"), "#eef3f8", fg="#1b2430", active_bg="#e2e8f0").grid(row=0, column=3, padx=(0, 6))
        self.kanban_action_button(actions, "Ordenar A-Z", lambda: self.apply_kanban_order("title"), "#eef3f8", fg="#1b2430", active_bg="#e2e8f0").grid(row=0, column=4, padx=(0, 6))
        self.kanban_action_button(actions, "Feito", self.mark_card_done, "#eef3f8", fg="#1b2430", active_bg="#e2e8f0").grid(row=0, column=5, padx=(0, 6))
        self.kanban_action_button(actions, "Excluir", self.delete_card, THEME["danger"], active_bg="#9f1c14").grid(row=0, column=6)

        metrics = tk.Frame(surface, bg="#f7f9fc", padx=18, pady=0)
        metrics.grid(row=1, column=0, sticky="ew", pady=(0, 12))
        metric_specs = (
            ("HOJE", "Hoje", LANE_ACCENTS["HOJE"], LANE_TINTS["HOJE"]),
            ("AGUARDANDO CODEX", "Codex", LANE_ACCENTS["AGUARDANDO CODEX"], LANE_TINTS["AGUARDANDO CODEX"]),
            ("TESTAR", "Teste", LANE_ACCENTS["TESTAR"], LANE_TINTS["TESTAR"]),
            ("FEITO", "Feitos", LANE_ACCENTS["FEITO"], LANE_TINTS["FEITO"]),
        )
        self.kanban_summary_vars.clear()
        for col, (key, label, accent, bg) in enumerate(metric_specs):
            metrics.columnconfigure(col, weight=1, uniform="kanban_metrics")
            self.kanban_metric_tile(metrics, key, label, accent, bg, col)

        board = tk.Frame(surface, bg="#e9eff7", padx=10, pady=10)
        board.grid(row=2, column=0, sticky="nsew")
        board.rowconfigure(0, weight=1)
        self.kanban_lane_frames.clear()
        self.kanban_lane_headers.clear()
        self.kanban_card_ids.clear()
        self.kanban_lane_count_vars.clear()
        self.kanban_lane_canvases.clear()

        for col, lane in enumerate(KANBAN_BOARD_LANES):
            board.columnconfigure(col, weight=1, uniform="kanban_board")
            lane_bg = LANE_TINTS.get(lane, THEME["lane"])
            lane_frame = tk.Frame(
                board,
                bg=lane_bg,
                highlightthickness=1,
                highlightbackground="#d8e2ef",
            )
            lane_frame.grid(row=0, column=col, sticky="nsew", padx=(0, 8 if col < len(KANBAN_BOARD_LANES) - 1 else 0))
            lane_frame.columnconfigure(0, weight=1)
            lane_frame.rowconfigure(2, weight=1)
            lane_frame.hbx_lane_name = lane

            accent_color = LANE_ACCENTS.get(lane, THEME["accent"])
            tk.Frame(lane_frame, bg=accent_color, height=3).grid(row=0, column=0, sticky="ew")

            lane_header = tk.Frame(lane_frame, bg=lane_bg, padx=10, pady=8)
            lane_header.grid(row=1, column=0, sticky="ew")
            lane_header.columnconfigure(0, weight=1)
            lane_header.hbx_lane_name = lane
            lane_header.configure(cursor="hand2")
            self.kanban_lane_count_vars[lane] = tk.StringVar(value="0")
            lane_title = tk.Label(
                lane_header,
                text=LANE_LABELS.get(lane, lane),
                bg=lane_bg,
                fg="#15223a",
                font=(self.font_family, 9, "bold"),
                anchor="w",
                cursor="hand2",
            )
            lane_title.grid(row=0, column=0, sticky="w")
            lane_subtitle = tk.Label(
                lane_header,
                text=LANE_SUBTITLES.get(lane, ""),
                bg=lane_bg,
                fg=THEME["muted"],
                font=(self.font_family, 8),
                anchor="w",
                cursor="hand2",
            )
            lane_subtitle.grid(row=1, column=0, sticky="w", pady=(1, 0))
            lane_count = tk.Label(
                lane_header,
                textvariable=self.kanban_lane_count_vars[lane],
                bg="#ffffff",
                fg="#15223a",
                width=3,
                font=(self.font_family, 8, "bold"),
                cursor="hand2",
            )
            lane_count.grid(row=0, column=1, rowspan=2, sticky="e")
            for header_widget in (lane_header, lane_title, lane_subtitle, lane_count):
                header_widget.bind("<Button-1>", lambda _event, lane_name=lane: self.select_lane(lane_name), add="+")

            cards_canvas = tk.Canvas(lane_frame, bg=lane_bg, highlightthickness=0)
            cards_scroll = ttk.Scrollbar(lane_frame, orient="vertical", command=cards_canvas.yview)
            cards_canvas.configure(yscrollcommand=cards_scroll.set)
            cards_canvas.grid(row=2, column=0, sticky="nsew", padx=(0, 1), pady=(0, 8))
            cards_scroll.grid(row=2, column=1, sticky="ns", pady=(0, 8))
            cards_canvas.hbx_lane_name = lane
            cards_canvas.hbx_scroll_canvas = cards_canvas

            cards_frame = tk.Frame(cards_canvas, bg=lane_bg, padx=8, pady=2)
            cards_frame.columnconfigure(0, weight=1)
            cards_frame.hbx_lane_name = lane
            cards_frame.hbx_scroll_canvas = cards_canvas
            cards_window = cards_canvas.create_window((0, 0), window=cards_frame, anchor="nw")

            def sync_lane_scroll(event: tk.Event, canvas_widget: tk.Canvas = cards_canvas, window_id: int = cards_window) -> None:
                canvas_widget.configure(scrollregion=canvas_widget.bbox("all"))
                canvas_widget.itemconfigure(window_id, width=max(80, event.width))

            cards_canvas.bind("<Configure>", sync_lane_scroll)
            cards_frame.bind(
                "<Configure>",
                lambda _event, canvas_widget=cards_canvas: canvas_widget.configure(scrollregion=canvas_widget.bbox("all")),
            )
            self.bind_kanban_scroll(cards_canvas, cards_canvas)
            self.bind_kanban_scroll(cards_frame, cards_canvas)

            for widget in (lane_frame, lane_header, cards_canvas, cards_frame):
                self.register_lane_drop_widgets(widget, lane)
            self.kanban_lane_frames[lane] = cards_frame
            self.kanban_lane_headers[lane] = lane_header
            self.kanban_lane_canvases[lane] = cards_canvas
            self.kanban_card_ids[lane] = []

        self.refresh_kanban()

    def bind_kanban_scroll(self, widget: tk.Widget, canvas: tk.Canvas) -> None:
        widget.hbx_scroll_canvas = canvas
        widget.bind("<MouseWheel>", self.on_kanban_mousewheel, add="+")
        widget.bind("<Button-4>", self.on_kanban_mousewheel, add="+")
        widget.bind("<Button-5>", self.on_kanban_mousewheel, add="+")

    def kanban_scroll_canvas_for_widget(self, widget: tk.Widget) -> tk.Canvas | None:
        current: tk.Widget | None = widget
        while current:
            canvas = getattr(current, "hbx_scroll_canvas", None)
            if isinstance(canvas, tk.Canvas):
                return canvas
            current = current.master
        return None

    def on_kanban_mousewheel(self, event: tk.Event) -> str:
        canvas = self.kanban_scroll_canvas_for_widget(event.widget)
        if not canvas:
            return "break"
        if getattr(event, "num", None) == 4:
            delta = -3
        elif getattr(event, "num", None) == 5:
            delta = 3
        else:
            delta = -1 * int((event.delta or 0) / 120)
            if delta == 0:
                delta = -1 if (event.delta or 0) > 0 else 1
        canvas.yview_scroll(delta, "units")
        return "break"

    def card_display_text(self, card: sqlite3.Row) -> str:
        commit = (card["commit_sha"] or "-")[:7]
        module = card["module"] or "sem módulo"
        estimate = f"{card['estimate_minutes']}min" if card["estimate_minutes"] else "sem estim."
        return f"[{card['priority']}] {module} | {card['title']} | {commit} | {estimate} | {card['lane']}"

    def refresh_kanban(self) -> None:
        if not self.kanban_lane_frames:
            return
        self.kanban_card_widgets.clear()
        visible_counts: dict[str, int] = {}
        for lane, cards_frame in self.kanban_lane_frames.items():
            for child in cards_frame.winfo_children():
                child.destroy()
            cards = self.db.fetchall(
                """
                SELECT * FROM kanban_cards
                WHERE lane = ?
                ORDER BY sort_order ASC, updated_at DESC, id DESC
                """,
                (lane,),
            )
            visible_counts[lane] = len(cards)
            self.kanban_card_ids[lane] = [int(card["id"]) for card in cards]
            if lane in self.kanban_lane_count_vars:
                self.kanban_lane_count_vars[lane].set(str(len(cards)))
            for card in cards:
                self.render_kanban_card(cards_frame, card, lane)
            if not cards:
                empty = tk.Label(
                    cards_frame,
                    text="",
                    bg=LANE_TINTS.get(lane, THEME["lane"]),
                    fg=THEME["muted"],
                    height=6,
                )
                empty.grid(row=0, column=0, sticky="ew")
                empty.hbx_lane_name = lane
                canvas = self.kanban_scroll_canvas_for_widget(cards_frame)
                if canvas:
                    self.bind_kanban_scroll(empty, canvas)
                self.register_lane_drop_widgets(empty, lane)
        for key, var in self.kanban_summary_vars.items():
            var.set(str(visible_counts.get(key, 0)))
        self.apply_kanban_selection()
        self.update_current_card_label()

    def on_card_select(self, lane: str) -> None:
        card_ids = self.kanban_card_ids.get(lane, [])
        if card_ids:
            self.select_card(card_ids[0])

    def select_lane(self, lane: str) -> None:
        if lane not in KANBAN_LANES:
            return
        self.selected_lane = lane
        self.selected_card_id = None
        count = len(self.kanban_card_ids.get(lane, []))
        self.selected_card_var.set(f"Lane selecionada: {LANE_LABELS.get(lane, lane)} ({count} card(s))")
        self.apply_kanban_selection()

    def select_card(self, card_id: int) -> None:
        self.selected_lane = None
        self.selected_card_id = card_id
        card = self.get_card(self.selected_card_id)
        if card:
            self.selected_card_var.set(f"Selecionado #{card['id']}: {card['title']} ({card['lane']})")
        self.apply_kanban_selection()

    def apply_kanban_selection(self) -> None:
        for lane, header in self.kanban_lane_headers.items():
            selected = lane == self.selected_lane
            header.configure(
                highlightthickness=2 if selected else 0,
                highlightbackground=LANE_ACCENTS.get(lane, THEME["accent"]),
            )
        for card_id, widget in self.kanban_card_widgets.items():
            selected = card_id == self.selected_card_id
            widget.configure(
                highlightbackground=THEME["accent"] if selected else THEME["line"],
                highlightthickness=2 if selected else 1,
            )

    def register_lane_drop_widgets(self, widget: tk.Widget, lane: str) -> None:
        widget.hbx_lane_name = lane

    def latest_card_dispatch(self, card_id: int) -> sqlite3.Row | None:
        return self.db.fetchone(
            """
            SELECT * FROM codex_dispatches
            WHERE card_id = ?
            ORDER BY id DESC
            LIMIT 1
            """,
            (card_id,),
        )

    def dispatch_status_label(self, status: str) -> str:
        labels = {
            "queued": "na fila",
            "running": "rodando",
            "done": "concluído",
            "needs_review": "aguardando owner",
            "failed": "falhou",
            "cancelled": "parado",
        }
        return labels.get(str(status or "").strip(), str(status or "-"))

    def dispatch_card_summary(self, dispatch: sqlite3.Row, card: sqlite3.Row) -> tuple[str, str, str]:
        status = str(dispatch["status"] or "")
        commit = str(dispatch["commit_sha"] or card["commit_sha"] or "")
        branch = str(dispatch["branch"] or "-")
        error = str(dispatch["error"] or "").strip()
        if error:
            first_line = re.sub(r"\s+", " ", error.splitlines()[0]).strip()
        elif status == "running":
            first_line = f"iniciado {dispatch['started_at'] or dispatch['created_at']}"
        else:
            first_line = "sem detalhe registrado"
        if len(first_line) > 120:
            first_line = first_line[:117].rstrip() + "..."
        paths: list[str] = []
        for label, key in (("log", "output_path"), ("msg", "last_message_path"), ("prompt", "prompt_path")):
            value = str(dispatch[key] or "").strip()
            if value:
                paths.append(f"{label}: {Path(value).name}")
        details = " | ".join(paths[:3])
        model = str(dispatch["model"] or self.card_codex_model(card) or "padrão")
        intelligence = str(dispatch["intelligence_level"] or self.card_value(card, "intelligence_level", "") or "-")
        text = (
            f"{self.dispatch_status_label(status)} | {intelligence} | {model}\n"
            f"{first_line}"
        )
        if status == "running":
            return text, THEME["lane_hover"], THEME["accent"]
        if status == "needs_review":
            return text, "#faf5ff", "#7e22ce"
        if status == "done" or commit:
            return text, THEME["soft_success"], THEME["success"]
        if status == "failed":
            return text, THEME["soft_danger"], THEME["danger"]
        if status == "cancelled":
            return text, "#eef3f8", THEME["muted"]
        return text, THEME["soft_warning"], THEME["warning"]

    def card_status_badge(self, card: sqlite3.Row, dispatch: sqlite3.Row | None) -> tuple[str, str, str]:
        if dispatch:
            status = str(dispatch["status"] or "")
            if status == "needs_review":
                return "?", "#faf5ff", "#7e22ce"
            if status == "failed":
                return "!", THEME["soft_danger"], THEME["danger"]
            if status == "running":
                return ">", THEME["lane_hover"], THEME["accent"]
            if status == "cancelled":
                return "x", "#eef3f8", THEME["muted"]
        return "", "", ""

    def render_kanban_card(self, parent: tk.Frame, card: sqlite3.Row, lane: str) -> None:
        card_id = int(card["id"])
        priority = str(card["priority"] or "Média")
        accent = PRIORITY_ACCENTS.get(priority, THEME["accent"])
        module = str(card["module"] or "HBX")
        estimate = f"{card['estimate_minutes']}m" if int(card["estimate_minutes"] or 0) else "sem hora"
        commit = (str(card["commit_sha"] or "")[:7] or "-")
        ticket_code = str(card["ticket_code"] or "")
        urgency_level = self.normalize_urgency_level(self.card_value(card, "urgency_level", ""), priority)
        intelligence_level = self.normalize_intelligence_level(self.card_value(card, "intelligence_level", ""), card)
        model_label = self.card_codex_model(card) or "padrão"
        dispatch = self.latest_card_dispatch(card_id)

        row_index = len(parent.winfo_children())
        shell = tk.Frame(
            parent,
            bg="#d5deeb",
            highlightthickness=1,
            highlightbackground="#dce6f2",
            padx=0,
            pady=0,
            cursor="hand2",
        )
        shell.grid(row=row_index, column=0, sticky="ew", pady=(0, 9))
        shell.columnconfigure(1, weight=1)
        shell.hbx_lane_name = lane
        shell.hbx_card_id = card_id
        shell.hbx_scroll_canvas = self.kanban_scroll_canvas_for_widget(parent)

        tk.Frame(shell, bg=accent, width=4).grid(row=0, column=0, sticky="ns", pady=(0, 2))
        body = tk.Frame(shell, bg=THEME["card"], padx=9, pady=8)
        body.grid(row=0, column=1, sticky="ew", padx=(0, 1), pady=(0, 2))
        body.columnconfigure(0, weight=1)
        body.hbx_lane_name = lane
        body.hbx_card_id = card_id

        meta = tk.Frame(body, bg=THEME["card"])
        meta.grid(row=0, column=0, sticky="ew")
        meta.columnconfigure(0, weight=1)
        meta.columnconfigure(1, weight=0)
        meta.columnconfigure(2, weight=0)
        tk.Label(
            meta,
            text=f"#{card_id}",
            bg="#f3f6fb",
            fg=accent,
            padx=6,
            pady=2,
            font=(self.font_family, 8, "bold"),
        ).grid(row=0, column=0, sticky="w")
        tk.Label(
            meta,
            text=f"{priority}  {estimate}",
            bg=THEME["card"],
            fg=THEME["muted"],
            font=(self.font_family, 8),
        ).grid(row=0, column=1, sticky="e")
        badge_text, badge_bg, badge_fg = self.card_status_badge(card, dispatch)
        if badge_text:
            tk.Label(
                meta,
                text=badge_text,
                bg=badge_bg,
                fg=badge_fg,
                width=2,
                padx=4,
                pady=2,
                font=(self.font_family, 8, "bold"),
            ).grid(row=0, column=2, sticky="e", padx=(6, 0))

        title_label = tk.Label(
            body,
            text=str(card["title"] or "Card sem título"),
            bg=THEME["card"],
            fg=THEME["text"],
            justify="left",
            anchor="w",
            wraplength=155,
            font=(self.font_family, 9, "bold"),
        )
        title_label.grid(row=1, column=0, sticky="ew", pady=(6, 3))

        detail = tk.Label(
            body,
            text=(
                f"{module} | {ticket_code or card['ticket_customer'] or card['ticket_status'] or lane}"
                if ticket_code
                else f"{module} | commit {commit}"
            ),
            bg=THEME["card"],
            fg=THEME["muted"],
            justify="left",
            anchor="w",
            wraplength=155,
            font=(self.font_family, 8),
        )
        detail.grid(row=2, column=0, sticky="ew")
        next_row = 3

        intelligence = tk.Label(
            body,
            text=f"{urgency_level} | {intelligence_level} | {model_label}",
            bg="#f3f6fb",
            fg="#243449",
            justify="left",
            anchor="w",
            wraplength=155,
            padx=6,
            pady=3,
            font=(self.font_family, 8, "bold"),
        )
        intelligence.grid(row=next_row, column=0, sticky="ew", pady=(6, 0))
        next_row += 1

        if dispatch:
            dispatch_text, dispatch_bg, dispatch_fg = self.dispatch_card_summary(dispatch, card)
            dispatch_label = tk.Label(
                body,
                text=dispatch_text,
                bg=dispatch_bg,
                fg=dispatch_fg,
                justify="left",
                anchor="w",
                wraplength=155,
                padx=6,
                pady=3,
                font=(self.font_family, 8, "bold"),
            )
            dispatch_label.grid(row=next_row, column=0, sticky="ew", pady=(6, 0))
            next_row += 1

        if card["commit_sha"]:
            commit_label = tk.Label(
                body,
                text=f"commit {str(card['commit_sha'])[:7]}",
                bg="#f3f6fb",
                fg=THEME["text"],
                justify="left",
                anchor="w",
                wraplength=155,
                padx=6,
                pady=3,
                font=(self.font_family, 8, "bold"),
            )
            commit_label.grid(row=next_row, column=0, sticky="ew", pady=(6, 0))
            next_row += 1

        if card["blocked_reason"]:
            blocked_text = str(card["blocked_reason"])
            if len(blocked_text) > 140:
                blocked_text = blocked_text[:137].rstrip() + "..."
            block = tk.Label(
                body,
                text=blocked_text,
                bg=THEME["soft_danger"],
                fg=THEME["danger"],
                justify="left",
                anchor="w",
                wraplength=155,
                padx=6,
                pady=3,
                font=(self.font_family, 8, "bold"),
            )
            block.grid(row=next_row, column=0, sticky="ew", pady=(6, 0))

        for widget in (shell, body, meta, title_label, detail, intelligence):
            self.register_card_drag_widgets(widget, card_id, lane)
        for child in meta.winfo_children():
            self.register_card_drag_widgets(child, card_id, lane)
        if dispatch:
            self.register_card_drag_widgets(dispatch_label, card_id, lane)
        if card["commit_sha"]:
            self.register_card_drag_widgets(commit_label, card_id, lane)
        if card["blocked_reason"]:
            self.register_card_drag_widgets(block, card_id, lane)

        self.kanban_card_widgets[card_id] = shell
        self.apply_kanban_selection()

    def register_card_drag_widgets(self, widget: tk.Widget, card_id: int, lane: str) -> None:
        widget.hbx_card_id = card_id
        widget.hbx_lane_name = lane
        canvas = self.kanban_scroll_canvas_for_widget(widget)
        if canvas:
            self.bind_kanban_scroll(widget, canvas)
        widget.bind("<ButtonPress-1>", self.start_kanban_drag, add="+")
        widget.bind("<B1-Motion>", self.move_kanban_drag, add="+")
        widget.bind("<ButtonRelease-1>", self.release_kanban_drag, add="+")
        widget.bind("<Double-Button-1>", self.open_card_detail_from_event, add="+")

    def delete_card(self, card_id: int | None = None) -> None:
        target_id = card_id or self.selected_card_id
        card = self.get_card(target_id)
        if not card:
            messagebox.showwarning("Excluir card", "Selecione um card para excluir.")
            return
        confirmed = messagebox.askyesno(
            "Excluir card",
            f"Excluir definitivamente o card #{card['id']}?\n\n{card['title']}\n\n"
            "Isso remove o card local do Kanban e limpa eventos/dispatches ligados a ele.",
        )
        if not confirmed:
            return
        deleted_id = int(card["id"])
        self.db.execute("UPDATE chatgpt_exchanges SET card_id = NULL WHERE card_id = ?", (deleted_id,))
        self.db.execute("DELETE FROM card_events WHERE card_id = ?", (deleted_id,))
        self.db.execute("DELETE FROM codex_dispatches WHERE card_id = ?", (deleted_id,))
        self.db.execute("DELETE FROM kanban_cards WHERE id = ?", (deleted_id,))
        if self.selected_card_id == deleted_id:
            self.selected_card_id = None
        if self.current_card_id == deleted_id:
            self.current_card_id = None
        self.selected_card_var.set(f"Card #{deleted_id} excluído.")
        self.update_current_card_label()
        self.refresh_kanban()

    def start_kanban_drag(self, event: tk.Event) -> None:
        widget = event.widget
        card_id = getattr(widget, "hbx_card_id", None)
        lane = getattr(widget, "hbx_lane_name", None)
        if not card_id or not lane:
            return
        self.select_card(int(card_id))
        self.kanban_drag = {
            "card_id": int(card_id),
            "source_lane": str(lane),
            "target_lane": str(lane),
        }

    def move_kanban_drag(self, event: tk.Event) -> None:
        if not self.kanban_drag:
            return
        target = self.find_lane_under_pointer(event.x_root, event.y_root)
        if target:
            self.kanban_drag["target_lane"] = target

    def release_kanban_drag(self, event: tk.Event) -> None:
        if not self.kanban_drag:
            return
        card_id = int(self.kanban_drag["card_id"])
        source_lane = str(self.kanban_drag["source_lane"])
        target_lane = self.find_lane_under_pointer(event.x_root, event.y_root) or str(self.kanban_drag["target_lane"])
        self.kanban_drag = None
        if target_lane not in KANBAN_LANES or target_lane == source_lane:
            return
        self.update_card_lane(card_id, target_lane, f"Arrastado de {source_lane} para {target_lane}.")
        self.select_card(card_id)

    def find_lane_under_pointer(self, x_root: int, y_root: int) -> str | None:
        widget = self.winfo_containing(x_root, y_root)
        while widget:
            lane = getattr(widget, "hbx_lane_name", None)
            if lane:
                return str(lane)
            widget = widget.master
        return None

    def get_card(self, card_id: int | None) -> sqlite3.Row | None:
        if not card_id:
            return None
        return self.db.fetchone("SELECT * FROM kanban_cards WHERE id = ?", (card_id,))

    def require_selected_card(self) -> sqlite3.Row | None:
        card = self.get_card(self.selected_card_id)
        if not card:
            messagebox.showwarning("Kanban", "Selecione um card primeiro.")
            return None
        return card

    def card_value(self, data: dict | sqlite3.Row | None, key: str, default: object = "") -> object:
        if not data:
            return default
        if isinstance(data, sqlite3.Row):
            return data[key] if key in data.keys() else default
        return data.get(key, default)

    def sanitize_card_type(self, value: object, fallback: str = "Operacional") -> str:
        clean = str(value or "").strip()
        legacy_ai_label = "modo" + " ia"
        if self.normalize_card_title_key(clean) == legacy_ai_label:
            return fallback
        return clean or fallback

    def normalize_urgency_level(self, value: object, priority: object = "") -> str:
        clean = str(value or "").strip()
        if clean in URGENCY_LEVELS:
            return clean
        priority_clean = str(priority or "").strip()
        if priority_clean == "Crítica":
            return "Crítica"
        if priority_clean == "Alta":
            return "Alta"
        if priority_clean == "Baixa":
            return "Baixa"
        return "Normal"

    def normalize_intelligence_level(self, value: object, data: dict | sqlite3.Row | None = None) -> str:
        clean = str(value or "").strip()
        if clean in INTELLIGENCE_LEVELS:
            return clean
        key = self.normalize_card_title_key(clean)
        aliases = {
            "local rapido": "Média",
            "medio": "Média",
            "media": "Média",
            "medium": "Média",
            "spark rapido": "High",
            "alta": "High",
            "alto": "High",
            "high": "High",
            "spark longo": "Extra high",
            "extra alto": "Extra high",
            "extra alta": "Extra high",
            "extra high": "Extra high",
            "muito alto": "Extra high",
            "muito alta": "Extra high",
            "revisao humana": "Extra high",
            "humana": "Extra high",
        }
        if key in aliases:
            return aliases[key]
        _urgency, suggested = self.suggest_card_execution_controls(data or {})
        return suggested

    def suggest_card_execution_controls(self, data: dict | sqlite3.Row | None) -> tuple[str, str]:
        priority = str(self.card_value(data, "priority", "Média") or "Média").strip()
        lane = str(self.card_value(data, "lane", "") or "")
        text = " ".join(
            str(self.card_value(data, key, "") or "")
            for key in (
                "title",
                "description",
                "module",
                "type",
                "priority",
                "lane",
                "blocked_reason",
                "test_command",
                "codex_prompt",
                "chatgpt_prompt",
            )
        )
        normalized = self.normalize_card_title_key(text)
        sensitive = self.autocard_has_sensitive_terms(text)
        if sensitive:
            return "Crítica", "Extra high"
        if priority == "Crítica":
            return "Crítica", "Extra high"
        if any(term in normalized for term in ("multi area", "arquitetura", "worker", "fila", "integracao", "integração")):
            return "Alta", "Extra high"
        if priority == "Alta" or lane in ("HOJE", "AGUARDANDO CODEX") or any(
            term in normalized for term in ("ticket", "cliente", "bug", "erro", "falha", "whatsapp", "p0")
        ):
            return "Alta", "High"
        if priority == "Baixa" or any(
            term in normalized for term in ("readme", "documentacao", "documentação", "texto", "label", "copy", "limpeza")
        ):
            return "Baixa", "Média"
        return "Normal", "Média"

    def infer_research_path_from_text(self, module: object, text: object = "") -> str:
        module_key = self.normalize_card_title_key(str(module or ""))
        combined = self.normalize_card_title_key(f"{module or ''} {text or ''}")
        if "backend" in module_key or any(term in combined for term in ("api", "nest", "prisma", "worker", "fila")):
            return "Pesquisar primeiro em backend/src, backend/package.json e backend/prisma quando existir."
        if "frontend" in module_key or any(term in combined for term in ("next", "react", "tela", "ui", "interface")):
            return "Pesquisar primeiro em frontend/src e nos componentes/telas relacionados."
        if "owner" in module_key or "codex" in combined or "chatgpt" in combined:
            return "Pesquisar primeiro em hbx-owner/windows-app/hbx_owner_app.py, hbx-owner/windows-app/README.md e docs relacionados."
        if "whatsapp" in module_key or "whatsapp" in combined:
            return "Pesquisar primeiro em Webwhats, backend/src e telas de atendimento/retorno relacionadas."
        if "radar" in module_key or any(term in combined for term in ("lead", "leads", "oportunidade", "email discovery")):
            return "Pesquisar primeiro em backend/src e frontend/src buscando por Radar, leads e oportunidades com rg."
        if "retorno" in module_key or any(term in combined for term in ("ticket", "suporte", "inbound", "cliente")):
            return "Pesquisar primeiro em backend/src, frontend/src e fluxos de Retorno/Tickets com rg."
        if "vendas" in module_key or any(term in combined for term in ("vendas", "comercial", "outbound", "demo", "campanha")):
            return "Pesquisar primeiro em frontend/src e backend/src buscando por Vendas, campanha, outbound e demo."
        return "Pesquisar primeiro com rg pelo título do card, módulo e termos-chave antes de editar qualquer arquivo."

    def card_research_path(self, data: dict | sqlite3.Row) -> str:
        existing = str(self.card_value(data, "research_path", "") or "").strip()
        if existing:
            return existing
        return self.infer_research_path_from_text(
            self.card_value(data, "module", ""),
            " ".join(
                str(self.card_value(data, key, "") or "")
                for key in ("title", "description", "type", "codex_prompt", "chatgpt_prompt")
            ),
        )

    def card_execution_timeout(self, data: dict | sqlite3.Row | None) -> int:
        try:
            value = int(float(str(self.card_value(data, "execution_timeout_seconds", 0) or 0)))
        except ValueError:
            value = 0
        if value > 0:
            return max(30, min(value, 3600))
        intelligence = str(self.card_value(data, "intelligence_level", "") or "")
        if intelligence == "Extra high":
            return 300
        if intelligence == "High":
            return 180
        return 120

    def card_codex_model(self, data: dict | sqlite3.Row | None) -> str:
        override = normalize_codex_model_value(self.card_value(data, "codex_model_override", ""))
        if override:
            return override
        global_model = normalize_codex_model_value(self.config_data.get("codex_model"))
        if global_model:
            return global_model
        return self.routed_codex_model(data)

    def routed_codex_model(self, data: dict | sqlite3.Row | None) -> str:
        fast_model = normalize_codex_model_value(self.config_data.get("codex_model_fast") or DEFAULT_CONFIG["codex_model_fast"])
        deep_model = normalize_codex_model_value(self.config_data.get("codex_model_deep") or DEFAULT_CONFIG["codex_model_deep"])
        priority = str(self.card_value(data, "priority", "") or "").strip()
        intelligence = self.normalize_intelligence_level(self.card_value(data, "intelligence_level", ""), data)
        text = self.normalize_card_title_key(
            " ".join(
                str(self.card_value(data, key, "") or "")
                for key in ("title", "description", "module", "type", "priority", "lane", "test_command", "research_path")
            )
        )
        deep_terms = (
            "critica",
            "multi area",
            "backend frontend",
            "integracao",
            "arquitetura",
            "worker",
            "fila",
            "prisma",
            "schema",
            "runtime",
            "radar",
            "vendas",
            "pagamento",
            "comercial",
        )
        if intelligence == "Extra high" or priority == "Crítica" or any(term in text for term in deep_terms):
            return deep_model or fast_model
        return fast_model

    def open_card_detail_from_event(self, event: tk.Event) -> None:
        card_id = getattr(event.widget, "hbx_card_id", None)
        if not card_id:
            return
        self.select_card(int(card_id))
        self.open_card_detail(int(card_id))

    def open_selected_card_detail(self) -> None:
        card = self.require_selected_card()
        if not card:
            return
        self.open_card_detail(int(card["id"]))

    def build_card_detail_text(self, card: sqlite3.Row) -> str:
        dispatch = self.latest_card_dispatch(int(card["id"]))
        events = self.db.fetchall(
            """
            SELECT event_type, message, created_at
            FROM card_events
            WHERE card_id = ?
            ORDER BY id DESC
            LIMIT 30
            """,
            (card["id"],),
        )
        urgency = self.normalize_urgency_level(self.card_value(card, "urgency_level", ""), card["priority"])
        intelligence = self.normalize_intelligence_level(self.card_value(card, "intelligence_level", ""), card)
        model = self.card_codex_model(card) or "padrão"
        timeout = self.card_execution_timeout(card)
        sections = [
            f"Card #{card['id']} - {card['title']}",
            "",
            "EXECUÇÃO",
            f"Lane: {card['lane']}",
            f"Prioridade: {card['priority']}",
            f"Urgência: {urgency}",
            f"Inteligência: {intelligence}",
            f"Modelo Codex: {model}",
            f"Timeout alvo: {timeout}s",
            f"Módulo: {card['module'] or '-'}",
            f"Tipo: {self.sanitize_card_type(card['type'], 'Operacional')}",
            f"Estimativa: {card['estimate_minutes'] or 0} min",
            f"Commit: {card['commit_sha'] or '-'}",
            "",
            "CAMINHO DE PESQUISA",
            self.card_research_path(card),
            "",
            "DESCRIÇÃO",
            str(card["description"] or "-"),
            "",
            "CRITÉRIO DE ACEITE",
            str(card["acceptance_criteria"] or "-"),
            "",
            "TESTE SUGERIDO",
            str(card["test_command"] or "-"),
            "",
            "PROMPT CODEX",
            str(card["codex_prompt"] or "-"),
            "",
            "PROMPT CHATGPT",
            str(card["chatgpt_prompt"] or "-"),
            "",
            "BLOQUEIO / CUIDADO",
            str(card["blocked_reason"] or "-"),
        ]
        if dispatch:
            sections.extend(
                [
                    "",
                    "ÚLTIMO DISPATCH CODEX",
                    f"Status: {self.dispatch_status_label(str(dispatch['status'] or ''))}",
                    f"Branch: {dispatch['branch'] or '-'}",
                    f"Modelo: {dispatch['model'] or model}",
                    f"Inteligência: {dispatch['intelligence_level'] or intelligence}",
                    f"Worktree: {dispatch['worktree_path'] or '-'}",
                    f"Prompt: {dispatch['prompt_path'] or '-'}",
                    f"Log: {dispatch['output_path'] or '-'}",
                    f"Última resposta: {dispatch['last_message_path'] or '-'}",
                    f"Commit: {dispatch['commit_sha'] or '-'}",
                    f"Erro/detalhe: {dispatch['error'] or '-'}",
                ]
            )
        if events:
            sections.extend(["", "HISTÓRICO"])
            for event in events:
                message = re.sub(r"\s+", " ", str(event["message"] or "")).strip()
                sections.append(f"- {event['created_at']} | {event['event_type']} | {message}")
        return "\n".join(sections)

    def read_text_file_tail(self, path_value: object, limit: int = 5000) -> str:
        path_text = str(path_value or "").strip()
        if not path_text:
            return ""
        try:
            text = Path(path_text).read_text(encoding="utf-8", errors="replace")
        except OSError:
            return ""
        return text[-limit:]

    def build_codex_conversation_text(self, card: sqlite3.Row, dispatch: sqlite3.Row | None) -> str:
        if not dispatch:
            return (
                "Sem execução Codex ainda.\n\n"
                "Quando este card for enviado para Codex, esta área mostra o que ele está fazendo, "
                "a pergunta que ele fizer, erro, última resposta e caminhos de log."
            )
        status = str(dispatch["status"] or "")
        signal = {
            "queued": "... Codex está na fila",
            "running": "> Codex está rodando",
            "needs_review": "? Codex pediu resposta; card voltou para Hoje",
            "failed": "! Codex encontrou erro",
            "done": "OK Codex concluiu",
            "cancelled": "x Codex foi parado",
        }.get(status, f"Status: {self.dispatch_status_label(status)}")
        lines = [
            signal,
            "",
            f"Status: {self.dispatch_status_label(status)}",
            f"Branch: {dispatch['branch'] or '-'}",
            f"Modelo: {dispatch['model'] or self.card_codex_model(card) or 'padrão'}",
            f"PID: {dispatch['process_id'] or '-'}",
            f"Iniciado: {dispatch['started_at'] or '-'}",
            f"Finalizado: {dispatch['finished_at'] or '-'}",
            f"Commit: {dispatch['commit_sha'] or card['commit_sha'] or '-'}",
        ]
        error = str(dispatch["error"] or "").strip()
        if error:
            lines.extend(["", "MENSAGEM DO SISTEMA", error])
        last_message = self.read_text_file_tail(dispatch["last_message_path"], limit=3500).strip()
        if last_message:
            lines.extend(["", "ÚLTIMA RESPOSTA DO CODEX", last_message])
        output_tail = self.read_text_file_tail(dispatch["output_path"], limit=3500).strip()
        if output_tail and output_tail != last_message:
            lines.extend(["", "TRECHO DO LOG", output_tail])
        lines.extend(
            [
                "",
                "ARQUIVOS",
                f"Prompt: {dispatch['prompt_path'] or '-'}",
                f"Log: {dispatch['output_path'] or '-'}",
                f"Última resposta: {dispatch['last_message_path'] or '-'}",
            ]
        )
        return "\n".join(lines)

    def open_card_detail(self, card_id: int) -> None:
        card = self.get_card(card_id)
        if not card:
            messagebox.showwarning("Card", "Card não encontrado.")
            return
        win = tk.Toplevel(self)
        win.title(f"Card #{card['id']} - detalhes")
        win.transient(self)
        win.geometry("1080x760")
        win.minsize(860, 600)
        win.configure(padx=16, pady=16, bg=THEME["bg"])
        win.columnconfigure(0, weight=1)
        win.rowconfigure(0, weight=1)

        notebook = ttk.Notebook(win)
        notebook.grid(row=0, column=0, sticky="nsew")

        detail_tab = ttk.Frame(notebook, style="App.TFrame")
        codex_tab = ttk.Frame(notebook, style="App.TFrame")
        history_tab = ttk.Frame(notebook, style="App.TFrame")
        notebook.add(detail_tab, text="Resumo")
        notebook.add(codex_tab, text="Codex")
        notebook.add(history_tab, text="Histórico")

        detail_tab.columnconfigure(0, weight=1)
        detail_tab.rowconfigure(0, weight=1)
        frame = ttk.LabelFrame(detail_tab, text="Detalhe completo", padding=8, style="Modern.TLabelframe")
        frame.grid(row=0, column=0, sticky="nsew")
        frame.columnconfigure(0, weight=1)
        frame.rowconfigure(0, weight=1)
        text = tk.Text(frame, wrap="word")
        self.style_text_widget(text)
        text.insert("1.0", self.build_card_detail_text(card))
        text.configure(state="disabled")
        text.grid(row=0, column=0, sticky="nsew")
        scroll = ttk.Scrollbar(frame, orient="vertical", command=text.yview)
        scroll.grid(row=0, column=1, sticky="ns")
        text.configure(yscrollcommand=scroll.set)

        codex_tab.columnconfigure(0, weight=1)
        codex_tab.rowconfigure(1, weight=1)
        guide = (
            "Codex\n"
            "- ? aparece automaticamente quando o Codex pede resposta do Owner.\n"
            "- ! aparece automaticamente quando o Codex ou a execução registra erro.\n"
            "- A caixa de diretiva abaixo serve para responder ou guiar a próxima tentativa."
        )
        guide_label = tk.Label(
            codex_tab,
            text=guide,
            bg=THEME["panel"],
            fg=THEME["text"],
            justify="left",
            anchor="w",
            padx=10,
            pady=8,
            font=(self.font_family, 9),
        )
        guide_label.grid(row=0, column=0, sticky="ew", pady=(0, 10))

        latest_dispatch = self.latest_card_dispatch(int(card["id"]))
        status_frame = ttk.LabelFrame(codex_tab, text="Status e mensagens do Codex", padding=8, style="Modern.TLabelframe")
        status_frame.grid(row=1, column=0, sticky="nsew")
        status_frame.columnconfigure(0, weight=1)
        status_frame.rowconfigure(0, weight=1)
        status_text = tk.Text(status_frame, height=14, wrap="word")
        self.style_text_widget(status_text)
        status_text.insert("1.0", self.build_codex_conversation_text(card, latest_dispatch))
        status_text.configure(state="disabled")
        status_text.grid(row=0, column=0, sticky="nsew")
        status_scroll = ttk.Scrollbar(status_frame, orient="vertical", command=status_text.yview)
        status_scroll.grid(row=0, column=1, sticky="ns")
        status_text.configure(yscrollcommand=status_scroll.set)

        def refresh_codex_panel() -> None:
            if not win.winfo_exists():
                return
            current_card = self.get_card(int(card["id"]))
            current_dispatch = self.latest_card_dispatch(int(card["id"]))
            if current_card:
                status_text.configure(state="normal")
                status_text.delete("1.0", tk.END)
                status_text.insert("1.0", self.build_codex_conversation_text(current_card, current_dispatch))
                status_text.configure(state="disabled")
                status_text.see(tk.END)
            win.after(2500, refresh_codex_panel)

        win.after(2500, refresh_codex_panel)

        directive_frame = ttk.LabelFrame(codex_tab, text="Diretiva para o próximo Codex", padding=8, style="Modern.TLabelframe")
        directive_frame.grid(row=2, column=0, sticky="ew", pady=(10, 0))
        directive_frame.columnconfigure(0, weight=1)
        directive_text = tk.Text(directive_frame, height=6, wrap="word")
        self.style_text_widget(directive_text)
        if latest_dispatch and str(latest_dispatch["status"] or "") == "needs_review":
            error_text = str(latest_dispatch["error"] or "")
            if error_text:
                directive_text.insert("1.0", f"Resposta para o Codex:\n\n{error_text.splitlines()[0]}\n")
        directive_text.grid(row=0, column=0, sticky="nsew")
        directive_scroll = ttk.Scrollbar(directive_frame, orient="vertical", command=directive_text.yview)
        directive_scroll.grid(row=0, column=1, sticky="ns")
        directive_text.configure(yscrollcommand=directive_scroll.set)

        prompt_frame = ttk.LabelFrame(codex_tab, text="Prompt base que será enviado", padding=8, style="Modern.TLabelframe")
        prompt_frame.grid(row=3, column=0, sticky="ew", pady=(10, 0))
        prompt_frame.columnconfigure(0, weight=1)
        prompt_preview = tk.Text(prompt_frame, height=7, wrap="word")
        self.style_text_widget(prompt_preview)
        prompt_preview.insert("1.0", self.build_codex_dispatch_prompt(card, self.codex_branch_for_card(card)))
        prompt_preview.configure(state="disabled")
        prompt_preview.grid(row=0, column=0, sticky="ew")
        prompt_scroll = ttk.Scrollbar(prompt_frame, orient="vertical", command=prompt_preview.yview)
        prompt_scroll.grid(row=0, column=1, sticky="ns")
        prompt_preview.configure(yscrollcommand=prompt_scroll.set)

        history_tab.columnconfigure(0, weight=1)
        history_tab.rowconfigure(0, weight=1)
        history_text = tk.Text(history_tab, wrap="word")
        self.style_text_widget(history_text)
        events = self.db.fetchall(
            "SELECT event_type, message, created_at FROM card_events WHERE card_id = ? ORDER BY id DESC LIMIT 80",
            (int(card["id"]),),
        )
        history_text.insert(
            "1.0",
            "\n".join(
                f"- {row['created_at']} | {row['event_type']} | {re.sub(r'\\s+', ' ', str(row['message'] or '')).strip()}"
                for row in events
            )
            or "Sem histórico.",
        )
        history_text.configure(state="disabled")
        history_text.grid(row=0, column=0, sticky="nsew")
        history_scroll = ttk.Scrollbar(history_tab, orient="vertical", command=history_text.yview)
        history_scroll.grid(row=0, column=1, sticky="ns")
        history_text.configure(yscrollcommand=history_scroll.set)

        actions = ttk.Frame(win, style="Toolbar.TFrame")
        actions.grid(row=1, column=0, sticky="e", pady=(12, 0))

        def edit_and_close() -> None:
            win.destroy()
            self.selected_card_id = int(card["id"])
            self.edit_card()

        def dispatch_and_close() -> None:
            win.destroy()
            self.selected_card_id = int(card["id"])
            self.dispatch_selected_card_to_codex()

        def add_directive(rerun: bool) -> None:
            directive = directive_text.get("1.0", tk.END).strip()
            if not directive:
                messagebox.showwarning("Codex", "Escreva uma diretiva antes de enviar.", parent=win)
                return
            self.db.execute(
                "INSERT INTO card_events (card_id, event_type, message, created_at) VALUES (?, 'owner_directive', ?, ?)",
                (int(card["id"]), directive, now_iso()),
            )
            self.db.execute("UPDATE kanban_cards SET updated_at = ? WHERE id = ?", (now_iso(), int(card["id"])))
            if rerun:
                win.destroy()
                self.update_card_lane(int(card["id"]), "AGUARDANDO CODEX", "Diretiva do Owner enviada para Codex.")
            else:
                self.refresh_kanban()
                messagebox.showinfo("Codex", "Diretiva registrada no card.", parent=win)

        def stop_and_close() -> None:
            if self.stop_card_codex(int(card["id"]), parent=win):
                win.destroy()

        ttk.Button(actions, text="Parar", command=stop_and_close, style="Warning.TButton").grid(
            row=0, column=0, padx=(0, 8)
        )
        ttk.Button(actions, text="Salvar diretiva", command=lambda: add_directive(False)).grid(
            row=0, column=1, padx=(0, 8)
        )
        ttk.Button(actions, text="Responder e rodar", command=lambda: add_directive(True), style="Success.TButton").grid(
            row=0, column=2, padx=(0, 8)
        )
        ttk.Button(actions, text="Editar", command=edit_and_close, style="Accent.TButton").grid(
            row=0, column=3, padx=(0, 8)
        )
        ttk.Button(actions, text="Disparar Codex", command=dispatch_and_close, style="Success.TButton").grid(
            row=0, column=4, padx=(0, 8)
        )
        ttk.Button(actions, text="Fechar", command=win.destroy).grid(row=0, column=5)

    def show_card_form(self, title: str, card: sqlite3.Row | None = None) -> dict | None:
        win = tk.Toplevel(self)
        win.title(title)
        win.transient(self)
        win.grab_set()
        win.geometry("1060x780")
        win.minsize(820, 640)
        win.resizable(True, True)
        win.configure(padx=16, pady=16, bg=THEME["bg"])
        win.columnconfigure(0, weight=1)
        win.rowconfigure(2, weight=1)

        initial: dict[str, object] = {
            "title": self.card_value(card, "title", ""),
            "description": self.card_value(card, "description", ""),
            "module": self.card_value(card, "module", ""),
            "type": self.sanitize_card_type(self.card_value(card, "type", ""), "Operacional"),
            "priority": self.card_value(card, "priority", "Média"),
            "lane": self.card_value(card, "lane", "HOJE"),
            "acceptance_criteria": self.card_value(card, "acceptance_criteria", ""),
            "test_command": self.card_value(card, "test_command", ""),
            "codex_prompt": self.card_value(card, "codex_prompt", ""),
            "chatgpt_prompt": self.card_value(card, "chatgpt_prompt", ""),
            "estimate_minutes": str(self.card_value(card, "estimate_minutes", 30 if not card else 0) or 0),
            "blocked_reason": self.card_value(card, "blocked_reason", ""),
            "codex_model_override": self.card_value(card, "codex_model_override", ""),
            "execution_timeout_seconds": str(self.card_value(card, "execution_timeout_seconds", 0) or ""),
            "research_path": self.card_research_path(card) if card else "",
        }
        suggested_urgency, suggested_intelligence = self.suggest_card_execution_controls(initial)
        initial["urgency_level"] = self.normalize_urgency_level(
            self.card_value(card, "urgency_level", suggested_urgency), initial["priority"]
        )
        initial["intelligence_level"] = self.normalize_intelligence_level(
            self.card_value(card, "intelligence_level", suggested_intelligence), initial
        )
        if not initial["research_path"]:
            initial["research_path"] = self.infer_research_path_from_text(initial["module"], initial["description"])

        header = ttk.Frame(win, style="Toolbar.TFrame")
        header.grid(row=0, column=0, sticky="ew", pady=(0, 10))
        header.columnconfigure(1, weight=1)
        ttk.Label(header, text="Título", style="CardMuted.TLabel").grid(row=0, column=0, sticky="w", padx=(0, 10))
        values: dict[str, tk.StringVar] = {
            "title": tk.StringVar(value=str(initial["title"] or "")),
            "module": tk.StringVar(value=str(initial["module"] or "")),
            "type": tk.StringVar(value=str(initial["type"] or "")),
            "priority": tk.StringVar(value=str(initial["priority"] or "Média")),
            "lane": tk.StringVar(value=str(initial["lane"] or "HOJE")),
            "urgency_level": tk.StringVar(value=str(initial["urgency_level"] or "Normal")),
            "intelligence_level": tk.StringVar(value=str(initial["intelligence_level"] or "Média")),
            "codex_model_override": tk.StringVar(value=str(initial["codex_model_override"] or CARD_CODEX_MODEL_DEFAULT)),
            "execution_timeout_seconds": tk.StringVar(value=str(initial["execution_timeout_seconds"] or "")),
            "estimate_minutes": tk.StringVar(value=str(initial["estimate_minutes"] or "0")),
            "test_command": tk.StringVar(value=str(initial["test_command"] or "")),
        }
        ttk.Entry(header, textvariable=values["title"]).grid(row=0, column=1, sticky="ew")

        meta = ttk.LabelFrame(win, text="Controle de execução", padding=10, style="Modern.TLabelframe")
        meta.grid(row=1, column=0, sticky="ew", pady=(0, 10))
        for column in range(8):
            meta.columnconfigure(column, weight=1 if column in (1, 3, 5, 7) else 0)
        meta_fields = (
            ("module", "Módulo", ttk.Entry, {}),
            ("type", "Tipo", ttk.Combobox, {"values": ("Operacional", "Ticket cliente", "ChatGPT", "PDF", "Bug", "Frontend", "Backend", "Docs")}),
            ("priority", "Prioridade", ttk.Combobox, {"values": ("Baixa", "Média", "Alta", "Crítica")}),
            ("urgency_level", "Urgência", ttk.Combobox, {"values": URGENCY_LEVELS}),
            ("lane", "Lane", ttk.Combobox, {"values": KANBAN_BOARD_LANES + ("ARQUIVADO",), "state": "readonly"}),
            ("intelligence_level", "Inteligência", ttk.Combobox, {"values": INTELLIGENCE_LEVELS, "state": "readonly"}),
            ("codex_model_override", "Modelo Codex opcional", ttk.Entry, {}),
            ("execution_timeout_seconds", "Timeout s", ttk.Entry, {}),
            ("estimate_minutes", "Estimativa min", ttk.Entry, {}),
        )
        for index, (key, label, widget_class, kwargs) in enumerate(meta_fields):
            row = index // 3
            base_col = (index % 3) * 2
            ttk.Label(meta, text=label, style="CardMuted.TLabel").grid(
                row=row, column=base_col, sticky="w", padx=(0, 8), pady=5
            )
            widget_kwargs = dict(kwargs)
            if widget_class is ttk.Combobox and "state" not in widget_kwargs:
                widget_kwargs["state"] = "readonly"
            widget = widget_class(meta, textvariable=values[key], **widget_kwargs)
            widget.grid(row=row, column=base_col + 1, sticky="ew", padx=(0, 14), pady=5)

        body = ttk.Frame(win, style="App.TFrame")
        body.grid(row=2, column=0, sticky="nsew")
        body.columnconfigure(0, weight=1)
        body.columnconfigure(1, weight=1)
        body.rowconfigure(0, weight=2)
        body.rowconfigure(1, weight=1)
        body.rowconfigure(2, weight=1)

        text_widgets: dict[str, tk.Text] = {}

        def add_text(area: ttk.Frame, key: str, label: str, value: object, row: int, column: int, height: int) -> None:
            frame = ttk.LabelFrame(area, text=label, padding=8, style="Modern.TLabelframe")
            frame.grid(row=row, column=column, sticky="nsew", padx=(0, 8) if column == 0 else (8, 0), pady=(0, 10))
            frame.columnconfigure(0, weight=1)
            frame.rowconfigure(0, weight=1)
            widget = tk.Text(frame, height=height, wrap="word")
            self.style_text_widget(widget)
            widget.insert("1.0", str(value or ""))
            widget.grid(row=0, column=0, sticky="nsew")
            scroll = ttk.Scrollbar(frame, orient="vertical", command=widget.yview)
            scroll.grid(row=0, column=1, sticky="ns")
            widget.configure(yscrollcommand=scroll.set)
            text_widgets[key] = widget

        add_text(body, "description", "Descrição grande do card", initial["description"], 0, 0, 12)
        add_text(body, "research_path", "Caminho de pesquisa obrigatório para IA", initial["research_path"], 0, 1, 12)
        add_text(body, "acceptance_criteria", "Critério de aceite", initial["acceptance_criteria"], 1, 0, 6)
        add_text(body, "codex_prompt", "Prompt Codex", initial["codex_prompt"], 1, 1, 6)
        add_text(body, "chatgpt_prompt", "Prompt ChatGPT", initial["chatgpt_prompt"], 2, 0, 5)
        add_text(body, "blocked_reason", "Evidência / cuidado", initial["blocked_reason"], 2, 1, 5)

        test_frame = ttk.LabelFrame(win, text="Teste sugerido", padding=8, style="Modern.TLabelframe")
        test_frame.grid(row=3, column=0, sticky="ew", pady=(0, 10))
        test_frame.columnconfigure(0, weight=1)
        ttk.Entry(test_frame, textvariable=values["test_command"]).grid(row=0, column=0, sticky="ew")

        result: dict | None = None

        def save() -> None:
            nonlocal result
            title_value = values["title"].get().strip()
            if not title_value:
                messagebox.showerror("Card", "Título é obrigatório.", parent=win)
                return
            try:
                estimate = int(values["estimate_minutes"].get() or 0)
            except ValueError:
                messagebox.showerror("Card", "Estimativa precisa ser número inteiro.", parent=win)
                return
            try:
                timeout = int(float(str(values["execution_timeout_seconds"].get() or 0)))
            except ValueError:
                messagebox.showerror("Card", "Timeout precisa ser número inteiro.", parent=win)
                return
            result = {key: var.get().strip() for key, var in values.items()}
            for key, widget in text_widgets.items():
                result[key] = widget.get("1.0", tk.END).strip()
            result["estimate_minutes"] = max(0, estimate)
            result["execution_timeout_seconds"] = max(0, timeout)
            result["type"] = self.sanitize_card_type(result.get("type"), "Operacional")
            if result.get("lane") == "BACKLOG":
                result["lane"] = "HOJE"
            result["urgency_level"] = self.normalize_urgency_level(result.get("urgency_level"), result.get("priority"))
            result["intelligence_level"] = self.normalize_intelligence_level(result.get("intelligence_level"), result)
            result["codex_model_override"] = normalize_codex_model_value(result.get("codex_model_override"))
            if not result.get("research_path"):
                result["research_path"] = self.infer_research_path_from_text(
                    result.get("module"), f"{result.get('title')} {result.get('description')}"
                )
            win.destroy()

        actions = ttk.Frame(win)
        actions.grid(row=4, column=0, sticky="e")
        ttk.Button(actions, text="Cancelar", command=win.destroy).grid(row=0, column=0, padx=(0, 8))
        ttk.Button(actions, text="Salvar", command=save).grid(row=0, column=1)
        win.wait_window()
        return result

    def create_card(self) -> None:
        if not self.can_create_new_card():
            return
        data = self.show_card_form("Criar card")
        if not data:
            return
        cur = self.db.execute(
            """
            INSERT INTO kanban_cards
            (date, title, description, module, type, priority, urgency_level, intelligence_level,
             codex_model_override, execution_timeout_seconds, research_path, lane, acceptance_criteria,
             test_command, codex_prompt, chatgpt_prompt, estimate_minutes, blocked_reason,
             created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                today_str(),
                data["title"],
                data["description"],
                data["module"],
                data["type"],
                data["priority"],
                data["urgency_level"],
                data["intelligence_level"],
                data["codex_model_override"],
                data["execution_timeout_seconds"],
                data["research_path"],
                data["lane"],
                data["acceptance_criteria"],
                data["test_command"],
                data["codex_prompt"],
                data["chatgpt_prompt"],
                data["estimate_minutes"],
                data["blocked_reason"],
                now_iso(),
                now_iso(),
            ),
        )
        card_id = int(cur.lastrowid)
        self.db.execute(
            "INSERT INTO card_events (card_id, event_type, message, created_at) VALUES (?, 'created', ?, ?)",
            (card_id, "Card criado manualmente.", now_iso()),
        )
        self.selected_card_id = card_id
        self.refresh_kanban()

    def edit_card(self) -> None:
        card = self.require_selected_card()
        if not card:
            return
        data = self.show_card_form("Editar card", card)
        if not data:
            return
        done_at = card["done_at"]
        if data["lane"] == "FEITO" and not done_at:
            done_at = now_iso()
        elif data["lane"] != "FEITO":
            done_at = None
        self.db.execute(
            """
            UPDATE kanban_cards
            SET title = ?, description = ?, module = ?, type = ?, priority = ?, urgency_level = ?,
                intelligence_level = ?, codex_model_override = ?, execution_timeout_seconds = ?,
                research_path = ?, lane = ?,
                acceptance_criteria = ?, test_command = ?, codex_prompt = ?, chatgpt_prompt = ?,
                estimate_minutes = ?, blocked_reason = ?, updated_at = ?, done_at = ?
            WHERE id = ?
            """,
            (
                data["title"],
                data["description"],
                data["module"],
                data["type"],
                data["priority"],
                data["urgency_level"],
                data["intelligence_level"],
                data["codex_model_override"],
                data["execution_timeout_seconds"],
                data["research_path"],
                data["lane"],
                data["acceptance_criteria"],
                data["test_command"],
                data["codex_prompt"],
                data["chatgpt_prompt"],
                data["estimate_minutes"],
                data["blocked_reason"],
                now_iso(),
                done_at,
                card["id"],
            ),
        )
        self.db.execute(
            "INSERT INTO card_events (card_id, event_type, message, created_at) VALUES (?, 'edited', ?, ?)",
            (card["id"], "Card editado.", now_iso()),
        )
        self.refresh_kanban()

    def update_card_lane(self, card_id: int, lane: str, message: str) -> None:
        previous = self.get_card(card_id)
        previous_lane = str(previous["lane"] or "") if previous else ""
        done_at = now_iso() if lane == "FEITO" else None
        next_order = self.next_lane_sort_order(lane)
        self.db.execute(
            "UPDATE kanban_cards SET lane = ?, sort_order = ?, updated_at = ?, done_at = ? WHERE id = ?",
            (lane, next_order, now_iso(), done_at, card_id),
        )
        self.db.execute(
            "INSERT INTO card_events (card_id, event_type, message, created_at) VALUES (?, 'moved', ?, ?)",
            (card_id, message, now_iso()),
        )
        if lane == "AGUARDANDO CODEX" and previous_lane != "AGUARDANDO CODEX":
            self.dispatch_card_to_codex(card_id, trigger=message)
        self.refresh_kanban()

    def next_lane_sort_order(self, lane: str) -> int:
        row = self.db.fetchone("SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM kanban_cards WHERE lane = ?", (lane,))
        return int(row["max_order"] or 0) + 10 if row else 10

    def move_waiting_cards_to_today(self) -> None:
        rows = self.db.fetchall(
            """
            SELECT * FROM kanban_cards
            WHERE lane = 'AGUARDANDO CODEX'
            ORDER BY lane, sort_order ASC, id ASC
            """
        )
        moved = 0
        skipped_running = 0
        for card in rows:
            latest = self.latest_card_dispatch(int(card["id"]))
            if latest and str(latest["status"] or "") == "running":
                skipped_running += 1
                continue
            if latest and str(latest["status"] or "") == "queued":
                self.update_codex_dispatch(
                    int(latest["id"]),
                    status="cancelled",
                    error="Fila cancelada por Tudo Hoje.",
                    finished_at=now_iso(),
                )
            next_order = self.next_lane_sort_order("HOJE")
            self.db.execute(
                "UPDATE kanban_cards SET lane = 'HOJE', sort_order = ?, updated_at = ?, done_at = NULL WHERE id = ?",
                (next_order, now_iso(), int(card["id"])),
            )
            self.db.execute(
                "INSERT INTO card_events (card_id, event_type, message, created_at) VALUES (?, 'moved', ?, ?)",
                (int(card["id"]), "Movido para Hoje por Tudo Hoje.", now_iso()),
            )
            moved += 1
        self.refresh_kanban()
        self.execution_status_var.set(f"Tudo Hoje: {moved} card(s) movido(s), {skipped_running} rodando ignorado(s).")

    def apply_kanban_order(self, mode: str) -> None:
        for lane in KANBAN_LANES:
            if lane == "BACKLOG":
                continue
            if mode == "title":
                rows = self.db.fetchall(
                    "SELECT id, title FROM kanban_cards WHERE lane = ? ORDER BY lower(title) ASC, id ASC",
                    (lane,),
                )
            else:
                rows = self.db.fetchall(
                    "SELECT id, title FROM kanban_cards WHERE lane = ? ORDER BY id ASC",
                    (lane,),
                )
            for index, row in enumerate(rows, start=1):
                self.db.execute(
                    "UPDATE kanban_cards SET sort_order = ?, updated_at = updated_at WHERE id = ?",
                    (index * 10, int(row["id"])),
                )
        self.refresh_kanban()
        self.execution_status_var.set("Kanban ordenado por título." if mode == "title" else "Kanban ordenado por número.")

    def move_card(self) -> None:
        card = self.require_selected_card()
        if not card:
            return
        lane = simpledialog.askstring("Mover card", f"Nova lane:\n{', '.join(KANBAN_LANES)}", initialvalue=card["lane"])
        if not lane:
            return
        lane = lane.strip().upper()
        if lane not in KANBAN_LANES:
            messagebox.showerror("Mover card", "Lane inválida.")
            return
        self.update_card_lane(card["id"], lane, f"Movido de {card['lane']} para {lane}.")

    def mark_card_done(self) -> None:
        card = self.require_selected_card()
        if not card:
            return
        actual = simpledialog.askinteger("Feito", "Tempo real em minutos:", initialvalue=card["actual_minutes"] or 0)
        if actual is not None:
            self.db.execute(
                "UPDATE kanban_cards SET actual_minutes = ?, updated_at = ? WHERE id = ?",
                (max(0, actual), now_iso(), card["id"]),
            )
        self.update_card_lane(card["id"], "FEITO", "Card marcado como feito.")

    def resolve_codex_cli_path(self) -> str:
        configured = str(self.config_data.get("codex_cli_path") or DEFAULT_CONFIG["codex_cli_path"]).strip()
        candidate = configured or "codex"
        if Path(candidate).name.lower() not in ("codex", "codex.exe"):
            return ""
        if Path(candidate).is_absolute():
            return candidate if Path(candidate).exists() else ""
        return self.find_codex_cli(candidate)

    def find_codex_cli(self, candidate: str = "codex") -> str:
        found = shutil.which(candidate) or shutil.which("codex.exe")
        if found:
            return found
        extension_root = Path.home() / ".vscode" / "extensions"
        if extension_root.exists():
            matches = sorted(
                extension_root.glob("openai.chatgpt-*/bin/windows-x86_64/codex.exe"),
                key=lambda item: item.stat().st_mtime,
                reverse=True,
            )
            for match in matches:
                if match.exists():
                    return str(match)
        return ""

    def codex_worktree_root(self, ensure: bool = False) -> Path:
        configured = str(self.config_data.get("codex_worktree_dir") or DEFAULT_CONFIG["codex_worktree_dir"]).strip()
        root = Path(configured).expanduser()
        if not root.is_absolute():
            root = self.repo_path() / root
        root = root.resolve()
        if ensure:
            root.mkdir(parents=True, exist_ok=True)
        return root

    def card_branch_slug(self, card: sqlite3.Row) -> str:
        title = self.normalize_card_title_key(str(card["title"] or "card"))
        title = re.sub(r"[^a-z0-9]+", "-", title).strip("-")
        return title[:48] or "card"

    def codex_branch_for_card(self, card: sqlite3.Row) -> str:
        return f"owner/card-{card['id']}-{self.card_branch_slug(card)}"

    def codex_worktree_for_branch(self, branch: str, ensure_root: bool = False) -> Path:
        root = self.codex_worktree_root(ensure=ensure_root)
        name = re.sub(r"[^A-Za-z0-9._-]+", "-", branch).strip(".-").lower()
        target = (root / name).resolve()
        if target != root and root not in target.parents:
            raise RuntimeError(f"worktree Codex fora do diretório permitido: {target}")
        return target

    def codex_max_parallel_dispatches(self) -> int:
        try:
            value = int(float(str(self.config_data.get("codex_max_parallel_dispatches", 1) or 1)))
        except ValueError:
            value = 1
        return max(1, min(value, 20))

    def codex_sandbox_mode(self) -> str:
        value = str(
            self.config_data.get("codex_sandbox_mode") or DEFAULT_CONFIG["codex_sandbox_mode"]
        ).strip()
        allowed = {"read-only", "workspace-write", "danger-full-access"}
        return value if value in allowed else ""

    def codex_running_dispatch_count(self) -> int:
        row = self.db.fetchone("SELECT COUNT(*) AS total FROM codex_dispatches WHERE status = 'running'")
        return int(row["total"] or 0) if row else 0

    def get_codex_dispatch(self, dispatch_id: int) -> sqlite3.Row | None:
        return self.db.fetchone("SELECT * FROM codex_dispatches WHERE id = ? LIMIT 1", (dispatch_id,))

    def dispatch_card_to_codex(self, card_id: int, trigger: str = "lane") -> bool:
        card = self.get_card(card_id)
        if not card:
            return False
        intelligence_level = self.normalize_intelligence_level(self.card_value(card, "intelligence_level", ""), card)
        model = self.card_codex_model(card)

        latest = self.latest_card_dispatch(card_id)
        if latest and str(latest["status"]) in ("queued", "running"):
            self.execution_status_var.set(f"Card #{card_id} já está na fila Codex.")
            return False

        codex_path = self.resolve_codex_cli_path()
        if not codex_path:
            prompt = self.build_codex_dispatch_prompt(card, "")
            path = self.save_prompt_file(f"card-{card_id}-codex-dispatch", prompt)
            self.copy_text(prompt)
            self.db.execute(
                "INSERT INTO card_events (card_id, event_type, message, created_at) VALUES (?, 'codex_prepared', ?, ?)",
                (card_id, f"Codex CLI não encontrado. Prompt copiado: {path}", now_iso()),
            )
            self.execution_status_var.set("Codex CLI não encontrado. Prompt copiado para execução manual.")
            return False

        repo = self.repo_path()
        if not repo.exists():
            self.execution_status_var.set(f"repo_path não existe: {repo}")
            return False

        ok, base_sha = self.run_hidden_command(["git", "rev-parse", "HEAD"], repo, timeout=20)
        if not ok:
            self.execution_status_var.set(f"Não consegui ler HEAD para dispatch Codex: {base_sha}")
            return False
        base_sha = base_sha.strip()
        branch = self.codex_branch_for_card(card)
        try:
            worktree = self.codex_worktree_for_branch(branch, ensure_root=True)
        except RuntimeError as exc:
            self.execution_status_var.set(str(exc))
            return False

        if not worktree.exists():
            ok, branch_exists = self.run_hidden_command(["git", "show-ref", "--verify", f"refs/heads/{branch}"], repo, timeout=20)
            if ok:
                ok, worktree_output = self.run_hidden_command(["git", "worktree", "add", str(worktree), branch], repo, timeout=120)
            else:
                ok, worktree_output = self.run_hidden_command(
                    ["git", "worktree", "add", "-b", branch, str(worktree), "HEAD"],
                    repo,
                    timeout=120,
                )
            if not ok:
                self.execution_status_var.set(f"Falha ao criar worktree Codex: {worktree_output}")
                return False

        dispatch_dir = APP_DIR / "codex-dispatches"
        dispatch_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        prompt_path = dispatch_dir / f"{stamp}-card-{card_id}-prompt.md"
        output_path = dispatch_dir / f"{stamp}-card-{card_id}-output.log"
        last_message_path = dispatch_dir / f"{stamp}-card-{card_id}-last-message.md"
        prompt = self.build_codex_dispatch_prompt(card, branch)
        prompt_path.write_text(prompt, encoding="utf-8")

        dispatch_id = self.insert_codex_dispatch(
            card_id=card_id,
            status="queued",
            branch=branch,
            worktree_path=worktree,
            prompt_path=prompt_path,
            output_path=output_path,
            last_message_path=last_message_path,
            base_sha=base_sha,
            model=model,
            intelligence_level=intelligence_level,
        )
        self.db.execute(
            "INSERT INTO card_events (card_id, event_type, message, created_at) VALUES (?, 'codex_queued', ?, ?)",
            (
                card_id,
                f"Card entrou na fila Codex por {trigger}. Paralelo: {self.codex_running_dispatch_count()}/{self.codex_max_parallel_dispatches()}.",
                now_iso(),
            ),
        )
        self.execution_status_var.set(f"Card #{card_id} entrou na fila Codex.")
        started = self.start_queued_codex_dispatches()
        if started == 0:
            self.refresh_kanban()
        return True

    def start_codex_dispatch_process(self, dispatch: sqlite3.Row) -> bool:
        card_id = int(dispatch["card_id"])
        card = self.get_card(card_id)
        if not card:
            self.update_codex_dispatch(int(dispatch["id"]), status="failed", error="card não encontrado", finished_at=now_iso())
            return False

        codex_path = self.resolve_codex_cli_path()
        if not codex_path:
            self.update_codex_dispatch(
                int(dispatch["id"]),
                status="failed",
                error="Codex CLI não encontrado ao iniciar fila",
                finished_at=now_iso(),
            )
            self.execution_status_var.set("Codex CLI não encontrado para iniciar a fila.")
            return False

        worktree = Path(dispatch["worktree_path"])
        prompt_path = Path(dispatch["prompt_path"])
        output_path = Path(dispatch["output_path"])
        last_message_path = Path(dispatch["last_message_path"])
        if not worktree.exists() or not prompt_path.exists():
            self.update_codex_dispatch(
                int(dispatch["id"]),
                status="failed",
                error="worktree ou prompt não encontrado ao iniciar fila",
                finished_at=now_iso(),
            )
            return False

        command = [
            codex_path,
            "exec",
            "--cd",
            str(worktree),
            "-o",
            str(last_message_path),
        ]
        sandbox_mode = self.codex_sandbox_mode()
        if sandbox_mode:
            command.extend(["--sandbox", sandbox_mode])
        model = normalize_codex_model_value(dispatch["model"] or self.card_codex_model(card))
        if model:
            command.extend(["--model", model])
        command.append("-")

        prompt_handle = None
        output_handle = None
        try:
            prompt_handle = prompt_path.open("r", encoding="utf-8")
            output_handle = output_path.open("w", encoding="utf-8")
            process = subprocess.Popen(
                command,
                cwd=worktree,
                stdin=prompt_handle,
                stdout=output_handle,
                stderr=subprocess.STDOUT,
                text=True,
                creationflags=self.hidden_creation_flags(),
            )
        except OSError as exc:
            self.update_codex_dispatch(int(dispatch["id"]), status="failed", error=str(exc), finished_at=now_iso())
            self.execution_status_var.set(f"Falha ao iniciar Codex: {exc}")
            return False
        finally:
            if prompt_handle:
                prompt_handle.close()
            if output_handle:
                output_handle.close()

        intelligence_level = str(dispatch["intelligence_level"] or self.card_value(card, "intelligence_level", "") or "")
        self.codex_processes[int(dispatch["id"])] = process
        self.update_codex_dispatch(int(dispatch["id"]), status="running", process_id=process.pid, started_at=now_iso())
        self.record_ai_usage_event("normal", model=model or "default", context=f"card:{card_id}:{intelligence_level}")
        self.refresh_usage_hud()
        branch = str(dispatch["branch"] or "")
        self.db.execute(
            "INSERT INTO card_events (card_id, event_type, message, created_at) VALUES (?, 'codex_started', ?, ?)",
            (
                card_id,
                f"Codex iniciado em {branch} pela fila. PID {process.pid}. Inteligência: {intelligence_level}. Modelo: {model or 'padrão'}.",
                now_iso(),
            ),
        )
        self.execution_status_var.set(f"Codex iniciado para card #{card_id}: {branch}")
        return True

    def start_queued_codex_dispatches(self) -> int:
        capacity = self.codex_max_parallel_dispatches() - self.codex_running_dispatch_count()
        if capacity <= 0:
            return 0
        rows = self.db.fetchall(
            "SELECT * FROM codex_dispatches WHERE status = 'queued' ORDER BY id ASC LIMIT ?",
            (capacity,),
        )
        started = 0
        for row in rows:
            if self.start_codex_dispatch_process(row):
                started += 1
        if started:
            self.refresh_kanban()
        return started

    def dispatch_failed_by_retryable_runtime_config(self, dispatch: sqlite3.Row | None) -> bool:
        if not dispatch:
            return False
        model = str(dispatch["model"] or "").strip()
        if model in UNSUPPORTED_CODEX_MODEL_VALUES:
            return True
        error = str(dispatch["error"] or "")
        if "model is not supported" in error or "invalid_request_error" in error:
            return True
        output_tail = self.read_codex_dispatch_output(dispatch, limit=2000)
        if "model is not supported" in output_tail or "invalid_request_error" in output_tail:
            return True
        combined = f"{error}\n{output_tail}"
        return (
            "windows sandbox: spawn setup refresh" in combined
            and "sandbox: workspace-write" in combined
            and self.codex_sandbox_mode() != "workspace-write"
        )

    def queue_waiting_codex_cards(self) -> int:
        rows = self.db.fetchall(
            """
            SELECT * FROM kanban_cards
            WHERE lane = 'AGUARDANDO CODEX'
            ORDER BY sort_order ASC, updated_at ASC, id ASC
            LIMIT 50
            """
        )
        queued = 0
        for card in rows:
            latest = self.latest_card_dispatch(int(card["id"]))
            if latest and str(latest["status"]) in ("queued", "running"):
                continue
            if latest and str(latest["status"]) == "failed" and not self.dispatch_failed_by_retryable_runtime_config(latest):
                continue
            if self.dispatch_card_to_codex(int(card["id"]), trigger="fila automática"):
                queued += 1
        return queued

    def insert_codex_dispatch(
        self,
        card_id: int,
        status: str,
        branch: str,
        worktree_path: Path,
        prompt_path: Path,
        output_path: Path,
        last_message_path: Path,
        base_sha: str,
        model: str = "",
        intelligence_level: str = "",
    ) -> int:
        cur = self.db.execute(
            """
            INSERT INTO codex_dispatches
            (card_id, status, branch, worktree_path, prompt_path, output_path, last_message_path,
             base_sha, model, intelligence_level, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                card_id,
                status,
                branch,
                str(worktree_path),
                str(prompt_path),
                str(output_path),
                str(last_message_path),
                base_sha,
                model,
                intelligence_level,
                now_iso(),
                now_iso(),
            ),
        )
        return int(cur.lastrowid)

    def update_codex_dispatch(self, dispatch_id: int, **fields: object) -> None:
        if not fields:
            return
        fields["updated_at"] = now_iso()
        assignments = ", ".join(f"{key} = ?" for key in fields)
        values = tuple(fields.values()) + (dispatch_id,)
        self.db.execute(f"UPDATE codex_dispatches SET {assignments} WHERE id = ?", values)

    def card_owner_directives_text(self, card_id: int) -> str:
        rows = self.db.fetchall(
            """
            SELECT event_type, message, created_at
            FROM card_events
            WHERE card_id = ?
              AND event_type IN ('owner_directive', 'owner_answer')
            ORDER BY id DESC
            LIMIT 8
            """,
            (card_id,),
        )
        if not rows:
            return ""
        lines = []
        for row in reversed(rows):
            message = re.sub(r"\s+", " ", str(row["message"] or "")).strip()
            if message:
                lines.append(f"- {row['created_at']} | {row['event_type']} | {message}")
        return "\n".join(lines)

    def build_codex_dispatch_prompt(self, card: sqlite3.Row, branch: str) -> str:
        owner_directives = self.card_owner_directives_text(int(card["id"]))
        return (
            f"## HBX-OWNER-CARD-{card['id']} — {card['title']}\n\n"
            "Leia AGENTS.md primeiro.\n\n"
            "Contexto:\n"
            "Este card veio do HBX Owner. Execute a menor correção segura em worktree isolado.\n\n"
            f"Branch local esperada: {branch or '-'}\n"
            f"Módulo: {card['module'] or '-'}\n"
            f"Tipo: {card['type'] or '-'}\n"
            f"Prioridade: {card['priority'] or '-'}\n"
            f"Urgência: {self.normalize_urgency_level(self.card_value(card, 'urgency_level', ''), card['priority'])}\n"
            f"Inteligência solicitada: {self.normalize_intelligence_level(self.card_value(card, 'intelligence_level', ''), card)}\n"
            f"Modelo solicitado: {self.card_codex_model(card) or 'padrão'}\n"
            f"Timeout alvo: {self.card_execution_timeout(card)}s\n"
            f"Ticket: {card['ticket_code'] or '-'}\n"
            f"Cliente: {card['ticket_customer'] or '-'}\n\n"
            "Caminho de pesquisa obrigatório:\n"
            f"{self.card_research_path(card)}\n\n"
            f"Descrição:\n{card['description'] or '-'}\n\n"
            f"Critério de aceite:\n{card['acceptance_criteria'] or 'Entrega verificável registrada.'}\n\n"
            f"Teste sugerido:\n{card['test_command'] or '-'}\n\n"
            f"Prompt específico do card:\n{card['codex_prompt'] or '-'}\n\n"
            "Diretivas recentes do Owner:\n"
            f"{owner_directives or '-'}\n\n"
            "Modo dono/local:\n"
            "- Este dispatch foi aprovado no HBX Owner local; aplique o que o card pedir no worktree.\n"
            "- Pode editar áreas citadas pelo card quando isso for necessário para concluir a entrega.\n"
            "- Não fazer push, deploy, publish, restart de produção, reset ou clean.\n"
            "- Manter o trabalho alinhado ao fluxo Radar -> Vendas -> WhatsApp -> Retorno.\n\n"
            "Entrega obrigatória:\n"
            "- aplicar a correção solicitada;\n"
            "- rodar checks locais mínimos relevantes;\n"
            "- criar um commit local nesta branch se houver alteração;\n"
            "- responder com commit, arquivos alterados, comandos rodados e risco residual.\n"
        )

    def process_is_running(self, pid: int) -> bool:
        if pid <= 0:
            return False
        if sys.platform.startswith("win"):
            ok, output = self.run_hidden_command(["tasklist", "/FI", f"PID eq {pid}", "/NH"], APP_DIR, timeout=10)
            return ok and str(pid) in output
        try:
            os.kill(pid, 0)
            return True
        except OSError:
            return False

    def stop_card_codex(self, card_id: int, parent: tk.Misc | None = None) -> bool:
        dispatch = self.latest_card_dispatch(card_id)
        if not dispatch or str(dispatch["status"] or "") not in ("queued", "running"):
            messagebox.showinfo("Parar Codex", "Este card não está rodando nem na fila.", parent=parent)
            return False
        dispatch_id = int(dispatch["id"])
        status = str(dispatch["status"] or "")
        pid = int(dispatch["process_id"] or 0)
        stopped = True
        if status == "running" and pid > 0:
            process = self.codex_processes.pop(dispatch_id, None)
            if process and process.poll() is None:
                try:
                    process.terminate()
                except OSError:
                    pass
            if self.process_is_running(pid):
                if sys.platform.startswith("win"):
                    ok, output = self.run_hidden_command(["taskkill", "/PID", str(pid), "/T", "/F"], APP_DIR, timeout=20)
                    stopped = ok
                else:
                    try:
                        os.kill(pid, 15)
                    except OSError:
                        stopped = False
                    else:
                        stopped = True
            if not stopped:
                messagebox.showwarning("Parar Codex", "Não consegui parar o processo do Codex.", parent=parent)
                return False
        note = f"Codex parado pelo Owner. Status anterior: {status}."
        self.update_codex_dispatch(
            dispatch_id,
            status="cancelled",
            error=note,
            finished_at=now_iso(),
        )
        self.db.execute(
            "UPDATE kanban_cards SET lane = 'HOJE', updated_at = ? WHERE id = ?",
            (now_iso(), card_id),
        )
        self.db.execute(
            "INSERT INTO card_events (card_id, event_type, message, created_at) VALUES (?, 'codex_cancelled', ?, ?)",
            (card_id, note, now_iso()),
        )
        self.refresh_kanban()
        return True

    def poll_codex_dispatches(self) -> None:
        rows = self.db.fetchall(
            "SELECT * FROM codex_dispatches WHERE status = 'running' ORDER BY id ASC LIMIT 10"
        )
        changed = False
        for row in rows:
            dispatch_id = int(row["id"])
            process = self.codex_processes.get(dispatch_id)
            if process:
                returncode = process.poll()
                if returncode is None:
                    continue
                self.codex_processes.pop(dispatch_id, None)
                self.finish_codex_dispatch(row, returncode=returncode)
                changed = True
                continue
            pid = int(row["process_id"] or 0)
            if self.process_is_running(pid):
                continue
            self.finish_codex_dispatch(row, returncode=None)
            changed = True
        if changed:
            self.refresh_kanban()
        self.queue_waiting_codex_cards()
        self.start_queued_codex_dispatches()

    def read_codex_dispatch_output(self, dispatch: sqlite3.Row, limit: int = 4000) -> str:
        output_path = str(dispatch["output_path"] or "").strip()
        if not output_path:
            return ""
        try:
            text = Path(output_path).read_text(encoding="utf-8", errors="replace")
        except OSError:
            return ""
        return text[-limit:]

    def codex_output_has_error(self, output: str) -> bool:
        lowered = output.lower()
        return any(
            marker in lowered
            for marker in (
                "error:",
                "invalid_request_error",
                "model is not supported",
                "fatal:",
            )
        )

    def extract_owner_input_request(self, output: str) -> str:
        marker = "HBX_OWNER_INPUT_REQUIRED"
        if marker not in output:
            return ""
        tail = output.split(marker, 1)[1].strip()
        lines = [line.strip("` -\t") for line in tail.splitlines() if line.strip()]
        question = " ".join(lines[:4]).strip()
        if len(question) > 900:
            question = question[:897].rstrip() + "..."
        return question or "Codex pediu diretiva do Owner."

    def git_is_ancestor(self, worktree: Path, ancestor: str, descendant: str) -> bool:
        if not ancestor or not descendant:
            return False
        ok, _ = self.run_hidden_command(["git", "merge-base", "--is-ancestor", ancestor, descendant], worktree, timeout=20)
        return ok

    def finish_codex_dispatch(self, dispatch: sqlite3.Row, returncode: int | None = None) -> None:
        worktree = Path(dispatch["worktree_path"])
        card_id = int(dispatch["card_id"])
        base_sha = str(dispatch["base_sha"] or "")
        if not worktree.exists():
            self.update_codex_dispatch(
                int(dispatch["id"]),
                status="failed",
                error="worktree não encontrado ao finalizar",
                finished_at=now_iso(),
            )
            return

        ok, head = self.run_hidden_command(["git", "rev-parse", "HEAD"], worktree, timeout=20)
        head = head.strip() if ok else ""
        ok_status, status_output = self.run_hidden_command(["git", "status", "--short"], worktree, timeout=20)
        status_output = status_output.strip() if ok_status else status_output
        output_tail = self.read_codex_dispatch_output(dispatch)
        input_request = self.extract_owner_input_request(output_tail)
        if input_request:
            note = f"Codex pediu diretiva do Owner: {input_request}"
            output_path = str(dispatch["output_path"] or "").strip()
            last_message_path = str(dispatch["last_message_path"] or "").strip()
            if output_path:
                note += f"\nLog: {output_path}"
            if last_message_path:
                note += f"\nÚltima resposta: {last_message_path}"
            self.update_codex_dispatch(
                int(dispatch["id"]),
                status="needs_review",
                error=note[:4000],
                finished_at=now_iso(),
            )
            self.db.execute(
                "UPDATE kanban_cards SET lane = 'HOJE', updated_at = ? WHERE id = ?",
                (now_iso(), card_id),
            )
            self.db.execute(
                "INSERT INTO card_events (card_id, event_type, message, created_at) VALUES (?, 'owner_input_required', ?, ?)",
                (card_id, note[:1000], now_iso()),
            )
            return
        process_failed = (returncode is not None and returncode != 0) or self.codex_output_has_error(output_tail)
        if process_failed:
            status = "failed"
            note = "Codex CLI terminou com erro; não vou marcar como feito nem reaproveitar commit antigo."
            if returncode is not None:
                note += f"\nReturn code: {returncode}"
            if status_output:
                note += f"\nGit status:\n{status_output}"
            if output_tail:
                note += f"\nTrecho do log:\n{output_tail[-1800:]}"
            output_path = str(dispatch["output_path"] or "").strip()
            last_message_path = str(dispatch["last_message_path"] or "").strip()
            if output_path:
                note += f"\nLog: {output_path}"
            if last_message_path:
                note += f"\nÚltima resposta: {last_message_path}"
            self.update_codex_dispatch(
                int(dispatch["id"]),
                status=status,
                error=note[:4000],
                finished_at=now_iso(),
            )
            self.db.execute(
                "INSERT INTO card_events (card_id, event_type, message, created_at) VALUES (?, 'codex_failed', ?, ?)",
                (card_id, note[:1000], now_iso()),
            )
            return

        head_is_new_dispatch_commit = head and head != base_sha and self.git_is_ancestor(worktree, base_sha, head)
        head_is_unrelated_to_dispatch = head and head != base_sha and not head_is_new_dispatch_commit

        if head_is_new_dispatch_commit:
            ok_msg, message = self.run_hidden_command(["git", "log", "-1", "--pretty=format:%s"], worktree, timeout=20)
            commit_message = message.strip() if ok_msg else ""
            self.update_codex_dispatch(
                int(dispatch["id"]),
                status="done",
                commit_sha=head,
                error="",
                finished_at=now_iso(),
            )
            self.db.execute(
                "UPDATE kanban_cards SET commit_sha = ?, lane = 'TESTAR', updated_at = ? WHERE id = ?",
                (head, now_iso(), card_id),
            )
            self.db.execute(
                "INSERT INTO card_events (card_id, event_type, message, created_at) VALUES (?, 'codex_done', ?, ?)",
                (card_id, f"Codex concluiu com commit {head[:7]} {commit_message}.", now_iso()),
            )
            return

        if status_output:
            commit_title = re.sub(r"\s+", " ", str(self.get_card(card_id)["title"] if self.get_card(card_id) else "card")).strip()
            commit_title = commit_title[:80] or "card"
            ok_add, add_output = self.run_hidden_command(["git", "add", "-A"], worktree, timeout=60)
            if ok_add:
                ok_commit, commit_output = self.run_hidden_command(
                    ["git", "commit", "-m", f"owner: card #{card_id} {commit_title}"],
                    worktree,
                    timeout=180,
                )
                if ok_commit:
                    ok_new_head, new_head = self.run_hidden_command(["git", "rev-parse", "HEAD"], worktree, timeout=20)
                    new_head = new_head.strip() if ok_new_head else ""
                    if not self.git_is_ancestor(worktree, base_sha, new_head):
                        status = "failed"
                        note = "Owner criou commit, mas ele não descende do base registrado do dispatch."
                        output_path = str(dispatch["output_path"] or "").strip()
                        if output_path:
                            note += f"\nLog: {output_path}"
                        self.update_codex_dispatch(
                            int(dispatch["id"]),
                            status=status,
                            error=note[:4000],
                            finished_at=now_iso(),
                        )
                        self.db.execute(
                            "INSERT INTO card_events (card_id, event_type, message, created_at) VALUES (?, 'codex_failed', ?, ?)",
                            (card_id, note[:1000], now_iso()),
                        )
                        return
                    self.update_codex_dispatch(
                        int(dispatch["id"]),
                        status="done",
                        commit_sha=new_head,
                        error="",
                        finished_at=now_iso(),
                    )
                    self.db.execute(
                        "UPDATE kanban_cards SET commit_sha = ?, lane = 'TESTAR', updated_at = ? WHERE id = ?",
                        (new_head, now_iso(), card_id),
                    )
                    self.db.execute(
                        "INSERT INTO card_events (card_id, event_type, message, created_at) VALUES (?, 'codex_done', ?, ?)",
                        (card_id, f"Owner commitou mudanças do Codex em {new_head[:7]}.", now_iso()),
                    )
                    return
            status = "failed"
            note = (
                "Codex deixou mudanças sem commit e o Owner não conseguiu commitar.\n"
                f"Git status:\n{status_output}\n"
                f"git add: {add_output if 'add_output' in locals() else '-'}\n"
                f"git commit: {commit_output if 'commit_output' in locals() else '-'}"
            )
        elif head_is_unrelated_to_dispatch:
            status = "failed"
            note = (
                "Codex terminou sem criar commit válido para este dispatch. "
                f"O HEAD atual ({head[:12]}) é diferente do base ({base_sha[:12]}), mas não descende dele."
            )
        else:
            status = "failed"
            note = "Codex terminou sem commit e sem mudanças detectadas."
        output_path = str(dispatch["output_path"] or "").strip()
        last_message_path = str(dispatch["last_message_path"] or "").strip()
        detail_note = note
        if output_path:
            detail_note += f"\nLog: {output_path}"
        if last_message_path:
            detail_note += f"\nÚltima resposta: {last_message_path}"
        self.update_codex_dispatch(
            int(dispatch["id"]),
            status=status,
            error=detail_note[:4000],
            finished_at=now_iso(),
        )
        self.db.execute(
            "INSERT INTO card_events (card_id, event_type, message, created_at) VALUES (?, 'codex_failed', ?, ?)",
            (card_id, detail_note[:1000], now_iso()),
        )

    def dispatch_selected_card_to_codex(self) -> None:
        if self.selected_lane:
            self.dispatch_lane_to_codex(self.selected_lane)
            return
        card = self.require_selected_card()
        if not card:
            return
        if card["lane"] != "AGUARDANDO CODEX":
            self.update_card_lane(card["id"], "AGUARDANDO CODEX", "Movido para Codex por botão.")
            return
        if self.dispatch_card_to_codex(int(card["id"]), trigger="botão"):
            self.refresh_kanban()

    def dispatch_lane_to_codex(self, lane: str) -> None:
        if lane not in KANBAN_BOARD_LANES:
            return
        allowed_mass_lanes = {"HOJE", "FAZENDO", "AGUARDANDO CODEX"}
        if lane not in allowed_mass_lanes:
            messagebox.showwarning(
                "Codex em massa",
                "Envio em massa só é permitido em Hoje, Fazendo ou Codex.",
            )
            return
        rows = self.db.fetchall(
            """
            SELECT * FROM kanban_cards
            WHERE lane = ?
            ORDER BY sort_order ASC, id ASC
            """,
            (lane,),
        )
        moved = 0
        skipped = 0
        for card in rows:
            latest = self.latest_card_dispatch(int(card["id"]))
            if latest and str(latest["status"] or "") in ("queued", "running"):
                skipped += 1
                continue
            if str(card["lane"] or "") != "AGUARDANDO CODEX":
                next_order = self.next_lane_sort_order("AGUARDANDO CODEX")
                self.db.execute(
                    "UPDATE kanban_cards SET lane = 'AGUARDANDO CODEX', sort_order = ?, updated_at = ?, done_at = NULL WHERE id = ?",
                    (next_order, now_iso(), int(card["id"])),
                )
                self.db.execute(
                    "INSERT INTO card_events (card_id, event_type, message, created_at) VALUES (?, 'moved', ?, ?)",
                    (int(card["id"]), f"Movido em massa de {lane} para AGUARDANDO CODEX.", now_iso()),
                )
            if self.dispatch_card_to_codex(int(card["id"]), trigger=f"lane {lane} em massa"):
                moved += 1
            else:
                skipped += 1
        self.selected_lane = "AGUARDANDO CODEX"
        self.refresh_kanban()
        self.selected_card_var.set(f"Lane {LANE_LABELS.get(lane, lane)} enviada para Codex: {moved} iniciado(s), {skipped} ignorado(s).")

    def link_commit_to_card(self, commit_sha: str | None = None) -> None:
        card = self.require_selected_card()
        if not card:
            return
        sha = commit_sha or simpledialog.askstring("Commit", "SHA do commit:", initialvalue=card["commit_sha"] or "")
        if not sha:
            return
        self.db.execute(
            "UPDATE kanban_cards SET commit_sha = ?, updated_at = ? WHERE id = ?",
            (sha.strip(), now_iso(), card["id"]),
        )
        self.db.execute(
            "INSERT INTO card_events (card_id, event_type, message, created_at) VALUES (?, 'commit', ?, ?)",
            (card["id"], f"Commit vinculado: {sha.strip()}", now_iso()),
        )
        self.refresh_kanban()

    def add_card_note(self) -> None:
        card = self.require_selected_card()
        if not card:
            return
        note = simpledialog.askstring("Nota", "Nota do card:")
        if not note:
            return
        self.db.execute(
            "INSERT INTO card_events (card_id, event_type, message, created_at) VALUES (?, 'note', ?, ?)",
            (card["id"], note.strip(), now_iso()),
        )
        self.db.execute("UPDATE kanban_cards SET updated_at = ? WHERE id = ?", (now_iso(), card["id"]))
        self.refresh_kanban()

    def duplicate_card(self) -> None:
        card = self.require_selected_card()
        if not card:
            return
        cur = self.db.execute(
            """
            INSERT INTO kanban_cards
            (date, title, description, module, type, priority, urgency_level, intelligence_level,
             codex_model_override, execution_timeout_seconds, research_path, lane, acceptance_criteria,
             test_command, codex_prompt, chatgpt_prompt, estimate_minutes, blocked_reason,
             created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'HOJE', ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                today_str(),
                f"{card['title']} (cópia)",
                card["description"],
                card["module"],
                self.sanitize_card_type(card["type"], "Operacional"),
                card["priority"],
                self.normalize_urgency_level(self.card_value(card, "urgency_level", ""), card["priority"]),
                self.normalize_intelligence_level(self.card_value(card, "intelligence_level", ""), card),
                normalize_codex_model_value(self.card_value(card, "codex_model_override", "")),
                self.card_execution_timeout(card),
                self.card_research_path(card),
                card["acceptance_criteria"],
                card["test_command"],
                card["codex_prompt"],
                card["chatgpt_prompt"],
                card["estimate_minutes"],
                card["blocked_reason"],
                now_iso(),
                now_iso(),
            ),
        )
        new_id = int(cur.lastrowid)
        self.db.execute(
            "INSERT INTO card_events (card_id, event_type, message, created_at) VALUES (?, 'created', ?, ?)",
            (new_id, f"Duplicado do card #{card['id']}.", now_iso()),
        )
        self.selected_card_id = new_id
        self.refresh_kanban()

    def insert_kanban_card(self, data: dict, source: str = "manual") -> int:
        lane = data.get("lane") or "BACKLOG"
        if lane not in KANBAN_LANES:
            lane = "HOJE"
        if lane == "BACKLOG":
            lane = "HOJE"
        data["type"] = self.sanitize_card_type(data.get("type"), source if source != "manual" else "Operacional")
        suggested_urgency, suggested_intelligence = self.suggest_card_execution_controls(data)
        urgency_level = self.normalize_urgency_level(data.get("urgency_level") or suggested_urgency, data.get("priority"))
        intelligence_level = self.normalize_intelligence_level(data.get("intelligence_level") or suggested_intelligence, data)
        research_path = str(data.get("research_path") or "").strip() or self.infer_research_path_from_text(
            data.get("module"), f"{data.get('title', '')} {data.get('description', '')} {data.get('codex_prompt', '')}"
        )
        try:
            timeout_seconds = int(float(str(data.get("execution_timeout_seconds") or 0)))
        except ValueError:
            timeout_seconds = 0
        cur = self.db.execute(
            """
            INSERT INTO kanban_cards
            (date, title, description, module, type, priority, urgency_level, intelligence_level,
             codex_model_override, execution_timeout_seconds, research_path, lane, acceptance_criteria,
             test_command, codex_prompt, chatgpt_prompt, estimate_minutes, blocked_reason,
             ticket_code, ticket_backend_id, ticket_customer, ticket_origin, ticket_category,
             ticket_classification, ticket_status, ticket_dispatch_status, ticket_codex_run_id,
             ticket_codex_run_url, ticket_github_issue_url, ticket_github_pr_number,
             ticket_github_branch, ticket_synced_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                today_str(),
                data.get("title", "").strip(),
                data.get("description", "").strip(),
                data.get("module", "").strip(),
                data.get("type", "").strip() or source,
                data.get("priority", "").strip() or "Média",
                urgency_level,
                intelligence_level,
                normalize_codex_model_value(data.get("codex_model_override")),
                max(0, timeout_seconds),
                research_path,
                lane,
                data.get("acceptance_criteria", "").strip(),
                data.get("test_command", "").strip(),
                data.get("codex_prompt", "").strip(),
                data.get("chatgpt_prompt", "").strip(),
                int(data.get("estimate_minutes") or 0),
                data.get("blocked_reason", "").strip(),
                str(data.get("ticket_code") or "").strip(),
                str(data.get("ticket_backend_id") or "").strip(),
                str(data.get("ticket_customer") or "").strip(),
                str(data.get("ticket_origin") or "").strip(),
                str(data.get("ticket_category") or "").strip(),
                str(data.get("ticket_classification") or "").strip(),
                str(data.get("ticket_status") or "").strip(),
                str(data.get("ticket_dispatch_status") or "").strip(),
                str(data.get("ticket_codex_run_id") or "").strip(),
                str(data.get("ticket_codex_run_url") or "").strip(),
                str(data.get("ticket_github_issue_url") or "").strip(),
                str(data.get("ticket_github_pr_number") or "").strip(),
                str(data.get("ticket_github_branch") or "").strip(),
                str(data.get("ticket_synced_at") or "").strip(),
                now_iso(),
                now_iso(),
            ),
        )
        card_id = int(cur.lastrowid)
        self.db.execute(
            "INSERT INTO card_events (card_id, event_type, message, created_at) VALUES (?, 'created', ?, ?)",
            (card_id, f"Card criado por {source}.", now_iso()),
        )
        return card_id

    def archive_card(self) -> None:
        card = self.require_selected_card()
        if not card:
            return
        self.update_card_lane(card["id"], "ARQUIVADO", "Card arquivado.")

    def set_current_card(self) -> None:
        card = self.require_selected_card()
        if not card:
            return
        self.current_card_id = int(card["id"])
        self.update_current_card_label()
        self.refresh_today()

    def update_current_card_label(self) -> None:
        card = self.get_card(self.current_card_id)
        if card:
            self.current_card_var.set(f"Card atual #{card['id']}: {card['title']} ({card['lane']})")
        else:
            self.current_card_var.set("Card atual não definido.")

    def _build_git_tab(self, frame: ttk.Frame) -> None:
        self.page_title(frame, "Git", "Status local e vínculo com cards")

        controls = self.card_frame(frame, padding=(12, 10))
        controls.grid(row=1, column=0, sticky="ew", pady=(12, 10))
        controls.columnconfigure(1, weight=1)

        ttk.Label(controls, text="repo_path", style="CardMuted.TLabel").grid(row=0, column=0, sticky="w", padx=(0, 8))
        ttk.Entry(controls, textvariable=self.git_repo_var).grid(row=0, column=1, sticky="ew", padx=(0, 8))
        ttk.Button(controls, text="Salvar caminho", command=self.save_git_repo_path, style="Accent.TButton").grid(row=0, column=2)

        buttons = ttk.Frame(frame, style="Toolbar.TFrame")
        buttons.grid(row=2, column=0, sticky="w", pady=(0, 10))
        ttk.Button(buttons, text="Ler status", command=self.git_read_status, style="Accent.TButton").grid(row=0, column=0, padx=(0, 8))
        ttk.Button(buttons, text="Último commit", command=self.git_last_commit).grid(row=0, column=1, padx=8)
        ttk.Button(buttons, text="Vincular último commit ao card atual", command=self.git_link_last_commit).grid(
            row=0, column=2, padx=8
        )
        ttk.Button(buttons, text="Gerar resumo do commit", command=self.git_commit_summary).grid(
            row=0, column=3, padx=8
        )

        output_frame = ttk.LabelFrame(frame, text="Saída", padding=8, style="Modern.TLabelframe")
        output_frame.grid(row=3, column=0, sticky="nsew")
        output_frame.columnconfigure(0, weight=1)
        output_frame.rowconfigure(0, weight=1)
        frame.rowconfigure(3, weight=1)

        self.git_output = tk.Text(output_frame, height=24, wrap="word")
        self.style_text_widget(self.git_output)
        self.git_output.grid(row=0, column=0, sticky="nsew")
        scroll = ttk.Scrollbar(output_frame, orient="vertical", command=self.git_output.yview)
        scroll.grid(row=0, column=1, sticky="ns")
        self.git_output.configure(yscrollcommand=scroll.set)

    def save_git_repo_path(self) -> None:
        self.config_data["repo_path"] = self.git_repo_var.get().strip() or str(APP_DIR)
        save_config(self.config_data)
        self.set_git_output(f"repo_path salvo: {self.config_data['repo_path']}")

    def set_git_output(self, text: str) -> None:
        if not hasattr(self, "git_output"):
            return
        self.git_output.delete("1.0", tk.END)
        self.git_output.insert(tk.END, text)

    def run_git_command(self, args: list[str]) -> tuple[bool, str]:
        command_key = tuple(args)
        if command_key not in SAFE_GIT_COMMANDS:
            return False, f"Comando Git bloqueado: git {' '.join(args)}"

        repo_path = Path(self.git_repo_var.get().strip() or str(APP_DIR))
        if not repo_path.exists():
            return False, f"repo_path não existe: {repo_path}"

        try:
            result = subprocess.run(
                ["git", *args],
                cwd=repo_path,
                capture_output=True,
                text=True,
                timeout=20,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            return False, str(exc)

        output = (result.stdout or "") + (result.stderr or "")
        return result.returncode == 0, output.strip()

    def parse_last_commit(self, output: str) -> tuple[str, str]:
        lines = output.splitlines()
        sha = lines[0].strip() if lines else ""
        message = lines[1].strip() if len(lines) > 1 else ""
        return sha, message

    def get_last_commit_info(self) -> tuple[str, str, str]:
        ok, output = self.run_git_command(["log", "-1", "--pretty=format:%H%n%s%n%cd"])
        if not ok:
            return "", "", output
        sha, message = self.parse_last_commit(output)
        self.last_commit_sha = sha
        self.last_commit_message = message
        return sha, message, output

    def save_git_snapshot(self, commit_sha: str = "", commit_message: str = "", status_short: str = "", diff_stat: str = "") -> None:
        self.db.execute(
            """
            INSERT INTO git_snapshots (date, commit_sha, commit_message, status_short, diff_stat, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (today_str(), commit_sha, commit_message, status_short, diff_stat, now_iso()),
        )

    def git_read_status(self) -> None:
        self.save_git_repo_path()
        ok, status = self.run_git_command(["status", "--short"])
        sha, message, _raw = self.get_last_commit_info()
        if ok:
            self.save_git_snapshot(commit_sha=sha, commit_message=message, status_short=status)
        self.set_git_output(status if ok else f"Erro ao ler status:\n{status}")

    def git_last_commit(self) -> None:
        self.save_git_repo_path()
        sha, message, raw = self.get_last_commit_info()
        if sha:
            self.save_git_snapshot(commit_sha=sha, commit_message=message)
        self.set_git_output(raw)

    def git_link_last_commit(self) -> None:
        sha, message, raw = self.get_last_commit_info()
        if not sha:
            self.set_git_output(f"Não foi possível ler último commit:\n{raw}")
            return
        self.link_commit_to_card(sha)
        self.set_git_output(f"Commit vinculado ao card selecionado:\n{sha}\n{message}")

    def git_commit_summary(self) -> None:
        self.save_git_repo_path()
        ok, summary = self.run_git_command(["show", "--stat", "--oneline", "--summary", "HEAD"])
        sha, message, _raw = self.get_last_commit_info()
        if ok:
            self.save_git_snapshot(commit_sha=sha, commit_message=message, diff_stat=summary)
        self.set_git_output(summary if ok else f"Erro ao gerar resumo:\n{summary}")

    def _build_pr_lab_tab(self, frame: ttk.Frame) -> None:
        self.page_title(frame, "Branches", "Branches, worktrees, testes isolados e merge aprovado")
        frame.columnconfigure(0, weight=1)
        frame.rowconfigure(4, weight=1)

        controls = self.card_frame(frame, padding=(12, 10))
        controls.grid(row=1, column=0, sticky="ew", pady=(12, 10))
        controls.columnconfigure(1, weight=1)
        controls.columnconfigure(3, weight=1)
        controls.columnconfigure(5, weight=1)
        ttk.Label(controls, text="base", style="CardMuted.TLabel").grid(row=0, column=0, sticky="w", padx=(0, 8))
        ttk.Label(
            controls,
            text=str(self.config_data.get("pr_lab_base_branch") or DEFAULT_CONFIG["pr_lab_base_branch"]),
            style="Card.TLabel",
        ).grid(row=0, column=1, sticky="w", padx=(0, 18))
        ttk.Label(controls, text="worktrees", style="CardMuted.TLabel").grid(row=0, column=2, sticky="w", padx=(0, 8))
        ttk.Label(
            controls,
            text=str(self.config_data.get("pr_lab_worktree_dir") or DEFAULT_CONFIG["pr_lab_worktree_dir"]),
            style="Card.TLabel",
        ).grid(row=0, column=3, sticky="w", padx=(0, 18))
        ttk.Label(controls, text="filtro", style="CardMuted.TLabel").grid(row=0, column=4, sticky="w", padx=(0, 8))
        ttk.Entry(controls, textvariable=self.pr_lab_branch_filter_var, width=18).grid(row=0, column=5, sticky="w")

        toolbar = ttk.Frame(frame, style="Toolbar.TFrame")
        toolbar.grid(row=2, column=0, sticky="ew", pady=(0, 10))
        ttk.Button(toolbar, text="Fetch --prune", command=self.pr_lab_fetch_all, style="Accent.TButton").grid(
            row=0, column=0, sticky="w", padx=(0, 8)
        )
        ttk.Button(toolbar, text="Todas branches", command=self.pr_lab_list_all_branches).grid(
            row=0, column=1, sticky="w", padx=8
        )
        ttk.Button(toolbar, text="PRs GitHub", command=self.pr_lab_list_github_prs).grid(
            row=0, column=2, sticky="w", padx=8
        )
        ttk.Button(toolbar, text="Owner/*", command=self.pr_lab_list_owner_branches).grid(
            row=0, column=3, sticky="w", padx=8
        )
        ttk.Button(toolbar, text="Criar worktree", command=self.pr_lab_create_worktree, style="Success.TButton").grid(
            row=0, column=4, sticky="w", padx=8
        )
        ttk.Button(toolbar, text="Rodar testes", command=self.pr_lab_run_tests, style="Warning.TButton").grid(
            row=0, column=5, sticky="w", padx=8
        )
        ttk.Button(toolbar, text="Comandos", command=self.pr_lab_copy_branch_commands).grid(
            row=0, column=6, sticky="w", padx=8
        )
        ttk.Button(toolbar, text="Abrir localhost", command=self.pr_lab_open_localhost).grid(
            row=1, column=0, sticky="w", padx=(0, 8), pady=(8, 0)
        )
        ttk.Button(toolbar, text="Abrir worktree", command=self.pr_lab_open_worktree_folder).grid(
            row=1, column=1, sticky="w", padx=8, pady=(8, 0)
        )
        ttk.Button(toolbar, text="Terminal tree", command=self.pr_lab_open_worktree_terminal).grid(
            row=1, column=2, sticky="w", padx=8, pady=(8, 0)
        )
        ttk.Button(toolbar, text="Merge no master", command=self.pr_lab_merge_approved, style="Danger.TButton").grid(
            row=1, column=3, sticky="w", padx=8, pady=(8, 0)
        )
        ttk.Button(toolbar, text="Push master", command=self.pr_lab_push_base, style="Danger.TButton").grid(
            row=1, column=4, sticky="w", padx=8, pady=(8, 0)
        )
        ttk.Button(toolbar, text="Rejeitar branch", command=self.pr_lab_delete_rejected_branch, style="Danger.TButton").grid(
            row=1, column=5, sticky="w", padx=8, pady=(8, 0)
        )

        status = self.card_frame(frame, padding=(12, 10))
        status.grid(row=3, column=0, sticky="ew", pady=(0, 10))
        status.columnconfigure(0, weight=1)
        ttk.Label(status, textvariable=self.pr_lab_status_var, style="Card.TLabel").grid(row=0, column=0, sticky="w")
        ttk.Label(status, textvariable=self.pr_lab_selected_var, style="CardMuted.TLabel").grid(
            row=1, column=0, sticky="w", pady=(3, 0)
        )

        body = ttk.Frame(frame, style="App.TFrame")
        body.grid(row=4, column=0, sticky="nsew")
        body.columnconfigure(0, weight=3)
        body.columnconfigure(1, weight=2)
        body.rowconfigure(0, weight=1)

        table_panel = ttk.LabelFrame(body, text="PRs e branches", padding=8, style="Modern.TLabelframe")
        table_panel.grid(row=0, column=0, sticky="nsew", padx=(0, 8))
        table_panel.columnconfigure(0, weight=1)
        table_panel.rowconfigure(0, weight=1)

        columns = ("tipo", "ref", "branch", "head", "titulo", "status", "worktree")
        tree = ttk.Treeview(table_panel, columns=columns, show="headings", height=18)
        headings = {
            "tipo": "Tipo",
            "ref": "Ref",
            "branch": "Branch",
            "head": "HEAD",
            "titulo": "Título",
            "status": "Status",
            "worktree": "Worktree",
        }
        widths = {
            "tipo": 80,
            "ref": 170,
            "branch": 170,
            "head": 110,
            "titulo": 240,
            "status": 110,
            "worktree": 260,
        }
        for column in columns:
            tree.heading(column, text=headings[column])
            tree.column(column, width=widths[column], anchor="w")
        tree.grid(row=0, column=0, sticky="nsew")
        tree_scroll = ttk.Scrollbar(table_panel, orient="vertical", command=tree.yview)
        tree_scroll.grid(row=0, column=1, sticky="ns")
        tree.configure(yscrollcommand=tree_scroll.set)
        tree.bind("<<TreeviewSelect>>", self.on_pr_lab_selected)
        self.pr_lab_tree = tree

        output_panel = ttk.LabelFrame(body, text="Saída", padding=8, style="Modern.TLabelframe")
        output_panel.grid(row=0, column=1, sticky="nsew", padx=(8, 0))
        output_panel.columnconfigure(0, weight=1)
        output_panel.rowconfigure(0, weight=1)
        self.pr_lab_output = tk.Text(output_panel, height=18, wrap="word")
        self.style_text_widget(self.pr_lab_output)
        self.pr_lab_output.grid(row=0, column=0, sticky="nsew")
        output_scroll = ttk.Scrollbar(output_panel, orient="vertical", command=self.pr_lab_output.yview)
        output_scroll.grid(row=0, column=1, sticky="ns")
        self.pr_lab_output.configure(yscrollcommand=output_scroll.set)
        self.set_pr_lab_output(
            "Fluxo seguro:\n"
            "1. Fetch --prune e listar todas as branches.\n"
            "2. Criar worktree isolado.\n"
            "3. Rodar testes e localhost só no worktree.\n"
            "4. Se aprovado, merge local no master.\n"
            "5. Se o master ficou aprovado, push master separado.\n"
            "6. Se rejeitado, excluir branch com confirmação pelo nome.\n"
        )

    def set_pr_lab_output(self, text: str) -> None:
        if not self.pr_lab_output:
            return
        self.pr_lab_output.delete("1.0", tk.END)
        self.pr_lab_output.insert(tk.END, text)

    def pr_lab_repo_path(self) -> Path:
        repo_path = self.repo_path()
        if not repo_path.exists():
            raise RuntimeError(f"repo_path não existe: {repo_path}")
        return repo_path

    def pr_lab_run_git(self, args: list[str], timeout: int = 30) -> tuple[bool, str]:
        try:
            repo_path = self.pr_lab_repo_path()
        except RuntimeError as exc:
            return False, str(exc)
        return self.run_hidden_command(["git", *args], repo_path, timeout=timeout)

    def pr_lab_worktree_root(self, ensure: bool = False) -> Path:
        configured = str(self.config_data.get("pr_lab_worktree_dir") or DEFAULT_CONFIG["pr_lab_worktree_dir"]).strip()
        root = Path(configured).expanduser()
        if not root.is_absolute():
            root = self.repo_path() / root
        root = root.resolve()
        if ensure:
            root.mkdir(parents=True, exist_ok=True)
        return root

    def pr_lab_worktree_name(self, item: dict) -> str:
        raw = str(item.get("branch") or item.get("ref") or item.get("id") or "worktree")
        raw = raw.replace("origin/", "")
        name = re.sub(r"[^A-Za-z0-9._-]+", "-", raw).strip(".-").lower()
        return name[:80] or "worktree"

    def pr_lab_default_worktree_path(self, item: dict, ensure_root: bool = False) -> Path:
        root = self.pr_lab_worktree_root(ensure=ensure_root)
        target = (root / self.pr_lab_worktree_name(item)).resolve()
        if target != root and root not in target.parents:
            raise RuntimeError(f"worktree fora do diretório permitido: {target}")
        return target

    def pr_lab_existing_worktree_label(self, item: dict) -> str:
        try:
            target = self.pr_lab_default_worktree_path(item)
        except RuntimeError:
            return "-"
        return str(target) if target.exists() else "-"

    def pr_lab_insert_items(self, items: list[dict], status: str) -> None:
        if not self.pr_lab_tree:
            return
        tree = self.pr_lab_tree
        for row in tree.get_children():
            tree.delete(row)
        self.pr_lab_items = {}
        for item in items:
            iid = str(item["id"])
            item["worktree"] = item.get("worktree") or self.pr_lab_existing_worktree_label(item)
            self.pr_lab_items[iid] = item
            tree.insert(
                "",
                "end",
                iid=iid,
                values=(
                    item.get("type", "-"),
                    item.get("ref", "-"),
                    item.get("branch", "-"),
                    item.get("head", "-"),
                    item.get("title", "-"),
                    item.get("status", "-"),
                    item.get("worktree", "-"),
                ),
            )
        self.pr_lab_status_var.set(status)
        if items:
            first = str(items[0]["id"])
            tree.selection_set(first)
            tree.focus(first)
            self.on_pr_lab_selected()

    def pr_lab_fetch_all(self) -> None:
        try:
            repo_path = self.pr_lab_repo_path()
        except RuntimeError as exc:
            self.pr_lab_status_var.set(str(exc))
            self.set_pr_lab_output(str(exc))
            return
        self.pr_lab_status_var.set("Sincronizando refs remotas com fetch --all --prune...")

        def worker() -> None:
            ok, output = self.run_hidden_command(["git", "fetch", "--all", "--prune"], repo_path, timeout=120)
            self.after(0, lambda: self.finish_pr_lab_fetch(ok, output))

        threading.Thread(target=worker, daemon=True).start()

    def finish_pr_lab_fetch(self, ok: bool, output: str) -> None:
        self.set_pr_lab_output(output or "Fetch concluído.")
        if not ok:
            self.pr_lab_status_var.set("Fetch falhou.")
            return
        self.pr_lab_status_var.set("Fetch concluído. Listando todas branches...")
        self.pr_lab_list_all_branches()

    def pr_lab_worktree_map(self) -> dict[str, str]:
        ok, output = self.pr_lab_run_git(["worktree", "list", "--porcelain"], timeout=30)
        if not ok:
            return {}
        result: dict[str, str] = {}
        for item in self.parse_alignment_worktrees(output):
            branch = str(item.get("branch") or "").replace("refs/heads/", "")
            path = str(item.get("path") or "")
            if branch and path:
                result[branch] = path
        return result

    def pr_lab_list_all_branches(self) -> None:
        worktrees = self.pr_lab_worktree_map()
        ok, output = self.pr_lab_run_git(
            [
                "for-each-ref",
                "--format=%(refname:short)\t%(objectname:short)\t%(committerdate:relative)\t%(subject)",
                "refs/heads",
                "refs/remotes/origin",
            ],
            timeout=45,
        )
        if not ok:
            self.pr_lab_status_var.set("Falha ao listar branches.")
            self.set_pr_lab_output(output)
            return
        items: list[dict] = []
        for line in output.splitlines():
            parts = line.split("\t", 3)
            if len(parts) < 4:
                continue
            ref, head, updated, subject = (part.strip() for part in parts)
            if not ref or ref == "origin/HEAD":
                continue
            is_remote = ref.startswith("origin/")
            branch = ref.replace("origin/", "", 1) if is_remote else ref
            worktree = worktrees.get(branch, "-")
            status = "worktree" if worktree != "-" else "remoto" if is_remote else "local"
            title = subject or f"Atualizada {updated}"
            items.append(
                {
                    "id": f"{'remote' if is_remote else 'local'}:{ref}",
                    "type": "remoto" if is_remote else "local",
                    "ref": ref,
                    "branch": branch,
                    "head": head,
                    "title": title,
                    "status": status,
                    "worktree": worktree,
                    "updated": updated,
                }
            )
        items.sort(key=lambda item: (0 if item.get("status") == "worktree" else 1, str(item.get("branch") or "").lower(), str(item.get("type") or "")))
        self.pr_lab_insert_items(items, f"Branches carregadas: {len(items)}")
        self.set_pr_lab_output(output or "Nenhuma branch encontrada.")

    def pr_lab_list_owner_branches(self) -> None:
        filter_value = self.pr_lab_branch_filter_var.get().strip() or "owner/"
        if not filter_value.startswith("owner/"):
            filter_value = "owner/"
            self.pr_lab_branch_filter_var.set(filter_value)
        ref_root = f"refs/remotes/origin/{filter_value.strip('/')}"
        ok, output = self.pr_lab_run_git(["for-each-ref", "--format=%(refname:short)", ref_root], timeout=30)
        if not ok:
            self.pr_lab_status_var.set("Falha ao listar owner/*.")
            self.set_pr_lab_output(output)
            return
        refs = [line.strip() for line in output.splitlines() if line.strip().startswith("origin/owner/")]
        items = [
            {
                "id": f"branch:{ref}",
                "type": "branch",
                "ref": ref,
                "branch": ref.replace("origin/", "", 1),
                "title": ref.replace("origin/", "", 1),
                "status": "remoto",
            }
            for ref in refs
        ]
        self.pr_lab_insert_items(items, f"Branches owner/* carregadas: {len(items)}")
        self.set_pr_lab_output(output or "Nenhuma branch origin/owner/* encontrada.")

    def pr_lab_list_github_prs(self) -> None:
        gh_path = shutil.which("gh")
        if not gh_path:
            message = "GitHub CLI não encontrado. Use Listar owner/* ou instale/autentique o gh localmente."
            self.pr_lab_status_var.set(message)
            self.set_pr_lab_output(message)
            return
        try:
            repo_path = self.pr_lab_repo_path()
        except RuntimeError as exc:
            self.pr_lab_status_var.set(str(exc))
            self.set_pr_lab_output(str(exc))
            return
        command = [
            gh_path,
            "pr",
            "list",
            "--state",
            "open",
            "--limit",
            "30",
            "--json",
            "number,title,headRefName,baseRefName,state,url,isDraft",
        ]
        ok, output = self.run_hidden_command(command, repo_path, timeout=45)
        if not ok:
            self.pr_lab_status_var.set("Falha ao listar PRs GitHub.")
            self.set_pr_lab_output(output)
            return
        try:
            rows = json.loads(output or "[]")
        except json.JSONDecodeError as exc:
            self.pr_lab_status_var.set("GitHub CLI retornou JSON inválido.")
            self.set_pr_lab_output(f"{exc}\n\n{output}")
            return
        if not isinstance(rows, list):
            rows = []
        items: list[dict] = []
        for row in rows:
            if not isinstance(row, dict):
                continue
            number = str(row.get("number") or "")
            branch = str(row.get("headRefName") or "")
            ref = f"origin/{branch}" if branch and not branch.startswith("origin/") else branch
            draft = "draft" if row.get("isDraft") else str(row.get("state") or "open").lower()
            items.append(
                {
                    "id": f"pr:{number}",
                    "type": "PR",
                    "ref": ref or f"PR #{number}",
                    "branch": branch or "-",
                    "title": f"#{number} {row.get('title') or '-'}",
                    "status": draft,
                    "url": str(row.get("url") or ""),
                    "base": str(row.get("baseRefName") or ""),
                }
            )
        self.pr_lab_insert_items(items, f"PRs GitHub carregados: {len(items)}")
        self.set_pr_lab_output(json.dumps(rows, ensure_ascii=False, indent=2) if rows else "Nenhum PR aberto encontrado.")

    def on_pr_lab_selected(self, _event: tk.Event | None = None) -> None:
        item = self.selected_pr_lab_item()
        if not item:
            self.pr_lab_selected_var.set("Nenhum PR ou branch selecionado.")
            return
        self.pr_lab_selected_var.set(
            f"{item.get('type')} | {item.get('branch') or item.get('ref')} | {item.get('status')} | {item.get('worktree') or '-'}"
        )

    def selected_pr_lab_item(self) -> dict | None:
        if not self.pr_lab_tree:
            return None
        selected = self.pr_lab_tree.selection()
        if not selected:
            return None
        return self.pr_lab_items.get(str(selected[0]))

    def pr_lab_base_branch(self) -> str:
        return str(self.config_data.get("pr_lab_base_branch") or DEFAULT_CONFIG["pr_lab_base_branch"]).strip() or "master"

    def pr_lab_selected_branch_name(self, item: dict) -> str:
        branch = str(item.get("branch") or "").strip()
        ref = str(item.get("ref") or "").strip()
        if branch and branch != "-":
            return branch.replace("origin/", "", 1)
        if ref.startswith("origin/"):
            return ref.replace("origin/", "", 1)
        return ref

    def pr_lab_selected_ref(self, item: dict) -> str:
        ref = str(item.get("ref") or "").strip()
        branch = self.pr_lab_selected_branch_name(item)
        item_type = str(item.get("type") or "").lower()
        if ref and not ref.startswith("PR #"):
            return ref
        if item_type in {"remoto", "pr"} and branch:
            return f"origin/{branch}"
        return branch

    def pr_lab_preferred_merge_ref(self, item: dict) -> str:
        branch = self.pr_lab_selected_branch_name(item)
        if branch:
            ok_local, _output = self.pr_lab_run_git(["show-ref", "--verify", f"refs/heads/{branch}"], timeout=20)
            if ok_local:
                return branch
        return self.pr_lab_selected_ref(item)

    def pr_lab_is_protected_branch(self, branch: str) -> bool:
        clean = branch.replace("origin/", "", 1).strip()
        protected = {self.pr_lab_base_branch(), "master", "main"}
        return clean in protected

    def pr_lab_item_ref_is_owner_branch(self, item: dict) -> bool:
        ref = str(item.get("ref") or "")
        branch = str(item.get("branch") or "")
        return ref.startswith("origin/owner/") or branch.startswith("owner/")

    def pr_lab_create_worktree(self) -> None:
        item = self.selected_pr_lab_item()
        if not item:
            messagebox.showwarning("Branches", "Selecione um PR ou branch.")
            return
        ref = self.pr_lab_preferred_merge_ref(item)
        if not ref:
            message = "Branch/ref inválida."
            self.pr_lab_status_var.set(message)
            self.set_pr_lab_output(message)
            return
        branch = self.pr_lab_selected_branch_name(item)
        if self.pr_lab_is_protected_branch(branch):
            message = "Worktree automático bloqueado para master/main. Use o repo principal para a base."
            self.pr_lab_status_var.set(message)
            self.set_pr_lab_output(message)
            return
        try:
            target = self.pr_lab_default_worktree_path(item, ensure_root=True)
        except RuntimeError as exc:
            self.pr_lab_status_var.set(str(exc))
            self.set_pr_lab_output(str(exc))
            return
        if target.exists():
            item["worktree"] = str(target)
            if self.pr_lab_tree:
                self.pr_lab_tree.set(str(item["id"]), "worktree", str(target))
            self.pr_lab_status_var.set(f"Worktree já existe: {target}")
            self.set_pr_lab_output(f"Worktree já existe:\n{target}")
            self.on_pr_lab_selected()
            return
        add_args = self.pr_lab_worktree_add_args(ref, branch, target)
        ok, output = self.pr_lab_run_git(add_args, timeout=120)
        if ok:
            item["worktree"] = str(target)
            if self.pr_lab_tree:
                self.pr_lab_tree.set(str(item["id"]), "worktree", str(target))
            self.pr_lab_status_var.set(f"Worktree criado: {target}")
            self.on_pr_lab_selected()
        else:
            self.pr_lab_status_var.set("Falha ao criar worktree.")
        self.set_pr_lab_output(output or f"Worktree criado em {target}")

    def pr_lab_worktree_add_args(self, ref: str, branch: str, target: Path) -> list[str]:
        ok_local, _output = self.pr_lab_run_git(["show-ref", "--verify", f"refs/heads/{branch}"], timeout=20)
        if ok_local:
            return ["worktree", "add", str(target), branch]
        if ref.startswith("origin/") and branch:
            return ["worktree", "add", "-b", branch, str(target), ref]
        return ["worktree", "add", str(target), ref]

    def pr_lab_selected_worktree_path(self, item: dict) -> Path | None:
        configured = str(item.get("worktree") or "").strip()
        if configured and configured != "-":
            path = Path(configured)
            return path if path.exists() else None
        try:
            path = self.pr_lab_default_worktree_path(item)
        except RuntimeError:
            return None
        return path if path.exists() else None

    def pr_lab_npm_command(self) -> str:
        return "npm.cmd" if sys.platform.startswith("win") else "npm"

    def pr_lab_test_specs(self, worktree: Path) -> list[tuple[str, list[str], Path, int]]:
        npm = self.pr_lab_npm_command()
        specs: list[tuple[str, list[str], Path, int]] = []
        owner_dir = worktree / "hbx-owner" / "windows-app"
        if (owner_dir / "hbx_owner_app.py").exists():
            specs.append(("Owner py_compile", [sys.executable, "-m", "py_compile", "hbx_owner_app.py"], owner_dir, 30))
            specs.append(("Owner no-gui", [sys.executable, "hbx_owner_app.py", "--no-gui"], owner_dir, 30))
        backend_dir = worktree / "backend"
        if (backend_dir / "package.json").exists():
            specs.append(("Backend prisma validate", [npm, "run", "prisma:validate"], backend_dir, 90))
            specs.append(("Backend build", [npm, "run", "build"], backend_dir, 180))
        frontend_dir = worktree / "frontend"
        if (frontend_dir / "package.json").exists():
            specs.append(("Frontend lint", [npm, "run", "lint"], frontend_dir, 180))
        if not specs:
            specs.append(("Git status", ["git", "status", "--short"], worktree, 30))
        return specs

    def pr_lab_run_tests(self) -> None:
        item = self.selected_pr_lab_item()
        if not item:
            messagebox.showwarning("Branches", "Selecione um PR ou branch.")
            return
        worktree = self.pr_lab_selected_worktree_path(item)
        if not worktree:
            message = "Crie o worktree antes de rodar testes."
            self.pr_lab_status_var.set(message)
            self.set_pr_lab_output(message)
            return
        reports: list[str] = []
        all_ok = True
        for label, command, cwd, timeout in self.pr_lab_test_specs(worktree):
            ok, output = self.run_hidden_command(command, cwd, timeout=timeout)
            all_ok = all_ok and ok
            command_text = " ".join(command)
            reports.append(
                f"{label}\n"
                f"CWD: {cwd}\n"
                f"CMD: {command_text}\n"
                f"RESULTADO: {'OK' if ok else 'FALHOU'}\n"
                f"{output or '-'}"
            )
            if not ok:
                break
        self.pr_lab_status_var.set(f"Testes no worktree: {'OK' if all_ok else 'com falha'}")
        self.set_pr_lab_output(("\n\n" + ("=" * 72) + "\n\n").join(reports))

    def pr_lab_open_localhost(self) -> None:
        url = str(self.config_data.get("pr_lab_localhost_url") or DEFAULT_CONFIG["pr_lab_localhost_url"]).strip()
        if not url:
            url = DEFAULT_CONFIG["pr_lab_localhost_url"]
        if not re.match(r"^https?://", url, flags=re.IGNORECASE):
            url = f"http://{url}"
        webbrowser.open(url)
        self.pr_lab_status_var.set(f"Localhost aberto: {url}")

    def pr_lab_open_worktree_folder(self) -> None:
        item = self.selected_pr_lab_item()
        if not item:
            messagebox.showwarning("Branches", "Selecione um PR ou branch.")
            return
        worktree = self.pr_lab_selected_worktree_path(item)
        if not worktree:
            message = "Worktree ainda não existe."
            self.pr_lab_status_var.set(message)
            self.set_pr_lab_output(message)
            return
        try:
            subprocess.Popen(["explorer.exe", str(worktree)])
        except OSError as exc:
            self.pr_lab_status_var.set(f"Não consegui abrir worktree: {exc}")
            return
        self.pr_lab_status_var.set(f"Worktree aberto: {worktree}")

    def pr_lab_open_worktree_terminal(self) -> None:
        item = self.selected_pr_lab_item()
        if not item:
            messagebox.showwarning("Branches", "Selecione um PR ou branch.")
            return
        worktree = self.pr_lab_selected_worktree_path(item)
        if not worktree:
            message = "Crie o worktree antes de abrir o terminal."
            self.pr_lab_status_var.set(message)
            self.set_pr_lab_output(message)
            return
        command = f"Set-Location -LiteralPath {self.powershell_quote(worktree)}"
        try:
            subprocess.Popen(["powershell.exe", "-NoExit", "-Command", command])
        except OSError as exc:
            self.pr_lab_status_var.set(f"Não consegui abrir terminal: {exc}")
            return
        self.pr_lab_status_var.set(f"Terminal aberto no worktree: {worktree}")

    def powershell_quote(self, value: object) -> str:
        return "'" + str(value).replace("'", "''") + "'"

    def pr_lab_copy_branch_commands(self) -> None:
        item = self.selected_pr_lab_item()
        if not item:
            messagebox.showwarning("Branches", "Selecione um PR ou branch.")
            return
        try:
            repo = self.pr_lab_repo_path()
            worktree = self.pr_lab_default_worktree_path(item, ensure_root=False)
        except RuntimeError as exc:
            self.pr_lab_status_var.set(str(exc))
            self.set_pr_lab_output(str(exc))
            return
        ref = self.pr_lab_preferred_merge_ref(item)
        branch = self.pr_lab_selected_branch_name(item)
        base_branch = self.pr_lab_base_branch()
        if not ref or not branch:
            message = "Branch/ref inválida para gerar comandos."
            self.pr_lab_status_var.set(message)
            self.set_pr_lab_output(message)
            return
        frontend_dir = worktree / "frontend"
        backend_dir = worktree / "backend"
        owner_dir = worktree / "hbx-owner" / "windows-app"
        lines = [
            "# HBX Owner - roteiro branch/worktree",
            f"# Branch alvo: {branch}",
            f"# Ref: {ref}",
            f"# Base aprovacao: {base_branch}",
            "",
            "Set-StrictMode -Version Latest",
            f"Set-Location -LiteralPath {self.powershell_quote(repo)}",
            "git fetch --all --prune",
        ]
        if worktree.exists():
            lines.extend(["", f"Set-Location -LiteralPath {self.powershell_quote(worktree)}"])
        else:
            lines.extend(
                [
                    "",
                    (
                        f"if (git show-ref --verify --quiet {self.powershell_quote(f'refs/heads/{branch}')}) "
                        f"{{ git worktree add {self.powershell_quote(worktree)} {self.powershell_quote(branch)} }} "
                        f"else {{ git worktree add -b {self.powershell_quote(branch)} {self.powershell_quote(worktree)} {self.powershell_quote(ref)} }}"
                    ),
                    f"Set-Location -LiteralPath {self.powershell_quote(worktree)}",
                ]
            )
        lines.extend(["git status --short", ""])
        if owner_dir.exists():
            lines.extend(
                [
                    "# Testes HBX Owner",
                    f"Set-Location -LiteralPath {self.powershell_quote(owner_dir)}",
                    "python -m py_compile hbx_owner_app.py",
                    "python hbx_owner_app.py --no-gui",
                    "",
                ]
            )
        if backend_dir.exists():
            lines.extend(
                [
                    "# Testes backend",
                    f"Set-Location -LiteralPath {self.powershell_quote(backend_dir)}",
                    "npm run prisma:validate",
                    "npm run build",
                    "",
                ]
            )
        if frontend_dir.exists():
            lines.extend(
                [
                    "# Testes frontend",
                    f"Set-Location -LiteralPath {self.powershell_quote(frontend_dir)}",
                    "npm run lint",
                    "npm run build",
                    "",
                    "# Localhost isolado da branch (use porta separada do master)",
                    "npm run dev -- --hostname 127.0.0.1 --port 3001",
                    "",
                ]
            )
        lines.extend(
            [
                "# Se aprovado: merge local na base e push separado",
                f"Set-Location -LiteralPath {self.powershell_quote(repo)}",
                f"git checkout {self.powershell_quote(base_branch)}",
                f"git pull --ff-only origin {self.powershell_quote(base_branch)}",
                f"git merge --no-ff --no-edit {self.powershell_quote(ref)}",
                "git status --short",
                f"git push origin {self.powershell_quote(base_branch)}",
                "",
            ]
        )
        if self.pr_lab_is_protected_branch(branch):
            lines.append("# Rejeição bloqueada: master/main/base são protegidas no HBX Owner.")
        else:
            lines.extend(
                [
                    "# Se rejeitado: remover worktree e branch",
                    f"git worktree remove --force {self.powershell_quote(worktree)}",
                    f"git branch -D {self.powershell_quote(branch)}",
                    f"git push origin --delete {self.powershell_quote(branch)}",
                ]
            )
        text = "\n".join(lines)
        self.copy_text(text)
        self.set_pr_lab_output(text)
        self.pr_lab_status_var.set("Comandos da branch copiados para o clipboard.")

    def pr_lab_merge_approved(self) -> None:
        item = self.selected_pr_lab_item()
        if not item:
            messagebox.showwarning("Branches", "Selecione um PR ou branch.")
            return
        ref = self.pr_lab_preferred_merge_ref(item)
        branch = self.pr_lab_selected_branch_name(item)
        base_branch = self.pr_lab_base_branch()
        if not ref or not branch:
            message = "Branch/ref inválida para merge."
            self.pr_lab_status_var.set(message)
            self.set_pr_lab_output(message)
            return
        if self.pr_lab_is_protected_branch(branch):
            message = "Merge bloqueado: não faz sentido aprovar a própria branch base."
            self.pr_lab_status_var.set(message)
            self.set_pr_lab_output(message)
            return
        try:
            repo_path = self.pr_lab_repo_path()
        except RuntimeError as exc:
            self.pr_lab_status_var.set(str(exc))
            self.set_pr_lab_output(str(exc))
            return
        confirmed = messagebox.askyesno(
            "Merge no master",
            (
                f"Confirmar merge local de {ref} em {base_branch}?\n\n"
                "O Owner vai validar repo limpo, fazer checkout/pull --ff-only da base e só então mergear.\n"
                "Isso não faz push e não faz deploy."
            ),
        )
        if not confirmed:
            self.pr_lab_status_var.set("Merge cancelado pelo dono.")
            return
        self.pr_lab_status_var.set(f"Merge em andamento: {ref} -> {base_branch}...")

        def worker() -> None:
            ok, report = self.pr_lab_merge_worker(repo_path, ref, base_branch)
            self.after(0, lambda: self.finish_pr_lab_action("Merge", ok, report, refresh=True))

        threading.Thread(target=worker, daemon=True).start()

    def pr_lab_merge_worker(self, repo_path: Path, ref: str, base_branch: str) -> tuple[bool, str]:
        steps: list[str] = []

        def run(label: str, args: list[str], timeout: int = 60) -> bool:
            ok, output = self.run_hidden_command(["git", *args], repo_path, timeout=timeout)
            steps.append(
                f"{label}\nCMD: git {' '.join(args)}\nRESULTADO: {'OK' if ok else 'FALHOU'}\n{output or '-'}"
            )
            return ok

        ok, status = self.run_hidden_command(["git", "status", "--porcelain"], repo_path, timeout=20)
        steps.append(f"Validar repo limpo\nRESULTADO: {'OK' if ok and not status.strip() else 'FALHOU'}\n{status or '-'}")
        if not ok or status.strip():
            return False, "\n\n".join(steps)

        ok_local, _local = self.run_hidden_command(["git", "show-ref", "--verify", f"refs/heads/{base_branch}"], repo_path, timeout=20)
        if ok_local:
            if not run(f"Checkout {base_branch}", ["checkout", base_branch], timeout=45):
                return False, "\n\n".join(steps)
        else:
            if not run(f"Criar base local {base_branch}", ["checkout", "-B", base_branch, f"origin/{base_branch}"], timeout=60):
                return False, "\n\n".join(steps)
        if not run(f"Pull --ff-only {base_branch}", ["pull", "--ff-only", "origin", base_branch], timeout=120):
            return False, "\n\n".join(steps)
        if not run(f"Merge {ref}", ["merge", "--no-ff", "--no-edit", ref], timeout=180):
            return False, "\n\n".join(steps)
        run("Status pós-merge", ["status", "--short"], timeout=20)
        return True, "\n\n".join(steps)

    def pr_lab_push_base(self) -> None:
        base_branch = self.pr_lab_base_branch()
        try:
            repo_path = self.pr_lab_repo_path()
        except RuntimeError as exc:
            self.pr_lab_status_var.set(str(exc))
            self.set_pr_lab_output(str(exc))
            return
        confirmed = messagebox.askyesno(
            "Push master",
            (
                f"Confirmar push de {base_branch} para origin/{base_branch}?\n\n"
                "Use só depois dos testes e do merge local aprovado. Isso publica commits no GitHub."
            ),
        )
        if not confirmed:
            self.pr_lab_status_var.set("Push cancelado pelo dono.")
            return
        self.pr_lab_status_var.set(f"Push em andamento: origin/{base_branch}...")

        def worker() -> None:
            ok, report = self.pr_lab_push_worker(repo_path, base_branch)
            self.after(0, lambda: self.finish_pr_lab_action("Push", ok, report, refresh=True))

        threading.Thread(target=worker, daemon=True).start()

    def pr_lab_push_worker(self, repo_path: Path, base_branch: str) -> tuple[bool, str]:
        steps: list[str] = []

        def run(label: str, args: list[str], timeout: int = 60) -> tuple[bool, str]:
            ok, output = self.run_hidden_command(["git", *args], repo_path, timeout=timeout)
            steps.append(
                f"{label}\nCMD: git {' '.join(args)}\nRESULTADO: {'OK' if ok else 'FALHOU'}\n{output or '-'}"
            )
            return ok, output

        ok, current = run("Validar branch atual", ["rev-parse", "--abbrev-ref", "HEAD"], timeout=20)
        if not ok or current.strip() != base_branch:
            steps.append(f"Push bloqueado: branch atual é {current.strip() or '-'}, esperado {base_branch}.")
            return False, "\n\n".join(steps)
        ok, status = run("Validar repo limpo", ["status", "--porcelain"], timeout=20)
        if not ok or status.strip():
            steps.append("Push bloqueado: repo precisa estar limpo depois do merge/testes.")
            return False, "\n\n".join(steps)
        ok, _output = run(f"Push origin/{base_branch}", ["push", "origin", base_branch], timeout=180)
        return ok, "\n\n".join(steps)

    def pr_lab_delete_rejected_branch(self) -> None:
        item = self.selected_pr_lab_item()
        if not item:
            messagebox.showwarning("Branches", "Selecione um PR ou branch.")
            return
        branch = self.pr_lab_selected_branch_name(item)
        if not branch:
            message = "Branch inválida para rejeição."
            self.pr_lab_status_var.set(message)
            self.set_pr_lab_output(message)
            return
        if self.pr_lab_is_protected_branch(branch):
            message = "Rejeição bloqueada: master/main/base não podem ser excluídas pelo Owner."
            self.pr_lab_status_var.set(message)
            self.set_pr_lab_output(message)
            return
        typed = simpledialog.askstring(
            "Rejeitar branch",
            f"Para excluir a branch '{branch}', digite o nome exato da branch:",
            parent=self,
        )
        if typed != branch:
            self.pr_lab_status_var.set("Exclusão cancelada: nome não confirmado.")
            return
        try:
            repo_path = self.pr_lab_repo_path()
        except RuntimeError as exc:
            self.pr_lab_status_var.set(str(exc))
            self.set_pr_lab_output(str(exc))
            return
        worktree = self.pr_lab_selected_worktree_path(item)
        self.pr_lab_status_var.set(f"Rejeitando branch: {branch}...")

        def worker() -> None:
            ok, report = self.pr_lab_delete_branch_worker(repo_path, branch, worktree)
            self.after(0, lambda: self.finish_pr_lab_action("Rejeição", ok, report, refresh=True))

        threading.Thread(target=worker, daemon=True).start()

    def pr_lab_delete_branch_worker(self, repo_path: Path, branch: str, worktree: Path | None) -> tuple[bool, str]:
        steps: list[str] = []
        all_ok = True

        def run(label: str, args: list[str], timeout: int = 60, required: bool = True) -> bool:
            nonlocal all_ok
            ok, output = self.run_hidden_command(["git", *args], repo_path, timeout=timeout)
            steps.append(
                f"{label}\nCMD: git {' '.join(args)}\nRESULTADO: {'OK' if ok else 'FALHOU'}\n{output or '-'}"
            )
            if required and not ok:
                all_ok = False
            return ok

        if worktree and worktree.exists():
            try:
                root = self.pr_lab_worktree_root(ensure=False)
                resolved = worktree.resolve()
                if resolved != root and root in resolved.parents:
                    run("Remover worktree", ["worktree", "remove", "--force", str(resolved)], timeout=90, required=False)
                else:
                    steps.append(f"Worktree não removido por segurança: {resolved}")
            except RuntimeError as exc:
                steps.append(f"Worktree não removido: {exc}")

        ok_local, _local = self.run_hidden_command(["git", "show-ref", "--verify", f"refs/heads/{branch}"], repo_path, timeout=20)
        if ok_local:
            run("Excluir branch local", ["branch", "-D", branch], timeout=60, required=True)
        else:
            steps.append(f"Branch local ausente: {branch}")

        ok_remote, _remote = self.run_hidden_command(["git", "ls-remote", "--exit-code", "--heads", "origin", branch], repo_path, timeout=45)
        if ok_remote:
            run("Excluir branch remota", ["push", "origin", "--delete", branch], timeout=120, required=True)
        else:
            steps.append(f"Branch remota ausente ou não acessível: origin/{branch}")
        return all_ok, "\n\n".join(steps)

    def finish_pr_lab_action(self, action: str, ok: bool, report: str, refresh: bool = False) -> None:
        if refresh:
            self.pr_lab_list_all_branches()
        self.pr_lab_status_var.set(f"{action}: {'OK' if ok else 'falhou'}.")
        self.set_pr_lab_output(report or f"{action} concluído.")

    def _build_alignment_tab(self, frame: ttk.Frame) -> None:
        self.page_title(frame, "Alinhamento HBX", "Inventário read-only de local, GitHub, VPS e runtime")
        frame.columnconfigure(0, weight=1)
        frame.rowconfigure(4, weight=1)

        metrics = ttk.Frame(frame, style="App.TFrame")
        metrics.grid(row=1, column=0, sticky="ew", pady=(12, 10))
        for column in range(4):
            metrics.columnconfigure(column, weight=1)
        self.ops_metric_card(metrics, 0, "Local", self.alignment_local_var, THEME["accent"])
        self.ops_metric_card(metrics, 1, "Worktrees", self.alignment_worktrees_var, THEME["warning"])
        self.ops_metric_card(metrics, 2, "GitHub", self.alignment_remote_var, THEME["success"])
        self.ops_metric_card(metrics, 3, "Runtime", self.alignment_runtime_var, "#7c3aed")

        controls = self.card_frame(frame, padding=(12, 10))
        controls.grid(row=2, column=0, sticky="ew", pady=(0, 10))
        controls.columnconfigure(1, weight=1)
        controls.columnconfigure(3, weight=1)
        controls.columnconfigure(5, weight=1)
        ttk.Label(controls, text="repo", style="CardMuted.TLabel").grid(row=0, column=0, sticky="w", padx=(0, 8))
        ttk.Label(controls, text=str(self.repo_path()), style="Card.TLabel").grid(row=0, column=1, sticky="w", padx=(0, 18))
        ttk.Label(controls, text="runtime", style="CardMuted.TLabel").grid(row=0, column=2, sticky="w", padx=(0, 8))
        ttk.Label(
            controls,
            text=self.alignment_runtime_url_from_config(self.config_data),
            style="Card.TLabel",
        ).grid(row=0, column=3, sticky="w", padx=(0, 18))
        ttk.Label(controls, text="VPS", style="CardMuted.TLabel").grid(row=0, column=4, sticky="w", padx=(0, 8))
        ttk.Label(
            controls,
            text=str(self.config_data.get("alignment_vps_ssh_target") or "não configurada"),
            style="Card.TLabel",
        ).grid(row=0, column=5, sticky="w")

        toolbar = ttk.Frame(frame, style="Toolbar.TFrame")
        toolbar.grid(row=3, column=0, sticky="ew", pady=(0, 10))
        ttk.Button(toolbar, text="Verificar tudo", command=self.refresh_alignment, style="Accent.TButton").grid(
            row=0, column=0, sticky="w", padx=(0, 8)
        )
        ttk.Button(toolbar, text="Copiar relatório", command=self.copy_alignment_report).grid(
            row=0, column=1, sticky="w", padx=8
        )
        ttk.Button(toolbar, text="Abrir runtime", command=self.open_alignment_runtime).grid(
            row=0, column=2, sticky="w", padx=8
        )
        ttk.Button(toolbar, text="Ir para Branches", command=lambda: self.notebook.select(self.tabs["Branches"])).grid(
            row=0, column=3, sticky="w", padx=8
        )
        ttk.Label(toolbar, textvariable=self.alignment_status_var, style="Muted.TLabel").grid(
            row=0, column=4, sticky="w", padx=(18, 0)
        )

        body = ttk.Frame(frame, style="App.TFrame")
        body.grid(row=4, column=0, sticky="nsew")
        body.columnconfigure(0, weight=3)
        body.columnconfigure(1, weight=2)
        body.rowconfigure(0, weight=1)

        table_panel = ttk.LabelFrame(body, text="Camadas", padding=8, style="Modern.TLabelframe")
        table_panel.grid(row=0, column=0, sticky="nsew", padx=(0, 8))
        table_panel.columnconfigure(0, weight=1)
        table_panel.rowconfigure(0, weight=1)

        columns = ("camada", "branch", "head", "status", "detalhe")
        tree = ttk.Treeview(table_panel, columns=columns, show="headings", height=18)
        headings = {
            "camada": "Camada",
            "branch": "Branch / alvo",
            "head": "HEAD",
            "status": "Status",
            "detalhe": "Detalhe",
        }
        widths = {
            "camada": 125,
            "branch": 220,
            "head": 120,
            "status": 120,
            "detalhe": 420,
        }
        for column in columns:
            tree.heading(column, text=headings[column])
            tree.column(column, width=widths[column], anchor="w")
        tree.tag_configure("ok", foreground=THEME["success"])
        tree.tag_configure("warn", foreground=THEME["warning"])
        tree.tag_configure("fail", foreground=THEME["danger"])
        tree.grid(row=0, column=0, sticky="nsew")
        tree_scroll = ttk.Scrollbar(table_panel, orient="vertical", command=tree.yview)
        tree_scroll.grid(row=0, column=1, sticky="ns")
        tree.configure(yscrollcommand=tree_scroll.set)
        self.alignment_tree = tree

        output_panel = ttk.LabelFrame(body, text="Relatório", padding=8, style="Modern.TLabelframe")
        output_panel.grid(row=0, column=1, sticky="nsew", padx=(8, 0))
        output_panel.columnconfigure(0, weight=1)
        output_panel.rowconfigure(0, weight=1)
        self.alignment_output = tk.Text(output_panel, height=18, wrap="word")
        self.style_text_widget(self.alignment_output)
        self.alignment_output.grid(row=0, column=0, sticky="nsew")
        output_scroll = ttk.Scrollbar(output_panel, orient="vertical", command=self.alignment_output.yview)
        output_scroll.grid(row=0, column=1, sticky="ns")
        self.alignment_output.configure(yscrollcommand=output_scroll.set)
        self.set_alignment_output(
            "ALINHAMENTO HBX\n"
            "Clique em Verificar tudo para comparar local, worktrees, heads remotos, VPS opcional e containers.\n"
            "Este painel é somente leitura: não faz merge, push, deploy, restart ou limpeza."
        )

    def set_alignment_output(self, text: str) -> None:
        self.alignment_last_report = text
        if not self.alignment_output:
            return
        self.alignment_output.delete("1.0", tk.END)
        self.alignment_output.insert(tk.END, text)

    def alignment_runtime_url_from_config(self, config: dict) -> str:
        url = str(
            config.get("alignment_runtime_url")
            or config.get("pr_lab_localhost_url")
            or DEFAULT_CONFIG["alignment_runtime_url"]
        ).strip()
        if url and not re.match(r"^https?://", url, flags=re.IGNORECASE):
            url = f"http://{url}"
        return url

    def open_alignment_runtime(self) -> None:
        url = self.alignment_runtime_url_from_config(self.config_data)
        if not url:
            messagebox.showwarning("Alinhamento", "Runtime URL não configurada.")
            return
        webbrowser.open(url)
        self.alignment_status_var.set(f"Runtime aberto: {url}")

    def copy_alignment_report(self) -> None:
        text = self.alignment_last_report.strip()
        if not text and self.alignment_output:
            text = self.alignment_output.get("1.0", tk.END).strip()
        if not text:
            messagebox.showwarning("Alinhamento", "Nenhum relatório para copiar.")
            return
        self.copy_text(text)
        messagebox.showinfo("Alinhamento", "Relatório de alinhamento copiado.")

    def refresh_alignment(self) -> None:
        repo = self.repo_path()
        config = dict(self.config_data)
        self.alignment_status_var.set("Verificando local, GitHub, VPS e runtime...")

        def worker() -> None:
            snapshot = self.collect_alignment_snapshot(repo, config)
            self.after(0, lambda: self.apply_alignment_snapshot(snapshot))

        threading.Thread(target=worker, daemon=True).start()

    def apply_alignment_snapshot(self, snapshot: dict) -> None:
        metrics = snapshot.get("metrics", {})
        self.alignment_local_var.set(str(metrics.get("local") or "-"))
        self.alignment_worktrees_var.set(str(metrics.get("worktrees") or "-"))
        self.alignment_remote_var.set(str(metrics.get("remote") or "-"))
        self.alignment_runtime_var.set(str(metrics.get("runtime") or "-"))
        self.alignment_status_var.set(str(snapshot.get("status") or "Alinhamento concluído."))

        if self.alignment_tree:
            for item in self.alignment_tree.get_children():
                self.alignment_tree.delete(item)
            for row in snapshot.get("rows", []):
                self.alignment_tree.insert(
                    "",
                    "end",
                    values=(
                        row.get("layer", "-"),
                        row.get("branch", "-"),
                        row.get("head", "-"),
                        row.get("status", "-"),
                        row.get("detail", "-"),
                    ),
                    tags=(self.alignment_row_tag(row),),
                )
        self.set_alignment_output(str(snapshot.get("report") or ""))

    def alignment_row_tag(self, row: dict) -> str:
        status = str(row.get("status") or "").lower()
        detail = str(row.get("detail") or "").lower()
        text = f"{status} {detail}"
        if any(token in text for token in ("falha", "erro", "indisponível", "indisponivel", "ausente")):
            return "fail"
        if any(token in text for token in ("sujo", "divergente", "não configur", "nao configur", "sem revision", "alerta")):
            return "warn"
        return "ok"

    def collect_alignment_snapshot(self, repo: Path, config: dict) -> dict:
        rows: list[dict[str, str]] = []
        sections: list[tuple[str, str]] = []
        metrics = {"local": "-", "worktrees": "-", "remote": "-", "runtime": "-"}
        command_cwd = repo if repo.exists() else APP_DIR

        def add_row(layer: str, branch: str, head: str, status: str, detail: str) -> None:
            rows.append(
                {
                    "layer": layer,
                    "branch": self.alignment_clip(branch, 160),
                    "head": self.alignment_short_sha(head) or "-",
                    "status": self.alignment_clip(status, 80),
                    "detail": self.alignment_clip(detail, 320),
                }
            )

        local_branch = "-"
        local_head = ""
        local_ok = repo.exists()
        if not repo.exists():
            add_row("Local", str(repo), "-", "falha", "repo_path não existe")
            sections.append(("LOCAL", f"repo_path não existe: {repo}"))
        else:
            ok_branch, branch_output = self.alignment_git(repo, ["rev-parse", "--abbrev-ref", "HEAD"])
            ok_head, head_output = self.alignment_git(repo, ["rev-parse", "HEAD"])
            ok_status, status_output = self.alignment_git(repo, ["status", "--short"])
            local_ok = ok_branch and ok_head
            local_branch = branch_output.strip().splitlines()[0] if ok_branch and branch_output.strip() else "-"
            local_head = head_output.strip().splitlines()[0] if ok_head and head_output.strip() else ""
            status_lines = [line for line in status_output.splitlines() if line.strip()] if ok_status else []
            status = "limpo" if local_ok and ok_status and not status_lines else "sujo" if local_ok and ok_status else "falha"
            detail = f"{len(status_lines)} mudança(s)" if status_lines else str(repo)
            if status_lines:
                detail = f"{detail}: " + " | ".join(status_lines[:5])
            if not local_ok:
                detail = branch_output or head_output or status_output or "não consegui ler HEAD local"
            add_row("Local", local_branch, local_head, status, detail)
            metrics["local"] = f"{local_branch} {self.alignment_short_sha(local_head)}" if local_head else "falha"
            sections.append(
                (
                    "LOCAL",
                    "\n".join(
                        [
                            f"Repo: {repo}",
                            f"Branch: {local_branch}",
                            f"HEAD: {local_head or '-'}",
                            f"Status: {status}",
                            status_output.strip() or "-",
                        ]
                    ),
                )
            )

        worktree_count = 0
        dirty_worktrees = 0
        if repo.exists():
            ok_wt, worktree_output = self.alignment_git(repo, ["worktree", "list", "--porcelain"], timeout=30)
            if ok_wt:
                worktrees = self.parse_alignment_worktrees(worktree_output)
                worktree_count = len(worktrees)
                for item in worktrees:
                    path_text = str(item.get("path") or "")
                    path = Path(path_text)
                    branch = str(item.get("branch") or "detached").replace("refs/heads/", "")
                    head = str(item.get("head") or "")
                    ok_status, status_output = self.run_hidden_command(["git", "status", "--short"], path, timeout=20) if path.exists() else (False, "worktree path ausente")
                    status_lines = [line for line in status_output.splitlines() if line.strip()] if ok_status else []
                    if status_lines:
                        dirty_worktrees += 1
                    status = "limpo" if ok_status and not status_lines else "sujo" if ok_status else "falha"
                    detail = path_text if not status_lines else f"{path_text} | " + " | ".join(status_lines[:3])
                    add_row("Worktree", branch, head, status, detail)
                sections.append(("WORKTREES", worktree_output.strip() or "-"))
            else:
                add_row("Worktree", "-", "-", "falha", worktree_output or "git worktree list falhou")
                sections.append(("WORKTREES", worktree_output or "git worktree list falhou"))
        metrics["worktrees"] = f"{worktree_count} total" + (f", {dirty_worktrees} sujo(s)" if dirty_worktrees else "")

        remote_heads: dict[str, str] = {}
        remote_url = "-"
        if repo.exists():
            ok_url, url_output = self.alignment_git(repo, ["remote", "get-url", "origin"], timeout=20)
            remote_url = url_output.strip() if ok_url and url_output.strip() else "-"
            ok_remote, remote_output = self.alignment_git(repo, ["ls-remote", "--heads", "origin"], timeout=60)
            if ok_remote:
                remote_heads = self.parse_alignment_remote_heads(remote_output)
                for branch, sha in sorted(remote_heads.items(), key=lambda item: item[0].lower()):
                    add_row("GitHub/origin", branch, sha, "remoto", remote_url)
                sections.append(("GITHUB/ORIGIN HEADS", remote_output.strip() or "-"))
            else:
                add_row("GitHub/origin", "origin", "-", "falha", remote_output or "git ls-remote falhou")
                sections.append(("GITHUB/ORIGIN HEADS", remote_output or "git ls-remote falhou"))
        metrics["remote"] = f"{len(remote_heads)} heads" if remote_heads else "0 heads"

        if local_branch not in ("-", "HEAD") and local_head and remote_heads:
            remote_head = remote_heads.get(local_branch)
            if remote_head:
                compare_status = "alinhado" if remote_head == local_head else "divergente"
                compare_detail = (
                    f"local {self.alignment_short_sha(local_head)} | "
                    f"origin/{local_branch} {self.alignment_short_sha(remote_head)}"
                )
                add_row("Comparação", local_branch, local_head, compare_status, compare_detail)
            else:
                add_row("Comparação", local_branch, local_head, "sem remoto", f"origin/{local_branch} não existe")

        runtime_rows, runtime_text, runtime_metric = self.collect_alignment_runtime(command_cwd, config, remote_heads, local_head)
        rows.extend(runtime_rows)
        metrics["runtime"] = runtime_metric
        sections.append(("RUNTIME LOCAL", runtime_text))

        vps_rows, vps_text = self.collect_alignment_vps(command_cwd, config, remote_heads, local_head)
        rows.extend(vps_rows)
        sections.append(("VPS", vps_text))

        fail_count = sum(1 for row in rows if self.alignment_row_tag(row) == "fail")
        warn_count = sum(1 for row in rows if self.alignment_row_tag(row) == "warn")
        status = f"Alinhamento concluído: {len(rows)} item(ns), {fail_count} falha(s), {warn_count} aviso(s)."
        report = self.format_alignment_report(repo, rows, sections, metrics, status)
        return {"rows": rows, "metrics": metrics, "status": status, "report": report}

    def alignment_git(self, repo: Path, args: list[str], timeout: int = 30) -> tuple[bool, str]:
        return self.run_hidden_command(["git", *args], repo, timeout=timeout)

    def parse_alignment_worktrees(self, output: str) -> list[dict[str, str]]:
        worktrees: list[dict[str, str]] = []
        current: dict[str, str] = {}
        for line in output.splitlines():
            if not line.strip():
                if current:
                    worktrees.append(current)
                    current = {}
                continue
            key, _, value = line.partition(" ")
            if key == "worktree":
                current["path"] = value.strip()
            elif key == "HEAD":
                current["head"] = value.strip()
            elif key == "branch":
                current["branch"] = value.strip()
            elif key == "detached":
                current["branch"] = "detached"
        if current:
            worktrees.append(current)
        return worktrees

    def parse_alignment_remote_heads(self, output: str) -> dict[str, str]:
        heads: dict[str, str] = {}
        prefix = "refs/heads/"
        for line in output.splitlines():
            parts = line.split()
            if len(parts) < 2 or not parts[1].startswith(prefix):
                continue
            heads[parts[1][len(prefix) :]] = parts[0]
        return heads

    def collect_alignment_runtime(
        self,
        cwd: Path,
        config: dict,
        remote_heads: dict[str, str],
        local_head: str,
    ) -> tuple[list[dict[str, str]], str, str]:
        rows: list[dict[str, str]] = []
        lines: list[str] = []
        runtime_url = self.alignment_runtime_url_from_config(config)
        http_status = "sem health"
        if runtime_url:
            http_row, http_text = self.collect_alignment_runtime_http(runtime_url, remote_heads, local_head)
            rows.append(http_row)
            lines.append(http_text)
            http_status = http_row["status"]
        else:
            rows.append(
                {
                    "layer": "Runtime HTTP",
                    "branch": "-",
                    "head": "-",
                    "status": "não configurado",
                    "detail": "alignment_runtime_url vazio",
                }
            )
            lines.append("Runtime HTTP não configurado.")

        container_rows, container_text = self.collect_alignment_local_containers(cwd, config, remote_heads, local_head)
        rows.extend(container_rows)
        lines.append(container_text)
        container_count = len([row for row in container_rows if row.get("layer") == "Container local"])
        return rows, "\n\n".join(lines), f"{http_status}; {container_count} cont."

    def collect_alignment_runtime_http(
        self,
        runtime_url: str,
        remote_heads: dict[str, str],
        local_head: str,
    ) -> tuple[dict[str, str], str]:
        base = runtime_url.rstrip("/")
        endpoints = ("/api/health", "/health", "/api/version", "/version", "")
        last_error = ""
        for endpoint in endpoints:
            url = f"{base}{endpoint}"
            ok, status_code, body = self.alignment_fetch_url(url)
            if not ok:
                last_error = body
                continue
            info = self.alignment_extract_runtime_info(body)
            commit = str(info.get("commit") or "")
            branch = str(info.get("branch") or url)
            version = str(info.get("version") or info.get("build") or "")
            compare = self.alignment_compare_revision(commit, remote_heads, local_head) if commit else "sem commit no payload"
            detail_parts = [url, f"HTTP {status_code}", compare]
            if version:
                detail_parts.append(f"versão/build {version}")
            return (
                {
                    "layer": "Runtime HTTP",
                    "branch": branch,
                    "head": commit or "-",
                    "status": f"HTTP {status_code}",
                    "detail": " | ".join(detail_parts),
                },
                f"{url}\nHTTP {status_code}\n{body[:4000] if body else '-'}",
            )
        return (
            {
                "layer": "Runtime HTTP",
                "branch": runtime_url,
                "head": "-",
                "status": "indisponível",
                "detail": last_error or "nenhum endpoint health/version respondeu",
            },
            f"Runtime HTTP indisponível em {runtime_url}\n{last_error or '-'}",
        )

    def collect_alignment_local_containers(
        self,
        cwd: Path,
        config: dict,
        remote_heads: dict[str, str],
        local_head: str,
    ) -> tuple[list[dict[str, str]], str]:
        rows: list[dict[str, str]] = []
        ok, output = self.run_hidden_command(
            ["docker", "ps", "--format", "{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}"],
            cwd,
            timeout=25,
        )
        if not ok:
            message = self.friendly_docker_error(output or "docker ps falhou")
            return (
                [
                    {
                        "layer": "Container local",
                        "branch": "-",
                        "head": "-",
                        "status": "indisponível",
                        "detail": message,
                    }
                ],
                message,
            )

        filter_text = str(config.get("alignment_container_filter") or "").strip().lower()
        containers = []
        for line in output.splitlines():
            parts = line.split("\t")
            if len(parts) < 4:
                continue
            cid, name, image, status = parts[:4]
            if filter_text and filter_text not in f"{name} {image}".lower():
                continue
            containers.append({"id": cid, "name": name, "image": image, "status": status})

        if not containers:
            detail = f"nenhum container ativo com filtro '{filter_text}'" if filter_text else "nenhum container ativo"
            return (
                [
                    {
                        "layer": "Container local",
                        "branch": "-",
                        "head": "-",
                        "status": "alerta",
                        "detail": detail,
                    }
                ],
                output.strip() or detail,
            )

        report_lines = ["Containers locais:"]
        for container in containers:
            revision, version, project = self.alignment_container_labels(cwd, container["id"])
            revision_source = "label"
            if not revision:
                revision = self.alignment_revision_from_image(container["image"])
                revision_source = "imagem" if revision else ""
            compare = self.alignment_compare_revision(revision, remote_heads, local_head) if revision else "sem revision label"
            detail = f"{container['name']} | {container['status']} | {compare}"
            if revision_source:
                detail += f" | revision via {revision_source}"
            if version:
                detail += f" | version {version}"
            if project:
                detail += f" | compose {project}"
            rows.append(
                {
                    "layer": "Container local",
                    "branch": container["image"],
                    "head": revision or "-",
                    "status": "publicado" if revision else "sem revision",
                    "detail": detail,
                }
            )
            report_lines.append(
                f"- {container['name']} | {container['image']} | {container['status']} | "
                f"revision={revision or '-'} | fonte={revision_source or '-'} | {compare}"
            )
        return rows, "\n".join(report_lines)

    def alignment_container_labels(self, cwd: Path, container_id: str) -> tuple[str, str, str]:
        template = (
            '{{ index .Config.Labels "org.opencontainers.image.revision" }}\t'
            '{{ index .Config.Labels "org.opencontainers.image.version" }}\t'
            '{{ index .Config.Labels "com.docker.compose.project" }}'
        )
        ok, output = self.run_hidden_command(["docker", "inspect", "--format", template, container_id], cwd, timeout=10)
        if not ok:
            return "", "", ""
        parts = ["" if part.strip() == "<no value>" else part.strip() for part in output.split("\t")]
        while len(parts) < 3:
            parts.append("")
        return parts[0], parts[1], parts[2]

    def collect_alignment_vps(
        self,
        cwd: Path,
        config: dict,
        remote_heads: dict[str, str],
        local_head: str,
    ) -> tuple[list[dict[str, str]], str]:
        target = str(config.get("alignment_vps_ssh_target") or "").strip()
        repo_path = str(config.get("alignment_vps_repo_path") or "").strip()
        if not target:
            return (
                [
                    {
                        "layer": "VPS",
                        "branch": "-",
                        "head": "-",
                        "status": "não configurado",
                        "detail": "preencha alignment_vps_ssh_target para auditar por SSH",
                    }
                ],
                "VPS não configurada. Este painel não usa VPS como fonte de branch; ela serve apenas para comparar deploy/runtime.",
            )

        docker_format = "{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}"
        inspect_template = '{{ index .Config.Labels "org.opencontainers.image.revision" }}'
        script_parts = ['echo "__HBX_VPS_GIT__"']
        if repo_path:
            quoted_repo = shlex.quote(repo_path)
            script_parts.append(
                "if [ -d {repo} ]; then "
                "cd {repo} && "
                "echo \"GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)\" && "
                "echo \"GIT_HEAD=$(git rev-parse HEAD 2>/dev/null)\" && "
                "echo \"GIT_STATUS_COUNT=$(git status --short 2>/dev/null | wc -l)\"; "
                "else echo \"GIT_REPO_MISSING={plain}\"; fi".format(
                    repo=quoted_repo,
                    plain=repo_path.replace('"', "'"),
                )
            )
        else:
            script_parts.append('echo "GIT_REPO_MISSING=alignment_vps_repo_path vazio"')
        script_parts.append('echo "__HBX_VPS_CONTAINERS__"')
        script_parts.append(
            "docker ps --format {fmt} 2>/dev/null | "
            "while IFS=\"$(printf '\\t')\" read -r cid cname cimage cstatus; do "
            "crev=$(docker inspect --format {inspect} \"$cid\" 2>/dev/null); "
            "printf 'CONTAINER\\t%s\\t%s\\t%s\\t%s\\n' \"$cname\" \"$cimage\" \"$cstatus\" \"$crev\"; "
            "done".format(fmt=shlex.quote(docker_format), inspect=shlex.quote(inspect_template))
        )
        command = [
            "ssh",
            "-o",
            "BatchMode=yes",
            "-o",
            "ConnectTimeout=8",
            target,
            " ; ".join(script_parts),
        ]
        ok, output = self.run_hidden_command(command, cwd, timeout=35)
        if not ok:
            return (
                [
                    {
                        "layer": "VPS",
                        "branch": target,
                        "head": "-",
                        "status": "falha SSH",
                        "detail": output or "ssh não respondeu",
                    }
                ],
                output or "ssh não respondeu",
            )

        branch = "-"
        head = ""
        status_count = ""
        missing_repo = ""
        container_rows: list[dict[str, str]] = []
        for line in output.splitlines():
            if line.startswith("GIT_BRANCH="):
                branch = line.split("=", 1)[1].strip() or "-"
            elif line.startswith("GIT_HEAD="):
                head = line.split("=", 1)[1].strip()
            elif line.startswith("GIT_STATUS_COUNT="):
                status_count = line.split("=", 1)[1].strip()
            elif line.startswith("GIT_REPO_MISSING="):
                missing_repo = line.split("=", 1)[1].strip()
            elif line.startswith("CONTAINER\t"):
                parts = line.split("\t")
                if len(parts) < 5:
                    continue
                _tag, name, image, status, revision = parts[:5]
                revision = "" if revision.strip() == "<no value>" else revision.strip()
                revision_source = "label"
                if not revision:
                    revision = self.alignment_revision_from_image(image)
                    revision_source = "imagem" if revision else ""
                compare = self.alignment_compare_revision(revision, remote_heads, local_head) if revision else "sem revision label"
                container_rows.append(
                    {
                        "layer": "VPS container",
                        "branch": image,
                        "head": revision or "-",
                        "status": "publicado" if revision else "sem revision",
                        "detail": f"{name} | {status} | {compare}" + (f" | revision via {revision_source}" if revision_source else ""),
                    }
                )

        rows: list[dict[str, str]] = []
        if missing_repo:
            rows.append(
                {
                    "layer": "VPS git",
                    "branch": target,
                    "head": "-",
                    "status": "ausente",
                    "detail": missing_repo,
                }
            )
        else:
            dirty = status_count and status_count != "0"
            rows.append(
                {
                    "layer": "VPS git",
                    "branch": branch,
                    "head": head or "-",
                    "status": "sujo" if dirty else "limpo",
                    "detail": f"{target} | mudanças: {status_count or '?'}",
                }
            )
        rows.extend(container_rows)
        if not container_rows:
            rows.append(
                {
                    "layer": "VPS container",
                    "branch": target,
                    "head": "-",
                    "status": "alerta",
                    "detail": "nenhum container retornado por docker ps na VPS",
                }
            )
        return rows, output.strip() or "-"

    def alignment_fetch_url(self, url: str) -> tuple[bool, int, str]:
        request = urllib.request.Request(url, headers={"User-Agent": "HBXOwnerAlignment/1.0"})
        try:
            with urllib.request.urlopen(request, timeout=5) as response:
                raw = response.read(24_000)
                charset = response.headers.get_content_charset() or "utf-8"
                return True, int(getattr(response, "status", 200)), raw.decode(charset, errors="replace")
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            return False, 0, str(exc)

    def alignment_extract_runtime_info(self, body: str) -> dict[str, str]:
        info: dict[str, str] = {}
        text = body.strip()
        if text.startswith("{") or text.startswith("["):
            try:
                data = json.loads(text)
            except json.JSONDecodeError:
                data = None
            if data is not None:
                self.alignment_collect_json_info(data, info)
        if "commit" not in info:
            match = re.search(r"\b[0-9a-f]{7,40}\b", text, flags=re.IGNORECASE)
            if match:
                info["commit"] = match.group(0)
        return info

    def alignment_revision_from_image(self, image: str) -> str:
        for pattern in (r"[:@]([0-9a-fA-F]{7,40})(?:$|[^0-9a-fA-F])", r"\b([0-9a-fA-F]{12,40})\b"):
            match = re.search(pattern, str(image or ""))
            if match:
                return match.group(1)
        return ""

    def alignment_collect_json_info(self, data: object, info: dict[str, str]) -> None:
        key_map = {
            "commit": "commit",
            "sha": "commit",
            "gitsha": "commit",
            "git_sha": "commit",
            "revision": "commit",
            "branch": "branch",
            "version": "version",
            "build": "build",
            "image": "image",
        }
        if isinstance(data, dict):
            for key, value in data.items():
                normalized = re.sub(r"[^a-z0-9_]+", "", str(key).lower())
                target = key_map.get(normalized)
                if target and isinstance(value, (str, int, float)) and target not in info:
                    info[target] = str(value)[:160]
                if isinstance(value, (dict, list)):
                    self.alignment_collect_json_info(value, info)
        elif isinstance(data, list):
            for item in data[:20]:
                self.alignment_collect_json_info(item, info)

    def alignment_compare_revision(self, revision: str, remote_heads: dict[str, str], local_head: str) -> str:
        clean = str(revision or "").strip()
        if not clean:
            return "sem revision"
        if local_head and clean.startswith(local_head[: len(clean)]):
            return "igual ao HEAD local"
        for branch, sha in remote_heads.items():
            if sha.startswith(clean) or clean.startswith(sha[: len(clean)]):
                return f"igual origin/{branch}"
        return "revision não encontrada no local/origin"

    def alignment_short_sha(self, value: str) -> str:
        text = str(value or "").strip()
        if not text or text == "-":
            return ""
        if re.fullmatch(r"[0-9a-fA-F]{7,40}", text):
            return text[:12]
        return self.alignment_clip(text, 24)

    def alignment_clip(self, value: object, limit: int) -> str:
        text = str(value or "-").replace("\r", " ").replace("\n", " ").strip()
        return text if len(text) <= limit else f"{text[: max(0, limit - 3)]}..."

    def format_alignment_report(
        self,
        repo: Path,
        rows: list[dict[str, str]],
        sections: list[tuple[str, str]],
        metrics: dict,
        status: str,
    ) -> str:
        lines = [
            "ALINHAMENTO HBX",
            f"Data: {now_iso()}",
            f"Repo local: {repo}",
            "",
            "RESUMO",
            f"- Status: {status}",
            f"- Local: {metrics.get('local', '-')}",
            f"- Worktrees: {metrics.get('worktrees', '-')}",
            f"- GitHub/origin: {metrics.get('remote', '-')}",
            f"- Runtime: {metrics.get('runtime', '-')}",
            "",
            "CAMADAS",
        ]
        for row in rows:
            lines.append(
                "- {layer}: {branch} | {head} | {status} | {detail}".format(
                    layer=row.get("layer", "-"),
                    branch=row.get("branch", "-"),
                    head=row.get("head", "-"),
                    status=row.get("status", "-"),
                    detail=row.get("detail", "-"),
                )
            )
        lines.append("")
        lines.append("DETALHES")
        for title, text in sections:
            lines.extend(["", f"[{title}]", text.strip() or "-"])
        return "\n".join(lines)

    def _build_chatgpt_tab(self, frame: ttk.Frame) -> None:
        self.page_title(frame, "ChatGPT", "Pesquisa em cards")

        buttons = ttk.Frame(frame, style="Toolbar.TFrame")
        buttons.grid(row=1, column=0, sticky="w", pady=(12, 10))
        ttk.Button(buttons, text="Copiar regra", command=self.copy_hbx_required_output_rules, style="Accent.TButton").grid(
            row=0, column=0, padx=(0, 8)
        )
        ttk.Button(
            buttons,
            text="Semi automático",
            command=self.prepare_hbx_deep_research_semi_auto,
            style="Success.TButton",
        ).grid(row=0, column=1, padx=8)
        ttk.Button(
            buttons,
            text="Pesquisa automática",
            command=self.prepare_hbx_deep_research_auto,
            style="Success.TButton",
        ).grid(row=0, column=2, padx=8)
        ttk.Button(
            buttons,
            text="Gerar cards",
            command=self.transform_response_into_cards,
            style="Success.TButton",
        ).grid(row=0, column=3, padx=8)

        status = ttk.Frame(frame, style="Toolbar.TFrame")
        status.grid(row=2, column=0, sticky="ew", pady=(0, 10))
        ttk.Label(status, textvariable=self.autocard_status_var, style="Muted.TLabel").grid(row=0, column=0, sticky="w")

        output_frame = ttk.LabelFrame(frame, text="Pesquisa, prompt ou resposta", padding=8, style="Modern.TLabelframe")
        output_frame.grid(row=3, column=0, sticky="nsew")
        output_frame.columnconfigure(0, weight=1)
        output_frame.rowconfigure(0, weight=1)
        frame.rowconfigure(3, weight=1)

        self.chatgpt_text = tk.Text(output_frame, height=26, wrap="word")
        self.style_text_widget(self.chatgpt_text)
        self.chatgpt_text.grid(row=0, column=0, sticky="nsew")
        scroll = ttk.Scrollbar(output_frame, orient="vertical", command=self.chatgpt_text.yview)
        scroll.grid(row=0, column=1, sticky="ns")
        self.chatgpt_text.configure(yscrollcommand=scroll.set)

    def set_chatgpt_text(self, text: str) -> None:
        if not hasattr(self, "chatgpt_text"):
            return
        self.chatgpt_text.delete("1.0", tk.END)
        self.chatgpt_text.insert(tk.END, text)

    def hbx_required_output_rules(self) -> str:
        return (
            "SAIDA OBRIGATORIA\n"
            "1. Responda somente com HBX_CARDS_JSON_START / HBX_CARDS_JSON_END.\n"
            "2. Dentro do bloco, devolva apenas um JSON array valido; sem markdown e sem resumo fora do bloco.\n"
            f"3. Primeiro card: criar/atualizar o relatorio datado em docs/OWNER_RESEARCH_{today_str()}.md, com estado atual, evolucao, proximos passos em paralelo e riscos.\n"
            "4. Todos os cards devem entrar em lane HOJE; o Owner decide manualmente o que vai para Codex.\n"
            "5. Riscos sensiveis devem ficar descritos no texto/aceite, sem criar travas de fluxo.\n"
            "6. Preencha urgency_level, intelligence_level, execution_timeout_seconds e research_path.\n"
            "   intelligence_level valido: use somente Média, High ou Extra high.\n"
            "   codex_model_override deve ficar vazio, salvo instrução explícita do Owner.\n"
            "7. O codex_prompt deve ser a licao de casa: leia AGENTS.md, pesquise nos caminhos certos, trabalhe na branch criada pelo Owner, implemente a menor correcao segura, rode checks relevantes e registre o resultado."
        )

    def copy_hbx_required_output_rules(self) -> None:
        rules = self.hbx_required_output_rules()
        self.copy_text(rules)
        self.set_chatgpt_text(rules)
        self.autocard_status_var.set("Regra HBX_CARDS_JSON copiada.")

    def prepare_hbx_deep_research_semi_auto(self) -> None:
        prompt = self.build_hbx_deep_research_prompt()
        self.last_chatgpt_prompt = prompt
        self.chatgpt_last_research_prompt = prompt
        self.copy_text(prompt)
        path = self.save_prompt_file("hbx-deep-research-semi-auto", prompt)
        self.open_chatgpt()
        self.set_chatgpt_text(
            f"{prompt}\n\n---\nPrompt copiado e salvo em: {path}\n"
            "Semi automático: abrindo o ChatGPT e colando o prompt sem enviar."
        )
        self.autocard_status_var.set("Semi automático: tentando colar o prompt no ChatGPT sem enviar.")
        threading.Thread(
            target=lambda: self.run_chatgpt_prompt_paste_only(path),
            daemon=True,
        ).start()

    def prepare_hbx_deep_research_auto(self) -> None:
        prompt = self.build_hbx_deep_research_prompt()
        self.last_chatgpt_prompt = prompt
        self.chatgpt_last_research_prompt = prompt
        self.copy_text(prompt)
        path = self.save_prompt_file("hbx-deep-research-auto", prompt)
        self.open_chatgpt()
        self.set_chatgpt_text(
            f"{prompt}\n\n---\nPrompt copiado e salvo em: {path}\n"
            "Automação full iniciada: tentando focar o ChatGPT, selecionar pesquisa aprofundada/GitHub, colar e enviar."
        )
        self.autocard_status_var.set("Pesquisa automática: tentando controlar o ChatGPT Desktop.")
        threading.Thread(
            target=lambda: self.run_chatgpt_deep_research_automation(path),
            daemon=True,
        ).start()

    def run_chatgpt_prompt_paste_only(self, prompt_path: Path) -> None:
        ok, output = self.submit_chatgpt_deep_research_prompt(send_enter=False)
        if not ok:
            self.after(
                0,
                lambda: self.autocard_status_var.set(
                    f"Semi automático falhou. Prompt segue no clipboard. {output[:180]}"
                ),
            )
            return
        self.after(
            0,
            lambda: self.autocard_status_var.set(
                f"Semi automático pronto. Prompt colado sem enviar. Arquivo: {prompt_path.name}"
            ),
        )

    def run_chatgpt_deep_research_automation(self, prompt_path: Path) -> None:
        ok, output = self.submit_chatgpt_deep_research_prompt(send_enter=True)
        if not ok:
            self.after(
                0,
                lambda: self.autocard_status_var.set(
                    f"Pesquisa automática falhou ao enviar. Prompt segue no clipboard. {output[:180]}"
                ),
            )
            return

        self.after(
            0,
            lambda: self.autocard_status_var.set(
                "Pesquisa automática enviada. Monitorando ChatGPT até aparecer HBX_CARDS_JSON."
            ),
        )
        self.monitor_chatgpt_deep_research_result(prompt_path)

    def submit_chatgpt_deep_research_prompt(self, send_enter: bool | None = None) -> tuple[bool, str]:
        if not sys.platform.startswith("win"):
            return False, "Automação full só está implementada no Windows."

        delay_ms = max(500, self.parse_int_config("chatgpt_auto_focus_delay_seconds", 5) * 1000)
        extra_keys = self.chatgpt_auto_extra_key_sequence()
        script = self.build_chatgpt_submit_script(
            delay_ms=delay_ms,
            model_mode=str(self.config_data.get("chatgpt_auto_model_mode") or "Pro").strip(),
            new_chat=self.config_bool("chatgpt_auto_new_chat", True),
            send_enter=self.config_bool("chatgpt_auto_send_enter", True) if send_enter is None else send_enter,
            extra_keys=extra_keys,
        )
        timeout = max(20, int(delay_ms / 1000) + 25)
        return self.run_powershell_automation(script, timeout=timeout)

    def monitor_chatgpt_deep_research_result(self, prompt_path: Path) -> None:
        max_minutes = self.parse_int_config("chatgpt_auto_monitor_minutes", 0)
        poll_seconds = max(5, self.parse_int_config("chatgpt_auto_poll_seconds", 20))
        deadline = time.monotonic() + max_minutes * 60 if max_minutes > 0 else None
        attempt = 0
        last_error = ""

        while deadline is None or time.monotonic() < deadline:
            attempt += 1
            ok, visible_text = self.read_chatgpt_visible_text()
            if ok and visible_text:
                block = self.extract_autocard_json_block(visible_text)
                if block:
                    self.after(0, lambda text=block: self.finish_chatgpt_auto_research(text, prompt_path))
                    return
                last_error = ""
            elif visible_text:
                last_error = visible_text[:220]
                if "Janela do ChatGPT não encontrada" in visible_text:
                    self.after(
                        0,
                        lambda detail=last_error: self.autocard_status_var.set(
                            f"Pesquisa automática parada: {detail}"
                        ),
                    )
                    return

            if attempt <= 6 or attempt % 6 == 0:
                self.advance_chatgpt_research_if_needed()

            if attempt == 1 or attempt % 3 == 0:
                remaining = "sem limite" if deadline is None else f"{max(0, int((deadline - time.monotonic()) // 60))} min"
                self.after(
                    0,
                    lambda remaining=remaining: self.autocard_status_var.set(
                        f"Pesquisa automática em andamento. Aguardando JSON no ChatGPT; limite restante: {remaining}."
                    ),
                )
            time.sleep(poll_seconds)

        message = (
            "Pesquisa automática: não encontrei HBX_CARDS_JSON na janela do ChatGPT dentro do limite. "
            "A pesquisa pode ainda estar rodando; copie o resultado final e cole no campo de texto com Ctrl+V."
        )
        if last_error:
            message = f"{message} Último detalhe: {last_error}"
        self.after(0, lambda: self.autocard_status_var.set(message[:500]))

    def finish_chatgpt_auto_research(self, text: str, prompt_path: Path) -> None:
        self.copy_text(text)
        self.set_chatgpt_text(text)
        self.save_chatgpt_exchange(text, prompt=f"auto-pesquisa-hbx:{prompt_path.name}")
        if not self.can_create_new_card():
            return
        try:
            created_ids, skipped_existing, recognized_count = self.create_chatgpt_cards_from_text(text, source="ChatGPT auto")
        except Exception as exc:
            self.autocard_status_var.set(f"Pesquisa automática capturada, mas falhou ao gerar cards: {exc}")
            return
        if not recognized_count:
            self.autocard_status_var.set("Pesquisa automática capturada, mas nenhum card foi reconhecido.")
            return
        self.notebook.select(self.tabs["Kanban"])
        self.report_autocard_result(created_ids, skipped_existing, recognized_count, "Pesquisa automática")

    def extract_autocard_json_block(self, text: str) -> str:
        pattern = re.compile(
            rf"{re.escape(AUTOCARD_JSON_START)}\s*(.*?)\s*{re.escape(AUTOCARD_JSON_END)}",
            re.IGNORECASE | re.DOTALL,
        )
        match = pattern.search(str(text or ""))
        if not match:
            return ""
        return f"{AUTOCARD_JSON_START}\n{match.group(1).strip()}\n{AUTOCARD_JSON_END}"

    def read_chatgpt_visible_text(self) -> tuple[bool, str]:
        if not sys.platform.startswith("win"):
            return False, "Leitura automática do ChatGPT só está implementada no Windows."
        return self.run_powershell_automation(self.chatgpt_visible_text_script(), timeout=20)

    def advance_chatgpt_research_if_needed(self) -> tuple[bool, str]:
        if not sys.platform.startswith("win"):
            return False, ""
        return self.run_powershell_automation(self.chatgpt_advance_research_script(), timeout=15)

    def run_powershell_automation(self, script: str, timeout: int = 30) -> tuple[bool, str]:
        command = ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script]
        try:
            result = subprocess.run(
                command,
                cwd=APP_DIR,
                capture_output=True,
                text=True,
                timeout=timeout,
                check=False,
                creationflags=self.hidden_creation_flags(),
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            return False, str(exc)
        output = "\n".join(part for part in ((result.stdout or "").strip(), (result.stderr or "").strip()) if part)
        return result.returncode == 0, output

    def config_bool(self, key: str, fallback: bool = False) -> bool:
        value = self.config_data.get(key, fallback)
        if isinstance(value, bool):
            return value
        return str(value).strip().lower() in ("1", "true", "sim", "yes", "on")

    def chatgpt_auto_extra_key_sequence(self) -> list[str]:
        raw = str(self.config_data.get("chatgpt_auto_extra_keys") or "").strip()
        if not raw:
            return []
        return [part.strip() for part in re.split(r"[\n|]+", raw) if part.strip()]

    def build_chatgpt_submit_script(
        self,
        delay_ms: int,
        model_mode: str,
        new_chat: bool,
        send_enter: bool,
        extra_keys: list[str],
    ) -> str:
        template = r'''
$ErrorActionPreference = "SilentlyContinue"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$delayMs = __DELAY_MS__
$modelMode = @'
__MODEL_MODE__
'@
$newChat = __NEW_CHAT__
$sendEnter = __SEND_ENTER__
$extraKeys = ConvertFrom-Json @'
__EXTRA_KEYS_JSON__
'@

function Send-HbxKeys([string]$keys, [int]$pauseMs = 350) {
    [System.Windows.Forms.SendKeys]::SendWait($keys)
    Start-Sleep -Milliseconds $pauseMs
}

function Get-HbxChatGptWindow {
    $root = [System.Windows.Automation.AutomationElement]::RootElement
    $windows = $root.FindAll(
        [System.Windows.Automation.TreeScope]::Children,
        [System.Windows.Automation.Condition]::TrueCondition
    )
    foreach ($window in $windows) {
        $name = [string]$window.Current.Name
        if ($name -match "ChatGPT|OpenAI") {
            return $window
        }
    }
    return $null
}

function Invoke-HbxByText([string[]]$needles) {
    $window = Get-HbxChatGptWindow
    if ($null -eq $window) { return $false }
    $all = $window.FindAll(
        [System.Windows.Automation.TreeScope]::Descendants,
        [System.Windows.Automation.Condition]::TrueCondition
    )
    foreach ($needle in $needles) {
        $needleLower = $needle.ToLowerInvariant()
        foreach ($element in $all) {
            $name = [string]$element.Current.Name
            if ([string]::IsNullOrWhiteSpace($name)) { continue }
            if (-not $name.ToLowerInvariant().Contains($needleLower)) { continue }
            try {
                $invoke = $element.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
                $invoke.Invoke()
                Start-Sleep -Milliseconds 500
                return $true
            } catch {}
            try {
                $select = $element.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
                $select.Select()
                Start-Sleep -Milliseconds 500
                return $true
            } catch {}
        }
    }
    return $false
}

function Select-HbxModelMode([string]$mode) {
    if ([string]::IsNullOrWhiteSpace($mode)) { return $false }
    $opened = Invoke-HbxByText @("Pro", "Instant", "Thinking", "Estendido", "Modelo", "Model")
    if (-not $opened) {
        Send-HbxKeys "%{DOWN}" 450
    }
    Start-Sleep -Milliseconds 700
    $selected = Invoke-HbxByText @($mode)
    if (-not $selected -and $mode -match "pro") {
        $selected = Invoke-HbxByText @("Pro")
    }
    if (-not $selected -and ($mode -match "thinking" -or $mode -match "estendido")) {
        $selected = Invoke-HbxByText @("Thinking", "Estendido")
    }
    Send-HbxKeys "{ESC}" 250
    return $selected
}

$shell = New-Object -ComObject WScript.Shell
Start-Sleep -Milliseconds $delayMs
$activated = $false
foreach ($name in @("ChatGPT", "OpenAI")) {
    if ($shell.AppActivate($name)) {
        $activated = $true
        break
    }
}
if (-not $activated) {
    Write-Output "Janela do ChatGPT não encontrada."
    exit 2
}

Start-Sleep -Milliseconds 700
Send-HbxKeys "{ESC}" 250
if ($newChat) {
    Send-HbxKeys "^n" 800
}

[void](Select-HbxModelMode $modelMode)
[void](Invoke-HbxByText @("Pesquisa aprofundada", "Deep research", "Pesquisa profunda"))
[void](Invoke-HbxByText @("Ferramentas", "Tools", "Aplicativos", "Apps", "Conectores", "Connectors"))
[void](Invoke-HbxByText @("Pesquisa aprofundada", "Deep research", "Pesquisa profunda"))
[void](Invoke-HbxByText @("GitHub", "JhonatanBarata/HBX", "HBX"))

foreach ($keys in $extraKeys) {
    if (-not [string]::IsNullOrWhiteSpace([string]$keys)) {
        Send-HbxKeys ([string]$keys) 450
    }
}

Send-HbxKeys "^v" 900
if ($sendEnter) {
    Send-HbxKeys "{ENTER}" 700
}

Write-Output "Prompt enviado ao ChatGPT; monitoramento ativo."
exit 0
'''
        return (
            template.replace("__DELAY_MS__", str(delay_ms))
            .replace("__MODEL_MODE__", model_mode)
            .replace("__NEW_CHAT__", "$true" if new_chat else "$false")
            .replace("__SEND_ENTER__", "$true" if send_enter else "$false")
            .replace("__EXTRA_KEYS_JSON__", json.dumps(extra_keys, ensure_ascii=False))
        )

    def chatgpt_visible_text_script(self) -> str:
        return r'''
$ErrorActionPreference = "SilentlyContinue"
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$root = [System.Windows.Automation.AutomationElement]::RootElement
$windows = $root.FindAll(
    [System.Windows.Automation.TreeScope]::Children,
    [System.Windows.Automation.Condition]::TrueCondition
)
$target = $null
foreach ($window in $windows) {
    $name = [string]$window.Current.Name
    if ($name -match "ChatGPT|OpenAI") {
        $target = $window
        break
    }
}
if ($null -eq $target) {
    Write-Output "Janela do ChatGPT não encontrada."
    exit 2
}

$items = New-Object System.Collections.Generic.List[string]
$all = $target.FindAll(
    [System.Windows.Automation.TreeScope]::Descendants,
    [System.Windows.Automation.Condition]::TrueCondition
)
foreach ($element in $all) {
    $name = [string]$element.Current.Name
    if (-not [string]::IsNullOrWhiteSpace($name)) {
        $items.Add($name)
    }
    try {
        $value = $element.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value
        if (-not [string]::IsNullOrWhiteSpace([string]$value)) {
            $items.Add([string]$value)
        }
    } catch {}
}

$text = ($items | Select-Object -Unique) -join "`n"
if ($text.Length -gt 220000) {
    $text = $text.Substring($text.Length - 220000)
}
Write-Output $text
exit 0
'''

    def chatgpt_advance_research_script(self) -> str:
        return r'''
$ErrorActionPreference = "SilentlyContinue"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

function Get-HbxChatGptWindow {
    $root = [System.Windows.Automation.AutomationElement]::RootElement
    $windows = $root.FindAll(
        [System.Windows.Automation.TreeScope]::Children,
        [System.Windows.Automation.Condition]::TrueCondition
    )
    foreach ($window in $windows) {
        $name = [string]$window.Current.Name
        if ($name -match "ChatGPT|OpenAI") { return $window }
    }
    return $null
}

function Invoke-HbxByText([string[]]$needles) {
    $window = Get-HbxChatGptWindow
    if ($null -eq $window) { return $false }
    $all = $window.FindAll(
        [System.Windows.Automation.TreeScope]::Descendants,
        [System.Windows.Automation.Condition]::TrueCondition
    )
    foreach ($needle in $needles) {
        $needleLower = $needle.ToLowerInvariant()
        foreach ($element in $all) {
            $name = [string]$element.Current.Name
            if ([string]::IsNullOrWhiteSpace($name)) { continue }
            if (-not $name.ToLowerInvariant().Contains($needleLower)) { continue }
            try {
                $invoke = $element.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
                $invoke.Invoke()
                Start-Sleep -Milliseconds 700
                Write-Output "Clique intermediário: $name"
                return $true
            } catch {}
            try {
                $select = $element.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
                $select.Select()
                Start-Sleep -Milliseconds 700
                Write-Output "Seleção intermediária: $name"
                return $true
            } catch {}
        }
    }
    return $false
}

[void](Invoke-HbxByText @(
    "Atualizar",
    "Iniciar pesquisa",
    "Iniciar",
    "Começar pesquisa",
    "Comecar pesquisa",
    "Start research",
    "Run research",
    "Continue",
    "Continuar",
    "Confirmar",
    "Confirm",
    "Prosseguir"
))
exit 0
'''

    def build_hbx_deep_research_prompt(self) -> str:
        branch = self.safe_git_output(["rev-parse", "--abbrev-ref", "HEAD"], "-").strip() or "-"
        status = self.safe_git_output(["status", "--short"], "-").strip() or "limpo"
        recent_commits = self.safe_git_output(["log", "--oneline", "-12"], "-").strip() or "-"
        research_date = today_str()
        research_stamp = date.today().strftime("%d-%m")
        previous_stamp = (date.today() - timedelta(days=1)).strftime("%d-%m")
        report_path = f"docs/OWNER_RESEARCH_{research_date}.md"
        done_cards = self.db.fetchall(
            """
            SELECT * FROM kanban_cards
            WHERE lane = 'FEITO' AND commit_sha != ''
            ORDER BY done_at DESC, updated_at DESC
            LIMIT 15
            """
        )
        pending_cards = self.db.fetchall(
            """
            SELECT * FROM kanban_cards
            WHERE lane NOT IN ('FEITO', 'ARQUIVADO')
            ORDER BY
                CASE lane
                    WHEN 'HOJE' THEN 1
                    WHEN 'FAZENDO' THEN 2
                    WHEN 'AGUARDANDO CODEX' THEN 3
                    WHEN 'TESTAR' THEN 4
                    ELSE 9
                END,
                updated_at DESC
            LIMIT 20
            """
        )

        done_lines = "\n".join(
            (
                f"- #{card['id']} commit {str(card['commit_sha'])[:12]} | "
                f"{card['module'] or '-'} | {card['title']} | feito: {card['done_at'] or '-'}"
            )
            for card in done_cards
        ) or "-"
        pending_lines = "\n".join(
            (
                f"- #{card['id']} {card['lane']} | {card['priority']} | "
                f"{card['module'] or '-'} | {card['title']}"
            )
            for card in pending_cards
        ) or "-"
        return (
            "HBX OWNER - PESQUISA PERIODICA DE EVOLUCAO\n\n"
            "Use o repositorio JhonatanBarata/HBX, o contexto operacional abaixo e a sua pesquisa avancada. "
            "Se a interface abrir uma etapa de planejamento, selecione Pesquisa aprofundada/Deep research; "
            "quando GitHub aparecer em Aplicativos/Apps, use o repositorio JhonatanBarata/HBX como fonte. "
            "A resposta sera copiada de volta para o HBX Owner e precisa nascer diretamente no formato "
            "que o Kanban do HBX Owner entende.\n\n"
            f"Data de hoje: {research_date}\n"
            f"Rodada curta: {research_stamp}; rodada anterior de referencia: {previous_stamp}\n"
            f"Arquivo de relatorio que o Codex deve criar/atualizar: {report_path}\n"
            "Repositorio publico/referencia: JhonatanBarata/HBX\n"
            f"Workspace local: {self.repo_path()}\n"
            f"Branch atual: {branch}\n\n"
            "VALIDACAO OBRIGATORIA DO REPOSITORIO\n"
            "- Antes de criar qualquer card, confirme internamente que conseguiu consultar o repositorio JhonatanBarata/HBX.\n"
            "- Use como referencia minima os caminhos AGENTS.md, hbx-owner/windows-app, docs, frontend/src e backend/src.\n"
            "- Se nao conseguir ler o repositorio, nao use conhecimento generico sobre SaaS, CRM, prospeccao ou kanban.\n"
            "- Se nao conseguir entender o que e o HBX Owner pelo repositorio, nao gere HBX_CARDS_JSON.\n"
            "- Se nao houver acesso real ao repositorio, responda somente: REPOSITORIO_INDISPONIVEL - nao consegui ler JhonatanBarata/HBX.\n"
            "- se nao conseguir resposta do repositorio, pare agora a analise.\n\n"
            "NORTE DO PRODUTO\n"
            "HBX e uma esteira de prospeccao: Radar -> Vendas -> WhatsApp -> Retorno.\n"
            "Radar e memoria de leads/oportunidades. Resultado negativo protege contra retrabalho e nao deve ser descartado.\n"
            "Backend e fonte de verdade para cobranca, acesso, plano, entitlement, quota e status comercial.\n\n"
            "O QUE JA FOI CONCLUIDO COM COMMIT\n"
            f"{done_lines}\n\n"
            "CARDS PENDENTES NO OWNER\n"
            f"{pending_lines}\n\n"
            "GIT - COMMITS RECENTES\n"
            f"{recent_commits}\n\n"
            "GIT - STATUS LOCAL\n"
            f"{status}\n\n"
            "TAREFA\n"
            "Faca uma analise do estado atual do /HBX: o que evoluiu, quais riscos ficaram, "
            "quais problemas graves precisam ser atacados e quais proximos passos podem andar em paralelo. "
            "Transforme a analise diretamente em cards aplicaveis pelo HBX Owner. "
            "Inclua um card para criar o relatorio datado acima, equivalente a uma nova rodada de pesquisa, "
            "comparavel a rodada anterior. Inclua tambem uma licao de casa para Codex trabalhar nos problemas "
            "mais graves detectados.\n\n"
            "REGRAS DE SEGURANCA\n"
            "- Nao sugerir bypass de plano, pagamento, entitlement, quota, auth ou backend.\n"
            "- Nao sugerir apagar historico negativo de Radar.\n"
            "- Nao criar card generico sem empresa/oportunidade real quando falar de Radar.\n"
            "- Cards executaveis pelo Owner local devem nascer em HOJE; o Owner escolhe quais vao para AGUARDANDO CODEX.\n"
            "- Publicacao e merge dependem de comando explicito do dono.\n\n"
            f"{self.hbx_required_output_rules()}\n\n"
            f"{AUTOCARD_JSON_START}\n"
            "[\n"
            "  {\n"
            f"    \"title\": \"Criar relatorio de evolucao HBX {research_stamp}\",\n"
            "    \"module\": \"Owner\",\n"
            "    \"priority\": \"Alta\",\n"
            "    \"lane\": \"HOJE\",\n"
            "    \"type\": \"Pesquisa\",\n"
            f"    \"description\": \"Gerar {report_path} com estado atual, o que evoluiu, riscos, proximos passos em paralelo e relacao dos cards criados nesta rodada.\",\n"
            "    \"acceptance_criteria\": \"Relatorio markdown criado/atualizado com data da rodada, comparativo com a rodada anterior, riscos e plano executavel.\",\n"
            "    \"test_command\": \"python -m py_compile hbx-owner/windows-app/hbx_owner_app.py\",\n"
            f"    \"codex_prompt\": \"Leia AGENTS.md. O HBX Owner criara a branch deste card; trabalhe nela. Crie/atualize {report_path} com estado atual do HBX, evolucao desde a rodada anterior, proximos passos em paralelo e os problemas graves detectados. Se encontrar correcao pequena e segura ligada ao relatorio, aplique; caso contrario, limite a documentacao operacional. Rode checks relevantes e deixe commit local.\",\n"
            "    \"chatgpt_prompt\": \"Revisar se a rodada gerou cards acionaveis, sem bypass comercial e com JSON importavel pelo Owner.\",\n"
            "    \"estimate_minutes\": 90,\n"
            "    \"blocked_reason\": \"\",\n"
            "    \"urgency_level\": \"Alta\",\n"
            "    \"intelligence_level\": \"Extra high\",\n"
            "    \"codex_model_override\": \"\",\n"
            "    \"execution_timeout_seconds\": 300,\n"
            "    \"research_path\": \"Pesquisar primeiro em AGENTS.md, docs, hbx-owner/windows-app, frontend/src e backend/src conforme as lacunas detectadas.\"\n"
            "  }\n"
            "]\n"
            f"{AUTOCARD_JSON_END}\n"
        )

    def safe_git_output(self, args: list[str], fallback: str = "") -> str:
        ok, output = self.pr_lab_run_git(args, timeout=30)
        return output if ok else fallback or output

    def add_pdf_to_chatgpt(self) -> None:
        initial_dir = HBX_REPO_DIR / "docs"
        if not initial_dir.exists():
            initial_dir = Path.home()
        selected = filedialog.askopenfilename(
            title="Adicionar PDF",
            initialdir=str(initial_dir),
            filetypes=(("Arquivos PDF", "*.pdf"), ("Todos os arquivos", "*.*")),
        )
        if not selected:
            return

        pdf_path = Path(selected)
        self.chatgpt_pdf_path_var.set(str(pdf_path))
        extracted_text, extraction_status = self.extract_pdf_text(pdf_path)
        prompt = self.build_pdf_cards_prompt(pdf_path, extracted_text, extraction_status)
        automation_response = ""

        if not self.pdf_text_is_usable(extracted_text):
            automation_response = self.send_pdf_to_automation(pdf_path, prompt)

        if automation_response:
            self.set_chatgpt_text(automation_response)
            self.save_chatgpt_exchange(automation_response, prompt=prompt)
            self.autocard_status_var.set("Automação respondeu. Transformando resposta em cards.")
            self.transform_response_into_cards()
            return

        self.set_chatgpt_text(prompt)
        self.copy_text(prompt)
        if not self.pdf_text_is_usable(extracted_text):
            message = (
                "Texto local insuficiente. Prompt copiado. "
                "Anexe o PDF no ChatGPT Desktop, envie o prompt, cole a resposta aqui com Ctrl+V e clique em Gerar cards automático."
            )
            self.autocard_status_var.set(message)
            messagebox.showinfo(
                "PDF -> prompt",
                (
                    f"{message}\n\n"
                    "Leitura local opcional indisponível; isso não impede o fluxo manual com ChatGPT."
                ),
            )
            return

        self.autocard_status_var.set("Prompt do PDF copiado. Envie ao ChatGPT e cole a resposta aqui.")
        messagebox.showinfo(
            "PDF -> prompt",
            (
                f"PDF lido localmente: {extraction_status}\n"
                "O prompt para gerar cards foi copiado para o clipboard."
            ),
        )

    def extract_pdf_text(self, pdf_path: Path) -> tuple[str, str]:
        if not pdf_path.exists():
            return "", "arquivo não encontrado"
        if pdf_path.suffix.lower() != ".pdf":
            return "", "arquivo selecionado não é PDF"

        errors: list[str] = []
        for module_name in ("pypdf", "PyPDF2"):
            try:
                module = importlib.import_module(module_name)
                reader = module.PdfReader(str(pdf_path))
                pages = []
                for page in reader.pages:
                    try:
                        pages.append(page.extract_text() or "")
                    except Exception:
                        pages.append("")
                text = "\n\n".join(page.strip() for page in pages if page.strip()).strip()
                if text:
                    return text, f"texto extraído com {module_name} ({len(text)} caracteres)"
            except Exception as exc:
                errors.append(f"{module_name}: {exc}")

        pdftotext = shutil.which("pdftotext")
        if pdftotext:
            try:
                result = subprocess.run(
                    [pdftotext, "-layout", str(pdf_path), "-"],
                    capture_output=True,
                    text=True,
                    timeout=30,
                    check=False,
                )
                text = (result.stdout or "").strip()
                if text:
                    return text, f"texto extraído com pdftotext ({len(text)} caracteres)"
                if result.stderr:
                    errors.append(f"pdftotext: {result.stderr.strip()}")
            except Exception as exc:
                errors.append(f"pdftotext: {exc}")

        detail = "; ".join(errors[:2]) if errors else "nenhum extrator disponível"
        return "", f"não foi possível extrair texto localmente ({detail})"

    def pdf_text_is_usable(self, text: str) -> bool:
        clean = re.sub(r"\s+", " ", text or "").strip()
        return len(clean) >= PDF_MIN_TEXT_CHARS

    def build_pdf_cards_prompt(self, pdf_path: Path, extracted_text: str, extraction_status: str) -> str:
        clipped_text = (extracted_text or "").strip()
        if len(clipped_text) > PDF_TEXT_MAX_CHARS:
            clipped_text = clipped_text[:PDF_TEXT_MAX_CHARS].rstrip() + "\n\n[TEXTO CORTADO PELO HBX OWNER]"
        text_block = clipped_text or "Texto local indisponível. Use o PDF anexado como fonte principal."
        return (
            "HBX OWNER - LER PDF E DEVOLVER CARDS PARA KANBAN\n\n"
            f"Arquivo: {pdf_path.name}\n"
            f"Caminho local: {pdf_path}\n"
            f"Leitura local: {extraction_status}\n\n"
            "Objetivo:\n"
            "Leia o documento inteiro e transforme o que for acionável em cards operacionais para o HBX Owner.\n"
            "Priorize tickets de clientes, problemas de suporte, pedidos reais, riscos de operação, lacunas do produto, "
            "oportunidades claras e respostas de API que precisem virar trabalho.\n\n"
            "Regras obrigatórias:\n"
            "1. Responda somente com um bloco HBX_CARDS_JSON_START / HBX_CARDS_JSON_END.\n"
            "2. Dentro do bloco, devolva um JSON array válido, sem markdown fora do bloco.\n"
            "3. Um card por ticket, demanda, risco ou ação verificável.\n"
            "4. Não crie card genérico sem cliente, empresa, evidência ou origem. Se faltar identificação, crie um card de triagem para identificar cliente/origem.\n"
            "5. Preserve histórico negativo, erros de API e falhas de atendimento como evidência; não apague nem suavize.\n"
            "6. Cards de ticket de cliente devem usar type = \"Ticket cliente\" e module = \"Retorno\", salvo quando o texto provar outro módulo.\n"
            "7. Cards derivados de resposta de API devem usar type = \"Resposta API\" e descrever endpoint, erro, payload ou comportamento observado quando existir.\n"
            "8. Use lane \"HOJE\" para triagem e trabalho aplicável pelo Owner local; AGUARDANDO CODEX é reservado para escolha manual do Owner.\n"
            "9. Se faltar dado, crie card de triagem em \"HOJE\" com blocked_reason vazio.\n\n"
            "Campos de cada card:\n"
            "- title: frase curta começando com verbo ou com o ticket do cliente.\n"
            "- module: Radar, Vendas, WhatsApp, Retorno, Backend, Frontend, Owner ou HBX.\n"
            "- priority: Crítica, Alta, Média ou Baixa.\n"
            "- lane: HOJE, AGUARDANDO CODEX, TESTAR ou FEITO.\n"
            "- type: Ticket cliente, Resposta API, Produto, Bug, Pesquisa ou Operação.\n"
            "- description: contexto, cliente/empresa, evidência do PDF/API e impacto.\n"
            "- acceptance_criteria: como saber que o card foi resolvido.\n"
            "- test_command: comando real se existir; vazio se não existir.\n"
            "- codex_prompt: instrução objetiva para implementar ou investigar no repositório.\n"
            "- chatgpt_prompt: pergunta de revisão quando fizer sentido.\n"
            "- estimate_minutes: número inteiro.\n"
            "- blocked_reason: sempre vazio.\n"
            "- urgency_level: Baixa, Normal, Alta ou Crítica.\n"
            "- intelligence_level: use somente Média, High ou Extra high.\n"
            "- codex_model_override: deixe vazio, salvo instrução explícita do Owner.\n"
            "- execution_timeout_seconds: 120 para Média, 180 para High, 300 para Extra high.\n"
            "- research_path: caminho onde o Codex deve pesquisar primeiro.\n\n"
            "Formato obrigatório:\n"
            f"{AUTOCARD_JSON_START}\n"
            "[\n"
            "  {\n"
            "    \"title\": \"Formalizar ticket do cliente X sobre falha Y\",\n"
            "    \"module\": \"Retorno\",\n"
            "    \"priority\": \"Alta\",\n"
            "    \"lane\": \"HOJE\",\n"
            "    \"type\": \"Ticket cliente\",\n"
            "    \"description\": \"Cliente, evidência do PDF/API, impacto e origem.\",\n"
            "    \"acceptance_criteria\": \"Ticket reproduzido, corrigido ou encaminhado com evidência registrada.\",\n"
            "    \"test_command\": \"\",\n"
            "    \"codex_prompt\": \"Investigar o fluxo citado e registrar a menor correção segura.\",\n"
            "    \"chatgpt_prompt\": \"Revisar se o ticket cobre causa, impacto e aceite.\",\n"
            "    \"estimate_minutes\": 60,\n"
            "    \"blocked_reason\": \"\",\n"
            "    \"urgency_level\": \"Alta\",\n"
            "    \"intelligence_level\": \"High\",\n"
            "    \"codex_model_override\": \"\",\n"
            "    \"execution_timeout_seconds\": 180,\n"
            "    \"research_path\": \"Pesquisar primeiro em backend/src e frontend/src buscando pelo ticket, cliente ou erro citado.\"\n"
            "  }\n"
            "]\n"
            f"{AUTOCARD_JSON_END}\n\n"
            "Texto extraído localmente:\n"
            "<<<HBX_PDF_TEXT_START\n"
            f"{text_block}\n"
            "HBX_PDF_TEXT_END>>>\n"
        )

    def send_pdf_to_automation(self, pdf_path: Path, prompt: str) -> str:
        url = str(self.config_data.get("pdf_automation_url") or "").strip()
        if not url:
            return ""
        try:
            pdf_bytes = pdf_path.read_bytes()
        except OSError as exc:
            self.autocard_status_var.set(f"PDF não lido para automação: {exc}")
            return ""
        if len(pdf_bytes) > PDF_AUTOMATION_MAX_BYTES:
            self.autocard_status_var.set("PDF maior que 25 MB; automação não acionada.")
            return ""

        payload = {
            "kind": "hbx-owner-pdf-to-cards",
            "filename": pdf_path.name,
            "pdfPath": str(pdf_path),
            "pdfBase64": base64.b64encode(pdf_bytes).decode("ascii"),
            "prompt": prompt,
            "expectedFormat": "HBX_CARDS_JSON",
        }
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers = {"Content-Type": "application/json; charset=utf-8"}
        token = str(os.environ.get("HBX_OWNER_PDF_AUTOMATION_TOKEN") or self.config_data.get("pdf_automation_token") or "").strip()
        if token:
            headers["Authorization"] = f"Bearer {token}"
        timeout = self.parse_int_config("pdf_automation_timeout_seconds", 90)

        try:
            request = urllib.request.Request(url, data=body, headers=headers, method="POST")
            with urllib.request.urlopen(request, timeout=timeout) as response:
                raw = response.read().decode("utf-8", errors="replace").strip()
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            self.autocard_status_var.set(f"Automação PDF indisponível: {exc}")
            return ""

        parsed = self.extract_automation_response_text(raw)
        if parsed:
            return parsed
        self.autocard_status_var.set("Automação respondeu, mas sem texto/cards reconhecíveis.")
        return ""

    def extract_automation_response_text(self, raw: str) -> str:
        if not raw:
            return ""
        if AUTOCARD_JSON_START in raw and AUTOCARD_JSON_END in raw:
            return raw
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            return raw

        cards_payload = None
        if isinstance(payload, list):
            cards_payload = payload
        elif isinstance(payload, dict):
            for key in ("response", "text", "content", "answer", "message", "output"):
                value = payload.get(key)
                if isinstance(value, str) and value.strip():
                    return value.strip()
            for key in ("cards", "items"):
                value = payload.get(key)
                if isinstance(value, list):
                    cards_payload = value
                    break
            data = payload.get("data")
            if isinstance(data, dict):
                return self.extract_automation_response_text(json.dumps(data, ensure_ascii=False))

        if cards_payload is not None:
            return (
                f"{AUTOCARD_JSON_START}\n"
                f"{json.dumps(cards_payload, indent=2, ensure_ascii=False)}\n"
                f"{AUTOCARD_JSON_END}"
            )
        return ""

    def parse_int_config(self, key: str, fallback: int) -> int:
        try:
            value = int(float(str(self.config_data.get(key, fallback))))
        except (TypeError, ValueError):
            return fallback
        return value if value > 0 else fallback

    def hbx_cards_json_template(self) -> str:
        research_date = today_str()
        research_stamp = date.today().strftime("%d-%m")
        report_path = f"docs/OWNER_RESEARCH_{research_date}.md"
        sample = [
            {
                "title": f"Criar relatório de evolução HBX {research_stamp}",
                "module": "Owner",
                "priority": "Alta",
                "lane": "HOJE",
                "type": "Pesquisa",
                "description": (
                    f"Gerar {report_path} com estado atual, evolução do HBX, riscos, próximos passos "
                    "em paralelo e relação dos cards desta rodada."
                ),
                "acceptance_criteria": (
                    "Relatório markdown criado/atualizado com data da rodada, comparativo, riscos e plano executável."
                ),
                "test_command": "python -m py_compile hbx-owner/windows-app/hbx_owner_app.py",
                "codex_prompt": (
                    "Leia AGENTS.md. O HBX Owner criará a branch deste card; trabalhe nela. "
                    f"Crie/atualize {report_path}, aplique apenas correções pequenas e seguras se forem claras, "
                    "rode checks relevantes e deixe commit local."
                ),
                "chatgpt_prompt": "Revisar se a rodada gerou cards acionáveis, sem bypass comercial e com JSON importável pelo Owner.",
                "urgency_level": "Alta",
                "intelligence_level": "Extra high",
                "codex_model_override": CARD_CODEX_MODEL_DEFAULT,
                "execution_timeout_seconds": 300,
                "research_path": "Pesquisar primeiro em AGENTS.md, docs, hbx-owner/windows-app, frontend/src e backend/src.",
            }
        ]
        return (
            f"{AUTOCARD_JSON_START}\n"
            f"{json.dumps(sample, indent=2, ensure_ascii=False)}\n"
            f"{AUTOCARD_JSON_END}"
        )

    def copy_hbx_cards_json_format(self) -> None:
        template = self.hbx_cards_json_template()
        self.copy_text(template)
        path = self.save_prompt_file("hbx-cards-json", template)
        self.set_chatgpt_text(f"{template}\n\n---\nFormato copiado e salvo em: {path}")
        self.autocard_status_var.set("Formato HBX_CARDS_JSON copiado para o clipboard.")

    def save_chatgpt_exchange(self, response: str, prompt: str | None = None) -> None:
        card = self.get_card(self.current_card_id) or self.get_card(self.selected_card_id)
        card_id = int(card["id"]) if card else None
        self.db.execute(
            """
            INSERT INTO chatgpt_exchanges (date, card_id, prompt, response, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (today_str(), card_id, prompt or self.last_chatgpt_prompt or "", response, now_iso()),
        )

    def report_autocard_result(
        self,
        created_ids: list[int],
        skipped_existing: int,
        recognized_count: int,
        context: str,
        parent: tk.Misc | None = None,
    ) -> str:
        if created_ids:
            lane_summary = self.autocard_created_lane_summary(created_ids)
            message = (
                f"{context}: {len(created_ids)} card(s) criado(s): "
                f"{', '.join('#' + str(card_id) for card_id in created_ids)}"
            )
            if lane_summary:
                message = f"{message}\n\nColunas: {lane_summary}"
        elif recognized_count and skipped_existing:
            message = f"{context}: {skipped_existing} card(s) reconhecido(s), mas todos já existiam."
        elif recognized_count:
            message = f"{context}: cards reconhecidos, mas nenhum novo foi criado."
        else:
            message = f"{context}: nenhum card reconhecido."
        if hasattr(self, "autocard_status_var"):
            self.autocard_status_var.set(message)
        messagebox.showinfo("Autocard", message, parent=parent)
        return message

    def autocard_created_lane_summary(self, card_ids: list[int]) -> str:
        ids = [int(card_id) for card_id in card_ids if int(card_id) > 0]
        if not ids:
            return ""
        placeholders = ",".join("?" for _ in ids)
        rows = self.db.fetchall(
            f"""
            SELECT lane, COUNT(*) AS total
            FROM kanban_cards
            WHERE id IN ({placeholders})
            GROUP BY lane
            ORDER BY
                CASE lane
                    WHEN 'HOJE' THEN 1
                    WHEN 'FAZENDO' THEN 2
                    WHEN 'AGUARDANDO CODEX' THEN 3
                    WHEN 'TESTAR' THEN 4
                    WHEN 'REVISAR COM CHATGPT' THEN 5
                    WHEN 'BACKLOG' THEN 6
                    ELSE 9
                END
            """,
            tuple(ids),
        )
        return ", ".join(f"{row['lane']}: {row['total']}" for row in rows)

    def copy_text(self, text: str) -> None:
        self.clipboard_clear()
        self.clipboard_append(text)
        self.update_idletasks()

    def save_prompt_file(self, kind: str, prompt: str) -> Path:
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        path = APP_DIR / "prompts" / f"{stamp}-{kind}.txt"
        path.write_text(prompt, encoding="utf-8")
        return path

    def resolve_chatgpt_app_id(self) -> str:
        configured = str(self.config_data.get("chatgpt_app_id", "")).strip()
        if configured:
            return configured

        if not sys.platform.startswith("win"):
            return ""

        command = [
            "powershell.exe",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            (
                "$app = Get-StartApps | "
                "Where-Object { $_.Name -eq 'ChatGPT' -or $_.Name -match 'OpenAI' } | "
                "Select-Object -First 1; "
                "if ($app) { $app.AppID }"
            ),
        ]
        try:
            result = subprocess.run(command, capture_output=True, text=True, timeout=8, check=False)
        except (OSError, subprocess.TimeoutExpired):
            return ""
        return result.stdout.strip().splitlines()[0].strip() if result.stdout.strip() else ""

    def open_chatgpt(self) -> None:
        app_id = self.resolve_chatgpt_app_id()
        if sys.platform.startswith("win") and app_id:
            try:
                subprocess.Popen(["explorer.exe", f"shell:AppsFolder\\{app_id}"])
            except OSError as exc:
                messagebox.showwarning("ChatGPT Desktop", f"Não consegui abrir o app do Windows:\n{exc}")
                return
            self.set_chatgpt_text("ChatGPT Desktop solicitado pelo Windows.\n\nO prompt atual continua no clipboard.")
            return

        fallback_url = str(self.config_data.get("chatgpt_fallback_url", "")).strip()
        if fallback_url:
            webbrowser.open(fallback_url)
            self.set_chatgpt_text("ChatGPT Desktop não encontrado. Fallback web aberto por configuração.")
            return

        messagebox.showwarning(
            "ChatGPT Desktop",
            "ChatGPT Desktop não encontrado. Instale o app do Windows ou configure chatgpt_app_id em config.json.",
        )

    def transform_response_into_cards(self) -> None:
        if not self.can_create_new_card():
            return
        raw = ""
        if hasattr(self, "chatgpt_text"):
            raw = self.chatgpt_text.get("1.0", tk.END).strip()
        if not raw:
            try:
                raw = self.clipboard_get().strip()
            except tk.TclError:
                raw = ""
        if not raw:
            latest = self.db.fetchone("SELECT response FROM chatgpt_exchanges ORDER BY id DESC LIMIT 1")
            raw = latest["response"] if latest else ""
        if not raw:
            self.autocard_status_var.set("Não há pesquisa ou resposta para transformar em cards.")
            messagebox.showwarning("Autocard", "Não há pesquisa ou resposta para transformar em cards.")
            return

        self.save_chatgpt_exchange(raw, prompt="gerar-cards-automatico")
        created_ids, skipped_existing, recognized_count = self.create_chatgpt_cards_from_text(raw)
        if created_ids:
            self.set_chatgpt_text(
                f"{len(created_ids)} card(s) criado(s): {', '.join('#' + str(cid) for cid in created_ids)}"
            )
        self.report_autocard_result(created_ids, skipped_existing, recognized_count, "Gerar cards automático")

    def create_chatgpt_cards_from_text(self, raw: str, source: str = "ChatGPT") -> tuple[list[int], int, int]:
        cards = self.parse_chatgpt_cards(raw)
        created_ids: list[int] = []
        skipped_existing = 0
        for card in cards:
            title = card.get("title", "").strip()
            if not title:
                continue
            if self.card_title_exists(title):
                skipped_existing += 1
                continue
            if str(card.get("lane") or "").strip().upper() == "AGUARDANDO CODEX":
                card["lane"] = "HOJE"
            created_ids.append(self.insert_kanban_card(card, source=source))
        if created_ids:
            self.refresh_kanban()
        return created_ids, skipped_existing, len(cards)

    def parse_chatgpt_cards(self, text: str) -> list[dict]:
        return self.compile_autocards(text)

    def compile_autocards(self, text: str) -> list[dict]:
        raw = str(text or "").strip()
        if not raw:
            return []

        json_cards = self.parse_hbx_cards_json(raw)
        if json_cards:
            return self.unique_autocards(json_cards)

        legacy_cards: list[dict] = []
        legacy_cards.extend(self.parse_card_blocks(raw))
        legacy_cards.extend(self.parse_markdown_tasks(raw))
        legacy_cards.extend(self.parse_next_cards_block(raw))
        if legacy_cards:
            return self.unique_autocards(legacy_cards)

        freeform_cards: list[dict] = []
        freeform_cards.extend(self.parse_section_action_cards(raw))
        freeform_cards.extend(self.parse_freeform_action_cards(raw))
        return self.unique_autocards(freeform_cards)

    def parse_hbx_cards_json(self, text: str) -> list[dict]:
        pattern = re.compile(
            rf"{re.escape(AUTOCARD_JSON_START)}\s*(.*?)\s*{re.escape(AUTOCARD_JSON_END)}",
            re.IGNORECASE | re.DOTALL,
        )
        cards: list[dict] = []
        for match in pattern.finditer(text):
            block = match.group(1).strip()
            if not block:
                continue
            try:
                payload = json.loads(block)
            except json.JSONDecodeError:
                continue
            if isinstance(payload, dict):
                payload = payload.get("cards") or payload.get("items") or []
            if not isinstance(payload, list):
                continue
            for item in payload:
                if isinstance(item, dict):
                    cards.append(dict(item))
        return cards

    def unique_autocards(self, cards: list[dict]) -> list[dict]:
        seen: set[str] = set()
        unique_cards: list[dict] = []
        for card in cards:
            normalized = self.normalize_autocard_payload(card)
            title = normalized.get("title", "").strip()
            key = self.normalize_card_title_key(title)
            if not key or key in seen:
                continue
            seen.add(key)
            unique_cards.append(normalized)
        return unique_cards

    def normalize_card_title_key(self, title: str) -> str:
        clean = unicodedata.normalize("NFD", str(title or "").lower())
        clean = "".join(ch for ch in clean if unicodedata.category(ch) != "Mn")
        clean = re.sub(r"[^a-z0-9]+", " ", clean)
        return re.sub(r"\s+", " ", clean).strip()

    def normalize_autocard_payload(self, card: dict | None) -> dict:
        raw = dict(card or {})
        title = self.clean_chatgpt_candidate_text(str(raw.get("title") or raw.get("titulo") or ""))
        if not title:
            return {}
        title = title[:180].rstrip(" ,.;:")
        full_text = " ".join(str(raw.get(key) or "") for key in ("title", "description", "module", "type", "codex_prompt"))
        full_text = f"{title} {full_text}"
        priority = self.normalize_autocard_priority(raw.get("priority") or raw.get("prioridade"), full_text)
        lane = self.normalize_autocard_lane(raw.get("lane") or raw.get("status"), full_text)

        blocked_reason = ""

        type_value = self.sanitize_card_type(raw.get("type") or raw.get("tipo") or "ChatGPT", "ChatGPT")
        module_value = str(raw.get("module") or raw.get("modulo") or self.infer_module_from_text(full_text)).strip()[:60]
        normalized = {
            "title": title,
            "description": str(raw.get("description") or raw.get("descricao") or "").strip(),
            "module": module_value,
            "type": type_value[:60],
            "priority": priority,
            "lane": lane,
            "acceptance_criteria": str(
                raw.get("acceptance_criteria")
                or raw.get("criterio_de_aceite")
                or raw.get("critério_de_aceite")
                or raw.get("criterio de aceite")
                or raw.get("critério de aceite")
                or "Entrega verificável registrada no HBX Owner."
            ).strip(),
            "test_command": str(raw.get("test_command") or raw.get("teste") or "").strip(),
            "codex_prompt": str(raw.get("codex_prompt") or raw.get("prompt_codex") or raw.get("prompt codex") or "").strip(),
            "chatgpt_prompt": str(raw.get("chatgpt_prompt") or raw.get("prompt_chatgpt") or raw.get("prompt chatgpt") or "").strip(),
            "estimate_minutes": self.normalize_autocard_estimate(raw.get("estimate_minutes"), priority),
            "blocked_reason": blocked_reason,
        }
        urgency_level, intelligence_level = self.suggest_card_execution_controls(normalized)
        normalized["urgency_level"] = self.normalize_urgency_level(
            raw.get("urgency_level") or raw.get("urgencia") or urgency_level,
            priority,
        )
        normalized["intelligence_level"] = self.normalize_intelligence_level(
            raw.get("intelligence_level") or raw.get("inteligencia") or intelligence_level,
            normalized,
        )
        normalized["codex_model_override"] = normalize_codex_model_value(
            raw.get("codex_model_override") or raw.get("modelo_codex") or raw.get("modelo codex")
        )
        try:
            normalized["execution_timeout_seconds"] = int(
                float(str(raw.get("execution_timeout_seconds") or raw.get("timeout_seconds") or 0))
            )
        except ValueError:
            normalized["execution_timeout_seconds"] = 0
        normalized["research_path"] = str(
            raw.get("research_path")
            or raw.get("caminho_de_pesquisa")
            or raw.get("caminho pesquisa")
            or self.infer_research_path_from_text(module_value, full_text)
        ).strip()
        return normalized

    def normalize_autocard_priority(self, value: object, text: str) -> str:
        key = self.normalize_card_title_key(str(value or ""))
        if key in ("critica", "critico"):
            return "Crítica"
        if key == "alta":
            return "Alta"
        if key in ("media", "medio"):
            return "Média"
        if key == "baixa":
            return "Baixa"
        lowered = self.normalize_card_title_key(text)
        if any(self.normalize_card_title_key(term) in lowered for term in AUTOCARD_HIGH_PRIORITY_TERMS):
            return "Alta"
        return self.infer_priority_from_text(text)

    def normalize_autocard_lane(self, value: object, text: str) -> str:
        raw = str(value or "").strip().upper()
        raw = unicodedata.normalize("NFD", raw)
        raw = "".join(ch for ch in raw if unicodedata.category(ch) != "Mn")
        raw = re.sub(r"[_\-]+", " ", raw)
        raw = re.sub(r"\s+", " ", raw).strip()
        aliases = {
            "AGUARDANDO CODEX": "HOJE",
            "WAITING CODEX": "HOJE",
            "AGUARDANDO": "HOJE",
            "AGUARDANDO DONO": "HOJE",
            "OWNER INPUT": "HOJE",
            "NEEDS OWNER": "HOJE",
            "REVISAR COM CHATGPT": "REVISAR COM CHATGPT",
            "BACKLOG": "HOJE",
            "NEW": "HOJE",
            "TRIAGE": "HOJE",
            "HOJE": "HOJE",
            "FAZENDO": "FAZENDO",
            "IN PROGRESS": "FAZENDO",
            "TESTAR": "TESTAR",
            "FEITO": "FEITO",
            "DONE": "FEITO",
            "BLOQUEADO": "HOJE",
            "ARQUIVADO": "ARQUIVADO",
        }
        if raw in aliases:
            return aliases[raw]
        return self.infer_lane_from_text(text)

    def normalize_autocard_estimate(self, value: object, priority: str) -> int:
        try:
            parsed = int(float(str(value or "").strip()))
        except ValueError:
            parsed = 0
        if parsed > 0:
            return max(5, min(parsed, 960))
        return 60 if priority in ("Alta", "Crítica") else 30

    def autocard_has_sensitive_terms(self, text: str) -> bool:
        normalized = self.normalize_card_title_key(text)
        return any(self.normalize_card_title_key(term) in normalized for term in AUTOCARD_SENSITIVE_TERMS)

    def parse_section_action_cards(self, text: str) -> list[dict]:
        cards: list[dict] = []
        in_action_section = False
        section_label = ""
        for raw_line in text.splitlines():
            line = raw_line.strip()
            if not line:
                continue
            bullet_match = re.match(r"^(?:[-*•]\s+|\[[ xX]\]\s+|\d+[\).\-\s]+)(.+)$", line)
            if not bullet_match and self.is_freeform_heading(line):
                in_action_section = self.heading_suggests_actions(line)
                section_label = self.clean_chatgpt_candidate_text(line.strip("# :"))
                continue
            if not in_action_section:
                continue

            content = (bullet_match.group(1) if bullet_match else line).strip()
            if not content:
                continue

            candidates = self.extract_freeform_candidates(content, True)
            titled_candidates = [
                (candidate, self.normalize_freeform_title(candidate))
                for candidate in candidates
            ]
            titled_candidates = [(candidate, title) for candidate, title in titled_candidates if title]
            if not titled_candidates:
                section_candidate = self.normalize_section_action_candidate(content)
                section_title = self.normalize_freeform_title(section_candidate)
                if section_candidate and section_title:
                    titled_candidates = [(section_candidate, section_title)]
            for candidate, title in titled_candidates:
                card = self.build_freeform_card(title, candidate)
                card["lane"] = self.infer_lane_from_text(f"{section_label} {candidate}")
                card["description"] = (
                    f"Criado automaticamente a partir da seção {section_label or 'operacional'}.\n\n"
                    f"Trecho: {content[:800]}"
                )
                cards.append(card)
        return cards

    def normalize_section_action_candidate(self, text: str) -> str:
        clean = self.clean_chatgpt_candidate_text(text)
        if not clean or len(clean) < 6:
            return ""
        clean = re.sub(r"^sprint\s+\d+\s*[—-]\s*", "", clean, flags=re.IGNORECASE).strip()
        clean = re.sub(r"^objetivo\s*[:\-]\s*", "", clean, flags=re.IGNORECASE).strip()
        if not clean or len(clean) > 180:
            return ""
        if self.has_action_verb(clean):
            return clean
        return f"Implementar {clean}"

    def infer_lane_from_text(self, text: str) -> str:
        upper = text.upper()
        if "BLOQUEADO" in upper or "BLOQUEIO" in upper:
            return "HOJE"
        if "AGUARDANDO DONO" in upper or "OWNER INPUT" in upper or "NEEDS OWNER" in upper:
            return "HOJE"
        if "AGUARDANDO CODEX" in upper or "WAITING_CODEX" in upper or "WAITING CODEX" in upper:
            return "HOJE"
        if "TESTAR" in upper or "TESTE" in upper:
            return "TESTAR"
        if "REVISAR COM CHATGPT" in upper:
            return "REVISAR COM CHATGPT"
        if "HOJE" in upper or "AGORA" in upper or "PRIORIDADE IMEDIATA" in upper or "IMEDIATA" in upper or "P0" in upper:
            return "HOJE"
        return "HOJE"

    def parse_card_blocks(self, text: str) -> list[dict]:
        label_map = {
            "titulo": "title",
            "título": "title",
            "modulo": "module",
            "módulo": "module",
            "prioridade": "priority",
            "criterio de aceite": "acceptance_criteria",
            "critério de aceite": "acceptance_criteria",
            "teste": "test_command",
            "test_command": "test_command",
            "descricao": "description",
            "descrição": "description",
            "tipo": "type",
            "lane": "lane",
            "status": "lane",
            "urgencia": "urgency_level",
            "urgência": "urgency_level",
            "inteligencia": "intelligence_level",
            "inteligência": "intelligence_level",
            "nivel de inteligencia": "intelligence_level",
            "nível de inteligência": "intelligence_level",
            "caminho de pesquisa": "research_path",
            "research_path": "research_path",
            "modelo codex": "codex_model_override",
            "codex_model_override": "codex_model_override",
            "timeout": "execution_timeout_seconds",
            "execution_timeout_seconds": "execution_timeout_seconds",
            "prompt codex": "codex_prompt",
            "codex prompt": "codex_prompt",
            "codex_prompt": "codex_prompt",
            "prompt chatgpt": "chatgpt_prompt",
            "chatgpt_prompt": "chatgpt_prompt",
            "bloqueio": "blocked_reason",
            "blocked_reason": "blocked_reason",
            "estimativa": "estimate_minutes",
            "estimate_minutes": "estimate_minutes",
        }
        cards: list[dict] = []
        current: dict | None = None
        current_lines: list[str] = []

        def flush() -> None:
            nonlocal current, current_lines
            if not current:
                return
            if current_lines and not current.get("description"):
                current["description"] = "\n".join(current_lines).strip()
            current.setdefault("lane", self.infer_lane_from_text("\n".join(current_lines)))
            current.setdefault("priority", "Média")
            cards.append(current)
            current = None
            current_lines = []

        for raw_line in text.splitlines():
            line = raw_line.strip()
            if not line:
                continue
            if line.upper().startswith("CARD:"):
                flush()
                current = {"title": line[5:].strip(), "type": "ChatGPT"}
                continue
            if current is None:
                continue
            if ":" in line:
                label, value = line.split(":", 1)
                key = label_map.get(label.strip().lower())
                if key:
                    current[key] = value.strip()
                    continue
            current_lines.append(line)
        flush()
        return cards

    def parse_markdown_tasks(self, text: str) -> list[dict]:
        cards: list[dict] = []
        for line in text.splitlines():
            match = re.match(r"^\s*[-*]\s+\[[ xX]\]\s+(.+)$", line)
            if not match:
                continue
            title = match.group(1).strip()
            if not title:
                continue
            cards.append(
                {
                    "title": title,
                    "description": "Criado a partir de checklist markdown.",
                    "priority": "Média",
                    "lane": self.infer_lane_from_text(line),
                    "type": "ChatGPT",
                }
            )
        return cards

    def parse_next_cards_block(self, text: str) -> list[dict]:
        cards: list[dict] = []
        in_block = False
        for raw_line in text.splitlines():
            line = raw_line.strip()
            if not line:
                if in_block:
                    break
                continue
            if line.upper().startswith("PRÓXIMOS CARDS:") or line.upper().startswith("PROXIMOS CARDS:"):
                in_block = True
                continue
            if not in_block:
                continue
            match = re.match(r"^(?:[-*•]\s+|\d+[\).\-\s]+)(.+)$", line)
            if not match:
                continue
            title = match.group(1).strip()
            if title:
                cards.append(
                    {
                        "title": title,
                        "description": "Criado a partir do bloco PRÓXIMOS CARDS.",
                        "priority": "Média",
                        "lane": self.infer_lane_from_text(text),
                        "type": "ChatGPT",
                    }
                )
        return cards

    def parse_freeform_action_cards(self, text: str) -> list[dict]:
        cards: list[dict] = []
        candidates: list[str] = []
        in_action_section = False

        for raw_line in text.splitlines():
            line = raw_line.strip()
            if not line:
                continue

            if self.is_freeform_heading(line):
                in_action_section = self.heading_suggests_actions(line)
                continue

            bullet_match = re.match(r"^(?:[-*•]\s+|\d+[\).\-\s]+)(.+)$", line)
            if bullet_match:
                candidates.extend(self.extract_freeform_candidates(bullet_match.group(1), in_action_section))
                continue

            candidates.extend(self.extract_freeform_candidates(line, in_action_section))

        seen: set[str] = set()
        for candidate in candidates:
            title = self.normalize_freeform_title(candidate)
            if not title:
                continue
            key = re.sub(r"\W+", "", title.lower())
            if key in seen:
                continue
            seen.add(key)
            cards.append(self.build_freeform_card(title, candidate))
        return cards

    def extract_freeform_candidates(self, line: str, in_action_section: bool) -> list[str]:
        clean = self.clean_chatgpt_candidate_text(line)
        if not clean:
            return []

        lowered = clean.lower()
        if not in_action_section and any(lowered.startswith(prefix) for prefix in CHATGPT_NON_ACTION_PREFIXES):
            return []

        candidates: list[str] = []
        if any(marker in lowered for marker in CHATGPT_GAP_MARKERS):
            candidates.extend(self.extract_gap_candidates(clean))

        if in_action_section or self.has_action_verb(clean):
            candidates.extend(self.split_freeform_action_segments(clean))

        return candidates

    def extract_gap_candidates(self, line: str) -> list[str]:
        lowered = line.lower()
        marker_positions = [(lowered.find(marker), marker) for marker in CHATGPT_GAP_MARKERS if marker in lowered]
        if not marker_positions:
            return []
        index, marker = min(marker_positions, key=lambda item: item[0])
        fragment = line[index + len(marker) :].strip(" :.,;")
        if not fragment:
            return []

        fragment = re.split(r"(?<=[.!?])\s+(?=[A-ZÀ-Ý])", fragment, maxsplit=1)[0]
        fragment = re.sub(r"\s+e\s+(?=[a-zA-ZÀ-ÿ0-9])", "; ", fragment, flags=re.IGNORECASE)
        parts = re.split(r"[,;]+", fragment)
        return [part.strip() for part in parts if part.strip()]

    def split_freeform_action_segments(self, line: str) -> list[str]:
        action_pattern = "|".join(re.escape(verb) for verb in CHATGPT_ACTION_VERBS)
        line = re.sub(rf"\s+e\s+(?=(?:{action_pattern})\b)", "; ", line, flags=re.IGNORECASE)
        chunks = re.split(r";+|(?<=[.!?])\s+", line)
        segments: list[str] = []
        for chunk in chunks:
            chunk = chunk.strip()
            if not chunk:
                continue
            if "," in chunk and len(chunk) > 80:
                segments.extend(part.strip() for part in chunk.split(",") if part.strip())
            else:
                segments.append(chunk)
        return segments

    def normalize_freeform_title(self, text: str) -> str:
        title = self.clean_chatgpt_candidate_text(text)
        if not title:
            return ""

        title = self.strip_before_action_verb(title)
        title = self.strip_freeform_modal_prefix(title)
        title = self.normalize_gap_title(title)
        title = self.clean_chatgpt_candidate_text(title)

        if not title or len(title) < 8:
            return ""
        if not self.has_action_verb(title):
            return ""
        if len(title) > 180:
            title = title[:177].rstrip(" ,.;:") + "..."
        return title[:1].upper() + title[1:]

    def clean_chatgpt_candidate_text(self, text: str) -> str:
        clean = re.sub(r"https?://\S+", "", text)
        clean = re.sub(r"\[[^\]]+\]", "", clean)
        clean = clean.replace("**", "").replace("__", "").replace("`", "")
        clean = re.sub(
            r"^\s*(?:ação|acao|tarefa|card|próximo card|proximo card|recomendação|recomendacao)\s*[:\-]\s*",
            "",
            clean,
            flags=re.IGNORECASE,
        )
        clean = re.sub(r"^\s*\[[ xX]\]\s+", "", clean)
        clean = re.sub(r"\s+", " ", clean)
        return clean.strip(" \t\r\n.,;:-")

    def strip_before_action_verb(self, title: str) -> str:
        action_pattern = "|".join(re.escape(verb) for verb in CHATGPT_ACTION_VERBS)
        match = re.search(rf"\b(?:{action_pattern})\b", title, flags=re.IGNORECASE)
        if match and match.start() > 0:
            return title[match.start() :].strip(" ,.;:")
        return title

    def strip_freeform_modal_prefix(self, title: str) -> str:
        title = re.sub(
            r"^(?:o\s+)?(?:sistema|app|hbx|backend|frontend|owner)?\s*(?:deve|precisa|deveria|tem que)\s+",
            "",
            title,
            flags=re.IGNORECASE,
        )
        title = re.sub(r"^(?:é necessário|e necessario|recomendo|recomenda-se)\s+", "", title, flags=re.IGNORECASE)
        title = re.sub(r"^(?:e|ou)\s+", "", title, flags=re.IGNORECASE)
        return title.strip(" ,.;:")

    def normalize_gap_title(self, title: str) -> str:
        lower = title.lower()
        conversions = (
            ("formalização de ", "Formalizar "),
            ("formalizacao de ", "Formalizar "),
            ("validação de ", "Validar "),
            ("validacao de ", "Validar "),
            ("integração de ", "Integrar "),
            ("integracao de ", "Integrar "),
            ("documentação de ", "Documentar "),
            ("documentacao de ", "Documentar "),
            ("automação de ", "Automatizar "),
            ("automacao de ", "Automatizar "),
        )
        for prefix, replacement in conversions:
            if lower.startswith(prefix):
                return replacement + title[len(prefix) :].strip()

        if lower.startswith("fila "):
            return "Tornar " + title
        if lower.startswith(("ticket/os", "ticket/OS")):
            return "Formalizar " + title
        if lower.startswith(("deep email discovery", "email discovery", "email finder", "email verifier")):
            return "Implementar " + title
        if lower.startswith(("campanha ", "campanha automática", "campanha automatica")):
            return "Implementar " + title
        if lower.startswith(("anexo", "anexos")):
            return "Adicionar " + title
        return title

    def has_action_verb(self, text: str) -> bool:
        lowered = text.lower()
        action_pattern = "|".join(re.escape(verb) for verb in CHATGPT_ACTION_VERBS)
        return bool(re.search(rf"\b(?:{action_pattern})\b", lowered, flags=re.IGNORECASE))

    def is_freeform_heading(self, line: str) -> bool:
        clean = self.clean_chatgpt_candidate_text(line.strip("# "))
        if not clean or len(clean) > 80:
            return False
        if line.rstrip().endswith(":"):
            return True
        if any(mark in clean for mark in (".", "?", "!")):
            return False
        return clean[:1].isupper() and len(clean.split()) <= 8

    def heading_suggests_actions(self, line: str) -> bool:
        lowered = self.clean_chatgpt_candidate_text(line).lower()
        return any(hint in lowered for hint in CHATGPT_ACTION_SECTION_HINTS)

    def build_freeform_card(self, title: str, source_text: str) -> dict:
        priority = self.infer_priority_from_text(title + " " + source_text)
        card = {
            "title": title,
            "description": f"Criado automaticamente a partir de resposta livre do ChatGPT.\n\nTrecho: {source_text[:800]}",
            "module": self.infer_module_from_text(title + " " + source_text),
            "type": "ChatGPT",
            "priority": priority,
            "lane": self.infer_lane_from_text(title + " " + source_text),
            "acceptance_criteria": "Entrega verificável registrada no HBX Owner.",
            "test_command": "",
            "estimate_minutes": 60 if priority in ("Alta", "Crítica") else 30,
        }
        urgency_level, intelligence_level = self.suggest_card_execution_controls(card)
        card["urgency_level"] = urgency_level
        card["intelligence_level"] = intelligence_level
        card["codex_model_override"] = CARD_CODEX_MODEL_DEFAULT
        card["execution_timeout_seconds"] = self.card_execution_timeout(card)
        card["research_path"] = self.infer_research_path_from_text(card["module"], title + " " + source_text)
        return card

    def infer_priority_from_text(self, text: str) -> str:
        lowered = text.lower()
        if any(term in lowered for term in ("p0", "crítico", "critico", "quebrado", "bloqueio", "vazamento")):
            return "Crítica"
        if any(
            term in lowered
            for term in (
                "urgente",
                "deve",
                "precisa",
                "fraco em",
                "falta",
                "monetização",
                "monetizacao",
                "durável",
                "duravel",
                "ticket",
                "os",
                "fila",
            )
        ):
            return "Alta"
        return "Média"

    def infer_module_from_text(self, text: str) -> str:
        lowered = text.lower()
        module_keywords = (
            (
                "Radar",
                (
                    "radar",
                    "lead",
                    "leads",
                    "oportunidade",
                    "hunter",
                    "domain search",
                    "enriquecimento",
                    "email discovery",
                    "email finder",
                    "email verifier",
                    "deep email",
                ),
            ),
            ("WhatsApp", ("whatsapp", "mensagem", "atendimento")),
            ("Retorno", ("retorno", "suporte", "ticket", "ticket/os", "os", "inbound", "conversa", "agenda")),
            ("Vendas", ("venda", "vendas", "comercial", "pipeline", "campanha", "outbound", "demo")),
            ("Backend", ("backend", "prisma", "nest", "api", "banco", "sqlite", "firestore", "worker", "fila")),
            ("Frontend", ("frontend", "next", "react", "tela", "ui", "interface")),
            ("Owner", ("owner", "codex", "chatgpt", "automação", "automacao", "documentação", "documentacao")),
        )
        for module, keywords in module_keywords:
            if any(keyword in lowered for keyword in keywords):
                return module
        return "HBX"

    def get_current_session(self) -> sqlite3.Row | None:
        return self.db.fetchone(
            """
            SELECT * FROM work_sessions
            WHERE status IN ('active', 'paused')
            ORDER BY id DESC
            LIMIT 1
            """
        )

    def get_open_break(self, session_id: int) -> sqlite3.Row | None:
        return self.db.fetchone(
            "SELECT * FROM work_breaks WHERE session_id = ? AND ended_at IS NULL ORDER BY id DESC LIMIT 1",
            (session_id,),
        )

    def break_minutes(self, session_id: int) -> int:
        total = 0
        for row in self.db.fetchall("SELECT started_at, ended_at FROM work_breaks WHERE session_id = ?", (session_id,)):
            total += minutes_between(row["started_at"], row["ended_at"])
        return total

    def work_minutes(self, session: sqlite3.Row) -> int:
        elapsed = minutes_between(session["started_at"], session["stopped_at"])
        return max(0, elapsed - self.break_minutes(session["id"]))

    def refresh_today(self) -> None:
        session = self.get_current_session()
        if not session:
            self.active_session_id = None
            self.today_status_var.set("Sem expediente aberto.")
            self.today_elapsed_var.set("0 min")
            self.today_break_var.set("Sem pausa aberta.")
            self.refresh_dashboard(None)
            return

        self.active_session_id = int(session["id"])
        minutes = self.work_minutes(session)
        hours, mins = divmod(minutes, 60)
        self.today_elapsed_var.set(f"{hours}h {mins:02d}min")
        self.today_status_var.set(
            f"Sessão #{session['id']} iniciada em {session['started_at']} | status: {session['status']}"
        )

        open_break = self.get_open_break(session["id"])
        if open_break:
            self.today_break_var.set(f"Pausa aberta desde {open_break['started_at']} | motivo: {open_break['reason']}")
        else:
            self.today_break_var.set("Sem pausa aberta.")
        self.refresh_dashboard(session)

    def refresh_dashboard(self, session: sqlite3.Row | None) -> None:
        worked = self.work_minutes(session) if session else 0
        planned_minutes = max(1, int(float(session["planned_hours"] if session else self.config_data.get("planned_hours", 8)) * 60))
        progress = min(999, int((worked / planned_minutes) * 100))
        self.dashboard_progress_var.set(f"{progress}%")

        if session and session["status"] == "active":
            seated = self.minutes_since_last_pause(int(session["id"]), session["started_at"])
            self.dashboard_seated_var.set(self.format_minutes(seated))
        elif session and session["status"] == "paused":
            self.dashboard_seated_var.set("em pausa")
        else:
            self.dashboard_seated_var.set("0 min")

        card = self.get_card(self.current_card_id) or self.db.fetchone(
            "SELECT * FROM kanban_cards WHERE lane = 'FAZENDO' ORDER BY updated_at DESC LIMIT 1"
        )
        self.dashboard_card_var.set(f"#{card['id']} {card['title']} ({card['lane']})" if card else "Nenhum card atual.")

        commits = self.db.fetchone(
            "SELECT COUNT(DISTINCT commit_sha) AS total FROM git_snapshots WHERE date = ? AND commit_sha != ''",
            (today_str(),),
        )
        done = self.db.fetchone(
            "SELECT COUNT(*) AS total FROM kanban_cards WHERE done_at LIKE ?",
            (f"{today_str()}%",),
        )
        blocked = self.db.fetchone(
            "SELECT COUNT(*) AS total FROM codex_dispatches WHERE status = 'failed' AND created_at LIKE ?",
            (f"{today_str()}%",),
        )
        self.dashboard_commits_var.set(str(commits["total"] if commits else 0))
        self.dashboard_done_var.set(str(done["total"] if done else 0))
        self.dashboard_blocked_var.set(str(blocked["total"] if blocked else 0))

        seated_minutes = 0
        if session and session["status"] == "active":
            seated_minutes = self.minutes_since_last_pause(int(session["id"]), session["started_at"])
        if worked >= 480 or progress >= 100:
            self.set_dashboard_health("pare", "#b91c1c")
        elif worked >= int(planned_minutes * 0.72) or seated_minutes >= 120:
            self.set_dashboard_health("atenção", "#c2410c")
        else:
            self.set_dashboard_health("saudável", "#15803d")

    def set_dashboard_health(self, text: str, color: str) -> None:
        self.dashboard_health_var.set(text)
        if hasattr(self, "dashboard_health_label"):
            self.dashboard_health_label.configure(bg=color)

    def _tick(self) -> None:
        self.refresh_today()
        self.poll_codex_dispatches()
        self.refresh_usage_hud()
        self.check_time_alerts()
        self.check_boss_mode()
        self.after(30_000, self._tick)

    def checkpoint_exists(self, session_id: int, checkpoint_type: str) -> bool:
        row = self.db.fetchone(
            "SELECT id FROM checkpoints WHERE session_id = ? AND checkpoint_type = ? LIMIT 1",
            (session_id, checkpoint_type),
        )
        return row is not None

    def register_checkpoint(self, session_id: int, checkpoint_type: str, message: str) -> int:
        cur = self.db.execute(
            """
            INSERT INTO checkpoints (session_id, checkpoint_type, created_at, message)
            VALUES (?, ?, ?, ?)
            """,
            (session_id, checkpoint_type, now_iso(), message),
        )
        return int(cur.lastrowid)

    def minutes_since_last_pause(self, session_id: int, started_at: str) -> int:
        row = self.db.fetchone(
            """
            SELECT ended_at, started_at FROM work_breaks
            WHERE session_id = ?
            ORDER BY COALESCE(ended_at, started_at) DESC
            LIMIT 1
            """,
            (session_id,),
        )
        if not row:
            return minutes_between(started_at)
        if row["ended_at"] is None:
            return 0
        return minutes_between(row["ended_at"])

    def check_time_alerts(self) -> None:
        session = self.get_current_session()
        if not session:
            return

        worked = self.work_minutes(session)
        planned_minutes = max(1, int(float(session["planned_hours"] or 8) * 60))
        session_id = int(session["id"])

        relative_alerts = (
            ("relative_25", int(planned_minutes * 0.25), "Cadê entrega testável?"),
            ("relative_50", int(planned_minutes * 0.50), "Sem commit, sem progresso."),
            ("relative_72", int(planned_minutes * 0.72), "Hora de olhar comercial ou revisão de venda."),
            ("relative_92", int(planned_minutes * 0.92), "Fechamento chegando. Organize o handoff."),
        )
        for checkpoint_type, minute_mark, message in relative_alerts:
            if worked >= minute_mark:
                self.trigger_alert_once(session_id, checkpoint_type, message)

        if session["status"] == "active":
            no_pause_minutes = self.minutes_since_last_pause(session_id, session["started_at"])
            if no_pause_minutes >= 120:
                self.trigger_alert_once(session_id, "break_2h", "Pausa obrigatória: 2h sem pausa.")
            if no_pause_minutes >= 240:
                self.trigger_alert_once(session_id, "break_4h", "Pausa maior obrigatória: 4h sem pausa.")

        if worked >= 480:
            self.trigger_alert_once(session_id, "close_8h", "Depois de 8h, sem feature nova.")
        if worked >= 600:
            self.trigger_alert_once(session_id, "red_10h", "Você passou do limite. Fechamento agora.")
        if worked >= 720:
            self.trigger_alert_once(session_id, "hard_12h", "12h atingidas. Só fechamento.")

    def trigger_alert_once(self, session_id: int, checkpoint_type: str, message: str) -> None:
        if self.checkpoint_exists(session_id, checkpoint_type):
            return
        checkpoint_id = self.register_checkpoint(session_id, checkpoint_type, message)
        self.show_alert_window(checkpoint_id, checkpoint_type, message)

    def play_alert_sound(self) -> None:
        try:
            winsound.MessageBeep(winsound.MB_ICONEXCLAMATION)
        except RuntimeError:
            pass

    def show_alert_window(self, checkpoint_id: int, checkpoint_type: str, message: str) -> None:
        self.play_alert_sound()
        win = tk.Toplevel(self)
        win.title("Alerta HBX Owner")
        win.transient(self)
        win.resizable(False, False)
        win.configure(padx=18, pady=18, bg=THEME["bg"])

        ttk.Label(win, text="Alerta", style="Title.TLabel").grid(row=0, column=0, columnspan=2, sticky="w")
        ttk.Label(win, text=message, wraplength=420).grid(row=1, column=0, columnspan=2, sticky="w", pady=(12, 18))

        def ok() -> None:
            self.db.execute("UPDATE checkpoints SET user_note = 'ok' WHERE id = ?", (checkpoint_id,))
            win.destroy()

        def create_blocker() -> None:
            card_id = self.create_blocker_card(message, checkpoint_type)
            if card_id:
                self.db.execute(
                    "UPDATE checkpoints SET user_note = 'card de falha criado em Hoje' WHERE id = ?",
                    (checkpoint_id,),
                )
                win.destroy()

        ttk.Button(win, text="ok", command=ok, style="Accent.TButton").grid(row=2, column=0, sticky="ew", padx=(0, 8))
        ttk.Button(win, text="criar card em Hoje", command=create_blocker, style="TButton").grid(
            row=2, column=1, sticky="ew"
        )
        win.grab_set()

    def create_blocker_card(self, message: str, source: str = "alerta") -> int:
        if not self.can_create_new_card():
            return 0
        cur = self.db.execute(
            """
            INSERT INTO kanban_cards
            (date, title, description, module, type, priority, lane, blocked_reason, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'Alta', 'HOJE', '', ?, ?)
            """,
            (
                today_str(),
                f"Revisar alerta: {message}",
                f"Criado automaticamente pelo alerta {source}.",
                "Foco",
                "Alerta",
                now_iso(),
                now_iso(),
            ),
        )
        card_id = int(cur.lastrowid)
        self.db.execute(
            "INSERT INTO card_events (card_id, event_type, message, created_at) VALUES (?, 'created', ?, ?)",
            (card_id, f"Card de alerta criado em Hoje pelo alerta {source}.", now_iso()),
        )
        self.refresh_kanban()
        return card_id

    def start_work(self) -> None:
        planned_hours = float(self.config_data.get("planned_hours") or 8)
        notes = self.config_data.get("unique_goal") or ""
        session_id, message = create_work_session(self.db, planned_hours, notes, source="app")
        if session_id is None:
            messagebox.showinfo("Ponto", message)
        else:
            self.active_session_id = session_id
        self.refresh_today()

    def start_break(self) -> None:
        session = self.get_current_session()
        if not session:
            messagebox.showwarning("Pausa", "Inicie o expediente antes de abrir pausa.")
            return
        if self.get_open_break(session["id"]):
            messagebox.showinfo("Pausa", "Já existe uma pausa aberta.")
            return

        reason = simpledialog.askstring("Pausa", "Motivo da pausa:", initialvalue="pausa") or "pausa"
        self.db.execute(
            "INSERT INTO work_breaks (session_id, started_at, reason) VALUES (?, ?, ?)",
            (session["id"], now_iso(), reason.strip()),
        )
        self.db.execute("UPDATE work_sessions SET status = 'paused' WHERE id = ?", (session["id"],))
        append_point_event("HBX_BREAK_STARTED")
        update_day_state(status="paused", last_event="app_start_break", active_session_id=int(session["id"]))
        self.refresh_today()

    def resume_break(self) -> None:
        session = self.get_current_session()
        if not session:
            messagebox.showwarning("Retomar", "Não há sessão aberta.")
            return
        open_break = self.get_open_break(session["id"])
        if not open_break:
            messagebox.showinfo("Retomar", "Não há pausa aberta.")
            return
        self.db.execute("UPDATE work_breaks SET ended_at = ? WHERE id = ?", (now_iso(), open_break["id"]))
        self.db.execute("UPDATE work_sessions SET status = 'active' WHERE id = ?", (session["id"],))
        append_point_event("HBX_BREAK_ENDED")
        update_day_state(status="active", last_event="app_resume_break", active_session_id=int(session["id"]))
        self.refresh_today()

    def stop_work(self) -> None:
        session = self.get_current_session()
        if not session:
            messagebox.showwarning("Ponto", "Não há expediente aberto.")
            return
        open_break = self.get_open_break(session["id"])
        if open_break:
            self.db.execute("UPDATE work_breaks SET ended_at = ? WHERE id = ?", (now_iso(), open_break["id"]))

        total = self.work_minutes(session)
        stopped_at = now_iso()
        self.db.execute(
            "UPDATE work_sessions SET stopped_at = ?, total_minutes = ?, status = 'stopped' WHERE id = ?",
            (stopped_at, total, session["id"]),
        )
        append_point_event("HBX_WORK_STOPPED")
        update_day_state(
            status="stopped",
            stopped_at=stopped_at,
            total_minutes=total,
            last_event="app_stop_work",
            active_session_id="",
        )
        self.refresh_today()
        messagebox.showinfo("Ponto", f"Expediente fechado com {total} minutos líquidos.")

    def register_retroactive(self) -> None:
        session_date = simpledialog.askstring("Retroativo", "Data (AAAA-MM-DD):", initialvalue=today_str())
        start_time = simpledialog.askstring("Retroativo", "Início (HH:MM):", initialvalue="09:00")
        stop_time = simpledialog.askstring("Retroativo", "Fim (HH:MM):", initialvalue="18:00")
        notes = simpledialog.askstring("Retroativo", "Notas:", initialvalue="registro retroativo") or ""
        if not session_date or not start_time or not stop_time:
            return

        try:
            start_dt = datetime.fromisoformat(f"{session_date} {start_time}:00")
            stop_dt = datetime.fromisoformat(f"{session_date} {stop_time}:00")
        except ValueError:
            messagebox.showerror("Retroativo", "Use data AAAA-MM-DD e horários HH:MM.")
            return
        if stop_dt <= start_dt:
            messagebox.showerror("Retroativo", "O fim precisa ser depois do início.")
            return

        total = int((stop_dt - start_dt).total_seconds() // 60)
        self.db.execute(
            """
            INSERT INTO work_sessions
            (date, started_at, stopped_at, planned_hours, total_minutes, status, retroactive, notes, created_at)
            VALUES (?, ?, ?, ?, ?, 'stopped', 1, ?, ?)
            """,
            (
                session_date,
                start_dt.isoformat(sep=" "),
                stop_dt.isoformat(sep=" "),
                float(self.config_data.get("planned_hours") or 8),
                total,
                notes.strip(),
                now_iso(),
            ),
        )
        self.refresh_today()
        messagebox.showinfo("Retroativo", f"Registro retroativo salvo com {total} minutos.")

    def format_minutes(self, minutes: int) -> str:
        hours, mins = divmod(max(0, minutes), 60)
        return f"{hours}h {mins:02d}min"

    def html_list(self, items: list[str]) -> str:
        if not items:
            return "<p>Nenhum registro.</p>"
        return "<ul>" + "".join(f"<li>{html_lib.escape(item)}</li>" for item in items) + "</ul>"

    def close_day(self) -> None:
        session = self.get_current_session()
        if session and messagebox.askyesno("Fechar dia", "Existe expediente aberto. Fechar agora antes do relatório?"):
            self.stop_work()
        html_path = self.generate_daily_html_report(today_str())
        pdf_path = self.export_daily_report_pdf(html_path)
        if pdf_path:
            self.set_report_output(f"Relatório HTML gerado:\n{html_path}\n\nPDF gerado:\n{pdf_path}")
        else:
            self.set_report_output(f"Relatório HTML gerado:\n{html_path}\n\nPDF não gerado; HTML disponível.")
        self.copy_next_day_plan(open_chat=True, silent=True)
        webbrowser.open(html_path.as_uri())

    def generate_weekly_report(self) -> Path:
        end_date = date.today()
        start_date = end_date - timedelta(days=6)
        start = start_date.isoformat()
        end = end_date.isoformat()

        sessions = self.db.fetchall(
            "SELECT * FROM work_sessions WHERE date BETWEEN ? AND ? ORDER BY date, started_at",
            (start, end),
        )
        done_cards = self.db.fetchall(
            "SELECT * FROM kanban_cards WHERE done_at BETWEEN ? AND ? ORDER BY done_at DESC",
            (f"{start} 00:00:00", f"{end} 23:59:59"),
        )
        failed_dispatches = self.db.fetchall(
            "SELECT * FROM codex_dispatches WHERE status = 'failed' ORDER BY updated_at DESC LIMIT 20"
        )
        local_runs = self.db.fetchall(
            "SELECT * FROM local_runs WHERE date BETWEEN ? AND ? ORDER BY created_at DESC",
            (start, end),
        )
        git_rows = self.db.fetchall(
            "SELECT * FROM git_snapshots WHERE date BETWEEN ? AND ? AND commit_sha != '' ORDER BY created_at DESC",
            (start, end),
        )

        minutes_by_date: dict[str, int] = {}
        for row in sessions:
            minutes_by_date[row["date"]] = minutes_by_date.get(row["date"], 0) + int(
                row["total_minutes"] or self.work_minutes(row)
            )
        hours_items = [
            f"{day}: {self.format_minutes(minutes)}" for day, minutes in sorted(minutes_by_date.items())
        ] or ["Nenhuma sessão registrada."]
        done_items = [f"#{card['id']} {card['title']} | {card['module']} | {card['done_at'] or '-'}" for card in done_cards]
        failed_items = [
            f"card #{row['card_id']} | {row['updated_at'] or row['created_at']} | {row['error_message'] or '-'}"
            for row in failed_dispatches
        ]
        run_items = [
            f"{row['created_at']} | {row['command_key']} | rc={row['returncode']} | {row['output'][:180]}"
            for row in local_runs
        ]
        git_items = [f"{row['created_at']} | {row['commit_sha']} | {row['commit_message']}" for row in git_rows]

        total_minutes = sum(minutes_by_date.values())
        summary = (
            f"Semana {start} a {end}: {self.format_minutes(total_minutes)} trabalhados, "
            f"{len(done_cards)} cards feitos, {len(failed_dispatches)} falhas Codex, "
            f"{len(local_runs)} execuções locais."
        )

        html = f"""<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>HBX Owner - Relatório semanal {html_lib.escape(start)} a {html_lib.escape(end)}</title>
  <style>
    body {{ font-family: Segoe UI, Arial, sans-serif; margin: 32px; color: #1f2937; }}
    h1, h2 {{ color: #111827; }}
    section {{ border-top: 1px solid #d1d5db; padding-top: 14px; margin-top: 18px; }}
    pre {{ white-space: pre-wrap; background: #f3f4f6; padding: 12px; border-radius: 6px; }}
  </style>
</head>
<body>
  <h1>HBX Owner Local Pro - Relatório semanal</h1>
  <p><strong>Período:</strong> {html_lib.escape(start)} a {html_lib.escape(end)}</p>
  <p><strong>Resumo:</strong> {html_lib.escape(summary)}</p>
  <section><h2>Horas por dia</h2>{self.html_list(hours_items)}</section>
  <section><h2>Cards feitos</h2>{self.html_list(done_items)}</section>
  <section><h2>Falhas Codex</h2>{self.html_list(failed_items)}</section>
  <section><h2>Execuções locais</h2>{self.html_list(run_items)}</section>
  <section><h2>Git snapshots</h2>{self.html_list(git_items)}</section>
</body>
</html>
"""
        path = APP_DIR / "reports" / f"{end}-weekly.html"
        path.write_text(html, encoding="utf-8")
        if hasattr(self, "report_output"):
            self.set_report_output(f"Relatório semanal gerado:\n{path}\n\n{summary}")
        webbrowser.open(path.as_uri())
        return path

    def generate_daily_html_report(self, report_date: str) -> Path:
        sessions = self.db.fetchall("SELECT * FROM work_sessions WHERE date = ? ORDER BY started_at", (report_date,))
        total_minutes = sum(int(row["total_minutes"] or self.work_minutes(row)) for row in sessions)
        session_ids = [int(row["id"]) for row in sessions]

        break_items: list[str] = []
        checkpoint_items: list[str] = []
        if session_ids:
            placeholders = ",".join("?" for _ in session_ids)
            breaks = self.db.fetchall(
                f"SELECT * FROM work_breaks WHERE session_id IN ({placeholders}) ORDER BY started_at",
                tuple(session_ids),
            )
            for row in breaks:
                break_items.append(
                    f"Sessão #{row['session_id']} | {row['started_at']} até {row['ended_at'] or 'aberta'} | {row['reason']}"
                )

            checkpoints = self.db.fetchall(
                f"SELECT * FROM checkpoints WHERE session_id IN ({placeholders}) ORDER BY created_at",
                tuple(session_ids),
            )
            for row in checkpoints:
                note = row["user_note"] or "sem confirmação"
                checkpoint_items.append(f"{row['created_at']} | {row['checkpoint_type']} | {row['message']} | {note}")

        done_cards = self.db.fetchall(
            "SELECT * FROM kanban_cards WHERE date = ? AND lane = 'FEITO' ORDER BY done_at DESC, updated_at DESC",
            (report_date,),
        )
        failed_dispatches = self.db.fetchall(
            "SELECT * FROM codex_dispatches WHERE status = 'failed' AND created_at LIKE ? ORDER BY updated_at DESC",
            (f"{report_date}%",),
        )
        pending_cards = self.get_pending_cards()
        latest_git = self.db.fetchone("SELECT * FROM git_snapshots ORDER BY id DESC LIMIT 1")
        chatgpt_rows = self.db.fetchall(
            "SELECT * FROM chatgpt_exchanges WHERE date = ? ORDER BY created_at", (report_date,)
        )
        local_run_rows = self.db.fetchall(
            "SELECT * FROM local_runs WHERE date = ? ORDER BY created_at", (report_date,)
        )
        ok, repo_status = self.run_git_command(["status", "--short"])
        repo_status_text = repo_status if ok else f"Indisponível: {repo_status}"

        risk = "saudável"
        if total_minutes >= 600:
            risk = "crítico: passou de 10h"
        elif total_minutes >= 480:
            risk = "atenção: passou de 8h"

        done_items = [f"#{card['id']} {card['title']} | {card['module']} | commit {card['commit_sha'] or '-'}" for card in done_cards]
        pending_items = [f"#{card['id']} {card['lane']} | {card['title']} | {card['priority']}" for card in pending_cards]
        failed_items = [
            f"card #{row['card_id']} | {row['updated_at'] or row['created_at']} | {row['error_message'] or '-'}"
            for row in failed_dispatches
        ]
        chat_items = [
            f"{row['created_at']} | card #{row['card_id'] or '-'} | {row['response'][:500]}" for row in chatgpt_rows
        ]
        local_run_items = [
            f"{row['created_at']} | {row['command_key']} | rc={row['returncode']} | {row['output'][:500]}"
            for row in local_run_rows
        ]

        next_plan = self.build_next_plan_text(report_date, pending_cards)
        summary = (
            f"Dia {report_date}: {self.format_minutes(total_minutes)} trabalhados, "
            f"{len(done_cards)} cards feitos, {len(failed_dispatches)} falhas Codex."
        )
        handoff = self.build_handoff_prompt(report_date, summary, pending_cards, latest_git, repo_status_text)

        html = f"""<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>HBX Owner - Relatório {html_lib.escape(report_date)}</title>
  <style>
    body {{ font-family: Segoe UI, Arial, sans-serif; margin: 32px; color: #1f2937; }}
    h1, h2 {{ color: #111827; }}
    section {{ border-top: 1px solid #d1d5db; padding-top: 14px; margin-top: 18px; }}
    pre {{ white-space: pre-wrap; background: #f3f4f6; padding: 12px; border-radius: 6px; }}
    .risk {{ font-weight: 700; }}
  </style>
</head>
<body>
  <h1>HBX Owner Local Pro - Relatório diário</h1>
  <p><strong>Data:</strong> {html_lib.escape(report_date)}</p>
  <p><strong>Resumo:</strong> {html_lib.escape(summary)}</p>

  <section><h2>Horas trabalhadas</h2><p>{html_lib.escape(self.format_minutes(total_minutes))}</p></section>
  <section><h2>Pausas</h2>{self.html_list(break_items)}</section>
  <section><h2>Alertas ignorados/checkpoints</h2>{self.html_list(checkpoint_items)}</section>
  <section><h2>Cards feitos</h2>{self.html_list(done_items)}</section>
  <section><h2>Cards pendentes</h2>{self.html_list(pending_items)}</section>
  <section><h2>Falhas Codex</h2>{self.html_list(failed_items)}</section>
  <section><h2>Último commit</h2><pre>{html_lib.escape((latest_git['commit_sha'] + ' ' + latest_git['commit_message']) if latest_git else 'Nenhum snapshot Git.')}</pre></section>
  <section><h2>Status do repo</h2><pre>{html_lib.escape(repo_status_text)}</pre></section>
  <section><h2>Respostas do ChatGPT</h2>{self.html_list(chat_items)}</section>
  <section><h2>Execuções locais</h2>{self.html_list(local_run_items)}</section>
  <section><h2>Risco físico/foco</h2><p class="risk">{html_lib.escape(risk)}</p></section>
  <section><h2>Plano de amanhã</h2><pre>{html_lib.escape(next_plan)}</pre></section>
  <section><h2>Prompt de handoff</h2><pre>{html_lib.escape(handoff)}</pre></section>
</body>
</html>
"""
        path = APP_DIR / "reports" / f"{report_date}.html"
        path.write_text(html, encoding="utf-8")
        self.db.execute(
            """
            INSERT INTO daily_reports (date, html_path, pdf_path, summary_text, next_plan_text, created_at)
            VALUES (?, ?, '', ?, ?, ?)
            """,
            (report_date, str(path), summary, next_plan, now_iso()),
        )
        return path

    def find_edge_executable(self) -> str | None:
        found = shutil.which("msedge") or shutil.which("msedge.exe")
        if found:
            return found
        candidates = [
            Path("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"),
            Path("C:/Program Files/Microsoft/Edge/Application/msedge.exe"),
        ]
        for candidate in candidates:
            if candidate.exists():
                return str(candidate)
        return None

    def export_daily_report_pdf(self, html_path: Path) -> Path | None:
        edge = self.find_edge_executable()
        if not edge:
            messagebox.showwarning("PDF", "PDF não gerado; HTML disponível")
            return None

        pdf_path = html_path.with_suffix(".pdf")
        command = [
            edge,
            "--headless",
            "--disable-gpu",
            f"--print-to-pdf={pdf_path}",
            html_path.as_uri(),
        ]
        try:
            result = subprocess.run(command, capture_output=True, text=True, timeout=60, check=False)
        except (OSError, subprocess.TimeoutExpired):
            messagebox.showwarning("PDF", "PDF não gerado; HTML disponível")
            return None
        if result.returncode != 0 or not pdf_path.exists():
            messagebox.showwarning("PDF", "PDF não gerado; HTML disponível")
            return None

        self.db.execute(
            "UPDATE daily_reports SET pdf_path = ? WHERE html_path = ?",
            (str(pdf_path), str(html_path)),
        )
        return pdf_path

    def build_next_plan_text(self, report_date: str, pending_cards: list[sqlite3.Row]) -> str:
        next_date = (date.fromisoformat(report_date) + timedelta(days=1)).isoformat()
        tomorrow_cards = pending_cards[:3]
        main_card = tomorrow_cards[0] if tomorrow_cards else None
        secondary = "\n".join(f"- #{card['id']} {card['title']}" for card in tomorrow_cards[1:]) or "-"
        return (
            "PLANO_AMANHA\n"
            f"Data: {next_date}\n"
            f"Meta única: {main_card['title'] if main_card else self.config_data.get('unique_goal', '')}\n"
            f"Card principal: {('#' + str(main_card['id']) + ' ' + main_card['title']) if main_card else '-'}\n"
            f"Cards secundários:\n{secondary}\n"
            f"Não fazer: {self.config_data.get('not_today', '')}\n"
            "Risco: fadiga e dispersão se passar de 8h\n"
            f"Primeiro comando do dia: python {APP_DIR / 'hbx_owner_app.py'}\n"
        )

    def get_pending_cards(self) -> list[sqlite3.Row]:
        return self.db.fetchall(
            """
            SELECT * FROM kanban_cards
            WHERE lane NOT IN ('FEITO', 'ARQUIVADO')
            ORDER BY lane, priority DESC, updated_at DESC
            """
        )

    def copy_next_day_plan(self, open_chat: bool = True, silent: bool = False) -> str:
        plan = self.build_next_plan_text(today_str(), self.get_pending_cards())
        self.copy_text(plan)
        path = self.save_prompt_file("plano-amanha", plan)
        if hasattr(self, "report_output") and not silent:
            self.set_report_output(f"PLANO_AMANHA copiado para clipboard.\nArquivo: {path}\n\n{plan}")
        if open_chat:
            self.open_chatgpt()
        if not silent:
            messagebox.showinfo("Plano de amanhã", "PLANO_AMANHA copiado para clipboard.")
        return plan

    def build_handoff_prompt(
        self,
        report_date: str,
        summary: str,
        pending_cards: list[sqlite3.Row],
        latest_git: sqlite3.Row | None,
        repo_status: str,
    ) -> str:
        next_cards = "\n".join(f"- #{card['id']} {card['lane']} {card['title']}" for card in pending_cards[:5]) or "-"
        commit = f"{latest_git['commit_sha']} {latest_git['commit_message']}" if latest_git else "-"
        return (
            "HANDOFF HBX OWNER\n"
            f"Data: {report_date}\n"
            f"Resumo: {summary}\n"
            f"Último commit: {commit}\n"
            f"Status do repo:\n{repo_status}\n"
            f"Próximos cards:\n{next_cards}\n"
            "Me ajude a começar pelo menor próximo passo testável.\n"
        )

    def _build_config_tab(self, frame: ttk.Frame) -> None:
        self.page_title(frame, "Config", "Preferências locais")

        frame.rowconfigure(1, weight=1)
        scroll_shell = ttk.Frame(frame, style="App.TFrame")
        scroll_shell.grid(row=1, column=0, sticky="nsew", pady=(12, 0))
        scroll_shell.rowconfigure(0, weight=1)
        scroll_shell.columnconfigure(0, weight=1)

        canvas = tk.Canvas(scroll_shell, bg=THEME["bg"], highlightthickness=0)
        scrollbar = ttk.Scrollbar(scroll_shell, orient="vertical", command=canvas.yview)
        canvas.configure(yscrollcommand=scrollbar.set)
        canvas.grid(row=0, column=0, sticky="nsew")
        scrollbar.grid(row=0, column=1, sticky="ns")

        content = ttk.Frame(canvas, style="App.TFrame")
        content.columnconfigure(0, weight=1)
        content_window = canvas.create_window((0, 0), window=content, anchor="nw")

        def sync_scroll_region(_event: tk.Event | None = None) -> None:
            canvas.configure(scrollregion=canvas.bbox("all"))

        def sync_content_width(event: tk.Event) -> None:
            canvas.itemconfigure(content_window, width=event.width)

        def on_mousewheel(event: tk.Event) -> str:
            if getattr(event, "num", None) == 4:
                canvas.yview_scroll(-3, "units")
            elif getattr(event, "num", None) == 5:
                canvas.yview_scroll(3, "units")
            else:
                canvas.yview_scroll(-int(event.delta / 120), "units")
            return "break"

        def bind_config_mousewheel(_event: tk.Event) -> None:
            canvas.bind_all("<MouseWheel>", on_mousewheel, add="+")
            canvas.bind_all("<Button-4>", on_mousewheel, add="+")
            canvas.bind_all("<Button-5>", on_mousewheel, add="+")

        def unbind_config_mousewheel(_event: tk.Event) -> None:
            canvas.unbind_all("<MouseWheel>")
            canvas.unbind_all("<Button-4>")
            canvas.unbind_all("<Button-5>")

        content.bind("<Configure>", sync_scroll_region)
        canvas.bind("<Configure>", sync_content_width)
        canvas.bind("<Enter>", bind_config_mousewheel)
        canvas.bind("<Leave>", unbind_config_mousewheel)
        content.bind("<Enter>", bind_config_mousewheel)
        content.bind("<Leave>", unbind_config_mousewheel)

        panel = ttk.LabelFrame(content, text="Preferências locais", padding=12, style="Modern.TLabelframe")
        panel.grid(row=0, column=0, sticky="ew")
        panel.columnconfigure(1, weight=1)

        fields = (
            ("repo_path", "Repo path"),
            ("planned_hours", "Horas planejadas"),
            ("hours_available", "Horas disponíveis"),
            ("chatgpt_app_id", "ChatGPT Desktop AppID"),
            ("chatgpt_auto_focus_delay_seconds", "ChatGPT auto delay foco"),
            ("chatgpt_auto_model_mode", "ChatGPT auto modo/modelo"),
            ("chatgpt_auto_new_chat", "ChatGPT auto novo chat"),
            ("chatgpt_auto_send_enter", "ChatGPT auto enviar"),
            ("chatgpt_auto_extra_keys", "ChatGPT auto teclas extras"),
            ("chatgpt_auto_monitor_minutes", "ChatGPT auto monitor min"),
            ("chatgpt_auto_poll_seconds", "ChatGPT auto polling seg"),
            ("pdf_automation_url", "PDF automation URL"),
            ("usage_hud_enabled", "Usage HUD enabled"),
            ("usage_hud_window_hours", "Usage HUD window hours"),
            ("owner_backend_url", "Owner backend URL"),
            ("owner_tickets_secret", "Owner tickets secret"),
            ("owner_local_agent_url", "Owner local agent URL"),
            ("owner_local_agent_token", "Owner local agent token"),
            ("pr_lab_base_branch", "Branches base branch"),
            ("pr_lab_worktree_dir", "Branches worktree dir"),
            ("pr_lab_localhost_url", "Branches localhost URL"),
            ("alignment_runtime_url", "Alinhamento runtime URL"),
            ("alignment_container_filter", "Alinhamento container filtro"),
            ("alignment_vps_ssh_target", "Alinhamento VPS SSH"),
            ("alignment_vps_repo_path", "Alinhamento VPS repo path"),
            ("codex_max_parallel_dispatches", "Codex paralelos"),
            ("codex_cli_path", "Codex CLI path"),
            ("codex_sandbox_mode", "Codex sandbox mode"),
            ("codex_model", "Codex model global opcional"),
            ("codex_model_fast", "Codex model médio opcional"),
            ("codex_model_deep", "Codex model grave opcional"),
            ("codex_worktree_dir", "Codex worktree dir"),
            ("unique_goal", "Meta única"),
            ("technical_task", "Tarefa técnica"),
            ("commercial_task", "Tarefa comercial"),
            ("blocker", "Impedimento"),
            ("not_today", "Não fazer hoje"),
        )
        for row, (key, label) in enumerate(fields):
            ttk.Label(panel, text=label, style="CardMuted.TLabel").grid(row=row, column=0, sticky="w", padx=(0, 10), pady=5)
            var = tk.StringVar(value=str(self.config_data.get(key, "")))
            self.config_entries[key] = var
            show_char = "*" if key in {"owner_tickets_secret", "owner_local_agent_token"} else ""
            ttk.Entry(panel, textvariable=var, show=show_char).grid(row=row, column=1, sticky="ew", pady=5)

        boss_row = len(fields)
        ttk.Checkbutton(panel, text="Chefe chato", variable=self.boss_mode_var).grid(
            row=boss_row, column=1, sticky="w", pady=(8, 5)
        )
        ttk.Button(panel, text="Salvar config", command=self.save_config_from_tab, style="Accent.TButton").grid(
            row=boss_row + 1, column=1, sticky="e", pady=(12, 0)
        )

        windows_panel = ttk.LabelFrame(content, text="Windows", padding=12, style="Modern.TLabelframe")
        windows_panel.grid(row=1, column=0, sticky="ew", pady=(12, 0))
        for column in range(5):
            windows_panel.columnconfigure(column, weight=1)
        ttk.Label(
            windows_panel,
            text=(
                "Instalacao local cria atalhos seguros. Self-check valida Python, SQLite e scripts "
                "sem abrir navegador ou janela do app."
            ),
            style="Card.TLabel",
            wraplength=780,
        ).grid(row=0, column=0, columnspan=5, sticky="w", pady=(0, 10))
        ttk.Button(
            windows_panel,
            text="Copiar comando instalar",
            command=self.copy_install_command,
            style="Accent.TButton",
        ).grid(row=1, column=0, sticky="ew", padx=(0, 8))
        ttk.Button(
            windows_panel,
            text="Copiar comando remover",
            command=self.copy_uninstall_command,
        ).grid(row=1, column=1, sticky="ew", padx=8)
        ttk.Button(
            windows_panel,
            text="Copiar self-check",
            command=self.copy_self_check_command,
            style="Warning.TButton",
        ).grid(row=1, column=2, sticky="ew", padx=8)
        ttk.Button(
            windows_panel,
            text="Verificar saude",
            command=self.run_windows_health_check,
            style="Success.TButton",
        ).grid(row=1, column=3, sticky="ew", padx=8)
        ttk.Button(
            windows_panel,
            text="Abrir Startup",
            command=self.open_startup_folder,
        ).grid(row=1, column=4, sticky="ew", padx=(8, 0))

    def save_config_from_tab(self) -> None:
        for key, var in self.config_entries.items():
            value: str | float = var.get().strip()
            if key in {"planned_hours", "hours_available"}:
                try:
                    value = float(value)
                except ValueError:
                    messagebox.showerror("Config", f"{key} precisa ser numérico.")
                    return
            elif key in {
                "usage_hud_window_hours",
                "codex_max_parallel_dispatches",
                "chatgpt_auto_focus_delay_seconds",
                "chatgpt_auto_monitor_minutes",
                "chatgpt_auto_poll_seconds",
            }:
                try:
                    value = int(float(value))
                except ValueError:
                    messagebox.showerror("Config", f"{key} precisa ser numérico.")
                    return
            elif key in {"usage_hud_enabled", "chatgpt_auto_new_chat", "chatgpt_auto_send_enter"}:
                value = value.lower() in ("1", "true", "sim", "yes", "on")
            self.config_data[key] = value
        self.config_data["boss_mode"] = bool(self.boss_mode_var.get())
        save_config(self.config_data)
        update_day_state(
            hours_available=self.config_data.get("hours_available", self.config_data.get("planned_hours", 8)),
            unique_goal=self.config_data.get("unique_goal", ""),
            technical_task=self.config_data.get("technical_task", ""),
            commercial_task=self.config_data.get("commercial_task", ""),
            blocker=self.config_data.get("blocker", ""),
            not_today=self.config_data.get("not_today", ""),
            last_event="config_saved",
        )
        self.git_repo_var.set(str(self.config_data.get("repo_path") or APP_DIR))
        self.today_plan_var.set(self.config_data.get("unique_goal") or "Meta única não definida.")
        self.codex_model_var.set(str(self.config_data.get("codex_model") or ""))
        self.refresh_usage_hud()
        messagebox.showinfo("Config", "Configuração salva localmente.")

    def install_command(self) -> str:
        return f'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "{INSTALL_SCRIPT_PATH}"'

    def uninstall_command(self) -> str:
        return f'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "{UNINSTALL_SCRIPT_PATH}"'

    def self_check_command(self) -> str:
        return f'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "{SELF_CHECK_SCRIPT_PATH}"'

    def copy_install_command(self) -> None:
        command = self.install_command()
        self.copy_text(command)
        messagebox.showinfo("Windows", f"Comando de instalacao copiado:\n{command}")

    def copy_uninstall_command(self) -> None:
        command = self.uninstall_command()
        self.copy_text(command)
        messagebox.showinfo("Windows", f"Comando de remocao copiado:\n{command}")

    def copy_self_check_command(self) -> None:
        command = self.self_check_command()
        self.copy_text(command)
        messagebox.showinfo("Windows", f"Comando de self-check copiado:\n{command}")

    def startup_folder_path(self) -> Path:
        appdata = Path(str(Path.home())) / "AppData" / "Roaming"
        return appdata / "Microsoft" / "Windows" / "Start Menu" / "Programs" / "Startup"

    def desktop_folder_path(self) -> Path:
        return Path(str(Path.home())) / "Desktop"

    def run_windows_health_check(self) -> str:
        startup = self.startup_folder_path()
        desktop = self.desktop_folder_path()
        checks = [
            ("App Python", APP_DIR / "hbx_owner_app.py"),
            ("Launcher", APP_DIR / "launch-hbx-owner.ps1"),
            ("Owner workspace", HBX_OWNER_WORKSPACE_DIR),
            ("Ops Control", OPS_CONTROL_DIR),
            ("Ops Control script", OPS_CONTROL_SCRIPT_PATH),
            ("Ops Control compose", OPS_CONTROL_COMPOSE_PATH),
            ("Ops Control env", OPS_CONTROL_ENV_PATH),
            ("Start HBX", APP_DIR / "start-hbx.ps1"),
            ("Start Work", APP_DIR / "start-work.ps1"),
            ("Install script", INSTALL_SCRIPT_PATH),
            ("Uninstall script", UNINSTALL_SCRIPT_PATH),
            ("Self-check script", SELF_CHECK_SCRIPT_PATH),
            ("SQLite", DB_PATH),
            ("Memoria", MEMORY_PATH),
            ("Plano do dia", DAY_PLAN_PATH),
            ("Startup shortcut", startup / "HBX Owner.lnk"),
            ("Desktop shortcut", desktop / "HBX Owner.lnk"),
        ]
        lines = ["SAUDE HBX OWNER WINDOWS", f"Data: {now_iso()}", ""]
        for label, path in checks:
            lines.append(f"[{'OK' if path.exists() else '--'}] {label}: {path}")
        python_status = shutil.which("py.exe") or shutil.which("python.exe") or "-"
        lines.append(f"[{'OK' if python_status != '-' else '--'}] Python launcher: {python_status}")
        chatgpt_app_id = str(self.config_data.get("chatgpt_app_id", "")).strip()
        lines.append(f"[{'OK' if chatgpt_app_id else '--'}] ChatGPT AppID: {chatgpt_app_id or '-'}")
        report = "\n".join(lines)
        if hasattr(self, "execution_output"):
            self.set_execution_output(report)
            self.execution_status_var.set("Verificacao de saude concluida.")
        messagebox.showinfo("Saude Windows", report)
        return report

    def open_startup_folder(self) -> None:
        startup = self.startup_folder_path()
        startup.mkdir(parents=True, exist_ok=True)
        try:
            subprocess.Popen(["explorer.exe", str(startup)])
        except OSError as exc:
            messagebox.showwarning("Startup", f"Nao consegui abrir Startup:\n{exc}")

    def boss_mode_enabled(self) -> bool:
        return bool(self.config_data.get("boss_mode") or self.boss_mode_var.get())

    def current_work_minutes(self) -> int:
        session = self.get_current_session()
        return self.work_minutes(session) if session else 0

    def can_create_new_card(self) -> bool:
        if not self.boss_mode_enabled():
            return True
        worked = self.current_work_minutes()
        if worked >= 720:
            messagebox.showerror("Chefe chato", "12h atingidas. Só permitir FECHAR DIA.")
            return False
        if worked >= 480:
            return messagebox.askyesno("Chefe chato", "Depois de 8h, sem feature nova. Criar card mesmo assim?")
        return True

    def check_boss_mode(self) -> None:
        if not self.boss_mode_enabled():
            return
        session = self.get_current_session()
        if not session:
            return
        session_id = int(session["id"])
        worked = self.work_minutes(session)

        stalled_cards = self.db.fetchall("SELECT id, title, updated_at FROM kanban_cards WHERE lane = 'FAZENDO'")
        for card in stalled_cards:
            if minutes_between(card["updated_at"]) >= 90:
                self.trigger_alert_once(
                    session_id,
                    f"boss_card_stalled_{card['id']}",
                    f"Card FAZENDO parado há mais de 90 min: #{card['id']} {card['title']}",
                )

        last_commit = self.db.fetchone(
            """
            SELECT created_at FROM git_snapshots
            WHERE date = ? AND commit_sha != ''
            ORDER BY id DESC
            LIMIT 1
            """,
            (today_str(),),
        )
        no_recent_snapshot = not last_commit or minutes_between(last_commit["created_at"]) >= 180
        if worked >= 180 and no_recent_snapshot:
            self.trigger_alert_once(session_id, "boss_no_commit_3h", "Sem commit em 3h.")

        if worked >= 600 and not self.checkpoint_exists(session_id, "boss_red_10h"):
            checkpoint_id = self.register_checkpoint(
                session_id, "boss_red_10h", "Você passou do limite. Fechamento agora."
            )
            self.show_red_screen(checkpoint_id)

    def show_red_screen(self, checkpoint_id: int) -> None:
        self.play_alert_sound()
        win = tk.Toplevel(self)
        win.title("Chefe chato")
        win.transient(self)
        win.configure(bg="#9b111e", padx=24, pady=24)
        win.geometry("520x260")

        tk.Label(
            win,
            text="VOCÊ PASSOU DO LIMITE",
            bg="#9b111e",
            fg="white",
            font=(self.font_family, 20, "bold"),
        ).pack(anchor="w")
        tk.Label(
            win,
            text="Fechamento agora. Não é trava do Windows; é só aviso insistente do app.",
            bg="#9b111e",
            fg="white",
            wraplength=450,
            justify="left",
            font=(self.font_family, 11),
        ).pack(anchor="w", pady=(16, 24))

        def ok() -> None:
            self.db.execute("UPDATE checkpoints SET user_note = 'ok tela vermelha' WHERE id = ?", (checkpoint_id,))
            win.destroy()

        tk.Button(win, text="ok", command=ok, width=18).pack(anchor="e")

    def on_close(self) -> None:
        self.db.close()
        self.destroy()

    def maximize_window(self) -> None:
        try:
            self.state("zoomed")
        except tk.TclError:
            self.geometry(f"{self.winfo_screenwidth()}x{self.winfo_screenheight()}+0+0")


def main() -> None:
    ensure_app_dirs()
    ensure_operational_files()

    parser = argparse.ArgumentParser(description="HBX Owner Local Pro")
    parser.add_argument("--init-db", action="store_true", help="Cria ou atualiza o SQLite sem abrir a janela.")
    parser.add_argument("--start-work", type=float, default=None, help="Inicia expediente com horas planejadas.")
    parser.add_argument("--no-gui", action="store_true", help="Executa a ação pedida sem abrir a janela.")
    args = parser.parse_args()

    if args.init_db:
        db = Database()
        db.init_schema()
        db.close()
        print(f"SQLite inicializado em {DB_PATH}")
        return

    if args.start_work is not None:
        db = Database()
        db.init_schema()
        config = load_config()
        notes = str(config.get("unique_goal") or "")
        _session_id, message = create_work_session(db, float(args.start_work), notes, source="cli")
        db.close()
        print(message)
        if args.no_gui:
            return

    if args.no_gui:
        db = Database()
        db.init_schema()
        db.close()
        return

    single_instance = SingleInstanceGuard()
    if not single_instance.acquire():
        return

    app = HbxOwnerApp()
    app.single_instance = single_instance
    app.mainloop()


if __name__ == "__main__":
    main()

