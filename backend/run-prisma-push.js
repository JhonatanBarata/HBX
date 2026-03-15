const { spawnSync } = require('child_process');
const env = { ...process.env };
const args = process.argv.slice(2);
const wantsDbPush = args.includes('--db-push');
const acceptDataLoss = args.includes('--accept-data-loss');

if (!env.DATABASE_URL || !env.DATABASE_URL.trim()) {
	console.error('DATABASE_URL is required. Refusing to use hardcoded credentials.');
	process.exit(1);
}

if (!env.DIRECT_URL || !env.DIRECT_URL.trim()) {
	env.DIRECT_URL = env.DATABASE_URL;
}

let commandArgs;
if (wantsDbPush) {
	if (String(env.ALLOW_DB_PUSH || '') !== '1') {
		console.error('Refusing prisma db push. Set ALLOW_DB_PUSH=1 and pass --db-push only for controlled local repair workflows.');
		process.exit(1);
	}

	commandArgs = ['prisma', 'db', 'push', '--schema=./prisma/schema.prisma'];
	if (acceptDataLoss) {
		commandArgs.push('--accept-data-loss');
	}
} else {
	commandArgs = ['prisma', 'migrate', 'deploy', '--schema=./prisma/schema.prisma'];
}

console.log('Using DATABASE_URL=', env.DATABASE_URL);
const r = spawnSync('npx', commandArgs, { stdio: 'inherit', env });
process.exit(r.status);
