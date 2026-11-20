# API tests against a real Postgres:
#   DATABASE_URL=postgresql://postgres:devonly@127.0.0.1:18432/dnda uv run --with-requirements requirements.txt --with pytest --with httpx pytest -q
import os

import psycopg
import pytest
from fastapi.testclient import TestClient

import api.index as backend


@pytest.fixture(autouse=True)
def fresh_db():
    if not os.environ.get("DATABASE_URL"):
        pytest.skip("DATABASE_URL not set")
    with psycopg.connect(os.environ["DATABASE_URL"], autocommit=True) as conn:
        conn.execute("drop table if exists kb, scores, messages")
    backend._ready = False  # next request recreates the schema and the KB


client = TestClient(backend.app)


def ask(q):
    r = client.post("/api/chat", json={"q": q})
    assert r.status_code == 200
    return r.json()


def test_health_creates_schema():
    assert client.get("/api/health").json() == {"ok": True}


@pytest.mark.parametrize("q, topic", [
    ("tell me about your vector search engine with HNSW", "vector-search"),
    ("how can I contact you?", "contact"),
    ("what's the Text2SQL energy project?", "energy-copilot"),
    ("which university do you study at", "education"),
    ("what languages do you speak", "spoken-languages"),
    ("hello!", "greeting"),
])
def test_chat_finds_the_right_topic(q, topic):
    assert ask(q)["topic"] == topic


def test_chat_falls_back_on_unknown_and_symbols():
    assert ask("zxqv blorp")["matched"] is False
    assert ask("??? !!! |&:*")["matched"] is False  # tsquery operators are stripped, never a 500


def test_scores_round_trip_and_ordering():
    assert client.get("/api/scores").json() == []
    client.post("/api/scores", json={"name": "low", "score": 10})
    top = client.post("/api/scores", json={"name": "  Duc Anh ", "score": 500}).json()
    assert top[0] == {"name": "Duc Anh", "score": 500} and top[1]["name"] == "low"


@pytest.mark.parametrize("body", [
    {"name": "", "score": 5}, {"name": "x" * 17, "score": 5}, {"name": "<script>", "score": 5},
    {"name": "ok", "score": -1}, {"name": "ok", "score": 100001},
])
def test_scores_reject_bad_input(body):
    assert client.post("/api/scores", json=body).status_code == 422


def test_messages_store_throttle_and_honeypot():
    msg = {"name": "Recruiter", "contact": "r@example.com", "body": "Hi!"}
    assert client.post("/api/messages", json={**msg, "website": "spam.example"}).status_code == 201
    for _ in range(3):
        assert client.post("/api/messages", json=msg).status_code == 201
    assert client.post("/api/messages", json=msg).status_code == 429
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        assert conn.execute("select count(*) from messages").fetchone()[0] == 3  # honeypot one not stored
