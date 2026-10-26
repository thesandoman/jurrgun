/**
 * Staff events, check-in part (split from routes/admin/events.tsx, Core Platform C3: a pure move).
 * See ./index.ts for the route list.
 */
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { batch } from "../../../db";
import { checkInOpen } from "../../../domain/rules";
import { fmtDate } from "../../../lib/i18n";
import { audit, notify } from "../../../lib/records";
import { blocks, profiles, registrations } from "../../../schema";
import { rosterAccess, seatCode } from "../../../domain/roster";
import { Button, Card, Field, Notice, page, str, Toggle, view } from "../../../ui/kit";
import { adminEvents } from "./app";
import { QR_PREFIX, checkedInCount } from "./edit";
import { BASE, checkedInRegistrations, me, refuse, seatLabel, wantsJson, withEvent } from "./shared";

// ------------------------------------------------------------ check-in --

const SCANNER_JS = `(function(){
  var out=document.getElementById('scan-status'),count=document.getElementById('checked-count'),
      video=document.getElementById('scan-video'),btn=document.getElementById('scan-start'),
      msgs=JSON.parse(document.getElementById('scan-msgs').textContent);
  if(!('BarcodeDetector' in window)||!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){
    out.textContent=msgs.unsupported;btn.hidden=true;return;
  }
  var detector=new BarcodeDetector({formats:['qr_code']}),busy=false,last='',lastAt=0;
  function show(text,ok){out.textContent=text;out.className='notice '+(ok?'ok':'error');}
  btn.addEventListener('click',function(){
    btn.hidden=true;
    navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}}).then(function(stream){
      video.srcObject=stream;video.hidden=false;return video.play();
    }).then(function(){out.textContent=msgs.ready;tick();}).catch(function(){out.textContent=msgs.denied;btn.hidden=false;});
  });
  function tick(){
    if(busy){return setTimeout(tick,250);}
    detector.detect(video).then(function(codes){
      for(var i=0;i<codes.length;i++){
        var raw=codes[i].rawValue||'';
        if(raw.indexOf('${QR_PREFIX}')!==0)continue;
        var token=raw.slice(${QR_PREFIX.length});
        if(token===last&&Date.now()-lastAt<4000)continue;
        last=token;lastAt=Date.now();busy=true;return send(token);
      }
    }).catch(function(){}).then(function(){busy=false;setTimeout(tick,250);});
  }
  function send(token){
    var body=new URLSearchParams();body.set('token',token);
    if(document.getElementById('scan-override').checked)body.set('override','1');
    return fetch(location.pathname,{method:'POST',credentials:'same-origin',
      headers:{'accept':'application/json','content-type':'application/x-www-form-urlencoded'},body:body.toString()})
      .then(function(r){return r.json();})
      .then(function(j){show(j.message,j.ok);if(typeof j.checkedIn==='number')count.textContent=String(j.checkedIn);
        if(navigator.vibrate)navigator.vibrate(j.ok?80:[60,60,60]);})
      .catch(function(){show(msgs.network,false);});
  }
})();`;

/** JSON for a <script type="application/json"> block, safe against </script>. */
function scriptJson(x: unknown): string {
  return JSON.stringify(x).replace(/</g, "\\u003c");
}

