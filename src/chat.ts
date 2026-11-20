// "Duc Anh (bot)": a side panel that asks the FastAPI backend, which answers with
// Postgres full-text search over facts from the CV. No LLM involved.
import { api } from "./api";

const SUGGESTIONS = [
  "what do you do at work?",
  "tell me about the vector search",
  "what's your research?",
  "what's your stack?",
  "how do I contact you?",
];
const GREETING = "Hey! I'm Duc Anh's bot ♟ I answer from his CV. Ask about his work, research, projects or stack.";
const OFFLINE = "My brain (the API) is offline right now. Email ducanhdn.ptit@gmail.com instead!";

export function initChat(panel: HTMLElement): void {
  const log = panel.querySelector<HTMLElement>("#chat-log")!;
  const form = panel.querySelector<HTMLFormElement>("#chat-form")!;
  const input = panel.querySelector<HTMLInputElement>("#chat-input")!;
  const suggest = panel.querySelector<HTMLElement>("#chat-suggest")!;

  const say = (text: string, who: "bot" | "me", typing = false) => {
    const p = document.createElement("p");
    p.className = `msg ${who}${typing ? " typing" : ""}`;
    p.textContent = text; // textContent only: answers and questions are never parsed as HTML
    log.append(p);
    log.scrollTop = log.scrollHeight;
    return p;
  };

  async function ask(q: string) {
    say(q, "me");
    const bubble = say("thinking…", "bot", true);
    try {
      const reply = await api.chat(q);
      bubble.textContent = reply.answer;
    } catch {
      bubble.textContent = OFFLINE;
    }
    bubble.classList.remove("typing");
    log.scrollTop = log.scrollHeight;
  }

  for (const s of SUGGESTIONS) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = s;
    b.addEventListener("click", () => ask(s));
    suggest.append(b);
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = input.value.trim().slice(0, 300);
    if (!q) return;
    input.value = "";
    void ask(q);
  });

  let greeted = false;
  panel.addEventListener("toggle", (e) => {
    if ((e as ToggleEvent).newState !== "open") return;
    if (!greeted) { say(GREETING, "bot"); greeted = true; }
    input.focus();
  });
}
