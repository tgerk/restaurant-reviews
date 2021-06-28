
exports = async (input) => {
  const db = context.services.get("mongodb-atlas").db("sample_restaurants");
  const cuisines = await db.collection("restaurants").distinct("cuisine");

  return cuisines;
};
