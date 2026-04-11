import { getContentTypeLabel, getPromotionTypeLabel, getStatusLabel } from "../lib/filters.js";
import { formatDateTime, getPromotionImageUrl } from "../lib/utils.js";

const note = document.querySelector("#history-note");
const emptyState = document.querySelector("#empty-state");
const table = document.querySelector("#history-table");
const body = document.querySelector("#history-body");

async function loadHistory() {
  const response = await chrome.runtime.sendMessage({ type: "GET_HISTORY_DATA" });
  if (!response?.ok) {
    note.textContent = response?.error || "Unable to load history.";
    emptyState.classList.remove("hidden");
    return;
  }

  note.textContent = response.settings.historyEnabled
    ? "Full local archive of promotions seen by the extension."
    : "History recording is disabled. Existing rows are shown until you clear them.";

  const entries = response.historyEntries || [];
  emptyState.classList.toggle("hidden", entries.length > 0);
  table.classList.toggle("hidden", entries.length === 0);
  body.textContent = "";

  for (const entry of entries) {
    const row = document.createElement("tr");

    const titleCell = document.createElement("td");
    titleCell.className = "title-cell";

    const titleWrap = document.createElement("div");
    titleWrap.className = "history-entry";

    const imageUrl = getPromotionImageUrl(entry);
    if (imageUrl) {
      const preview = document.createElement("a");
      preview.className = "history-entry-preview";
      preview.href = entry.url;
      preview.target = "_blank";
      preview.rel = "noreferrer";
      preview.setAttribute("aria-label", `Open ${entry.title} on Steam`);

      const image = document.createElement("img");
      image.className = "history-entry-image";
      image.src = imageUrl;
      image.alt = `${entry.title} artwork`;
      image.loading = "lazy";

      preview.append(image);
      titleWrap.append(preview);
    }

    const titleCopy = document.createElement("div");
    titleCopy.className = "history-entry-copy";

    const link = document.createElement("a");
    link.className = "game-link";
    link.href = entry.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = entry.title;
    titleCopy.append(link);
    titleWrap.append(titleCopy);
    titleCell.append(titleWrap);

    const promoTypeCell = document.createElement("td");
    promoTypeCell.innerHTML = `<span class="tag">${getPromotionTypeLabel(entry.promoType)}</span>`;

    const contentTypeCell = document.createElement("td");
    contentTypeCell.textContent = getContentTypeLabel(entry.contentType);

    const statusCell = document.createElement("td");
    statusCell.textContent = getStatusLabel(entry.status, entry.notificationStatus);

    const firstSeenCell = document.createElement("td");
    firstSeenCell.textContent = formatDateTime(entry.firstSeenAt);

    const notifiedCell = document.createElement("td");
    notifiedCell.textContent = formatDateTime(entry.lastNotifiedAt);

    row.append(titleCell, promoTypeCell, contentTypeCell, statusCell, firstSeenCell, notifiedCell);
    body.append(row);
  }
}

loadHistory().catch((error) => {
  note.textContent = error instanceof Error ? error.message : String(error);
  emptyState.classList.remove("hidden");
});
