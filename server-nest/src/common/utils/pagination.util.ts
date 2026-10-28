export interface PageArgs {
  take?: number;
  skip?: number;
}

// Prisma arguments for one page. Without a limit there is no paging: everything is returned
export function pageArgs(limit?: number, page = 1): PageArgs {
  return limit ? { take: limit, skip: (page - 1) * limit } : {};
}

// The numbers a client needs to draw its pager
export function pageInfo(total: number, page: number, limit?: number) {
  return {
    total,
    page,
    pages: limit ? Math.max(1, Math.ceil(total / limit)) : 1,
  };
}
