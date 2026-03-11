const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(file));
        } else if (file.endsWith('.tsx')) {
            results.push(file);
        }
    });
    return results;
}

const files = walk('c:/Users/japh/.gemini/antigravity/scratch/padocs/src/pages');
const files2 = walk('c:/Users/japh/.gemini/antigravity/scratch/padocs/src/components');
const allFiles = [...files, ...files2];
let issues = [];

allFiles.forEach(f => {
    const data = fs.readFileSync(f, 'utf8');
    const lines = data.split('\n');
    lines.forEach((line, i) => {
        if (!line.includes('t(') && !line.includes('console.')) {
            // Find hardcoded strings >Text< or placeholder="Text"
            if (/>\\s*[A-Z][A-Za-z0-9\s,'\-\\.?!]*</.test(line) || /placeholder=\"[A-Z]/.test(line) || /label=\"[A-Z]/.test(line)) {
                issues.push(`${f}:${i+1} => ${line.trim()}`);
            }
        }
    });
});

fs.writeFileSync('c:/Users/japh/.gemini/antigravity/scratch/padocs/src/issues.txt', issues.join('\n'));
console.log('Found ' + issues.length + ' potential issues.');
