import { IQuery } from "../interface";

interface QueryBuilderOptions {
  searchFields?: string[];
}

export const buildQuery = (
  query: IQuery,
  options: QueryBuilderOptions = {},
) => {
  const { searchFields = [] } = options;

  // Pagination

  const limit = query.limit ? Number(query.limit) : 10;

  const page = query.page ? Number(query.page) : 1;

  const skip = (page - 1) * limit;

  // Sorting

  const sortBy = query.sortBy ? query.sortBy : "createdAt";

  const sortOrder = query.sortOrder ? query.sortOrder : "desc";

  // Conditions

  const andConditions: any[] = [];

  // Searching

  if (query.searchTerm && searchFields.length > 0) {
    andConditions.push({
      OR: searchFields.map((field) => ({
        [field]: {
          contains: query.searchTerm,
          mode: "insensitive",
        },
      })),
    });
  }

  return {
    limit,
    page,
    skip,
    sortBy,
    sortOrder,
    andConditions,
  };
};
