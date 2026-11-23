"""dnda-port API: CV chat search, game leaderboard and contact messages on PostgreSQL.

Runs as a Vercel Python function (vercel.json rewrites /api/* here) or locally:
    DATABASE_URL=postgresql://... uvicorn api.index:app --port 18451
The schema and the knowledge base are created/synced on the first request of each
process, so a fresh database needs no manual migration.
"""
import hashlib
import os
import re
import threading

import psycopg
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, Field, field_validator

app = FastAPI(title="dnda-port API", docs_url="/api/docs", openapi_url="/api/openapi.json")

# --- knowledge base: what the chat bot can answer (from the CV, profile and pinned repos) ---
# (topic, extra search keywords, answer). Keywords widen full-text matching; answers are shown verbatim.
KB = [
    ("greeting", "hi hello hey yo who are you bot",
     "Hi! I'm Duc Anh's bot ♟. I answer from his CV, so ask about his work, research, projects, stack, or how to reach him."),
    ("about", "about yourself introduce background summary tell me who is duc anh harry wilson",
     "Dang Nguyen Duc Anh (Harry Wilson to friends abroad) is an AI Engineer in Hanoi. He grew up playing chess, "
     "found programming through the same curiosity, and now builds multi-agent LLM systems, retrieval platforms and Text2SQL agents."),
    ("work", "work job current role company employer ript research institute posts telecommunications what do you do engineer",
     "Since March 2025 he's an AI Engineer at the Research Institute of Posts and Telecommunications (RIPT) in Hanoi, "
     "building the multi-agent chatbot and retrieval platform behind 110+ production bots."),
    ("mass-chatbot", "mass chatbot platform multi agent multiagent dag pipeline langgraph qdrant fastapi sse streaming production bots",
     "MASS Chatbot v2 is the enterprise multi-agent chatbot and retrieval platform he architected: a DAG pipeline on FastAPI, "
     "LangGraph and Qdrant with parallel nodes, automatic fallbacks and real-time SSE streaming across 110+ production bots."),
    ("latency", "latency performance speed optimize optimization fast slow milliseconds ms retrieval keyword query",
     "Two latency wins at RIPT: he showed the documentation-search logic tripled retrieval latency and fixed it (15.96 ms → 6.86 ms on average), "
     "and redesigned the Qdrant/message services so keyword queries went from 95 ms → 5 ms with maintained term statistics."),
    ("distillation", "distillation distill fine tuning finetune finetuning open weights local model cost api llm cloud policy",
     "He distilled conversational agent policies from cloud LLMs into a local open-weights model with full fine-tuning on 110k+ chat messages, "
     "replacing about $1k a month of API calls with rented hardware."),
    ("research", "research researcher university luxembourg ui2code ui code html css javascript agents advisor van hoang le benchmark",
     "Since March 2026 he's an undergraduate researcher with the University of Luxembourg (advised by PostDoc Van-Hoang Le), "
     "studying multi-step AI agents that turn UI designs into HTML/CSS/JavaScript: the refinement loop (drafting, visual feedback, polishing) and when to stop."),
    ("education", "education university degree study student school ptit graduate graduation major minor bachelor",
     "He's finishing a B.S. in Information Technology at PTIT (Posts and Telecommunications Institute of Technology) in Hanoi, expected May 2027. "
     "Majors: AI, data science, ML and DL; minors: software engineering and maths."),
    ("projects", "projects portfolio built build github pinned side work showcase",
     "Pinned projects: a vector search engine with HNSW written from scratch, Energy Copilot (a Text2SQL agent), autoresearch with human gates, "
     "a YouTube summarizer on Qwen3-0.6B, The Healthy Lab (a full-stack restaurant site), and a personal finance app with Zalo and Telegram bots. "
     "Ask about any of them!"),
    ("vector-search", "vector search engine hnsw embeddings ann nearest neighbor neighbour from scratch numpy faiss hnswlib recall",
     "Vector Search Engine: exact search plus an HNSW index written from scratch in NumPy (no FAISS/hnswlib). Recall within 0.004 of hnswlib at identical settings, "
     "0.98 recall@10 at 0.52 ms on 120k real sentence embeddings (16.6× faster than single-thread exact search)."),
    ("energy-copilot", "energy copilot text2sql text sql agent electricity nilm smart meter household power timescaledb sqlglot",
     "Energy Copilot is an 11-node LangGraph Text2SQL agent for household electricity use, cost and savings. The LLM fills a query plan that code compiles "
     "to parameterized SQL behind a sqlglot guard (read-only, one home). Routing over 11 skills and 25 tools: skill hit@1 1.0, tool P/R 0.786/0.964."),
    ("autoresearch", "autoresearch karpathy autonomous research agent experiments training llm nanochat sigma noise rounds",
     "autoresearch (a fork of karpathy/autoresearch) has an AI agent run LLM training experiments in three rounds at 1/4, 1/2 and full data, "
     "with a human gate after each. A change is kept only if it beats 2σ of measured seed noise, and a sealed test shard checks for overfitting."),
    ("ytb", "youtube summarizer summary summarize video transcript whisper qwen captions notes",
     "The YouTube summarizer turns a link into structured notes (overview, key points, takeaway) with Qwen3-0.6B, using captions or local faster-whisper. "
     "He's fine-tuning it and measuring faithfulness on a golden set of 50 transcripts (in progress)."),
    ("healthy-lab", "healthy lab restaurant website web nextjs next ordering order bowl booking table full stack supabase",
     "The Healthy Lab is a full-stack restaurant site for his Web Programming class: ordering, a live-priced bowl builder, table booking and staff dashboards, "
     "built with Next.js 16 + FastAPI on Vercel and Postgres on Supabase with row-level security."),
    ("finance-bots", "finance money expense expenses spending budget wallet personal zalo telegram bot bots chat receipt mongodb express react",
     "His personal finance app (Zalo-Tele-intergrated-financial-apps) has Telegram and Zalo bots: send \"phở 45k\" or a receipt photo, confirm the draft, "
     "and it becomes a transaction, with wallets, categories, monthly budgets and stats in the web app. React + TypeScript, Express 5 and MongoDB Atlas on Vercel, "
     "a rule-based text parser (no LLM) and PaddleOCR + KIE for receipts. Built solo in 29 reviewed PRs with 366 automated tests; live at sochitieu-btl.vercel.app since November 2026."),
    ("stack", "skills stack tools languages technologies tech frameworks libraries python typescript java pytorch",
     "Languages: Python, TypeScript, Java, C++, C#. Frameworks: PyTorch, OpenCV, LangGraph, LangChain, FastAPI, Streamlit. "
     "Data and tools: PostgreSQL, pgvector, Qdrant, Hugging Face, Git, Pytest, Pydantic, tree-sitter."),
    ("rag", "rag retrieval augmented generation search vector database pgvector qdrant bm25 hybrid",
     "Retrieval is his daily work: Qdrant-backed retrieval for 110+ production bots at RIPT, pgvector HNSW tool routing in Energy Copilot, "
     "and an HNSW index written from scratch."),
    ("spoken-languages", "speak spoken english vietnamese ielts language languages",
     "Vietnamese (native) and English (IELTS 6.0)."),
    ("chess", "chess hobby hobbies free time fun play player",
     "He grew up as a chess player: evenings over a board, calculating lines and learning to lose gracefully. "
     "He stopped playing seriously, but says he's still playing chess; now the pieces are agents."),
    ("contact", "contact email mail reach message talk linkedin connect text",
     "Email ducanhdn.ptit@gmail.com, LinkedIn linkedin.com/in/dangnguyenducanh, or use the text_me button at the bottom of this page."),
    ("hiring", "hire hiring available availability internship intern job jobs opportunity opportunities open role roles collaborate collaboration",
     "He's open to AI Engineer (LLM) roles and research collaborations. Email ducanhdn.ptit@gmail.com."),
    ("location", "where location based live city country hanoi vietnam timezone",
     "Hanoi, Vietnam."),
    ("site", "site website this page built how made stack frontend backend database chat bot work",
     "This site: a TypeScript + Vite frontend and a FastAPI + PostgreSQL backend. This chat is Postgres full-text search over facts from his CV, no LLM involved."),
    ("game", "game play pawn climb leaderboard score",
     "Pawn climb: hop the pawn up the board with ← → (or A/D), grab ♛ for +5, and reach rank 8 to promote. Scores go on a shared leaderboard."),
]