adminEvents.get(
  "/:id/checkin",
  withEvent(async (c, e, db) => {
    const v = view(c);
    const { t, lang } = v;
    const [count, [{ expected }]] = await Promise.all([
      checkedInCount(db, e.id),
      db
        .select({ expected: sql<number>`count(*)` })
        .from(registrations)
        .where(and(eq(registrations.eventId, e.id), eq(registrations.status, "confirmed")))
        .limit(1),
    ]);
    const open = checkInOpen(e.startsAt);
    const msgs = {
      unsupported: t(
        "เบราว์เซอร์นี้สแกน QR ไม่ได้ ใช้รหัส 6 ตัวด้านล่างแทน (Chrome บน Android ใช้ได้)",
        "This browser can't scan QR codes. Use the 6-character code below (Chrome on Android works)",
      ),
      ready: t("เล็งกล้องไปที่ QR บนบัตรเข้างาน", "Point the camera at the attendee's pass"),
      denied: t("เปิดกล้องไม่ได้ อนุญาตให้ใช้กล้อง หรือใช้รหัสด้านล่างแทน", "Couldn't open the camera. Allow access or use the code below"),
      network: t("เชื่อมต่อไม่ได้ ลองอีกครั้ง", "Network error. Try again"),
    };
    return page(c, { title: t("จุดเช็กอิน", "Check-in station"), admin: true }, (
      <>
        <p>
          <a href={`${BASE}/${e.id}`}>{t("← กลับไปหน้าจัดการ", "← Back to the event")}</a>
        </p>
        <h1>{t("จุดเช็กอิน", "Check-in station")}</h1>
        <p class="muted">
          {lang === "en" && e.titleEn ? e.titleEn : e.title} · {fmtDate(e.startsAt, lang)}
        </p>
        {e.status !== "published" ? <Notice kind="error">{t("กิจกรรมนี้ไม่ได้เผยแพร่อยู่", "This event isn't published")}</Notice> : null}
        {open ? null : (
          <Notice kind="warn">
            {t(
              "ตอนนี้อยู่นอกช่วงเช็กอิน (30 นาทีก่อนเริ่ม ถึง 60 นาทีหลังเริ่ม) ถ้าจำเป็นให้ติ๊ก 'ข้ามช่วงเวลา' ระบบจะบันทึกไว้",
              "Outside the check-in window (30 min before to 60 min after the start). Tick 'override' if you must; it is logged",
            )}
          </Notice>
        )}
        <div class="stats">
          <div class="stat">
            <div class="stat-v">
              <span id="checked-count">{count}</span> / {Number(expected)}
            </div>
            <div class="stat-l">{t("เช็กอินแล้ว", "Checked in")}</div>
          </div>
        </div>
        <Card>
          <h2>{t("สแกนบัตรเข้างาน", "Scan a pass")}</h2>
          <div id="scan-status" class="notice info" role="status" aria-live="polite">
            {t("กดปุ่มเพื่อเปิดกล้อง", "Tap the button to open the camera")}
          </div>
          <video id="scan-video" playsinline muted hidden style="width:100%;max-width:420px;border-radius:12px;background:#000"></video>
          <div class="row">
            <button type="button" id="scan-start" class="btn primary">
              {t("เปิดกล้อง", "Start camera")}
            </button>
          </div>
          <label class="toggle">
            <input type="checkbox" id="scan-override" />
            <span>{t("ข้ามช่วงเวลาเช็กอิน (บันทึกไว้)", "Override the check-in window (logged)")}</span>
          </label>
        </Card>
        <Card>
          <h2>{t("พิมพ์รหัส 6 ตัว", "Enter the 6-character code")}</h2>
          <form method="post" action={`${BASE}/${e.id}/checkin`}>
            <Field
              label={t("รหัสใต้ QR บนบัตรของผู้เข้าร่วม", "Code under the QR on the attendee's pass")}
              name="code"
              required
              maxlength={6}
              pattern="[A-Za-z0-9_\-]{6}"
              autocomplete="off"
            />
            <Toggle name="override" label={t("ข้ามช่วงเวลาเช็กอิน (บันทึกไว้)", "Override the check-in window (logged)")} />
            <Button>{t("เช็กอิน", "Check in")}</Button>
          </form>
        </Card>
        <script type="application/json" id="scan-msgs" dangerouslySetInnerHTML={{ __html: scriptJson(msgs) }} />
        <script dangerouslySetInnerHTML={{ __html: SCANNER_JS }} />
      </>
    ));
  }, { roster: true }),
);

