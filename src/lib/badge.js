const BADGE_COLORS = Object.freeze({
  unread: "#d94b3d",
  read: "#2f8f46"
});

function formatBadgeCount(count) {
  return count > 99 ? "99+" : String(count);
}

export async function updateBadge(runtimeState, settings) {
  if (!settings.badgeEnabled) {
    await chrome.action.setBadgeText({ text: "" });
    return;
  }

  const unreadCount = Number(runtimeState?.unreadCount) || 0;
  const activeFreeToKeepCount = Number(runtimeState?.activeFreeToKeepCount) || 0;
  if (activeFreeToKeepCount <= 0) {
    await chrome.action.setBadgeText({ text: "" });
    return;
  }

  await chrome.action.setBadgeBackgroundColor({
    color: unreadCount > 0 ? BADGE_COLORS.unread : BADGE_COLORS.read
  });
  await chrome.action.setBadgeText({ text: formatBadgeCount(activeFreeToKeepCount) });
}
