/**
 * Library Routes — Book management
 * Permissions required: library.book.view / library.book.create / library.book.update / library.book.delete
 */
const router  = require('express').Router();
const mongoose = require('mongoose');
const { authenticate, loadMembership, requirePermission } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');

const auth = [authenticate, loadMembership];

// ── Inline Book model (no separate file needed yet) ────────────────────────────
const bookSchema = new mongoose.Schema({
  institute:       { type: mongoose.Schema.Types.ObjectId, ref: 'Institute', required: true },
  title:           { type: String, required: true },
  author:          { type: String, required: true },
  isbn:            { type: String },
  category:        { type: String },
  total_copies:    { type: Number, default: 1 },
  available_copies:{ type: Number, default: 1 },
  added_by:        { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  deletedAt:       { type: Date, default: null },
}, { timestamps: true });

const Book = mongoose.models.Book || mongoose.model('Book', bookSchema);

// ── Helper: get instituteId safely for both regular users and super admin ──────
function getInstId(req) {
  return req.instituteId ||
    req.headers['x-institute-id'] ||
    req.query.institute_id ||
    req.body?.institute_id;
}

// GET /api/library/books
router.get('/books', ...auth, requirePermission('library.book.view'), async (req, res) => {
  try {
    const iid = getInstId(req);
    const { search, category } = req.query;
    const filter = { institute: iid, deletedAt: null };
    if (search) filter.$or = [
      { title: { $regex: search, $options: 'i' } },
      { author: { $regex: search, $options: 'i' } },
      { isbn: { $regex: search, $options: 'i' } },
    ];
    if (category) filter.category = category;
    const books = await Book.find(filter).sort({ createdAt: -1 });
    return res.json({ success: true, data: books });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/library/books
router.post('/books', ...auth, requirePermission('library.book.create'), async (req, res) => {
  try {
    const iid = getInstId(req);
    if (!iid) return res.status(400).json({ success: false, message: 'Institute context required (x-institute-id header)' });
    const { title, author, isbn, category, total_copies } = req.body;
    if (!title || !author) return res.status(400).json({ success: false, message: 'Title and Author are required' });
    const copies = parseInt(total_copies) || 1;
    const book = await Book.create({
      institute: iid,
      title, author, isbn: isbn || null,
      category: category || null,
      total_copies: copies,
      available_copies: copies,
      added_by: req.user._id,
    });
    logAudit({ userId: req.user._id, instituteId: iid, action: 'CREATE', resource: 'library_books', resourceId: book._id, newData: { title, author }, req });
    return res.status(201).json({ success: true, data: book });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// PUT /api/library/books/:id
router.put('/books/:id', ...auth, requirePermission('library.book.update'), async (req, res) => {
  try {
    const iid = getInstId(req);
    const book = await Book.findOneAndUpdate(
      { _id: req.params.id, institute: iid, deletedAt: null },
      { $set: req.body },
      { new: true, runValidators: false }
    );
    if (!book) return res.status(404).json({ success: false, message: 'Book not found' });
    logAudit({ userId: req.user._id, instituteId: iid, action: 'UPDATE', resource: 'library_books', resourceId: book._id, req });
    return res.json({ success: true, data: book });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// DELETE /api/library/books/:id (soft)
router.delete('/books/:id', ...auth, requirePermission('library.book.delete'), async (req, res) => {
  try {
    const iid = getInstId(req);
    const book = await Book.findOneAndUpdate(
      { _id: req.params.id, institute: iid, deletedAt: null },
      { deletedAt: new Date() },
      { new: true, runValidators: false }
    );
    if (!book) return res.status(404).json({ success: false, message: 'Book not found' });
    logAudit({ userId: req.user._id, instituteId: iid, action: 'DELETE', resource: 'library_books', resourceId: book._id, req });
    return res.json({ success: true, message: 'Book deleted' });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
