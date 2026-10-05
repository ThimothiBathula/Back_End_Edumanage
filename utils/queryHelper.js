exports.buildQuery = (query = {}) => {

  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 10;

  const skip = (page - 1) * limit;

  const sortBy = query.sortBy || "createdAt";
  const order = query.order === "asc" ? "asc" : "desc";

  return {
    skip,
    take: limit,
    orderBy: {
      [sortBy]: order
    }
  };
};