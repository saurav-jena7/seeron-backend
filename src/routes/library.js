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

// GET /api/library/stats — real library stats
router.get('/stats', ...auth, async (req, res) => {
  try {
    const iid = getInstId(req);
    if (!iid) return res.json({ success: true, data: { totalBooks: 0, totalCopies: 0, availableCopies: 0, issuedCopies: 0 } });
    const books = await Book.find({ institute: iid, deletedAt: null });
    const totalBooks      = books.length;
    const totalCopies     = books.reduce((s, b) => s + (b.total_copies     || 0), 0);
    const availableCopies = books.reduce((s, b) => s + (b.available_copies || 0), 0);
    const issuedCopies    = totalCopies - availableCopies;
    return res.json({ success: true, data: { totalBooks, totalCopies, availableCopies, issuedCopies } });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

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

// ── Book Issue / Return ────────────────────────────────────────────────────────

const issueSchema = new mongoose.Schema({
  institute:    { type: mongoose.Schema.Types.ObjectId, ref: 'Institute', required: true },
  book:         { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true },
  member_type:  { type: String, enum: ['student', 'employee'], default: 'student' },
  member_id:    { type: mongoose.Schema.Types.ObjectId, required: true },
  member_name:  String,
  issued_by:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  issue_date:   { type: String, required: true },
  due_date:     { type: String, required: true },
  return_date:  { type: String, default: null },
  status:       { type: String, enum: ['issued', 'returned', 'overdue'], default: 'issued' },
  deletedAt:    { type: Date, default: null },
}, { timestamps: true });

const Issue = mongoose.models.LibraryIssue || mongoose.model('LibraryIssue', issueSchema);

// GET /api/library/issues
router.get('/issues', ...auth, requirePermission('library.book.view'), async (req, res) => {
  try {
    const iid = getInstId(req);
    const { status, book_id } = req.query;
    const filter = { institute: iid, deletedAt: null };
    if (status)  filter.status  = status;
    if (book_id) filter.book    = book_id;
    const issues = await Issue.find(filter)
      .populate('book', 'title author isbn')
      .sort({ createdAt: -1 })
      .limit(100);
    // Mark overdue
    const today = new Date().toISOString().split('T')[0];
    const result = issues.map(i => {
      const obj = i.toJSON();
      if (obj.status === 'issued' && obj.due_date < today) obj.status = 'overdue';
      return obj;
    });
    return res.json({ success: true, data: result });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/library/issues — issue a book
router.post('/issues', ...auth, requirePermission('library.book.view'), async (req, res) => {
  try {
    const iid = getInstId(req);
    const { book_id, member_type, member_id, member_name, issue_date, due_date } = req.body;
    if (!book_id || !member_id || !issue_date || !due_date)
      return res.status(400).json({ success: false, message: 'book_id, member_id, issue_date and due_date are required' });

    const book = await Book.findOne({ _id: book_id, institute: iid, deletedAt: null });
    if (!book) return res.status(404).json({ success: false, message: 'Book not found' });
    if (book.available_copies < 1)
      return res.status(400).json({ success: false, message: 'No copies available' });

    const issue = await Issue.create({
      institute: iid, book: book_id,
      member_type: member_type || 'student', member_id, member_name: member_name || '',
      issued_by: req.user._id, issue_date, due_date, status: 'issued',
    });
    await Book.findByIdAndUpdate(book_id, { $inc: { available_copies: -1 } }, { runValidators: false });

    await issue.populate('book', 'title author isbn');
    logAudit({ userId: req.user._id, instituteId: iid, action: 'CREATE', resource: 'library_issues', resourceId: issue._id, req });
    return res.status(201).json({ success: true, data: issue });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// PUT /api/library/issues/:id/return — return a book
router.put('/issues/:id/return', ...auth, requirePermission('library.book.view'), async (req, res) => {
  try {
    const iid = getInstId(req);
    const issue = await Issue.findOne({ _id: req.params.id, institute: iid, deletedAt: null });
    if (!issue) return res.status(404).json({ success: false, message: 'Issue record not found' });
    if (issue.status === 'returned')
      return res.status(400).json({ success: false, message: 'Book already returned' });

    const return_date = req.body.return_date || new Date().toISOString().split('T')[0];
    issue.status = 'returned';
    issue.return_date = return_date;
    await issue.save();

    await Book.findByIdAndUpdate(issue.book, { $inc: { available_copies: 1 } }, { runValidators: false });

    await issue.populate('book', 'title author isbn');
    logAudit({ userId: req.user._id, instituteId: iid, action: 'UPDATE', resource: 'library_issues', resourceId: issue._id, req });
    return res.json({ success: true, data: issue });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
