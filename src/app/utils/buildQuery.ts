import { IQuery } from "../interface";

export const buildQuery = (query: IQuery) => {
  
  const limit = query.limit ? Number(query.limit) : 10;
  const page = query.page ? Number(query.page) : 1;
  const skip = (page - 1) * limit;
  const sortBy = query.sortBy ? query.sortBy : "createdAt";
  const sortOrder = query.sortOrder ? query.sortOrder : "desc";

  return {
    limit,
    page,
    skip,
    sortBy,
    sortOrder,
  };
};
