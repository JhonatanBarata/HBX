from __future__ import annotations

import argparse
import atexit
import csv
import ctypes
import html as html_lib
import json
import re
import shutil
import sqlite3
import subprocess
import sys
import threading
import tkinter as tk
import winsound
import webbrowser
from datetime import date, datetime, timedelta
from pathlib import Path
from tkinter import font as tkfont
from tkinter import messagebox, simpledialog, ttk


def resolve_app_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


APP_DIR = resolve_app_dir()
HBX_REPO_DIR = (
    APP_DIR.parents[1]
    if APP_DIR.name == "windows-app" and APP_DIR.parent.name == "hbx-master" and len(APP_DIR.parents) > 1
    else APP_DIR
)
HBX_MASTER_WORKSPACE_DIR = APP_DIR.parent if APP_DIR.name == "windows-app" else HBX_REPO_DIR / "hbx-master"
OPS_CONTROL_DIR = HBX_MASTER_WORKSPACE_DIR / "ops-control"
OPS_CONTROL_SCRIPT_PATH = OPS_CONTROL_DIR / "open-hbx-ops-control.ps1"
OPS_CONTROL_ENV_PATH = HBX_REPO_DIR / ".env.ops-control"
OPS_CONTROL_COMPOSE_PATH = OPS_CONTROL_DIR / "docker-compose.yml"
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

TAB_NAMES = ("Hoje", "Ops Control", "Modo IA", "Execução", "Kanban", "Git", "ChatGPT", "Relatórios", "Config")
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
    "BLOQUEADO",
    "ARQUIVADO",
)

DEFAULT_CONFIG = {
    "repo_path": str(HBX_REPO_DIR),
    "planned_hours": 8,
    "boss_mode": False,
    "hours_available": 8,
    "chatgpt_app_id": "OpenAI.ChatGPT-Desktop_2p2nqsd0c76g0!ChatGPT",
    "chatgpt_fallback_url": "",
    "unique_goal": "",
    "technical_task": "",
    "commercial_task": "",
    "blocker": "",
    "not_today": "",
}

