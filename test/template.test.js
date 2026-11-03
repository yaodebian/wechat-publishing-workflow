import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {applyTemplate} from '../src/template.js';
test('rejects nested outer horizontal padding but allows local content padding', async () => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'wechat-padding-'));
  const file=path.join(dir,'template.html');
  try {
    for(const style of ['padding:0 8px','padding-left:8px','padding-inline:1rem']) {
      await fs.writeFile(file,`<section style="${style}"><section>{{{content}}}</section></section>`);
      await assert.rejects(applyTemplate('<p>正文</p>',file),/左右 padding/);
    }
    await fs.writeFile(file,'<section style="padding:12px 0">{{{content}}}</section>');
    const result=await applyTemplate('<blockquote style="padding:8px">正文</blockquote>',file);
    assert.match(result,/blockquote style="padding:8px"/);
  } finally {await fs.rm(dir,{recursive:true,force:true});}
});
