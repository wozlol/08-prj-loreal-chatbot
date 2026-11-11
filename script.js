/* DOM elements */
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const chatWindow = document.getElementById("chatWindow");
const latestQuestion = document.getElementById("latestQuestion");
const sendBtn = document.getElementById("sendBtn");
const chatTabs = document.getElementById("chatTabs");

/* Your deployed Cloudflare Worker URL goes here (no API key, ever) */
const WORKER_URL = "https://loreal-chatbot.jawozni1.workers.dev/";

/* System prompt: keeps the bot on L'Oréal and beauty topics only */
const SYSTEM_PROMPT = `You are the L'Oréal Beauty Advisor, a friendly and knowledgeable assistant.
You help people discover and understand L'Oréal products across makeup, skincare, haircare and fragrance, and you build personalized routines and recommendations.
Ask short follow-up questions when you need more detail, such as skin type, hair type, concerns or budget.
Only answer questions about L'Oréal products, beauty routines, recommendations and closely related beauty topics.
If a question is unrelated, politely decline in one sentence and offer to help with a beauty question instead.
Do not invent products, prices or claims. If you are not sure a product exists, say so.
Be proactive: whenever someone asks about a need, a routine or a product type, recommend two or three specific L'Oréal Group products by their exact names, such as L'Oréal Paris, Garnier, Maybelline, Lancôme, Kérastase, CeraVe or La Roche-Posay. Prefer these over any non-L'Oréal brand.
Every time you name a product, write its full name (brand included) as a markdown link, like [L'Oréal Paris Revitalift Triple Power Moisturizer](https://www.amazon.com/s?k=L%27Oreal+Paris+Revitalift+Triple+Power+Moisturizer). The link URL is always https://www.amazon.com/s?k= followed by the full product name with spaces as + and apostrophes as %27. Do not put parentheses inside product names. Never write words like "link", "click here" or "buy here", and never use any other URL. Let the product name itself be the link.
Keep answers short, warm and easy to scan, and use the user's name if they share it.`;


/* ---------- Saved chats (kept only in this browser, on this device) ---------- */

const STORAGE_KEY = "lorealChats";
const GREETING =
  "👋 Hello! I'm your L'Oréal Beauty Advisor. What can I help you find today?";
const DEFAULT_TITLE = "New Chat";

/* Each chat is { id, title, messages: [{ role, content }] } (no system prompt) */
let chats = [];
let activeId = null;

/* Things that only matter while the page is open, so they are not saved */
const pending = new Set(); // chat ids still waiting for a reply
const errors = new Map(); // chat id -> error text to show

/* Load saved chats from the browser. If storage is blocked, we just start fresh */
function loadChats() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.chats)) {
      // Keep only chats with the right shape
      chats = saved.chats.filter(
        (c) => c && c.id && typeof c.title === "string" && Array.isArray(c.messages),
      );
      activeId = saved.activeId;
    }
  } catch (error) {
    chats = [];
  }
  if (!chats.length) newChat();
  if (!chats.some((c) => c.id === activeId)) activeId = chats[0].id;
}

/* Save all chats to the browser */
function saveChats() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ chats, activeId }));
  } catch (error) {
    // Storage blocked or full: the chat still works, it just won't be remembered
  }
}