THEME = {
    "bg": "#eef3f7",
    "panel": "#f8fafc",
    "card": "#ffffff",
    "card_alt": "#e8eef5",
    "lane": "#f6f8fb",
    "lane_hover": "#e8f1ff",
    "text": "#111827",
    "muted": "#64748b",
    "line": "#d7dee8",
    "header": "#eaf1f7",
    "brand": "#0f1f35",
    "accent": "#2563eb",
    "accent_hover": "#1d4ed8",
    "success": "#15803d",
    "warning": "#b45309",
    "danger": "#b91c1c",
    "soft_success": "#e7f6ee",
    "soft_warning": "#fff5db",
    "soft_danger": "#fdecec",
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
    "BLOQUEADO": "Bloqueado",
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
    "BLOQUEADO": "#dc2626",
    "ARQUIVADO": "#475569",
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

PRIORITY_RANK = {"Crítica": 4, "Alta": 3, "Média": 2, "Baixa": 1}
LANE_RANK = {
    "FAZENDO": 0,
    "HOJE": 1,
    "TESTAR": 2,
    "REVISAR COM CHATGPT": 3,
    "AGUARDANDO CODEX": 4,
    "BLOQUEADO": 5,
    "BACKLOG": 6,
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


def migrate_legacy_db() -> None:
    if DB_PATH.exists() or not LEGACY_DB_PATH.exists():
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
                "Bloqueio:\n\n"
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
                lane TEXT NOT NULL DEFAULT 'BACKLOG',
                acceptance_criteria TEXT NOT NULL DEFAULT '',
                test_command TEXT NOT NULL DEFAULT '',
                codex_prompt TEXT NOT NULL DEFAULT '',
                chatgpt_prompt TEXT NOT NULL DEFAULT '',
                commit_sha TEXT NOT NULL DEFAULT '',
                estimate_minutes INTEGER NOT NULL DEFAULT 0,
                actual_minutes INTEGER NOT NULL DEFAULT 0,
                blocked_reason TEXT NOT NULL DEFAULT '',
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

            CREATE TABLE IF NOT EXISTS smart_interactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL,
                intent TEXT NOT NULL DEFAULT '',
                user_text TEXT NOT NULL DEFAULT '',
                assistant_text TEXT NOT NULL DEFAULT '',
                decision TEXT NOT NULL DEFAULT '',
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
            """
        )
        self.conn.commit()

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
        self.kanban_lane_frames: dict[str, tk.Frame] = {}
        self.kanban_card_widgets: dict[int, tk.Frame] = {}
        self.kanban_card_ids: dict[str, list[int]] = {}
        self.kanban_lane_count_vars: dict[str, tk.StringVar] = {}
        self.kanban_drag: dict[str, object] | None = None
        self.selected_card_var = tk.StringVar(value="Nenhum card selecionado.")
        self.current_card_var = tk.StringVar(value="Card atual não definido.")
        self.git_repo_var = tk.StringVar(value=self.config_data.get("repo_path") or str(APP_DIR))
        self.last_commit_sha = ""
        self.last_commit_message = ""
        self.last_chatgpt_prompt = ""
        self.boss_mode_var = tk.BooleanVar(value=bool(self.config_data.get("boss_mode")))
        self.config_entries: dict[str, tk.StringVar] = {}
        self.ops_status_var = tk.StringVar(value="Ops Control pronto para consultar.")
        self.ops_runtime_var = tk.StringVar(value="-")
        self.ops_containers_var = tk.StringVar(value="-")
        self.ops_docker_var = tk.StringVar(value="-")
        self.ops_watchdog_var = tk.StringVar(value="-")
        self.ops_updated_var = tk.StringVar(value="-")
        self.ops_panel_url_var = tk.StringVar(value="Painel IP: carregando...")
        self.ops_tree: ttk.Treeview | None = None
        self.ops_events_text: tk.Text | None = None
        self.smart_entries: dict[str, tk.StringVar] = {}
        self.smart_status_var = tk.StringVar(value="Aguardando check-in.")
        self.smart_decision_var = tk.StringVar(value="Sem decisão.")
        self.smart_next_action_var = tk.StringVar(value="Gere o plano do dia.")
        self.execution_command_var = tk.StringVar(value="py_compile")
        self.execution_status_var = tk.StringVar(value="Nenhuma execução local ainda.")
        self.last_execution_output = ""
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

        self.font_family = self.resolve_font_family()
        self.configure(bg=THEME["bg"])
        self.apply_visual_theme()
        self.columnconfigure(0, weight=1)
        self.rowconfigure(1, weight=1)

        self.build_app_header()
        self.notebook = ttk.Notebook(self)
        self.notebook.grid(row=1, column=0, sticky="nsew", padx=18, pady=(0, 18))

        self.tabs: dict[str, ttk.Frame] = {}
        for name in TAB_NAMES:
            frame = ttk.Frame(self.notebook, padding=(18, 16), style="App.TFrame")
            frame.columnconfigure(0, weight=1)
            self.notebook.add(frame, text=name)
            self.tabs[name] = frame
            if name == "Hoje":
                self._build_today_tab(frame)
            elif name == "Ops Control":
                self._build_ops_control_tab(frame)
            elif name == "Modo IA":
                self._build_smart_tab(frame)
            elif name == "Execução":
                self._build_execution_tab(frame)
            elif name == "Kanban":
                self._build_kanban_tab(frame)
            elif name == "Git":
                self._build_git_tab(frame)
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
        self.after(30_000, self._tick)

    def resolve_font_family(self) -> str:
        families = set(tkfont.families(self))
        return "Plus Jakarta Sans" if "Plus Jakarta Sans" in families else "Segoe UI"

    def apply_visual_theme(self) -> None:
        style = ttk.Style(self)
        try:
            style.theme_use("clam")
        except tk.TclError:
            pass

        body = (self.font_family, 10)
        body_bold = (self.font_family, 10, "bold")
        title = (self.font_family, 19, "bold")
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
        style.configure("TNotebook.Tab", padding=(18, 10), background=THEME["panel"], foreground=THEME["muted"], font=body_bold)
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

    def build_app_header(self) -> None:
        header = ttk.Frame(self, style="Header.TFrame", padding=(22, 16, 22, 12))
        header.grid(row=0, column=0, sticky="ew")
        header.columnconfigure(1, weight=1)

        brand = ttk.Frame(header, style="Header.TFrame")
        brand.grid(row=0, column=0, sticky="w")
        mark = tk.Label(
            brand,
            text="HBX",
            bg=THEME["brand"],
            fg="#ffffff",
            padx=12,
            pady=8,
            font=(self.font_family, 11, "bold"),
        )
        mark.grid(row=0, column=0, rowspan=2, sticky="nsw", padx=(0, 12))
        ttk.Label(brand, text="HBX Owner", style="HeaderTitle.TLabel").grid(row=0, column=1, sticky="w")
        ttk.Label(
            brand,
            text="Recovery + P0 técnico + demo + outbound",
            style="HeaderSub.TLabel",
        ).grid(row=1, column=1, sticky="w", pady=(2, 0))

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

    def _build_ops_control_tab(self, frame: ttk.Frame) -> None:
        self.page_title(frame, "Ops Control", "Painel técnico dentro do Master")
        frame.columnconfigure(0, weight=1)
        frame.rowconfigure(3, weight=2)
        frame.rowconfigure(4, weight=1)

        hero = tk.Frame(frame, bg=THEME["card"], highlightthickness=1, highlightbackground=THEME["line"])
        hero.grid(row=1, column=0, sticky="ew", pady=(14, 12))
        hero.columnconfigure(0, weight=1)
        hero_body = tk.Frame(hero, bg=THEME["card"], padx=18, pady=14)
        hero_body.grid(row=0, column=0, sticky="ew")
        hero_body.columnconfigure(0, weight=1)

        tk.Label(
            hero_body,
            text="Ops Control",
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
        ttk.Button(actions, text="Abrir painel", command=self.open_ops_control_web, style="Accent.TButton").grid(
            row=0, column=0, padx=(0, 8)
        )
        ttk.Button(actions, text="Iniciar painel", command=self.start_ops_control_native, style="Success.TButton").grid(
            row=0, column=1, padx=8
        )
        ttk.Button(actions, text="Atualizar", command=self.refresh_ops_control).grid(row=0, column=2, padx=8)
        ttk.Button(actions, text="Reiniciar", command=self.restart_ops_control_native, style="Warning.TButton").grid(
            row=0, column=3, padx=8
        )
        ttk.Button(actions, text="Logs", command=self.show_selected_ops_logs).grid(row=0, column=4, padx=8)
        ttk.Button(actions, text="Pasta", command=lambda: self.open_local_folder(OPS_CONTROL_DIR)).grid(
            row=0, column=5, padx=(8, 0)
        )

        metrics = ttk.Frame(frame, style="App.TFrame")
        metrics.grid(row=2, column=0, sticky="ew", pady=(0, 12))
        for col in range(5):
            metrics.columnconfigure(col, weight=1)
        self.ops_metric_card(metrics, 0, "Painel", self.ops_runtime_var, "#0e7490")
        self.ops_metric_card(metrics, 1, "Containers", self.ops_containers_var, "#2563eb")
        self.ops_metric_card(metrics, 2, "Docker", self.ops_docker_var, "#16a34a")
        self.ops_metric_card(metrics, 3, "Watchdog", self.ops_watchdog_var, "#b45309")
        self.ops_metric_card(metrics, 4, "Atualizado", self.ops_updated_var, "#64748b")

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

        events_panel = tk.Frame(frame, bg=THEME["card"], highlightthickness=1, highlightbackground=THEME["line"])
        events_panel.grid(row=4, column=0, sticky="nsew", pady=(12, 0))
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
        self.set_ops_events("Ops Control carregado dentro do Master.\nClique em Atualizar para consultar Docker sem abrir terminal.")
        self.ops_panel_url_var.set(f"Painel IP: {self.ops_control_panel_url()}")
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
        self.ops_panel_url_var.set(f"Painel IP: {self.ops_control_panel_url()}")

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

    def refresh_ops_control(self) -> None:
        self.ops_status_var.set("Consultando Docker e Ops Control...")

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
        ops_state = self.find_container_state(containers, ("ops-control", "hbx-master-ops-control"))
        watchdog_state = self.find_container_state(containers, ("watchdog", "hbx-engine-watchdog", "hbx-watchdog"))
        errors = []
        if not ps_ok:
            errors.append(self.friendly_docker_error(ps_output or "Docker ps falhou."))
        if ps_ok and not stats_ok:
            errors.append(self.friendly_docker_error(stats_output or "Docker stats indisponível."))
        if not OPS_CONTROL_ENV_PATH.exists():
            errors.append(".env.ops-control não encontrado na raiz do repo.")
        return {
            "containers": containers,
            "running": running,
            "total": len(containers),
            "ops_state": ops_state,
            "watchdog_state": watchdog_state,
            "docker_ok": ps_ok,
            "errors": errors,
            "updated_at": datetime.now().strftime("%H:%M:%S"),
        }

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
        watchdog_state = str(snapshot["watchdog_state"])
        self.ops_runtime_var.set(self.state_label(ops_state))
        self.ops_containers_var.set(f"{snapshot['running']} / {snapshot['total']}")
        self.ops_docker_var.set("online" if snapshot["docker_ok"] else "falha")
        self.ops_watchdog_var.set(self.state_label(watchdog_state))
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
        errors = snapshot.get("errors") or []
        if errors:
            self.ops_status_var.set("Ops Control consultado com alertas.")
            self.set_ops_events("\n".join(str(error) for error in errors))
        else:
            self.ops_status_var.set("Ops Control atualizado dentro do Master.")
            self.set_ops_events("Consulta concluída. Selecione um container e clique em Logs para ver eventos recentes.")

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
        self.ops_panel_url_var.set(f"Painel IP: {url}")
        webbrowser.open(url)
        self.ops_status_var.set(f"Painel web do Ops Control aberto: {url}")

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
            ("RETROATIVO", self.register_retroactive, "TButton"),
            ("Atualizar", self.refresh_today, "TButton"),
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
            ("Bloqueados", self.dashboard_blocked_var),
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

    def _build_smart_tab(self, frame: ttk.Frame) -> None:
        self.page_title(frame, "Modo IA", "Plano diário, anti-fuga e pacote para Codex")
        frame.columnconfigure(0, weight=1)
        frame.columnconfigure(1, weight=2)
        frame.rowconfigure(3, weight=1)

        checkin = self.card_frame(frame, padding=(16, 14))
        checkin.grid(row=1, column=0, sticky="nsew", padx=(0, 8), pady=(18, 12))
        checkin.columnconfigure(1, weight=1)
        fields = (
            ("hours_available", "Horas"),
            ("unique_goal", "Meta única"),
            ("technical_task", "Técnica"),
            ("commercial_task", "Comercial"),
            ("blocker", "Bloqueio"),
            ("not_today", "Não fazer"),
        )
        for row, (key, label) in enumerate(fields):
            ttk.Label(checkin, text=label, style="CardMuted.TLabel").grid(row=row, column=0, sticky="w", padx=(0, 8), pady=5)
            var = tk.StringVar(value=str(self.config_data.get(key, "")))
            self.smart_entries[key] = var
            ttk.Entry(checkin, textvariable=var).grid(row=row, column=1, sticky="ew", pady=5)

        status = self.card_frame(frame, padding=(16, 14))
        status.grid(row=1, column=1, sticky="nsew", padx=(8, 0), pady=(18, 12))
        status.columnconfigure(0, weight=1)
        ttk.Label(status, text="Decisão", style="CardMuted.TLabel").grid(row=0, column=0, sticky="w")
        ttk.Label(status, textvariable=self.smart_decision_var, style="CardValue.TLabel", wraplength=650).grid(
            row=1, column=0, sticky="w", pady=(4, 12)
        )
        ttk.Label(status, text="Próxima ação", style="CardMuted.TLabel").grid(row=2, column=0, sticky="w")
        ttk.Label(status, textvariable=self.smart_next_action_var, style="Card.TLabel", wraplength=650).grid(
            row=3, column=0, sticky="w", pady=(4, 12)
        )
        ttk.Label(status, text="Status", style="CardMuted.TLabel").grid(row=4, column=0, sticky="w")
        ttk.Label(status, textvariable=self.smart_status_var, style="Card.TLabel", wraplength=650).grid(
            row=5, column=0, sticky="w", pady=(4, 0)
        )

        actions = ttk.Frame(frame, style="Toolbar.TFrame")
        actions.grid(row=2, column=0, columnspan=2, sticky="ew", pady=(0, 12))
        action_buttons = (
            ("Gerar plano", self.smart_generate_daily_plan, "Accent.TButton"),
            ("Replanejar agora", self.smart_replan_now, "Warning.TButton"),
            ("Classificar pedido", self.smart_classify_current_input, "TButton"),
            ("Copiar pacote Codex", self.smart_copy_codex_package, "Success.TButton"),
            ("Abrir ChatGPT Desktop", self.open_chatgpt, "TButton"),
            ("Atualizar memória", self.smart_update_memory, "TButton"),
        )
        for index, (text, command, style_name) in enumerate(action_buttons):
            ttk.Button(actions, text=text, command=command, style=style_name).grid(
                row=0, column=index, padx=(0, 8), pady=(0, 6), sticky="w"
            )

        input_frame = ttk.LabelFrame(frame, text="Pedido/status seu", padding=8, style="Modern.TLabelframe")
        input_frame.grid(row=3, column=0, sticky="nsew", padx=(0, 8))
        input_frame.columnconfigure(0, weight=1)
        input_frame.rowconfigure(0, weight=1)
        self.smart_input = tk.Text(input_frame, height=18, wrap="word")
        self.style_text_widget(self.smart_input)
        self.smart_input.grid(row=0, column=0, sticky="nsew")
        self.smart_input.insert(
            "1.0",
            "O que aconteceu agora?\nO que você quer fazer?\nQual bloqueio apareceu?\n",
        )

        output_frame = ttk.LabelFrame(frame, text="Plano / resposta / pacote", padding=8, style="Modern.TLabelframe")
        output_frame.grid(row=3, column=1, sticky="nsew", padx=(8, 0))
        output_frame.columnconfigure(0, weight=1)
        output_frame.rowconfigure(0, weight=1)
        self.smart_output = tk.Text(output_frame, height=18, wrap="word")
        self.style_text_widget(self.smart_output)
        self.smart_output.grid(row=0, column=0, sticky="nsew")
        scroll = ttk.Scrollbar(output_frame, orient="vertical", command=self.smart_output.yview)
        scroll.grid(row=0, column=1, sticky="ns")
        self.smart_output.configure(yscrollcommand=scroll.set)

    def set_smart_output(self, text: str) -> None:
        if not hasattr(self, "smart_output"):
            return
        self.smart_output.delete("1.0", tk.END)
        self.smart_output.insert(tk.END, text)

    def get_smart_input_text(self) -> str:
        if not hasattr(self, "smart_input"):
            return ""
        return self.smart_input.get("1.0", tk.END).strip()

    def save_smart_checkin(self) -> dict:
        data: dict[str, str | float] = {}
        for key, var in self.smart_entries.items():
            value = var.get().strip()
            if key == "hours_available":
                try:
                    data[key] = float(value.replace(",", ".") or self.config_data.get("hours_available", 8))
                except ValueError:
                    data[key] = float(self.config_data.get("hours_available", 8) or 8)
            else:
                data[key] = value

        self.config_data.update(data)
        self.config_data["planned_hours"] = data.get("hours_available", self.config_data.get("planned_hours", 8))
        save_config(self.config_data)
        update_day_state(
            hours_available=data.get("hours_available", self.config_data.get("hours_available", 8)),
            unique_goal=data.get("unique_goal", ""),
            technical_task=data.get("technical_task", ""),
            commercial_task=data.get("commercial_task", ""),
            blocker=data.get("blocker", ""),
            not_today=data.get("not_today", ""),
            last_event="smart_checkin_saved",
        )
        self.today_plan_var.set(str(data.get("unique_goal") or "Meta única não definida."))
        return data

    def classify_smart_text(self, text: str) -> tuple[str, str, str]:
        normalized = text.lower()
        focus_hits = [word for word in FOCUS_KEYWORDS if word in normalized]
        fuga_hits = [word for word in FUGA_KEYWORDS if word in normalized]

        if fuga_hits and not focus_hits:
            return (
                "NÃO",
                f"Fuga provável: {', '.join(fuga_hits[:4])}.",
                "Volte para Recovery, P0 técnico, demo ou outbound.",
            )
        if fuga_hits and focus_hits:
            return (
                "AJUSTE",
                f"Tem risco de fuga ({', '.join(fuga_hits[:3])}), mas há ligação com {', '.join(focus_hits[:3])}.",
                "Corte escopo e entregue uma prova verificável hoje.",
            )
        if focus_hits:
            return (
                "APROVADO",
                f"Alinhado ao foco: {', '.join(focus_hits[:4])}.",
                "Execute o menor próximo passo testável.",
            )
        return (
            "AJUSTE",
            "Sem ligação clara com monetização imediata.",
            "Reescreva como venda, demo, cobrança, correção P0 ou prova técnica.",
        )

    def smart_context_rows(self) -> dict:
        session = self.get_current_session()
        pending = self.prioritized_pending_cards()
        done_today = self.db.fetchall(
            "SELECT * FROM kanban_cards WHERE done_at LIKE ? ORDER BY done_at DESC, updated_at DESC LIMIT 6",
            (f"{today_str()}%",),
        )
        blocked = self.db.fetchall("SELECT * FROM kanban_cards WHERE lane = 'BLOQUEADO' ORDER BY updated_at DESC LIMIT 6")
        latest_git = self.db.fetchone("SELECT * FROM git_snapshots ORDER BY id DESC LIMIT 1")
        smart_recent = self.db.fetchall(
            "SELECT * FROM smart_interactions WHERE date = ? ORDER BY id DESC LIMIT 5",
            (today_str(),),
        )
        local_runs = self.db.fetchall(
            "SELECT * FROM local_runs WHERE date = ? ORDER BY id DESC LIMIT 5",
            (today_str(),),
        )
        local_runs = self.db.fetchall(
            "SELECT * FROM local_runs WHERE date = ? ORDER BY id DESC LIMIT 5",
            (today_str(),),
        )
        ok, repo_status = self.run_git_command(["status", "--short"])
        return {
            "session": session,
            "pending": pending,
            "done_today": done_today,
            "blocked": blocked,
            "latest_git": latest_git,
            "smart_recent": smart_recent,
            "local_runs": local_runs,
            "local_runs": local_runs,
            "repo_status": repo_status if ok else f"Indisponível: {repo_status}",
            "memory": self.read_memory_text(),
        }

    def prioritized_pending_cards(self) -> list[sqlite3.Row]:
        cards = self.get_pending_cards()
        return sorted(
            cards,
            key=lambda card: (
                LANE_RANK.get(card["lane"], 50),
                -PRIORITY_RANK.get(card["priority"], 0),
                0 if self.card_has_focus(card) else 1,
                card["updated_at"],
            ),
        )

    def card_has_focus(self, card: sqlite3.Row) -> bool:
        text = " ".join(
            str(card[key] or "")
            for key in ("title", "description", "module", "type", "acceptance_criteria", "blocked_reason")
        ).lower()
        return any(word in text for word in FOCUS_KEYWORDS) and not (
            "radar" in text and not any(word in text for word in ("p0", "recovery", "cliente", "vendas", "whatsapp"))
        )

    def read_memory_text(self) -> str:
        ensure_operational_files()
        try:
            return MEMORY_PATH.read_text(encoding="utf-8").strip()
        except OSError:
            return ""

    def smart_generate_daily_plan(self) -> None:
        data = self.save_smart_checkin()
        request = self.get_smart_input_text()
        decision, reason, next_action = self.classify_smart_text(
            "\n".join(str(data.get(key, "")) for key in ("unique_goal", "technical_task", "commercial_task", "blocker", "not_today"))
            + "\n"
            + request
        )
        context = self.smart_context_rows()
        plan = self.build_smart_plan_text(data, request, decision, reason, next_action, context, replan=False)
        DAY_PLAN_PATH.write_text(plan, encoding="utf-8")
        self.store_smart_interaction("plano-dia", request, plan, decision)
        self.smart_decision_var.set(f"{decision} - {reason}")
        self.smart_next_action_var.set(next_action)
        self.smart_status_var.set(f"Plano salvo em {DAY_PLAN_PATH}")
        self.set_smart_output(plan)

    def smart_replan_now(self) -> None:
        data = self.save_smart_checkin()
        request = self.get_smart_input_text()
        decision, reason, next_action = self.classify_smart_text(request)
        context = self.smart_context_rows()
        plan = self.build_smart_plan_text(data, request, decision, reason, next_action, context, replan=True)
        DAY_PLAN_PATH.write_text(plan, encoding="utf-8")
        self.store_smart_interaction("replanejamento", request, plan, decision)
        self.smart_decision_var.set(f"{decision} - {reason}")
        self.smart_next_action_var.set(next_action)
        self.smart_status_var.set(f"Replanejamento salvo em {DAY_PLAN_PATH}")
        self.set_smart_output(plan)

    def smart_classify_current_input(self) -> None:
        request = self.get_smart_input_text()
        decision, reason, next_action = self.classify_smart_text(request)
        answer = (
            f"DECISÃO: {decision}\n"
            f"Motivo: {reason}\n"
            f"Próxima ação: {next_action}\n\n"
            "Regra: monetização ASAP. Não trocar Recovery/P0 técnico/demo/outbound por feature nova, Radar, "
            "refactor bonito ou marketing amplo."
        )
        self.store_smart_interaction("classificacao", request, answer, decision)
        self.smart_decision_var.set(f"{decision} - {reason}")
        self.smart_next_action_var.set(next_action)
        self.smart_status_var.set("Pedido classificado e salvo no histórico.")
        self.set_smart_output(answer)

    def smart_copy_codex_package(self) -> None:
        data = self.save_smart_checkin()
        request = self.get_smart_input_text()
        context = self.smart_context_rows()
        prompt = self.build_codex_context_prompt(data, request, context)
        self.copy_text(prompt)
        path = self.save_prompt_file("codex-contexto", prompt)
        self.store_smart_interaction("pacote-codex", request, prompt, "CONTEXTO")
        self.smart_decision_var.set("CONTEXTO - pacote pronto para Codex")
        self.smart_next_action_var.set("Cole este pacote no Codex e peça execução objetiva.")
        self.smart_status_var.set(f"Pacote copiado e salvo em {path}")
        self.set_smart_output(prompt)

    def smart_update_memory(self) -> None:
        request = self.get_smart_input_text()
        output = self.smart_output.get("1.0", tk.END).strip() if hasattr(self, "smart_output") else ""
        entry = (
            f"\n## Registro {now_iso()}\n"
            f"- Pedido/status: {request or '-'}\n"
            f"- Decisão: {self.smart_decision_var.get()}\n"
            f"- Próxima ação: {self.smart_next_action_var.get()}\n"
        )
        if output:
            entry += f"- Plano/resposta: {output[:700].replace(chr(10), ' ')}\n"
        with MEMORY_PATH.open("a", encoding="utf-8") as memory:
            memory.write(entry)
        self.store_smart_interaction("memoria", request, entry, "MEMÓRIA")
        self.smart_status_var.set(f"Memória atualizada em {MEMORY_PATH}")
        self.set_smart_output(self.read_memory_text())

    def build_smart_plan_text(
        self,
        data: dict,
        request: str,
        decision: str,
        reason: str,
        next_action: str,
        context: dict,
        replan: bool,
    ) -> str:
        pending = context["pending"]
        session = context["session"]
        hours = float(data.get("hours_available") or self.config_data.get("hours_available") or 8)
        total_minutes = max(60, int(hours * 60))
        worked = self.work_minutes(session) if session else 0
        remaining = max(0, total_minutes - worked)
        block_minutes = max(60, remaining)
        main_card = self.get_card(self.current_card_id) or (pending[0] if pending else None)
        secondary = pending[1:4] if pending else []
        commercial_start = max(30, int(block_minutes * 0.72))
        close_start = max(commercial_start + 10, int(block_minutes * 0.9))
        prefix = "REPLANEJAMENTO HBX" if replan else "PLANO DE AÇÃO HBX"

        secondary_lines = "\n".join(f"- #{card['id']} {card['lane']} | {card['title']}" for card in secondary) or "-"
        blocked_lines = "\n".join(
            f"- #{card['id']} {card['title']} | {card['blocked_reason'] or 'sem motivo registrado'}"
            for card in context["blocked"][:4]
        ) or "-"

        return (
            f"{prefix}\n"
            f"Data: {today_str()}\n"
            f"Decisão: {decision} - {reason}\n"
            f"Horas disponíveis: {hours:g}\n"
            f"Tempo líquido já registrado: {self.format_minutes(worked)}\n"
            f"Tempo restante estimado: {self.format_minutes(remaining)}\n\n"
            "META ÚNICA\n"
            f"{data.get('unique_goal') or (main_card['title'] if main_card else 'Definir meta única antes de começar.')}\n\n"
            "ORDEM DO DIA\n"
            f"1. Técnica/P0: {data.get('technical_task') or (main_card['title'] if main_card else 'Escolher card HOJE/FAZENDO.')}\n"
            f"2. Comercial: {data.get('commercial_task') or 'Fazer outbound/follow-up/demo antes do fechamento.'}\n"
            f"3. Bloqueio explícito: {data.get('blocker') or 'Nenhum bloqueio declarado.'}\n"
            f"4. Não fazer: {data.get('not_today') or 'Feature nova, Radar por curiosidade, refactor bonito ou marketing amplo.'}\n\n"
            "CARD PRINCIPAL\n"
            f"{('#' + str(main_card['id']) + ' ' + main_card['title'] + ' | ' + main_card['lane']) if main_card else '-'}\n\n"
            "CARDS SECUNDÁRIOS\n"
            f"{secondary_lines}\n\n"
            "BLOQUEIOS ATIVOS\n"
            f"{blocked_lines}\n\n"
            "BLOCOS SUGERIDOS\n"
            f"- 0-15min: confirmar card principal, critério de aceite e teste/build.\n"
            f"- 15-{max(30, commercial_start)}min: entregar prova técnica verificável.\n"
            f"- {commercial_start}-{close_start}min: demo, outbound, follow-up ou cobrança.\n"
            f"- {close_start}-{block_minutes}min: registrar entrega, bloquear pendências e salvar plano de amanhã.\n\n"
            "PRÓXIMO PASSO AGORA\n"
            f"{next_action}\n\n"
            "PEDIDO/STATUS RECEBIDO\n"
            f"{request or '-'}\n\n"
            "REGRA DE GUARDA\n"
            "Se aparecer Radar, feature nova, refactor bonito, UI por estética ou marketing amplo, responder NÃO e voltar para monetização ASAP.\n"
        )

    def build_codex_context_prompt(self, data: dict, request: str, context: dict) -> str:
        pending_lines = "\n".join(
            f"- #{card['id']} {card['lane']} | {card['priority']} | {card['title']} | teste: {card['test_command'] or '-'}"
            for card in context["pending"][:8]
        ) or "-"
        done_lines = "\n".join(f"- #{card['id']} {card['title']}" for card in context["done_today"]) or "-"
        blocked_lines = "\n".join(
            f"- #{card['id']} {card['title']} | {card['blocked_reason'] or '-'}" for card in context["blocked"]
        ) or "-"
        latest_git = context["latest_git"]
        commit = f"{latest_git['commit_sha']} {latest_git['commit_message']}" if latest_git else "-"
        recent_smart = "\n".join(
            f"- {row['created_at']} | {row['intent']} | {row['decision']}" for row in context["smart_recent"]
        ) or "-"
        local_runs = "\n".join(
            f"- {row['created_at']} | {row['command_key']} | rc={row['returncode']} | {row['output'][:240].replace(chr(10), ' ')}"
            for row in context.get("local_runs", [])
        ) or "-"

        return (
            "CONTEXTO PARA CODEX - HBX MASTER\n"
            f"Workspace: {APP_DIR}\n"
            f"Data: {today_str()}\n\n"
            "OBJETIVO FIXO\n"
            "Monetizar o HBX ASAP. Prioridade: HBX Recovery + P0 técnico + demo + outbound.\n\n"
            "REGRA ANTI-FUGA\n"
            "Se eu tentar trocar isso por feature nova, Radar, UI por estética, refactor bonito ou marketing amplo, diga NÃO e volte para o plano do dia.\n\n"
            "CHECK-IN ATUAL\n"
            f"- Horas disponíveis: {data.get('hours_available')}\n"
            f"- Meta única: {data.get('unique_goal')}\n"
            f"- Tarefa técnica: {data.get('technical_task')}\n"
            f"- Tarefa comercial: {data.get('commercial_task')}\n"
            f"- Bloqueio: {data.get('blocker')}\n"
            f"- Não fazer: {data.get('not_today')}\n\n"
            "PEDIDO/STATUS DO USUÁRIO\n"
            f"{request or '-'}\n\n"
            "CARDS PENDENTES PRIORIZADOS\n"
            f"{pending_lines}\n\n"
            "CARDS FEITOS HOJE\n"
            f"{done_lines}\n\n"
            "BLOQUEIOS\n"
            f"{blocked_lines}\n\n"
            "GIT\n"
            f"- Último snapshot: {commit}\n"
            f"- Status:\n{context['repo_status']}\n\n"
            "MEMÓRIA LOCAL\n"
            f"{context['memory'][:1800] or '-'}\n\n"
            "HISTÓRICO DO MODO IA HOJE\n"
            f"{recent_smart}\n\n"
            "EXECUÇÕES LOCAIS HOJE\n"
            f"{local_runs}\n\n"
            "O QUE EU PRECISO DE VOCÊ\n"
            "1. Responda com APROVADO, AJUSTE ou NÃO.\n"
            "2. Dê o menor próximo passo executável agora.\n"
            "3. Se for trabalho técnico, diga quais arquivos/comandos verificar.\n"
            "4. Não aceite fuga de foco.\n"
        )

    def store_smart_interaction(self, intent: str, user_text: str, assistant_text: str, decision: str) -> None:
        self.db.execute(
            """
            INSERT INTO smart_interactions (date, intent, user_text, assistant_text, decision, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (today_str(), intent, user_text, assistant_text, decision, now_iso()),
        )

    def _build_execution_tab(self, frame: ttk.Frame) -> None:
        self.page_title(frame, "Execução", "Checks locais seguros e ponte com Codex")
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
            ("Cards do plano", self.create_cards_from_current_plan, "Warning.TButton"),
            ("Saída para Codex", self.copy_execution_for_codex, "Accent.TButton"),
            ("Salvar bloqueio", self.save_execution_as_blocker, "Danger.TButton"),
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
        ttk.Label(status, text="Uso recomendado", style="CardMuted.TLabel").grid(row=2, column=0, sticky="w")
        ttk.Label(
            status,
            text=(
                "Rode a sequência básica antes de pedir intervenção técnica ao Codex. "
                "Depois copie a saída para manter o plano do dia alinhado com evidência local."
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

    def copy_execution_for_codex(self) -> None:
        data = self.save_smart_checkin() if self.smart_entries else self.config_data
        context = self.smart_context_rows()
        prompt = self.build_codex_context_prompt(data, self.last_execution_output, context)
        prompt += "\n\nSAÍDA LOCAL MAIS RECENTE\n" + (self.last_execution_output or "-")
        self.copy_text(prompt)
        path = self.save_prompt_file("codex-execucao", prompt)
        self.execution_status_var.set(f"Saída copiada para Codex e salva em {path}")
        self.set_execution_output(prompt)

    def plan_source_text(self) -> str:
        if hasattr(self, "smart_output"):
            text = self.smart_output.get("1.0", tk.END).strip()
            if text:
                return text
        if DAY_PLAN_PATH.exists():
            return DAY_PLAN_PATH.read_text(encoding="utf-8")
        return ""

    def create_cards_from_current_plan(self) -> None:
        plan = self.plan_source_text()
        actions = self.extract_plan_actions(plan)
        if not actions:
            self.execution_status_var.set("Nenhuma ação clara encontrada no plano.")
            self.set_execution_output("Gere um plano no Modo IA antes de criar cards.")
            return

        created_ids: list[int] = []
        for action in actions[:3]:
            if self.card_title_exists(action["title"]):
                continue
            created_ids.append(self.insert_kanban_card(action, source="Modo IA"))

        self.refresh_kanban()
        message = (
            f"Cards criados: {', '.join('#' + str(card_id) for card_id in created_ids)}"
            if created_ids
            else "Nenhum card novo criado; títulos já existiam."
        )
        self.execution_status_var.set(message)
        self.set_execution_output(message + "\n\n" + plan)

    def extract_plan_actions(self, plan: str) -> list[dict]:
        actions: list[dict] = []
        for line in plan.splitlines():
            match = re.match(r"^\s*[0-9]+\.\s*([^:]+):\s*(.+)$", line)
            if not match:
                continue
            label = match.group(1).strip()
            title = match.group(2).strip()
            lowered = label.lower()
            if lowered.startswith("bloqueio") or lowered.startswith("não fazer") or not title or title == "-":
                continue
            priority = "Alta" if any(word in lowered for word in ("técnica", "tecnica", "p0")) else "Média"
            estimate = 60 if priority == "Alta" else 30
            actions.append(
                {
                    "title": title[:180],
                    "description": f"Criado a partir do plano local: {label}.",
                    "module": label[:60],
                    "type": "Modo IA",
                    "priority": priority,
                    "lane": "HOJE",
                    "acceptance_criteria": "Entrega verificável registrada no HBX Owner.",
                    "test_command": "",
                    "estimate_minutes": estimate,
                }
            )
        return actions

    def card_title_exists(self, title: str) -> bool:
        row = self.db.fetchone(
            """
            SELECT id FROM kanban_cards
            WHERE title = ? AND lane NOT IN ('ARQUIVADO')
            LIMIT 1
            """,
            (title,),
        )
        return row is not None

    def save_execution_as_blocker(self) -> None:
        if not self.last_execution_output:
            self.execution_status_var.set("Não há saída local para transformar em bloqueio.")
            return
        card_id = self.insert_kanban_card(
            {
                "title": f"Bloqueio local: {self.execution_command_var.get() or 'execução'}",
                "description": self.last_execution_output[:1200],
                "module": "Execução local",
                "type": "Bloqueio",
                "priority": "Alta",
                "lane": "BLOQUEADO",
                "blocked_reason": self.last_execution_output[:500],
            },
            source="Execução",
        )
        self.refresh_kanban()
        self.execution_status_var.set(f"Bloqueio criado: #{card_id}")

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

    def _build_kanban_tab(self, frame: ttk.Frame) -> None:
        self.page_title(frame, "Kanban", "Fila operacional do dia")

        toolbar = ttk.Frame(frame, style="Toolbar.TFrame")
        toolbar.grid(row=1, column=0, sticky="ew", pady=(12, 8))
        toolbar.columnconfigure(10, weight=1)

        buttons = (
            ("Criar card", self.create_card, "Accent.TButton"),
            ("Editar", self.edit_card, "TButton"),
            ("Mover", self.move_card, "TButton"),
            ("Marcar feito", self.mark_card_done, "Success.TButton"),
            ("Vincular commit", self.link_commit_to_card, "TButton"),
            ("Adicionar nota", self.add_card_note, "TButton"),
            ("Duplicar", self.duplicate_card, "TButton"),
            ("Arquivar", self.archive_card, "Danger.TButton"),
            ("Definir atual", self.set_current_card, "Accent.TButton"),
            ("Atualizar", self.refresh_kanban, "TButton"),
        )
        for index, (text, command, style_name) in enumerate(buttons):
            ttk.Button(toolbar, text=text, command=command, style=style_name).grid(
                row=index // 5, column=index % 5, padx=(0, 8), pady=(0, 8), sticky="w"
            )

        context = self.card_frame(frame, padding=(12, 10))
        context.grid(row=2, column=0, sticky="ew", pady=(0, 10))
        context.columnconfigure(0, weight=1)
        ttk.Label(context, textvariable=self.selected_card_var, style="Card.TLabel").grid(row=0, column=0, sticky="w")
        ttk.Label(context, textvariable=self.current_card_var, style="CardMuted.TLabel").grid(
            row=1, column=0, sticky="w", pady=(3, 0)
        )

        board_container = ttk.Frame(frame, style="App.TFrame")
        board_container.grid(row=3, column=0, sticky="nsew")
        board_container.columnconfigure(0, weight=1)
        board_container.rowconfigure(0, weight=1)
        frame.rowconfigure(3, weight=1)

        canvas = tk.Canvas(board_container, highlightthickness=0, bg=THEME["bg"])
        xscroll = ttk.Scrollbar(board_container, orient="horizontal", command=canvas.xview)
        canvas.configure(xscrollcommand=xscroll.set)
        canvas.grid(row=0, column=0, sticky="nsew")
        xscroll.grid(row=1, column=0, sticky="ew")

        inner = ttk.Frame(canvas, style="App.TFrame")
        canvas.create_window((0, 0), window=inner, anchor="nw")
        inner.bind("<Configure>", lambda _event: canvas.configure(scrollregion=canvas.bbox("all")))

        for col, lane in enumerate(KANBAN_LANES):
            lane_frame = tk.Frame(
                inner,
                bg=THEME["lane"],
                highlightthickness=1,
                highlightbackground=THEME["line"],
                width=286,
                height=610,
            )
            lane_frame.grid(row=0, column=col, sticky="ns", padx=(0, 12), pady=(0, 4))
            lane_frame.grid_propagate(False)
            lane_frame.columnconfigure(0, weight=1)
            lane_frame.hbx_lane_name = lane

            accent = tk.Frame(lane_frame, bg=LANE_ACCENTS.get(lane, THEME["accent"]), height=4)
            accent.grid(row=0, column=0, sticky="ew")

            header = tk.Frame(lane_frame, bg=THEME["lane"], padx=12, pady=10)
            header.grid(row=1, column=0, sticky="ew")
            header.columnconfigure(0, weight=1)
            self.kanban_lane_count_vars[lane] = tk.StringVar(value="0")
            tk.Label(
                header,
                text=LANE_LABELS.get(lane, lane),
                bg=THEME["lane"],
                fg=THEME["text"],
                font=(self.font_family, 10, "bold"),
                anchor="w",
            ).grid(row=0, column=0, sticky="w")
            tk.Label(
                header,
                textvariable=self.kanban_lane_count_vars[lane],
                bg=LANE_ACCENTS.get(lane, THEME["accent"]),
                fg="#ffffff",
                width=3,
                font=(self.font_family, 9, "bold"),
            ).grid(row=0, column=1, sticky="e")

            cards_shell = tk.Frame(lane_frame, bg=THEME["lane"])
            cards_shell.grid(row=2, column=0, sticky="nsew")
            cards_shell.columnconfigure(0, weight=1)
            cards_shell.rowconfigure(0, weight=1)
            cards_shell.hbx_lane_name = lane

            cards_canvas = tk.Canvas(cards_shell, bg=THEME["lane"], highlightthickness=0, width=270)
            cards_scroll = ttk.Scrollbar(cards_shell, orient="vertical", command=cards_canvas.yview)
            cards_canvas.configure(yscrollcommand=cards_scroll.set)
            cards_canvas.grid(row=0, column=0, sticky="nsew")
            cards_scroll.grid(row=0, column=1, sticky="ns")
            cards_canvas.hbx_lane_name = lane

            cards_frame = tk.Frame(cards_canvas, bg=THEME["lane"], padx=10, pady=2)
            cards_frame.columnconfigure(0, weight=1)
            cards_frame.hbx_lane_name = lane
            cards_window = cards_canvas.create_window((0, 0), window=cards_frame, anchor="nw")

            def sync_lane_scroll(event: tk.Event, canvas_widget: tk.Canvas = cards_canvas, window_id: int = cards_window) -> None:
                canvas_widget.configure(scrollregion=canvas_widget.bbox("all"))
                canvas_widget.itemconfigure(window_id, width=event.width)

            cards_canvas.bind("<Configure>", sync_lane_scroll)
            cards_frame.bind("<Configure>", lambda _event, canvas_widget=cards_canvas: canvas_widget.configure(scrollregion=canvas_widget.bbox("all")))
            cards_frame.columnconfigure(0, weight=1)
            cards_frame.hbx_lane_name = lane
            lane_frame.rowconfigure(2, weight=1)

            drop_zone = tk.Label(
                lane_frame,
                text="",
                bg=THEME["lane"],
                fg=THEME["muted"],
                height=1,
            )
            drop_zone.grid(row=3, column=0, sticky="ew", padx=10, pady=(2, 10))
            drop_zone.hbx_lane_name = lane
            self.register_lane_drop_widgets(lane_frame, lane)
            self.register_lane_drop_widgets(header, lane)
            self.register_lane_drop_widgets(cards_shell, lane)
            self.register_lane_drop_widgets(cards_canvas, lane)
            self.register_lane_drop_widgets(cards_frame, lane)
            self.register_lane_drop_widgets(drop_zone, lane)
            self.kanban_lane_frames[lane] = cards_frame
            self.kanban_card_ids[lane] = []

        self.refresh_kanban()

    def card_display_text(self, card: sqlite3.Row) -> str:
        commit = (card["commit_sha"] or "-")[:7]
        module = card["module"] or "sem módulo"
        estimate = f"{card['estimate_minutes']}min" if card["estimate_minutes"] else "sem estim."
        return f"[{card['priority']}] {module} | {card['title']} | {commit} | {estimate} | {card['lane']}"

    def refresh_kanban(self) -> None:
        if not self.kanban_lane_frames:
            return
        self.kanban_card_widgets.clear()
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
            self.kanban_card_ids[lane] = [int(card["id"]) for card in cards]
            if lane in self.kanban_lane_count_vars:
                self.kanban_lane_count_vars[lane].set(str(len(cards)))
            for card in cards:
                self.render_kanban_card(cards_frame, card, lane)
            if not cards:
                empty = tk.Label(
                    cards_frame,
                    text="",
                    bg=THEME["lane"],
                    fg=THEME["muted"],
                    height=6,
                )
                empty.grid(row=0, column=0, sticky="ew")
                empty.hbx_lane_name = lane
                self.register_lane_drop_widgets(empty, lane)
        self.update_current_card_label()

    def on_card_select(self, lane: str) -> None:
        card_ids = self.kanban_card_ids.get(lane, [])
        if card_ids:
            self.select_card(card_ids[0])

    def select_card(self, card_id: int) -> None:
        self.selected_card_id = card_id
        card = self.get_card(self.selected_card_id)
        if card:
            self.selected_card_var.set(f"Selecionado #{card['id']}: {card['title']} ({card['lane']})")
        self.apply_kanban_selection()

    def apply_kanban_selection(self) -> None:
        for card_id, widget in self.kanban_card_widgets.items():
            selected = card_id == self.selected_card_id
            widget.configure(
                highlightbackground=THEME["accent"] if selected else THEME["line"],
                highlightthickness=2 if selected else 1,
            )

    def register_lane_drop_widgets(self, widget: tk.Widget, lane: str) -> None:
        widget.hbx_lane_name = lane

    def render_kanban_card(self, parent: tk.Frame, card: sqlite3.Row, lane: str) -> None:
        card_id = int(card["id"])
        priority = str(card["priority"] or "Média")
        accent = PRIORITY_ACCENTS.get(priority, THEME["accent"])
        module = str(card["module"] or "HBX")
        estimate = f"{card['estimate_minutes']} min" if int(card["estimate_minutes"] or 0) else "sem estim."
        commit = (str(card["commit_sha"] or "")[:7] or "-")

        row_index = len(parent.winfo_children())
        shell = tk.Frame(
            parent,
            bg=THEME["card"],
            highlightthickness=1,
            highlightbackground=THEME["line"],
            padx=0,
            pady=0,
            cursor="hand2",
        )
        shell.grid(row=row_index, column=0, sticky="ew", pady=(0, 10))
        shell.columnconfigure(1, weight=1)
        shell.hbx_lane_name = lane
        shell.hbx_card_id = card_id

        tk.Frame(shell, bg=accent, width=4).grid(row=0, column=0, rowspan=5, sticky="ns")
        body = tk.Frame(shell, bg=THEME["card"], padx=10, pady=9)
        body.grid(row=0, column=1, sticky="ew")
        body.columnconfigure(0, weight=1)
        body.hbx_lane_name = lane
        body.hbx_card_id = card_id

        meta = tk.Frame(body, bg=THEME["card"])
        meta.grid(row=0, column=0, sticky="ew")
        meta.columnconfigure(0, weight=1)
        tk.Label(
            meta,
            text=priority,
            bg=accent,
            fg="#ffffff",
            padx=7,
            pady=2,
            font=(self.font_family, 8, "bold"),
        ).grid(row=0, column=0, sticky="w")
        tk.Label(
            meta,
            text=estimate,
            bg=THEME["card"],
            fg=THEME["muted"],
            font=(self.font_family, 8),
        ).grid(row=0, column=1, sticky="e")

        title_label = tk.Label(
            body,
            text=str(card["title"] or "Card sem título"),
            bg=THEME["card"],
            fg=THEME["text"],
            justify="left",
            anchor="w",
            wraplength=220,
            font=(self.font_family, 10, "bold"),
        )
        title_label.grid(row=1, column=0, sticky="ew", pady=(7, 5))

        detail = tk.Label(
            body,
            text=f"{module}  |  commit {commit}",
            bg=THEME["card"],
            fg=THEME["muted"],
            justify="left",
            anchor="w",
            wraplength=220,
            font=(self.font_family, 8),
        )
        detail.grid(row=2, column=0, sticky="ew")

        if card["blocked_reason"]:
            block = tk.Label(
                body,
                text=str(card["blocked_reason"]),
                bg=THEME["soft_danger"],
                fg=THEME["danger"],
                justify="left",
                anchor="w",
                wraplength=220,
                padx=7,
                pady=4,
                font=(self.font_family, 8, "bold"),
            )
            block.grid(row=3, column=0, sticky="ew", pady=(7, 0))

        for widget in (shell, body, meta, title_label, detail):
            self.register_card_drag_widgets(widget, card_id, lane)
        for child in meta.winfo_children():
            self.register_card_drag_widgets(child, card_id, lane)
        if card["blocked_reason"]:
            self.register_card_drag_widgets(block, card_id, lane)

        self.kanban_card_widgets[card_id] = shell
        self.apply_kanban_selection()

    def register_card_drag_widgets(self, widget: tk.Widget, card_id: int, lane: str) -> None:
        widget.hbx_card_id = card_id
        widget.hbx_lane_name = lane
        widget.bind("<ButtonPress-1>", self.start_kanban_drag, add="+")
        widget.bind("<B1-Motion>", self.move_kanban_drag, add="+")
        widget.bind("<ButtonRelease-1>", self.release_kanban_drag, add="+")

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

    def show_card_form(self, title: str, card: sqlite3.Row | None = None) -> dict | None:
        win = tk.Toplevel(self)
        win.title(title)
        win.transient(self)
        win.grab_set()
        win.resizable(False, False)
        win.configure(padx=16, pady=16, bg=THEME["bg"])

        fields = [
            ("title", "Título", card["title"] if card else ""),
            ("description", "Descrição", card["description"] if card else ""),
            ("module", "Módulo", card["module"] if card else ""),
            ("type", "Tipo", card["type"] if card else ""),
            ("priority", "Prioridade", card["priority"] if card else "Média"),
            ("lane", "Lane", card["lane"] if card else "BACKLOG"),
            ("acceptance_criteria", "Critério de aceite", card["acceptance_criteria"] if card else ""),
            ("test_command", "Teste", card["test_command"] if card else ""),
            ("codex_prompt", "Prompt Codex", card["codex_prompt"] if card else ""),
            ("chatgpt_prompt", "Prompt ChatGPT", card["chatgpt_prompt"] if card else ""),
            ("estimate_minutes", "Estimativa min", str(card["estimate_minutes"] if card else 0)),
            ("blocked_reason", "Bloqueio", card["blocked_reason"] if card else ""),
        ]
        values: dict[str, tk.StringVar] = {}

        for row, (key, label, initial) in enumerate(fields):
            ttk.Label(win, text=label).grid(row=row, column=0, sticky="w", padx=(0, 10), pady=4)
            var = tk.StringVar(value=str(initial or ""))
            values[key] = var
            if key == "lane":
                widget = ttk.Combobox(win, textvariable=var, values=KANBAN_LANES, state="readonly", width=44)
            elif key == "priority":
                widget = ttk.Combobox(win, textvariable=var, values=("Baixa", "Média", "Alta", "Crítica"), width=44)
            else:
                widget = ttk.Entry(win, textvariable=var, width=48)
            widget.grid(row=row, column=1, sticky="ew", pady=4)

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
            result = {key: var.get().strip() for key, var in values.items()}
            result["estimate_minutes"] = max(0, estimate)
            win.destroy()

        actions = ttk.Frame(win)
        actions.grid(row=len(fields), column=0, columnspan=2, sticky="e", pady=(12, 0))
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
            (date, title, description, module, type, priority, lane, acceptance_criteria,
             test_command, codex_prompt, chatgpt_prompt, estimate_minutes, blocked_reason,
             created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                today_str(),
                data["title"],
                data["description"],
                data["module"],
                data["type"],
                data["priority"],
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
            SET title = ?, description = ?, module = ?, type = ?, priority = ?, lane = ?,
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
        self.refresh_kanban()

    def next_lane_sort_order(self, lane: str) -> int:
        row = self.db.fetchone("SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM kanban_cards WHERE lane = ?", (lane,))
        return int(row["max_order"] or 0) + 10 if row else 10

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
            (date, title, description, module, type, priority, lane, acceptance_criteria,
             test_command, codex_prompt, chatgpt_prompt, estimate_minutes, blocked_reason,
             created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 'BACKLOG', ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                today_str(),
                f"{card['title']} (cópia)",
                card["description"],
                card["module"],
                card["type"],
                card["priority"],
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
            lane = "BACKLOG"
        cur = self.db.execute(
            """
            INSERT INTO kanban_cards
            (date, title, description, module, type, priority, lane, acceptance_criteria,
             test_command, codex_prompt, chatgpt_prompt, estimate_minutes, blocked_reason,
             created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                today_str(),
                data.get("title", "").strip(),
                data.get("description", "").strip(),
                data.get("module", "").strip(),
                data.get("type", "").strip() or source,
                data.get("priority", "").strip() or "Média",
                lane,
                data.get("acceptance_criteria", "").strip(),
                data.get("test_command", "").strip(),
                data.get("codex_prompt", "").strip(),
                data.get("chatgpt_prompt", "").strip(),
                int(data.get("estimate_minutes") or 0),
                data.get("blocked_reason", "").strip(),
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

    def _build_chatgpt_tab(self, frame: ttk.Frame) -> None:
        self.page_title(frame, "ChatGPT", "Prompts com contexto local")

        buttons = ttk.Frame(frame, style="Toolbar.TFrame")
        buttons.grid(row=1, column=0, sticky="w", pady=(12, 10))
        ttk.Button(buttons, text="Abrir ChatGPT Desktop", command=self.open_chatgpt, style="Accent.TButton").grid(
            row=0, column=0, padx=(0, 8)
        )
        ttk.Button(buttons, text="Copiar check-in", command=self.copy_checkin_prompt).grid(row=0, column=1, padx=8)
        ttk.Button(buttons, text="Copiar revisão de card", command=self.copy_card_review_prompt).grid(
            row=0, column=2, padx=8
        )
        ttk.Button(buttons, text="Copiar revisão de commit", command=self.copy_commit_review_prompt).grid(
            row=0, column=3, padx=8
        )
        ttk.Button(buttons, text="Colar resposta do ChatGPT", command=self.paste_chatgpt_response).grid(
            row=0, column=4, padx=8
        )
        ttk.Button(buttons, text="Transformar resposta em cards", command=self.transform_response_into_cards).grid(
            row=0, column=5, padx=8
        )

        output_frame = ttk.LabelFrame(frame, text="Prompt ou resposta", padding=8, style="Modern.TLabelframe")
        output_frame.grid(row=2, column=0, sticky="nsew")
        output_frame.columnconfigure(0, weight=1)
        output_frame.rowconfigure(0, weight=1)
        frame.rowconfigure(2, weight=1)

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

    def current_card_text(self) -> str:
        card = self.get_card(self.current_card_id) or self.get_card(self.selected_card_id)
        if not card:
            return "Nenhum card atual."
        return (
            f"#{card['id']} {card['title']} | lane: {card['lane']} | módulo: {card['module']} | "
            f"prioridade: {card['priority']} | commit: {card['commit_sha'] or '-'}"
        )

    def repo_status_for_prompt(self) -> str:
        ok, status = self.run_git_command(["status", "--short"])
        return status if ok else f"Status indisponível: {status}"

    def copy_prompt(self, kind: str, prompt: str) -> None:
        self.last_chatgpt_prompt = prompt
        self.copy_text(prompt)
        path = self.save_prompt_file(kind, prompt)
        self.set_chatgpt_text(f"{prompt}\n\n---\nPrompt salvo em: {path}")

    def copy_checkin_prompt(self) -> None:
        sha, message, raw_commit = self.get_last_commit_info()
        last_commit = f"{sha} {message}".strip() if sha else raw_commit
        prompt = (
            "CHECK-IN HBX\n"
            f"Data: {today_str()}\n"
            f"Horas disponíveis: {self.config_data.get('hours_available', self.config_data.get('planned_hours', 8))}\n"
            f"Meta única: {self.config_data.get('unique_goal', '')}\n"
            f"Card atual: {self.current_card_text()}\n"
            f"Tarefa técnica: {self.config_data.get('technical_task', '')}\n"
            f"Tarefa comercial: {self.config_data.get('commercial_task', '')}\n"
            f"Bloqueio: {self.config_data.get('blocker', '')}\n"
            f"O que eu NÃO posso fazer hoje: {self.config_data.get('not_today', '')}\n"
            f"Último commit: {last_commit}\n"
            f"Status do repo:\n{self.repo_status_for_prompt()}\n"
        )
        self.copy_prompt("checkin", prompt)

    def copy_card_review_prompt(self) -> None:
        card = self.require_selected_card()
        if not card:
            return
        prompt = (
            "REVISÃO DE CARD HBX\n"
            f"Card: #{card['id']} {card['title']}\n"
            f"Módulo: {card['module']}\n"
            f"Lane: {card['lane']}\n"
            f"Prioridade: {card['priority']}\n"
            f"Descrição: {card['description']}\n"
            f"Critério de aceite: {card['acceptance_criteria']}\n"
            f"Comando de teste: {card['test_command']}\n"
            f"Commit vinculado: {card['commit_sha'] or '-'}\n"
            "Me diga:\n"
            "1. aprovado ou não\n"
            "2. falhas prováveis\n"
            "3. próximo card\n"
            "4. se devo parar ou continuar\n"
        )
        self.copy_prompt("card-review", prompt)

    def copy_commit_review_prompt(self) -> None:
        sha, message, raw_commit = self.get_last_commit_info()
        ok, diff_stat = self.run_git_command(["show", "--stat", "--oneline", "--summary", "HEAD"])
        card = self.get_card(self.current_card_id) or self.get_card(self.selected_card_id)
        prompt = (
            "REVISÃO HBX\n"
            f"Commit: {sha or raw_commit}\n"
            f"Mensagem: {message}\n"
            f"Diff stat:\n{diff_stat if ok else 'Indisponível: ' + diff_stat}\n"
            f"Card relacionado: {self.current_card_text()}\n"
            f"Critério de aceite: {card['acceptance_criteria'] if card else ''}\n"
            f"Comando de teste: {card['test_command'] if card else ''}\n"
            f"Riscos: {card['blocked_reason'] if card else ''}\n"
            "Me diga:\n"
            "1. aprovado ou não\n"
            "2. falhas prováveis\n"
            "3. próximo card\n"
            "4. se devo parar ou continuar\n"
        )
        self.copy_prompt("commit-review", prompt)

    def paste_chatgpt_response(self) -> None:
        try:
            initial_text = self.clipboard_get()
        except tk.TclError:
            initial_text = ""

        win = tk.Toplevel(self)
        win.title("Colar resposta do ChatGPT")
        win.transient(self)
        win.grab_set()
        win.geometry("760x520")
        win.configure(bg=THEME["bg"])
        win.columnconfigure(0, weight=1)
        win.rowconfigure(0, weight=1)

        text = tk.Text(win, wrap="word")
        self.style_text_widget(text)
        text.grid(row=0, column=0, sticky="nsew", padx=10, pady=10)
        text.insert("1.0", initial_text)

        def save_response() -> None:
            response = text.get("1.0", tk.END).strip()
            if not response:
                messagebox.showerror("ChatGPT", "Cole uma resposta antes de salvar.", parent=win)
                return
            card = self.get_card(self.current_card_id) or self.get_card(self.selected_card_id)
            self.db.execute(
                """
                INSERT INTO chatgpt_exchanges (date, card_id, prompt, response, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (today_str(), card["id"] if card else None, self.last_chatgpt_prompt, response, now_iso()),
            )
            self.set_chatgpt_text(response)
            win.destroy()
            messagebox.showinfo("ChatGPT", "Resposta salva localmente.")

        actions = ttk.Frame(win, style="Toolbar.TFrame")
        actions.grid(row=1, column=0, sticky="e", padx=10, pady=(0, 10))
        ttk.Button(actions, text="Cancelar", command=win.destroy).grid(row=0, column=0, padx=(0, 8))
        ttk.Button(actions, text="Salvar resposta", command=save_response, style="Accent.TButton").grid(row=0, column=1)

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
            messagebox.showwarning("Parser", "Não há resposta para transformar em cards.")
            return

        cards = self.parse_chatgpt_cards(raw)
        if not cards:
            messagebox.showinfo("Parser", "Nenhum card reconhecido no texto.")
            return

        created_ids = [self.insert_kanban_card(card, source="ChatGPT") for card in cards]
        self.refresh_kanban()
        self.set_chatgpt_text(f"{len(created_ids)} card(s) criado(s): {', '.join('#' + str(cid) for cid in created_ids)}")
        messagebox.showinfo("Parser", f"{len(created_ids)} card(s) criado(s) no Kanban.")

    def parse_chatgpt_cards(self, text: str) -> list[dict]:
        cards: list[dict] = []
        cards.extend(self.parse_card_blocks(text))
        cards.extend(self.parse_markdown_tasks(text))
        cards.extend(self.parse_next_cards_block(text))

        seen: set[str] = set()
        unique_cards: list[dict] = []
        for card in cards:
            title = card.get("title", "").strip()
            if not title:
                continue
            key = title.lower()
            if key in seen:
                continue
            seen.add(key)
            unique_cards.append(card)
        return unique_cards

    def infer_lane_from_text(self, text: str) -> str:
        upper = text.upper()
        if "HOJE" in upper or "AGORA" in upper:
            return "HOJE"
        return "BACKLOG"

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
            "descricao": "description",
            "descrição": "description",
            "lane": "lane",
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
            match = re.match(r"^\d+[\).\-\s]+(.+)$", line)
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
        blocked = self.db.fetchone("SELECT COUNT(*) AS total FROM kanban_cards WHERE lane = 'BLOQUEADO'")
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
        win.attributes("-topmost", True)
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
                    "UPDATE checkpoints SET user_note = 'card de bloqueio criado' WHERE id = ?",
                    (checkpoint_id,),
                )
                win.destroy()

        ttk.Button(win, text="ok", command=ok, style="Accent.TButton").grid(row=2, column=0, sticky="ew", padx=(0, 8))
        ttk.Button(win, text="criar card de bloqueio", command=create_blocker, style="Danger.TButton").grid(
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
            VALUES (?, ?, ?, ?, ?, 'Alta', 'BLOQUEADO', ?, ?, ?)
            """,
            (
                today_str(),
                f"Bloqueio: {message}",
                f"Criado automaticamente pelo alerta {source}.",
                "Foco",
                "Bloqueio",
                message,
                now_iso(),
                now_iso(),
            ),
        )
        card_id = int(cur.lastrowid)
        self.db.execute(
            "INSERT INTO card_events (card_id, event_type, message, created_at) VALUES (?, 'created', ?, ?)",
            (card_id, f"Card de bloqueio criado pelo alerta {source}.", now_iso()),
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
        blocked_cards = self.db.fetchall("SELECT * FROM kanban_cards WHERE lane = 'BLOQUEADO' ORDER BY updated_at DESC")
        smart_rows = self.db.fetchall(
            "SELECT * FROM smart_interactions WHERE date BETWEEN ? AND ? ORDER BY created_at DESC",
            (start, end),
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
        blocked_items = [f"#{card['id']} {card['title']} | {card['blocked_reason'] or '-'}" for card in blocked_cards]
        smart_items = [f"{row['created_at']} | {row['intent']} | {row['decision']}" for row in smart_rows]
        run_items = [
            f"{row['created_at']} | {row['command_key']} | rc={row['returncode']} | {row['output'][:180]}"
            for row in local_runs
        ]
        git_items = [f"{row['created_at']} | {row['commit_sha']} | {row['commit_message']}" for row in git_rows]

        total_minutes = sum(minutes_by_date.values())
        summary = (
            f"Semana {start} a {end}: {self.format_minutes(total_minutes)} trabalhados, "
            f"{len(done_cards)} cards feitos, {len(blocked_cards)} bloqueios ativos, "
            f"{len(smart_rows)} decisões IA."
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
  <section><h2>Bloqueios ativos</h2>{self.html_list(blocked_items)}</section>
  <section><h2>Modo IA</h2>{self.html_list(smart_items)}</section>
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
        blocked_cards = self.db.fetchall(
            "SELECT * FROM kanban_cards WHERE lane = 'BLOQUEADO' ORDER BY updated_at DESC"
        )
        pending_cards = self.get_pending_cards()
        latest_git = self.db.fetchone("SELECT * FROM git_snapshots ORDER BY id DESC LIMIT 1")
        chatgpt_rows = self.db.fetchall(
            "SELECT * FROM chatgpt_exchanges WHERE date = ? ORDER BY created_at", (report_date,)
        )
        smart_rows = self.db.fetchall(
            "SELECT * FROM smart_interactions WHERE date = ? ORDER BY created_at", (report_date,)
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
        blocked_items = [f"#{card['id']} {card['title']} | {card['blocked_reason']}" for card in blocked_cards]
        chat_items = [
            f"{row['created_at']} | card #{row['card_id'] or '-'} | {row['response'][:500]}" for row in chatgpt_rows
        ]
        smart_items = [
            f"{row['created_at']} | {row['intent']} | {row['decision']} | {row['assistant_text'][:500]}"
            for row in smart_rows
        ]
        local_run_items = [
            f"{row['created_at']} | {row['command_key']} | rc={row['returncode']} | {row['output'][:500]}"
            for row in local_run_rows
        ]

        next_plan = self.build_next_plan_text(report_date, pending_cards)
        summary = (
            f"Dia {report_date}: {self.format_minutes(total_minutes)} trabalhados, "
            f"{len(done_cards)} cards feitos, {len(blocked_cards)} bloqueados."
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
  <section><h2>Cards bloqueados</h2>{self.html_list(blocked_items)}</section>
  <section><h2>Último commit</h2><pre>{html_lib.escape((latest_git['commit_sha'] + ' ' + latest_git['commit_message']) if latest_git else 'Nenhum snapshot Git.')}</pre></section>
  <section><h2>Status do repo</h2><pre>{html_lib.escape(repo_status_text)}</pre></section>
  <section><h2>Respostas do ChatGPT</h2>{self.html_list(chat_items)}</section>
  <section><h2>Modo IA</h2>{self.html_list(smart_items)}</section>
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
            "HANDOFF HBX MASTER\n"
            f"Data: {report_date}\n"
            f"Resumo: {summary}\n"
            f"Último commit: {commit}\n"
            f"Status do repo:\n{repo_status}\n"
            f"Próximos cards:\n{next_cards}\n"
            "Me ajude a começar pelo menor próximo passo testável.\n"
        )

    def _build_config_tab(self, frame: ttk.Frame) -> None:
        self.page_title(frame, "Config", "Preferências locais")

        panel = ttk.LabelFrame(frame, text="Preferências locais", padding=12, style="Modern.TLabelframe")
        panel.grid(row=1, column=0, sticky="nsew", pady=(12, 0))
        panel.columnconfigure(1, weight=1)

        fields = (
            ("repo_path", "Repo path"),
            ("planned_hours", "Horas planejadas"),
            ("hours_available", "Horas disponíveis"),
            ("chatgpt_app_id", "ChatGPT Desktop AppID"),
            ("unique_goal", "Meta única"),
            ("technical_task", "Tarefa técnica"),
            ("commercial_task", "Tarefa comercial"),
            ("blocker", "Bloqueio"),
            ("not_today", "Não fazer hoje"),
        )
        for row, (key, label) in enumerate(fields):
            ttk.Label(panel, text=label, style="CardMuted.TLabel").grid(row=row, column=0, sticky="w", padx=(0, 10), pady=5)
            var = tk.StringVar(value=str(self.config_data.get(key, "")))
            self.config_entries[key] = var
            ttk.Entry(panel, textvariable=var).grid(row=row, column=1, sticky="ew", pady=5)

        boss_row = len(fields)
        ttk.Checkbutton(panel, text="Chefe chato", variable=self.boss_mode_var).grid(
            row=boss_row, column=1, sticky="w", pady=(8, 5)
        )
        ttk.Button(panel, text="Salvar config", command=self.save_config_from_tab, style="Accent.TButton").grid(
            row=boss_row + 1, column=1, sticky="e", pady=(12, 0)
        )

        windows_panel = ttk.LabelFrame(frame, text="Windows", padding=12, style="Modern.TLabelframe")
        windows_panel.grid(row=2, column=0, sticky="ew", pady=(12, 0))
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
            ("Workspace root", HBX_MASTER_WORKSPACE_DIR),
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
        win.attributes("-topmost", True)
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
            text="Fechamento agora. Não é bloqueio do Windows; é só aviso insistente do app.",
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
        return

    single_instance = SingleInstanceGuard()
    if not single_instance.acquire():
        return

    app = HbxOwnerApp()
    app.single_instance = single_instance
    app.mainloop()


if __name__ == "__main__":
    main()

