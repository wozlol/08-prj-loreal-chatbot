/* DOM elements */
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const chatWindow = document.getElementById("chatWindow");
const latestQuestion = document.getElementById("latestQuestion");
const sendBtn = document.getElementById("sendBtn");

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

/* Conversation history, so the bot remembers names and past questions */
const messages = [{ role: "system", content: SYSTEM_PROMPT }];

/* Add a message bubble to the chat window and return it */
function addMessage(text, who) {
  const bubble = document.createElement("div");
  bubble.className = `msg ${who}`;
  bubble.textContent = text;
  chatWindow.appendChild(bubble);
  // Keep the newest message in view
  chatWindow.scrollTop = chatWindow.scrollHeight;
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

/* Set initial message */
addMessage("👋 Hello! I'm your L'Oréal Beauty Advisor. What can I help you find today?", "ai");

/* Handle form submit */
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const text = userInput.value.trim();
  if (!text) return;

  // Show the user's message and the latest question banner
  addMessage(text, "user");
  latestQuestion.textContent = `You asked: ${text}`;
  latestQuestion.hidden = false;

  // Save to history, then clear and lock the input while we wait
  messages.push({ role: "user", content: text });
  userInput.value = "";
  userInput.disabled = true;
  sendBtn.disabled = true;

  // Temporary "thinking" bubble
  const thinking = addMessage("Thinking…", "ai");
  thinking.classList.add("thinking");

  try {
    // Send the whole conversation to the Cloudflare Worker
    const response = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: messages }),
    });
    const data = await response.json();

    // The reply text lives here in the OpenAI response
    const reply = data.choices[0].message.content;

    // Save the reply to history and show it
    messages.push({ role: "assistant", content: reply });
    thinking.classList.remove("thinking");
    thinking.innerHTML = renderMarkdown(reply);
  } catch (error) {
    // Network or response problem: drop the unanswered question from history
    console.error(error);
    messages.pop();
    thinking.classList.remove("thinking");
    thinking.textContent =
      "Sorry, I couldn't reach the advisor just now. Please try again.";
  }

  // Unlock the input again
  userInput.disabled = false;
  sendBtn.disabled = false;
  userInput.focus();
  chatWindow.scrollTop = chatWindow.scrollHeight;
});
