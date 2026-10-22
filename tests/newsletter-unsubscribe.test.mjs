import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApplication } from "../server.mjs";
import { upsertNewsletterSubscription } from "../backend/database.mjs";
import { newsletterUnsubscribeToken, runWeeklyDigest } from "../backend/weekly-digest.mjs";

test("public unsubscribe requires confirmation, rejects forged links and prevents delivery", async () => {
  const previous = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = "newsletter-test-key";
  const app = buildApplication({dbPath:join(mkdtempSync(join(tmpdir(),"nikai-newsletter-test-")),"app.db"),logger:false});
  try {
    const sub=upsertNewsletterSubscription(app.db,{email:"reader@example.test",normalizedEmail:"reader@example.test",topicSlugs:[],consentVersion:"test",source:"test"});
    const address=await app.listen(0,"127.0.0.1");
    const origin="http://127.0.0.1:"+address.port;
    const path="/newsletter/unsubscribe?id="+sub.id+"&token="+newsletterUnsubscribeToken(sub.id);
    const get=await fetch(origin+path);
    assert.equal(get.status,200); assert.ok((await get.text()).includes("确认取消订阅"));
    assert.equal(app.db.prepare("SELECT status FROM newsletter_subscriptions WHERE id=?").get(sub.id).status,"active");
    assert.equal((await fetch(origin+"/newsletter/unsubscribe?id="+sub.id+"&token="+ "0".repeat(64),{method:"POST"})).status,400);
    const post=await fetch(origin+path,{method:"POST"});
    assert.equal(post.status,200); assert.ok((await post.text()).includes("周报订阅已取消"));
    assert.equal(app.db.prepare("SELECT status FROM newsletter_subscriptions WHERE id=?").get(sub.id).status,"unsubscribed");
    assert.equal((await runWeeklyDigest({db:app.db,dryRun:true,env:{}})).sent,0);
    assert.equal((await fetch(origin+path,{method:"POST"})).status,200);
  } finally {
    await new Promise(resolve=>app.server.close(resolve)); app.db.close();
    if(previous===undefined)delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY=previous;
  }
});
