/**
 * Mongoose plugin that transforms every document's toJSON output:
 *  - Adds `id` as a string copy of `_id`
 *  - Removes `_id` and `__v`
 *  - Converts camelCase fields to snake_case for frontend compatibility
 */
const mongoose = require('mongoose');

// camelCase → snake_case
function toSnake(str) {
  return str.replace(/([A-Z])/g, (m) => `_${m.toLowerCase()}`);
}

function transformObj(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(transformObj);
  // Date objects must be serialised to ISO string, not iterated
  if (obj instanceof Date) return obj.toISOString();

  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === '__v') continue;
    if (k === '_id') {
      out['id'] = String(v);
      continue;
    }
    const snakeKey = toSnake(k);
    if (v && typeof v === 'object' && !Array.isArray(v) && v.constructor && v.constructor.name === 'ObjectId') {
      out[snakeKey] = String(v);
    } else if (v instanceof Date) {
      out[snakeKey] = v.toISOString();
    } else {
      out[snakeKey] = transformObj(v);
    }
  }
  return out;
}

function toJSONPlugin(schema) {
  schema.set('toJSON', {
    virtuals: true,
    transform(doc, ret) {
      return transformObj(ret);
    },
  });
}

module.exports = toJSONPlugin;
