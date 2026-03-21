/**
 * SGroup AI Console - Core Frontend Logic
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

input.addEventListener("input", function() {
  this.style.height = "auto";
  this.style.height = this.scrollHeight + "px";
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
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
    roleSpan.textContent = "Bạn";
    avatar.innerHTML = '<i data-lucide="user"></i>';
    wrapper.classList.add("user");
  } else {
    roleSpan.textContent = "SGroup AI";
    avatar.innerHTML = '<i data-lucide="bot"></i>';
  }

  contentDiv.innerHTML = contentHtml;

  messages.appendChild(fragment);
  if (window.lucide) {
    lucide.createIcons();
  }

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
    ? `<div class="citations"><div class="citation-label">Tham khảo:</div>${payload.response.citations
        .map(
          (citation) =>
            `<a href="${citation.url}" class="inline-preview" data-preview-url="${citation.url}" target="_blank" rel="noreferrer">${escapeHtml(citation.title)} <i data-lucide="link" class="icon-tiny"></i></a>`
        )
        .join("  ")}</div>`
    : "";

  const graph = payload.graph ?? { executedNodes: [], toolCalls: [], errors: [], warnings: [], usedFallbackRouter: false };
  const graphErrors = Array.isArray(graph.errors) ? graph.errors.filter(Boolean) : [];
  const graphWarnings = Array.isArray(graph.warnings) ? graph.warnings.filter(Boolean) : [];
  const toolNames = Array.isArray(payload.response.mcp?.toolNames)
    ? payload.response.mcp.toolNames.join(", ")
    : "Không dùng";

  const traceHtml = (graph.toolCalls || []).length
    ? graph.toolCalls.map((toolCall) => `<strong>${escapeHtml(toolCall.name)}</strong>: ${escapeHtml(JSON.stringify(toolCall.args))}`).join("<br />")
    : "N/A";
  const warningHtml = graphWarnings.length
    ? `<div class="graph-warning"><strong>Graph warnings:</strong><ul>${graphWarnings
        .map((warning) => `<li>${escapeHtml(warning)}</li>`)
        .join("")}</ul></div>`
    : "";
  const errorHtml = graphErrors.length
    ? `<div class="graph-error-box"><strong>Graph errors:</strong><ul>${graphErrors
        .map((error) => `<li>${escapeHtml(error)}</li>`)
        .join("")}</ul></div>`
    : '<div class="graph-ok">Không ghi nhận graph error.</div>';
  const fallbackHtml = graph.usedFallbackRouter
    ? '<div class="graph-warning">Fallback router đang được sử dụng.</div>'
    : "";

  const reasoningHtml = `
    <details style='display:none;' class='debug-details'>
      <summary>Chi tiết xử lý (Graph Logic)</summary>
      <div class="meta">
        <strong>Agent:</strong> ${escapeHtml(payload.route?.agent || "Unknown")}<br />
        <strong>Intent:</strong> ${escapeHtml(payload.route?.intent || "N/A")}<br />
        <strong>Capabilities:</strong> ${escapeHtml(toolNames)}<br />
        <strong>Path:</strong> ${escapeHtml((graph.executedNodes ?? []).join(" -> "))}<br />
        <strong>Trace:</strong> <div class="trace-box">${traceHtml}</div>
        ${fallbackHtml}
        ${warningHtml}
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
  webPanelStatus.textContent = "Đang tải trang...";

  webFrame.onload = () => {
    webPanelStatus.textContent = "Đã hiển thị";
  };
}

setTimeout(() => {
  appendMessage(
    "assistant",
    "Xin chào! Tôi là **SGroup Multi-Agent Assistant**.<br />Tôi có thể giúp bạn truy vấn tin tức, dự báo thời tiết, kiến thức SGroup và điều phối các task phức tạp qua bộ công cụ MCP. Bạn muốn bắt đầu từ đâu?"
  );
}, 100);

document.addEventListener("click", (event) => {
  const link = event.target.closest("[data-preview-url]");
  if (!link) return;

  event.preventDefault();
  updateWebPanel(link.dataset.previewUrl);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
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

    if (!res.ok) {
      throw new Error("Server trả về lỗi. Vui lòng thử lại.");
    }
    const payload = await res.json();

    typingIndicator.classList.add("is-hidden");
    appendMessage("assistant", renderAssistantPayload(payload));

    if (payload.response.webUrl) {
      updateWebPanel(payload.response.webUrl);
    }
  } catch (error) {
    typingIndicator.classList.add("is-hidden");
    appendMessage("assistant", `<div class="error-text"><strong>Lỗi:</strong> ${escapeHtml(error.message)}</div>`);
  }
});


