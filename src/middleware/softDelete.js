/**
 * Soft-deletes a Mongoose document by setting deletedAt = now.
 * @param {mongoose.Model} Model
 * @param {string} id
 */
async function softDelete(Model, id) {
  const result = await Model.findByIdAndUpdate(id, { deletedAt: new Date() });
  return !!result;
}

async function restore(Model, id) {
  const result = await Model.findByIdAndUpdate(id, { deletedAt: null });
  return !!result;
}

module.exports = { softDelete, restore };