FALLBACK = ("I only know what's on Duc Anh's CV, and that one's not in it. Try asking about his work, research, "
            "projects or stack, or email him at ducanhdn.ptit@gmail.com.")

SCHEMA = """
create table if not exists kb (
  topic    text primary key,
  keywords text not null,
  answer   text not null,
  tsv tsvector generated always as (
    setweight(to_tsvector('english', topic || ' ' || keywords), 'A') ||
    setweight(to_tsvector('english', answer), 'B')) stored
);
create index if not exists kb_tsv on kb using gin (tsv);
create table if not exists scores (
  id bigserial primary key,
  name text not null check (char_length(name) between 1 and 16),
  score integer not null check (score between 0 and 100000),
  ip_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists scores_top on scores (score desc, created_at);
create table if not exists messages (
  id bigserial primary key,
  name text not null check (char_length(name) between 1 and 80),
  contact text not null default '' check (char_length(contact) <= 120),
  body text not null check (char_length(body) between 1 and 2000),
  ip_hash text not null,
  created_at timestamptz not null default now()
);
"""

_ready = False
_lock = threading.Lock()


def connect():
    url = os.environ.get("DATABASE_URL") or os.environ.get("POSTGRES_URL")
    if not url:
        raise HTTPException(503, "database not configured")
    conn = psycopg.connect(url, autocommit=True, connect_timeout=5)
    global _ready
    if not _ready:
        with _lock:
            if not _ready:
                conn.execute(SCHEMA)
                with conn.cursor() as cur:  # keep the KB in sync with this file
                    cur.executemany(
                        "insert into kb (topic, keywords, answer) values (%s, %s, %s) "
                        "on conflict (topic) do update set keywords = excluded.keywords, answer = excluded.answer",
                        KB)
                    cur.execute("delete from kb where topic <> all(%s)", ([t for t, _, _ in KB],))
                _ready = True
    return conn