adminEvents.post(
  "/:id/checkin",
  withEvent(async (c, e, db) => {
    const { t } = view(c);
    const a = me(c);
    const json = wantsJson(c);
    const body = await c.req.parseBody();
    let token = str(body.token);
    if (token.startsWith(QR_PREFIX)) token = token.slice(QR_PREFIX.length);
    const code = str(body.code).toUpperCase();
    const override = str(body.override) === "1";

    const fail = async (status: 400 | 403 | 404 | 409, msg: string) => {
      if (json) return c.json({ ok: false, message: msg, checkedIn: await checkedInCount(db, e.id) }, status);
      return refuse(c, e, msg, status);
    };

    if (e.status !== "published") return fail(409, t("กิจกรรมนี้ไม่ได้เผยแพร่อยู่", "This event isn't published"));

    let reg: typeof registrations.$inferSelect | undefined;
    let method: "scan" | "manual";
    if (token) {
      method = "scan";
      if (token.length > 200) return fail(400, t("บัตรไม่ถูกต้อง", "Invalid pass"));
      [reg] = await db
        .select()
        .from(registrations)
        .where(and(eq(registrations.eventId, e.id), eq(registrations.passToken, token)))
        .limit(1);
      if (!reg) return fail(404, t("ไม่พบบัตรนี้ในกิจกรรมนี้", "This pass isn't for this event"));
    } else if (/^[A-Z0-9_-]{6}$/.test(code)) {
      method = "manual";
      const found = await db
        .select()
        .from(registrations)
        .where(
          and(
            eq(registrations.eventId, e.id),
            eq(registrations.status, "confirmed"),
            sql`upper(left(${registrations.passToken}, 6)) = ${code}`,
          ),
        )
        .limit(2);
      if (found.length === 0) return fail(404, t("ไม่พบรหัสนี้ในกิจกรรมนี้", "No confirmed attendee has this code"));
      if (found.length > 1) return fail(409, t("รหัสนี้ตรงกับมากกว่า 1 คน สแกน QR แทนนะ", "This code matches more than one person. Please scan the QR instead"));
      reg = found[0];
    } else {
      return fail(400, t("ใส่รหัส 6 ตัวหรือสแกน QR", "Enter the 6-character code or scan the QR"));
    }

    // A 💘 event's host checks people in by seat code: the name never reaches the station.
    const [prof] = rosterAccess(a, e) === "codes" ? [] : await db.select({ nickname: profiles.nickname }).from(profiles).where(eq(profiles.accountId, reg.accountId)).limit(1);
    const nickname = rosterAccess(a, e) === "codes" ? seatLabel(t, seatCode(reg.passToken)) : (prof?.nickname ?? "");

    if (reg.status !== "confirmed") return fail(409, t(`${nickname} ยังไม่ได้ยืนยันที่นั่ง`, `${nickname} doesn't have a confirmed seat`));

    if (reg.checkedInAt) {
      const msg = t(`${nickname} เช็กอินแล้ว`, `${nickname} is already checked in`);
      if (json) return c.json({ ok: true, already: true, message: msg, nickname, groupNo: reg.groupNo, checkedIn: await checkedInCount(db, e.id) });
      return c.redirect(`${BASE}/${e.id}/checkin?notice=checked_in`);
    }

    const now = new Date();
    if (!checkInOpen(e.startsAt, now) && !override) {
      return fail(403, t("อยู่นอกช่วงเวลาเช็กอิน", "Outside the check-in window"));
    }

    // Late arrival after groups are out: smallest group, ties → lowest number,
    // never a group with someone they blocked or who blocked them (PRD §8.1).
    // If every group has one, they stay ungrouped and staff seat them by hand.
    let groupNo: number | null = null;
    if (e.groupsPublishedAt) {
      const [seated, blockRows] = await Promise.all([
        checkedInRegistrations(db, e.id).then((rows) => rows.filter((r) => r.groupNo != null)),
        db
          .select({ blocker: blocks.blocker, blocked: blocks.blocked })
          .from(blocks)
          .where(or(eq(blocks.blocker, reg.accountId), eq(blocks.blocked, reg.accountId)))
          .limit(1000),
      ]);
      const avoid = new Set(blockRows.map((b) => (b.blocker === reg!.accountId ? b.blocked : b.blocker)));
      const groups = new Map<number, { n: number; clash: boolean }>();
      for (const row of seated) {
        const g = groups.get(Number(row.groupNo)) ?? { n: 0, clash: false };
        g.n += 1;
        if (avoid.has(row.accountId)) g.clash = true;
        groups.set(Number(row.groupNo), g);
      }
      const best = [...groups]
        .filter(([, g]) => !g.clash)
        .sort(([ga, a], [gb, b]) => a.n - b.n || ga - gb)[0];
      groupNo = best ? best[0] : null;
    }

    const queries: Parameters<typeof batch>[1] = [
      db
        .update(registrations)
        .set({ checkedInAt: now, checkedInBy: a.id, checkInMethod: method, ...(groupNo !== null ? { groupNo } : {}) })
        .where(and(eq(registrations.id, reg.id), isNull(registrations.checkedInAt))),
      audit(db, a.id, "event.checkin", { type: "registration", id: reg.id }, { eventId: e.id, method, override: override && !checkInOpen(e.startsAt, now), groupNo }),
    ];
    if (groupNo !== null) {
      queries.push(notify(db, reg.accountId, "group", `คุณนั่งโต๊ะ ${groupNo}`, `You're in group ${groupNo}`, `/events/${e.id}`));
    }
    await batch(c.env, queries);

    const msg = t(`เช็กอิน ${nickname} แล้ว`, `${nickname} checked in`) + (groupNo !== null ? t(` · โต๊ะ ${groupNo}`, ` · group ${groupNo}`) : "");
    if (json) return c.json({ ok: true, already: false, message: msg, nickname, groupNo, checkedIn: await checkedInCount(db, e.id) });
    return c.redirect(`${BASE}/${e.id}/checkin?notice=checked_in`);
  }, { roster: true }),
);

