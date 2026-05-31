export function errorBody(code: string, message: string) {
  return { code, message };
}

export function pageParams(query: Record<string, unknown>) {
  const page = Math.max(Number(query.page ?? 1), 1);
  const limit = Math.min(Math.max(Number(query.limit ?? 20), 1), 100);
  return { page, limit, skip: (page - 1) * limit };
}
