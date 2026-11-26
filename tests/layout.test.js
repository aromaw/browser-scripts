const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const nga = path.join(root, 'nga-code-agent-disguise', 'nga-code-agent-disguise.user.js');
const oldUrl = 'https://raw.githubusercontent.com/aromaw/nga-code-agent-disguise/main/nga-code-agent-disguise.user.js';
const newUrl = 'https://raw.githubusercontent.com/aromaw/browser-scripts/main/nga-code-agent-disguise/nga-code-agent-disguise.user.js';

test('the NGA script lives in its own folder and publishes the new update URL', () => {
    assert.equal(fs.existsSync(path.join(root, 'nga-code-agent-disguise.user.js')), false);
    const source = fs.readFileSync(nga, 'utf8');
    assert.match(source, new RegExp('@updateURL\\s+' + newUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(source, new RegExp('@downloadURL\\s+' + newUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.equal(source.includes(oldUrl), false);
    assert.match(source, /@version\s+4\.1\.7/);
    assert.match(source, /const VERSION = '4\.1\.7'/);
});
