export function statusLabel(status) {
  if (status >= 500) {
    return "error";
  }
  return "ok";
}

