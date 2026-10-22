import assert from "node:assert/strict";
import { test } from "node:test";
import { openDatabase, upsertNewsletterSubscription } from "../backend/database.mjs";
import { runWeeklyDigest, newsletterUnsubscribeToken, verifyNewsletterUnsubscribeToken } from "../backend/weekly-digest.mjs";

function fixture() {
  const db = openDatabase(":memory:");
  db.prepare("INSERT INTO categories (id, icon, name, description) VALUES (?, ?, ?, ?)").run("weekly-test", "weekly-test", "测试", "测试");
  db.prepare(`INSERT INTO tools (id,slug,name,domain,official_url,category_id,summary,description,pricing_type,language,content_updated_date)
    VALUES ('weekly-tool','weekly-tool','测试<工具>','example.com','https://example.com','weekly-test','简介&说明','说明','free','multi',date('now'))`).run();
  let count = 0;
  function subscriber(flags = [1, 1, 1], status = "active") {
    const n = ++count, user = "weekly-user-" + n, email = "weekly-" + n + "@example.com";
    db.prepare("INSERT INTO users (id,email,normalized_email,display_name,password_hash,password_salt,consent_version) VALUES (?,?,?,?,?,?,?)").run(user,email,email,"测试","hash","salt","test");
    const sub = upsertNewsletterSubscription(db, {email,normalizedEmail:email,topicSlugs:[],consentVersion:"test",source:"test"},user);
    db.prepare("INSERT INTO user_notification_preferences (user_id,weekly_digest,new_tool_alerts,favorite_update_alerts) VALUES (?,?,?,?)").run(user,...flags);
    db.prepare("INSERT INTO user_favorites (user_id,tool_id) VALUES (?,?)").run(user,"weekly-tool");
    db.prepare("UPDATE newsletter_subscriptions SET status=? WHERE id=?").run(status,sub.id);
    return sub;
  }
  return {db,subscriber};
}
const env = {RESEND_API_KEY:"fake-key",AUTH_EMAIL_FROM:"noreply@example.com",PUBLIC_BASE_URL:"https://ontimo.cn"};
const logger = {info(){},error(){}};
function sender(mails, behavior) {
  return async (_url,init) => { mails.push({mail:JSON.parse(init.body),init}); return behavior ? behavior(mails.length) : {ok:true,json:async()=>({id:"receipt-"+mails.length})}; };
}

test("verified sender fallback, complete content and weekly deduplication", async () => {
  const {db,subscriber}=fixture(); try {
    subscriber(); const mails=[];
    const result=await runWeeklyDigest({db,env,logger,fetchImpl:sender(mails)});
    assert.equal(result.sent,1); assert.equal(mails[0].mail.from,env.AUTH_EMAIL_FROM);
    for (const heading of ["每周精选","新工具速递","你收藏的工具动态"]) assert.ok(mails[0].mail.html.includes(heading));
    assert.ok(mails[0].mail.html.includes("测试&lt;工具&gt;"));
    assert.ok(mails[0].mail.html.includes("/tools/weekly-tool"));
    assert.ok(mails[0].mail.text.includes("简介&说明"));
    assert.ok(mails[0].mail.html.includes("/newsletter/unsubscribe?id="));
    assert.ok(mails[0].init.signal); assert.ok(mails[0].init.headers["Idempotency-Key"]);
    assert.equal((await runWeeklyDigest({db,env,logger,fetchImpl:sender(mails)})).sent,0);
    assert.equal(mails.length,1);
  } finally {db.close();}
});

test("unsubscribe tokens are scoped to a subscription and reject tampering", () => {
  const token = newsletterUnsubscribeToken("subscription-a",env);
  assert.equal(verifyNewsletterUnsubscribeToken("subscription-a",token,env),true);
  assert.equal(verifyNewsletterUnsubscribeToken("subscription-b",token,env),false);
  assert.equal(verifyNewsletterUnsubscribeToken("subscription-a","bad",env),false);
  assert.equal(verifyNewsletterUnsubscribeToken("subscription-a",token,{}),false);
});

test("each preference controls its section; inactive and all-off subscribers receive nothing", async () => {
  const {db,subscriber}=fixture(); try {
    subscriber([1,0,0]); subscriber([0,1,0]); subscriber([0,0,1]); subscriber([0,0,0]); subscriber([1,1,1],"unsubscribed"); subscriber([1,1,1],"suppressed");
    const mails=[]; await runWeeklyDigest({db,env,logger,fetchImpl:sender(mails)});
    assert.equal(mails.length,3);
    const headings=["每周精选","新工具速递","你收藏的工具动态"];
    mails.forEach(({mail},i)=>headings.forEach((heading,j)=>assert.equal(mail.html.includes(heading),i===j)));
  } finally {db.close();}
});

test("failure does not stop other subscribers, failed receipt remains retryable", async () => {
  const {db,subscriber}=fixture(); try {
    subscriber(); subscriber(); const mails=[];
    const result=await runWeeklyDigest({db,env,logger,fetchImpl:sender(mails,n=>n===1?{ok:false,status:503}:{ok:true,json:async()=>({id:"good"})})});
    assert.equal(result.failed,1); assert.equal(result.sent,1);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM email_delivery_log").get().n,1);
    const retry=[]; assert.equal((await runWeeklyDigest({db,env,logger,fetchImpl:sender(retry)})).sent,1);
    assert.equal(retry[0].init.headers["Idempotency-Key"],mails[0].init.headers["Idempotency-Key"]);
  } finally {db.close();}
});

test("missing configuration is a failure; empty provider receipt is not logged as delivered", async () => {
  const {db,subscriber}=fixture(); try {
    subscriber(); assert.equal((await runWeeklyDigest({db,env:{},logger})).reason,"email_not_configured");
    const result=await runWeeklyDigest({db,env,logger,fetchImpl:async()=>({ok:true,json:async()=>({})})});
    assert.equal(result.failed,1); assert.equal(db.prepare("SELECT COUNT(*) AS n FROM email_delivery_log").get().n,0);
  } finally {db.close();}
});

test("dry run reads recipients without network or delivery mutations", async () => {
  const {db,subscriber}=fixture(); try {
    subscriber(); const result=await runWeeklyDigest({db,env:{},logger,dryRun:true,fetchImpl:()=>{throw Error("Network forbidden");}});
    assert.equal(result.sent,1); assert.equal(db.prepare("SELECT COUNT(*) AS n FROM email_delivery_log").get().n,0);
  } finally {db.close();}
});
