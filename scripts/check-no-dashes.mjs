import fs from 'node:fs';
import path from 'node:path';

// Скрипт проверяет весь проект на наличие длинного и среднего тире.
// Если хотя бы один запрещённый символ найден, сборка сразу падает.
const FORBIDDEN = [
  { char: '\u2014', name: 'длинное тире (U+2014)' },
  { char: '\u2013', name: 'среднее тире (U+2013)' },
];

const IGNORE_DIRS = new Set([
  'node_modules',
  'dist',
  'android',
  '.git',
  '.aistudio',
  'public',
]);

const CHECK_EXTS = new Set([
  '.js',
  '.mjs',
  '.ts',
  '.tsx',
  '.jsx',
  '.html',
  '.css',
  '.json',
  '.md',
  '.yml',
  '.yaml',
]);

const rootDir = process.cwd();
const findings = [];

function scanDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDir(fullPath);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (!CHECK_EXTS.has(ext)) continue;
      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split(/\r?\n/);
      lines.forEach((line, idx) => {
        for (const item of FORBIDDEN) {
          if (line.includes(item.char)) {
            const rel = path.relative(rootDir, fullPath);
            findings.push(`${rel}:${idx + 1} найдено ${item.name}`);
          }
        }
      });
    }
  }
}

scanDir(rootDir);

if (findings.length > 0) {
  console.error('Ошибка проверки текста: найдены запрещённые символы тире!');
  for (const f of findings) {
    console.error('  - ' + f);
  }
  process.exit(1);
}

console.log('Проверка тире пройдена: запрещённых символов не найдено.');
