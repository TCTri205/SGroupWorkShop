/**
 * SGroup AI Console - Core Frontend Logic
 * C?i thi?n tr?i nghi?m ngý?i dùng, x? l? l?i iframe và hi?n th? tr?ng thái Agent.
 */

const form = document.getElementById("chat-form");
const input = document.getElementById("message-input");
const messages = document.getElementById("messages");
const template = document.getElementById("message-template");
const webPanel = document.getElementById("web-panel");
const webFrame = document.getElementById("web-frame");
const webLink = document.getElementById("web-link");
const webPanelStatus = document.getElementById("web-panel-status");
const typingIndicator = document.getElementById("typing-indicator");
const closePanelBtn = document.getElementById("close-panel");

// T? ð?ng ði?u ch?nh chi?u cao textarea
input.addEventListener("input", function() {
  this.style.height = "auto";
  this.style.height = (this.scrollHeight) + "px";
});

// G?i tin nh?n b?ng phím Enter (không kèm Shift)
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    form.dispatchEvent(new Event("submit"));
  }
});

closePanelBtn.addEventListener("click", () => {
  webPanel.classList.add("is-hidden");
});

function appendMessage(role, contentHtml) {
  const fragment = template.content.cloneNode(true);
  const wrapper = fragment.querySelector(".message-wrapper");
  const avatar = fragment.querySelector(".message-avatar");
  const roleSpan = fragment.querySelector(".message-role");
  const contentDiv = fragment.querySelector(".message-content");
  const timeSpan = fragment.querySelector(".message-time");
  
  const now = new Date();
  timeSpan.textContent = now.getHours() + ":" + String(now.getMinutes()).padStart(2, "0");

  wrapper.classList.add(role);
  
  if (role === "user") {
    roleSpan.textContent = "B?n";
    avatar.innerHTML = '<i data-lucide="user"></i>';
    wrapper.classList.add("user");
  } else {
    roleSpan.textContent = "SGroup AI";
    avatar.innerHTML = '<i data-lucide="bot"></i>';
  }

  contentDiv.innerHTML = contentHtml;
  
  messages.appendChild(fragment);
  if (window.lucide) lucide.createIcons();
  
  messages.scrollTop = messages.scrollHeight;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function linkifyMarkdownLinks(text) {
  const escaped = escapeHtml(text);
  return escaped
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      '<a href="$2" class="inline-preview" data-preview-url="$2" target="_blank" rel="noreferrer">$1 <i data-lucide="external-link" class="icon-tiny"></i></a>'
    )
    .replace(/\n/g, "<br />");
}

function renderAssistantPayload(payload) {
  const statusHtml = (payload.response.statusSteps || [])
    .map((step) => `<span class="status-chip">${escapeHtml(step)}</span>`)
    .join("");

  const citationsHtml = (payload.response.citations || []).length
    ? `<div class="citations"><div class="citation-label">Tham kh?o:</div>${payload.response.citations
        .map(
          (citation) =>
            `<a href="${citation.url}" class="inline-preview" data-preview-url="${citation.url}" target="_blank" rel="noreferrer">${escapeHtml(citation.title)} <i data-lucide="link" class="icon-tiny"></i></a>`
        )
        .join("  ")}</div>`
    : "";

  const graph = payload.graph ?? { executedNodes: [], toolCalls: [], errors: [], usedFallbackRouter: false };
  const graphErrors = Array.isArray(graph.errors) ? graph.errors.filter(Boolean) : [];
  const toolNames = Array.isArray(payload.response.mcp?.toolNames) 
    ? payload.response.mcp.toolNames.join(", ") 
    : "Không dùng";
    
  const traceHtml = (graph.toolCalls || []).length
    ? graph.toolCalls.map((tc) => `<strong>${escapeHtml(tc.name)}</strong>: ${escapeHtml(JSON.stringify(tc.args))}`).join("<br />")
    : "N/A";
  const errorHtml = graphErrors.length
    ? `<div class="graph-error-box"><strong>Graph errors:</strong><ul>${graphErrors
        .map((error) => `<li>${escapeHtml(error)}</li>`)
        .join("")}</ul></div>`
    : '<div class="graph-ok">Không ghi nh?n graph error.</div>';
  const fallbackHtml = graph.usedFallbackRouter
    ? '<div class="graph-warning">Fallback router ðang ðý?c s? d?ng.</div>'
    : "";

  const reasoningHtml = `
    <details>
      <summary>Chi ti?t x? l? (Graph Logic)</summary>
      <div class="meta">
        <strong>Agent:</strong> ${escapeHtml(payload.route?.agent || "Unknown")}<br />
        <strong>Intent:</strong> ${escapeHtml(payload.route?.intent || "N/A")}<br />
        <strong>Capabilities:</strong> ${escapeHtml(toolNames)}<br />
        <strong>Path:</strong> ${escapeHtml((graph.executedNodes ?? []).join("  "))}<br />
        <strong>Trace:</strong> <div class="trace-box">${traceHtml}</div>
        ${fallbackHtml}
        ${errorHtml}
        <p><em>${escapeHtml(payload.route?.reasoningSummary || "")}</em></p>
      </div>
    </details>`;

  return `
    <div class="main-response">${linkifyMarkdownLinks(payload.response.message)}</div>
    <div class="status-list">${statusHtml}</div>
    ${citationsHtml}
    ${reasoningHtml}
  `;
}

function updateWebPanel(url) {
  if (!url) {
    webPanel.classList.add("is-hidden");
    return;
  }

  webPanel.classList.remove("is-hidden");
  webFrame.src = url;
  webLink.href = url;
  webPanelStatus.textContent = "Ðang t?i trang...";
  
  webFrame.onload = () => {
    webPanelStatus.textContent = "Ð? hi?n th?";
  };
}

// Chào m?ng
setTimeout(() => {
  appendMessage(
    "assistant",
    "Xin chào! Tôi là **SGroup Multi-Agent Assistant**. <br />Tôi có th? giúp b?n truy v?n tin t?c, d? báo th?i ti?t, ki?n th?c SGroup và ði?u ph?i các task ph?c t?p qua b? công c? MCP. B?n mu?n b?t ð?u t? ðâu?"
  );
}, 100);

document.addEventListener("click", (e) => {
  const link = e.target.closest("[data-preview-url]");
  if (!link) return;
  
  e.preventDefault();
  updateWebPanel(link.dataset.previewUrl);
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const message = input.value.trim();
  if (!message) return;

  appendMessage("user", escapeHtml(message));
  input.value = "";
  input.style.height = "auto";
  
  typingIndicator.classList.remove("is-hidden");
  messages.scrollTop = messages.scrollHeight;

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message })
    });

    if (!res.ok) throw new Error("Server tr? v? l?i. Vui l?ng th? l?i.");
    const payload = await res.json();
    
    typingIndicator.classList.add("is-hidden");
    appendMessage("assistant", renderAssistantPayload(payload));

    if (payload.response.webUrl) {
      updateWebPanel(payload.response.webUrl);
    }
  } catch (err) {
    typingIndicator.classList.add("is-hidden");
    appendMessage("assistant", `<div class="error-text"><strong>L?i:</strong> ${escapeHtml(err.message)}</div>`);
  }
});

