export function getVisiblePromotions(entries, maxItems = 10) {
  return (Array.isArray(entries) ? entries : [])
    .filter((entry) => entry?.status === "active")
    .slice(0, maxItems);
}

export function getPopupStatusText(runtimeState = {}) {
  if (runtimeState.checkInProgress) {
    return "Checking now...";
  }
  if (runtimeState.lastCheckOutcome === "error") {
    return "Source error";
  }
  if (runtimeState.lastCheckOutcome === "success") {
    return runtimeState.lastResultCount > 0
      ? `${runtimeState.lastResultCount} promotion(s) tracked`
      : "No new free promotions found";
  }
  return "Idle";
}