def ip_hash(request: Request) -> str:
    ip = (request.headers.get("x-forwarded-for") or (request.client.host if request.client else "")).split(",")[0].strip()
    return hashlib.sha256(f"{os.environ.get('IP_SALT', 'dnda-port')}:{ip}".encode()).hexdigest()[:16]


def throttle(conn, table: str, who: str, limit: int, minutes: int = 10):
    # table is one of our two literal names, never user input
    n = conn.execute(f"select count(*) from {table} where ip_hash = %s and created_at > now() - make_interval(mins => %s)",
                     (who, minutes)).fetchone()[0]
    if n >= limit:
        raise HTTPException(429, "slow down a little")


# --- routes ----------------------------------------------------------------------------------------
class ChatIn(BaseModel):
    q: str = Field(min_length=1, max_length=300)


class ChatOut(BaseModel):
    answer: str
    topic: str | None
    matched: bool


class ScoreIn(BaseModel):
    name: str = Field(min_length=1, max_length=16)
    score: int = Field(ge=0, le=100000)

    @field_validator("name")
    @classmethod
    def clean_name(cls, v: str) -> str:
        v = v.strip()
        if not re.fullmatch(r"[\w .\-]{1,16}", v):
            raise ValueError("letters, digits, space, . _ - only")
        return v


class Score(BaseModel):
    name: str
    score: int


class MessageIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    contact: str = Field(default="", max_length=120)
    body: str = Field(min_length=1, max_length=2000)
    website: str = ""  # honeypot: humans never see this field


@app.get("/api/health")
def health():
    with connect() as conn:
        conn.execute("select 1")
    return {"ok": True}


@app.post("/api/chat", response_model=ChatOut)
def chat(inp: ChatIn):
    words = re.findall(r"[a-z0-9]+", inp.q.lower())[:24]  # alnum only: safe to join into a tsquery
    if not words:
        return ChatOut(answer=FALLBACK, topic=None, matched=False)
    with connect() as conn:
        row = conn.execute(
            "select topic, answer from kb, to_tsquery('english', %s) query "
            "where tsv @@ query order by ts_rank_cd(tsv, query, 32) desc, topic limit 1",
            (" | ".join(words),)).fetchone()
    if row is None:
        return ChatOut(answer=FALLBACK, topic=None, matched=False)
    return ChatOut(answer=row[1], topic=row[0], matched=True)


@app.get("/api/scores", response_model=list[Score])
def top_scores():
    with connect() as conn:
        rows = conn.execute("select name, score from scores order by score desc, created_at limit 10").fetchall()
    return [Score(name=n, score=s) for n, s in rows]


@app.post("/api/scores", response_model=list[Score], status_code=201)
def add_score(inp: ScoreIn, request: Request):
    who = ip_hash(request)
    with connect() as conn:
        throttle(conn, "scores", who, limit=20)
        conn.execute("insert into scores (name, score, ip_hash) values (%s, %s, %s)", (inp.name, inp.score, who))
    return top_scores()


@app.post("/api/messages", status_code=201)
def add_message(inp: MessageIn, request: Request):
    if inp.website:  # bot filled the hidden field: pretend success, store nothing
        return {"ok": True}
    who = ip_hash(request)
    with connect() as conn:
        throttle(conn, "messages", who, limit=3)
        conn.execute("insert into messages (name, contact, body, ip_hash) values (%s, %s, %s, %s)",
                     (inp.name.strip(), inp.contact.strip(), inp.body.strip(), who))
    return {"ok": True}
