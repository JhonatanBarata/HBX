const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    console.log('Searching for users with username starting with "smoke_"');
    const users = await prisma.user.findMany({ where: { username: { startsWith: 'smoke_' } }, select: { id: true, username: true, email: true } });
    if (!users.length) {
      console.log('No smoke users found.');
      return process.exit(0);
    }

    console.log('Found', users.length, 'users. Attempting bulk delete...');
    const ids = users.map((u) => u.id);

    try {
      const deleted = await prisma.user.deleteMany({ where: { id: { in: ids } } });
      console.log('deleteMany result:', deleted);
    } catch (e) {
      console.warn('Bulk delete failed (likely FK constraints). Falling back to per-user delete.');
    }

    // Try per-user deletes so we can report specific failures.
    const remaining = await prisma.user.findMany({ where: { username: { startsWith: 'smoke_' } }, select: { id: true, username: true } });
    if (!remaining.length) {
      console.log('No remaining smoke users.');
    } else {
      console.log('Some users remain after bulk attempt, trying individual deletes...');
      for (const u of remaining) {
        try {
          // Nullify known relations that may block deletion
          try {
            const pv = await prisma.productVersion.updateMany({ where: { authorId: u.id }, data: { authorId: null } });
            if (pv.count) console.log(`Cleared ${pv.count} productVersion.authorId for ${u.username}`);
          } catch (e) {
            // ignore if model not present or other error
          }

          try {
            const pr = await prisma.passwordReset.deleteMany({ where: { userId: u.id } });
            if (pr.count) console.log(`Deleted ${pr.count} PasswordReset rows for ${u.username}`);
          } catch (e) {
            // ignore if model not present or other error
          }

          await prisma.user.delete({ where: { id: u.id } });
          console.log('Deleted', u.username);
        } catch (err) {
          console.error('Failed to delete', u.username, '->', (err && err.message) || err);
        }
      }
    }

    console.log('Done');
  } catch (e) {
    console.error('Error while deleting smoke users:', e.message || e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