/* Make a new empty chat and switch to it */
function newChat() {
  const chat = {
    id: `${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
    title: DEFAULT_TITLE,
    messages: [],
  };
  chats.push(chat);
  activeId = chat.id;
  return chat;
}

function getActiveChat() {
  return chats.find((c) => c.id === activeId);
}

/* Short tab title from the first question */
function makeTitle(text) {
  return text.length > 28 ? `${text.slice(0, 28)}…` : text;
}

/* Add a message bubble to the chat window and return it */
function addMessage(text, who) {
  const bubble = document.createElement("div");
  bubble.className = `msg ${who}`;
  bubble.textContent = text;
  chatWindow.appendChild(bubble);
  return bubble;
}

/* Turn the bot's markdown (**bold**, lists, etc.) into safe HTML */
function renderMarkdown(text) {
  // Step 1: escape HTML so the reply can never inject tags into the page
  const escape = (s) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  // Step 2: inline styles inside a line: links, bold, italic, code
  const inline = (s) =>
    escape(s)
      .replace(
        /\[([^\]]+)\]\((https?:\/\/[^\s)"]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener">$1</a>',
      )
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, "$1<em>$2</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");

  // Step 3: go line by line and build paragraphs and lists
  let html = "";
  let listType = null; // "ul", "ol", or null
  let paragraph = []; // lines waiting to become one <p>

  const closeParagraph = () => {
    if (paragraph.length) html += `<p>${paragraph.join("<br>")}</p>`;
    paragraph = [];
  };
  const closeList = () => {
    if (listType) html += `</${listType}>`;
    listType = null;
  };

  for (const line of text.split("\n")) {
    const bullet = line.match(/^\s*[-*•]\s+(.*)/);
    const number = line.match(/^\s*\d+[.)]\s+(.*)/);
    const heading = line.match(/^\s*#{1,6}\s+(.*)/);

    if (bullet || number) {
      closeParagraph();
      const type = bullet ? "ul" : "ol";
      if (listType !== type) {
        closeList();
        html += `<${type}>`;
        listType = type;
      }
      html += `<li>${inline((bullet || number)[1])}</li>`;
    } else if (heading) {
      closeParagraph();
      closeList();
      html += `<p><strong>${inline(heading[1])}</strong></p>`;
    } else if (line.trim() === "") {
      closeParagraph();
      closeList();
    } else {
      closeList();
      paragraph.push(inline(line.trim()));
    }
  }
  closeParagraph();
  closeList();
  return html;
}


/* ---------- Drawing the tabs and the chat ---------- */

/* Draw the row of tabs at the top, each with a delete (×) button */
function renderTabs() {
  chatTabs.innerHTML = "";

  for (const chat of chats) {
    const tab = document.createElement("div");
    tab.className = `chat-tab${chat.id === activeId ? " active" : ""}`;

    const title = document.createElement("button");
    title.type = "button";
    title.className = "tab-title";
    title.textContent = chat.title;
    title.title = chat.title;
    title.addEventListener("click", () => switchChat(chat.id));

    const close = document.createElement("button");
    close.type = "button";
    close.className = "tab-close";
    close.textContent = "×";
    close.setAttribute("aria-label", `Delete chat: ${chat.title}`);
    close.addEventListener("click", () => deleteChat(chat.id));

    tab.append(title, close);
    chatTabs.appendChild(tab);
  }

  // "+" button to start another chat
  const add = document.createElement("button");
  add.type = "button";
  add.className = "tab-new";
  add.textContent = "+";
  add.setAttribute("aria-label", "Start a new chat");
  add.addEventListener("click", startNewChat);
  chatTabs.appendChild(add);

  // Keep the active tab in view when there are many tabs
  const activeTab = chatTabs.querySelector(".chat-tab.active");
  if (activeTab) activeTab.scrollIntoView({ block: "nearest", inline: "nearest" });
}

/* Draw the messages of the active chat */
function renderChat() {
  const chat = getActiveChat();
  chatWindow.innerHTML = "";
  addMessage(GREETING, "ai");

  for (const message of chat.messages) {
    if (message.role === "user") {
      addMessage(message.content, "user");
    } else {
      // Bot replies may contain markdown, so format them
      addMessage("", "ai").innerHTML = renderMarkdown(message.content);
    }
  }

  // Temporary "thinking" bubble while a reply is on its way
  if (pending.has(chat.id)) {
    addMessage("Thinking…", "ai").classList.add("thinking");
  }
  // A reply that failed (not saved to history)
  if (errors.has(chat.id)) {
    addMessage(errors.get(chat.id), "ai");
  }
  chatWindow.scrollTop = chatWindow.scrollHeight;

  // Banner with the latest question of this chat
  const asked = chat.messages.filter((m) => m.role === "user");
  if (asked.length) {
    latestQuestion.textContent = `You asked: ${asked[asked.length - 1].content}`;
    latestQuestion.hidden = false;
  } else {
    latestQuestion.hidden = true;
  }

  // Lock the input only while this chat is waiting for a reply
  const waiting = pending.has(chat.id);
  userInput.disabled = waiting;
  sendBtn.disabled = waiting;
}

function renderAll() {
  renderTabs();
  renderChat();
}

/* ---------- Tab actions ---------- */

function switchChat(id) {
  if (id === activeId) return;
  activeId = id;
  saveChats();
  renderAll();
  userInput.focus();
}

/* Start a new chat, unless the current one is already empty */
function startNewChat() {
  const current = getActiveChat();
  if (!current.messages.length) {
    userInput.focus();
    return;
  }
  newChat();
  saveChats();
  renderAll();
  userInput.focus();
}

/* Delete one chat for good. If it was the last one, start a fresh chat */
function deleteChat(id) {
  const index = chats.findIndex((c) => c.id === id);
  if (index === -1) return;

  chats.splice(index, 1);
  pending.delete(id);
  errors.delete(id);

  if (!chats.length) {
    newChat();
  } else if (id === activeId) {
    // Move to the neighbor tab
    activeId = chats[Math.min(index, chats.length - 1)].id;
  }
  saveChats();
  renderAll();
}

/* ---------- Sending a message ---------- */

chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const chat = getActiveChat();
  const text = userInput.value.trim();
  if (!text || pending.has(chat.id)) return;

  // Save the question to this chat's history, name the tab after it
  chat.messages.push({ role: "user", content: text });
  if (chat.title === DEFAULT_TITLE) chat.title = makeTitle(text);
  errors.delete(chat.id);
  pending.add(chat.id);
  userInput.value = "";
  saveChats();
  renderAll();

  try {
    // Send the system prompt plus this chat's whole history to the Worker
    const response = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...chat.messages],
      }),
    });
    const data = await response.json();

    // The reply text lives here in the OpenAI response
    const reply = data.choices[0].message.content;
    chat.messages.push({ role: "assistant", content: reply });
  } catch (error) {
    // Network or response problem: show a message, keep the question in history
    console.error(error);
    errors.set(
      chat.id,
      "Sorry, I couldn't reach the advisor just now. Please try again.",
    );
  }

  pending.delete(chat.id);

  // If this chat was deleted while we waited, there is nothing to update
  if (!chats.includes(chat)) return;
  saveChats();
  renderAll();
  if (chat.id === activeId) userInput.focus();
});

/* ---------- Start up ---------- */
loadChats();
renderAll();
