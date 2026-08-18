const { clearOperationalData, compactDatabase, db, getOperationalCounts, initDatabase } = require('../src/db');
const { createBackup } = require('../src/services/backupService');

async function main() {
  if (!process.argv.includes('--yes')) {
    console.error('Use: npm run db:reset -- --yes');
    process.exit(1);
  }

  initDatabase();
  const before = getOperationalCounts();
  const backup = await createBackup({ label: 'pre-reset-cli' });
  const after = clearOperationalData({ resetCategories: true });
  compactDatabase();

  console.log(JSON.stringify({
    message: 'Dados operacionais apagados.',
    backup: backup.file,
    before,
    after
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    db.close();
  });
