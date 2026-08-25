export interface RouteParams {
  tab: string;
  emailId: string | null;
  compose: boolean;
  editId: string | null;
}

export function readRouteParams(): RouteParams {
  const params = new URLSearchParams(window.location.search);
  return {
    tab: params.get("tab") || "SCHEDULED",
    emailId: params.get("email") || null,
    compose: params.has("compose"),
    editId: params.get("edit") || null,
  };
}

export function pushRouteParams(
  tab: string,
  emailId?: string | null,
  compose?: boolean,
  editId?: string | null
): void {
  const params = new URLSearchParams();
  params.set("tab", tab);
  if (emailId) params.set("email", emailId);
  if (compose) params.set("compose", "1");
  if (editId) params.set("edit", editId);

  const searchString = `?${params.toString()}`;
  if (window.location.search !== searchString) {
    window.history.pushState({}, "", searchString);
  }
}
