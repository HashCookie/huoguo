import axios, { AxiosInstance } from 'axios';
import nodemailer from 'nodemailer';

// ─── 环境变量 ───────────────────────────────────────────────
const ACCOUNT = process.env.BOOK_ACCOUNT!;
const PASSWORD = process.env.BOOK_PASSWORD!;
const NUM = Number(process.env.BOOK_NUM ?? '2');
const STORE_ID = Number(process.env.BOOK_STORE_ID ?? '19');
const ARRIVAL_TIME = process.env.BOOK_ARRIVAL ?? '18:00'; // 预计到店时间，如 "18:30"
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL;
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT ?? '465');
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

const BASE_URL = 'https://xcx.zhufuguihuoguo.com';
const POLL_INTERVAL_MS = 2 * 60 * 1000; // 2 分钟
const MAX_RUNTIME_MS = 5 * 60 * 60 * 1000; // 5 小时
const NOTIFY_THRESHOLD = 20; // 前面 ≤20 桌时通知
const AHEAD_BUFFER = 5; // 提前 5 桌的余量，确保到了不会过号

// ─── 工具函数 ───────────────────────────────────────────────
function now() {
  return new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** 解析 "18:30" → 今天北京时间的 Date 对象 */
function parseArrivalTime(timeStr: string): Date {
  const [h, m] = timeStr.split(':').map(Number);
  // 用 UTC+8 构造今天的目标时间
  const nowDate = new Date();
  const bjNow = new Date(nowDate.getTime() + 8 * 3600 * 1000);
  const bjTarget = new Date(bjNow);
  bjTarget.setUTCHours(h, m, 0, 0);
  // 转回 UTC
  return new Date(bjTarget.getTime() - 8 * 3600 * 1000);
}

/** 返回距离到店还有多少分钟 */
function minutesUntilArrival(arrivalDate: Date): number {
  return Math.max(0, (arrivalDate.getTime() - Date.now()) / 60000);
}

// ─── 登录 ───────────────────────────────────────────────────
async function login(): Promise<AxiosInstance> {
  console.log(`[${now()}] 🔐 开始登录...`);

  const ua =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';

  const loginPageRes = await axios.get(`${BASE_URL}/index/user/login.html`, {
    headers: { 'User-Agent': ua },
    timeout: 15000,
  });

  const csrfMatch = String(loginPageRes.data).match(
    /name="__token__"\s+value="([^"]+)"/
  );
  if (!csrfMatch?.[1]) {
    const altMatch = String(loginPageRes.data).match(/__token__.*?value="([^"]+)"/);
    if (!altMatch?.[1]) throw new Error('无法获取 CSRF token');
  }
  const csrfToken = csrfMatch?.[1] ?? String(loginPageRes.data).match(/__token__.*?value="([^"]+)"/)?.[1]!;

  const cookies: string[] = [];
  if (loginPageRes.headers['set-cookie']) {
    for (const c of loginPageRes.headers['set-cookie']) cookies.push(c.split(';')[0]);
  }

  const loginRes = await axios.post(
    `${BASE_URL}/index/user/login.html`,
    new URLSearchParams({
      account: ACCOUNT,
      password: PASSWORD,
      keeplogin: '1',
      __token__: csrfToken,
    }).toString(),
    {
      headers: {
        'User-Agent': ua,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        Cookie: cookies.join('; '),
        Referer: `${BASE_URL}/index/user/login.html`,
      },
      timeout: 15000,
      maxRedirects: 0,
      validateStatus: s => s < 400,
    }
  );

  if (loginRes.data.code !== 1) {
    throw new Error(`登录失败: ${loginRes.data.msg ?? JSON.stringify(loginRes.data)}`);
  }

  if (loginRes.headers['set-cookie']) {
    for (const c of loginRes.headers['set-cookie']) cookies.push(c.split(';')[0]);
  }

  const token = cookies.find(c => c.startsWith('token='))?.split('=')[1];
  if (!token) throw new Error('登录失败：未找到 token cookie');

  console.log(`[${now()}] ✅ 登录成功，token: ${token.substring(0, 8)}...`);

  return axios.create({
    baseURL: BASE_URL,
    timeout: 15000,
    headers: { 'Content-Type': 'application/json', 'User-Agent': ua, token },
  });
}

// ─── 查询当前排队情况（公开接口，不需要取号） ──────────────
interface QueueStatus {
  currentSn: number; // 当前叫到的号码数字
  waitingCount: number; // 当前等待桌数
  timestamp: number;
}

async function fetchQueueStatus(): Promise<QueueStatus> {
  const res = await axios.post(
    `${BASE_URL}/api/item/lists`,
    { search: '禹悦汇' },
    { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
  );

  if (res.data.code !== 1) {
    throw new Error(`查询排队失败: ${res.data.msg}`);
  }

  const store = res.data.data.find((s: any) => s.id === STORE_ID);
  if (!store) throw new Error('未找到目标门店');

  // 根据人数找到对应桌型
  const tableType = store.all_lineup?.find((q: any) => {
    if (NUM <= 2) return q.type === 'A';
    if (NUM <= 4) return q.type === 'B';
    if (NUM <= 6) return q.type === 'C';
    return q.type === 'F';
  });

  return {
    currentSn: tableType?.current_sn ?? 0,
    waitingCount: tableType?.num ?? store.lineup ?? 0,
    timestamp: Date.now(),
  };
}

// ─── 估算排队消化速度 ──────────────────────────────────────
/** 通过两次采样估算每分钟消化几桌 */
async function estimateRate(): Promise<number> {
  console.log(`[${now()}] 📈 开始估算排队消化速度...`);

  const sample1 = await fetchQueueStatus();
  console.log(`[${now()}]   第1次采样: 当前叫号=${sample1.currentSn}, 等待=${sample1.waitingCount}桌`);

  // 等 5 分钟再采样
  await sleep(5 * 60 * 1000);

  const sample2 = await fetchQueueStatus();
  console.log(`[${now()}]   第2次采样: 当前叫号=${sample2.currentSn}, 等待=${sample2.waitingCount}桌`);

  const elapsed = (sample2.timestamp - sample1.timestamp) / 60000;
  const consumed = sample2.currentSn - sample1.currentSn;

  if (consumed <= 0 || elapsed <= 0) {
    // 没有消化或数据异常，用默认值：每分钟 0.5 桌（即每桌 2 分钟）
    console.log(`[${now()}]   无法估算速度，使用默认值: 0.5 桌/分钟`);
    return 0.5;
  }

  const rate = consumed / elapsed;
  console.log(`[${now()}]   消化速度: ${rate.toFixed(2)} 桌/分钟（${elapsed.toFixed(0)}分钟内消化了${consumed}桌）`);
  return rate;
}

// ─── 取号 ───────────────────────────────────────────────────
interface BookResult {
  sn_text: string;
  sn: string;
  record_id: string;
}

async function takeNumber(api: AxiosInstance): Promise<BookResult> {
  console.log(`[${now()}] 🎫 取号中（${NUM}人，门店=${STORE_ID}）...`);

  const res = await api.post('/addons/lineup/user/getsn', {
    item_id: STORE_ID,
    num: NUM,
  });

  if (res.data.code !== 1) {
    throw new Error(`取号失败: ${res.data.msg ?? JSON.stringify(res.data)}`);
  }

  const data = res.data.data;
  const snText = data.sn_text ?? `${data.prefixcode}${data.sn}`;
  const recordId = String(data.id);

  console.log(`[${now()}] ✅ 取号成功！号码: ${snText}，记录ID: ${recordId}`);
  return { sn_text: snText, sn: data.sn, record_id: recordId };
}

async function takeNumberWithRetry(api: AxiosInstance): Promise<BookResult> {
  const maxRetryMs = 15 * 60 * 1000;
  const retryInterval = 15 * 1000;
  const deadline = Date.now() + maxRetryMs;

  while (Date.now() < deadline) {
    try {
      return await takeNumber(api);
    } catch (err: any) {
      const remaining = Math.round((deadline - Date.now()) / 1000);
      console.log(`[${now()}] ⏳ 取号未成功（${err.message}），剩余 ${remaining}s 继续重试...`);
      await sleep(retryInterval);
    }
  }
  throw new Error('取号超时：超过 15 分钟仍未取号成功');
}

// ─── 查询排队进度（已取号后） ────────────────────────────────
interface QueueProgress {
  sn: string;
  current_sn: string;
  wait_num: number;
  status_text: string;
}

async function checkProgress(api: AxiosInstance, recordId: string): Promise<QueueProgress> {
  const res = await api.post('/api/item/user_record', { record_id: recordId });

  if (res.data.code !== 1) {
    throw new Error(`查询排队进度失败: ${res.data.msg ?? JSON.stringify(res.data)}`);
  }

  const record = res.data.data?.user_record ?? res.data.data;
  const nowSn = record.now?.sn ? `${record.now.prefixcode ?? ''}${record.now.sn}` : '';
  const mySn = Number(record.sn) || 0;
  const currentSn = Number(record.now?.sn) || 0;
  const waitNum = mySn > currentSn ? mySn - currentSn : 0;

  return {
    sn: record.sn_text ?? `${record.prefixcode ?? ''}${record.sn ?? ''}`,
    current_sn: nowSn,
    wait_num: waitNum,
    status_text: record.status_text ?? '',
  };
}

// ─── 邮件通知 ───────────────────────────────────────────────
let emailSent = false;

async function sendNotification(progress: QueueProgress) {
  if (emailSent) return;
  if (!NOTIFY_EMAIL || !SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.log(`[${now()}] ⚠️ 邮件配置不完整，跳过通知`);
    return;
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  const estimatedMinutes = progress.wait_num * 2;

  await transporter.sendMail({
    from: `"朱富贵取号助手" <${SMTP_USER}>`,
    to: NOTIFY_EMAIL,
    subject: `🔥 快到你了！排队号 ${progress.sn}，前面还有 ${progress.wait_num} 桌`,
    html: `
      <h2>朱富贵火锅 - 排队通知</h2>
      <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;">
        <tr><td><strong>你的号码</strong></td><td>${progress.sn}</td></tr>
        <tr><td><strong>当前叫到</strong></td><td>${progress.current_sn}</td></tr>
        <tr><td><strong>前面还有</strong></td><td>${progress.wait_num} 桌</td></tr>
        <tr><td><strong>预计等待</strong></td><td>约 ${estimatedMinutes} 分钟</td></tr>
        <tr><td><strong>查询时间</strong></td><td>${now()}</td></tr>
      </table>
      <p style="color:#888;margin-top:16px;">此邮件由自动取号系统发送</p>
    `,
  });

  emailSent = true;
  console.log(`[${now()}] 📧 通知邮件已发送至 ${NOTIFY_EMAIL}`);
}

async function sendQueueTooLongNotification(waitingCount: number, estimatedMins: number) {
  if (!NOTIFY_EMAIL || !SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.log(`[${now()}] ⚠️ 邮件配置不完整，跳过通知`);
    return;
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  const waitHours = (estimatedMins / 60).toFixed(1);

  await transporter.sendMail({
    from: `"朱富贵取号助手" <${SMTP_USER}>`,
    to: NOTIFY_EMAIL,
    subject: `😮‍💨 今天排队太长，不建议去（${waitingCount}桌，约${waitHours}小时）`,
    html: `
      <h2>朱富贵火锅 - 排队提醒</h2>
      <p>你计划 <strong>${ARRIVAL_TIME}</strong> 到店（${NUM}人），但当前排队情况不乐观：</p>
      <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;">
        <tr><td><strong>当前等待</strong></td><td>${waitingCount} 桌</td></tr>
        <tr><td><strong>预计排队时间</strong></td><td>约 ${waitHours} 小时</td></tr>
        <tr><td><strong>查询时间</strong></td><td>${now()}</td></tr>
      </table>
      <p><strong>已放弃取号</strong>，建议改天或换个时间段再去。</p>
      <p style="color:#888;margin-top:16px;">此邮件由自动取号系统发送</p>
    `,
  });

  console.log(`[${now()}] 📧 "排队太长"通知已发送至 ${NOTIFY_EMAIL}`);
}

// ─── 主流程 ─────────────────────────────────────────────────
async function main() {
  const arrivalDate = parseArrivalTime(ARRIVAL_TIME);
  const minsUntil = minutesUntilArrival(arrivalDate);

  console.log('='.repeat(50));
  console.log(`[${now()}] 🚀 朱富贵自动取号系统启动`);
  console.log(`  人数: ${NUM}  门店ID: ${STORE_ID}`);
  console.log(`  预计到店: ${ARRIVAL_TIME}（${Math.round(minsUntil)} 分钟后）`);
  console.log('='.repeat(50));

  if (!ACCOUNT || !PASSWORD) {
    throw new Error('缺少环境变量 BOOK_ACCOUNT 或 BOOK_PASSWORD');
  }

  if (minsUntil <= 0) {
    throw new Error(`到店时间 ${ARRIVAL_TIME} 已过，请重新设置`);
  }

  const startTime = Date.now();

  // 1. 登录
  const api = await login();

  // 2. 估算排队消化速度
  const rate = await estimateRate(); // 桌/分钟

  // 3. 等待合适时机取号
  console.log(`\n[${now()}] ⏰ 等待最佳取号时机...\n`);

  let booked = false;
  let booking: BookResult | null = null;

  while (true) {
    const minsLeft = minutesUntilArrival(arrivalDate);

    try {
      const status = await fetchQueueStatus();
      const estimatedWaitMins = status.waitingCount / rate;

      console.log(
        `[${now()}] 📊 当前等待=${status.waitingCount}桌 | ` +
        `预计消化=${Math.round(estimatedWaitMins)}分钟 | ` +
        `距到店=${Math.round(minsLeft)}分钟`
      );

      // 判断：到店前能不能轮到？
      // 如果现在取号，前面 waitingCount 桌，需要 estimatedWaitMins 分钟
      // 但你只有 minsLeft 分钟就到了
      if (estimatedWaitMins <= minsLeft + AHEAD_BUFFER / rate) {
        console.log(`[${now()}] 🎯 时机到了！现在取号，预计到店时差不多轮到`);
        booked = true;
        break;
      }

      // 快到店了但排队还是太长 → 放弃，不取号
      if (minsLeft <= 10) {
        const waitHours = (estimatedWaitMins / 60).toFixed(1);
        console.log(`[${now()}] ❌ 距到店仅 ${Math.round(minsLeft)} 分钟，但前面还有 ${status.waitingCount} 桌（预计需 ${waitHours} 小时）`);
        console.log(`[${now()}] 🚫 排队太长，到店前轮不到，放弃取号`);
        await sendQueueTooLongNotification(status.waitingCount, estimatedWaitMins);
        return;
      }
    } catch (err: any) {
      console.error(`[${now()}] ❌ 查询失败: ${err.message}`);

      // 查询失败 + 快到店了，也不盲目取号
      if (minsLeft <= 10) {
        console.log(`[${now()}] 🚫 无法判断排队情况，放弃取号`);
        return;
      }
    }

    const checkInterval = minsLeft > 60 ? 5 * 60 * 1000 : 2 * 60 * 1000;
    await sleep(checkInterval);

    if (Date.now() - startTime > MAX_RUNTIME_MS) {
      throw new Error('已达最大运行时间，自动退出');
    }
  }

  // 4. 取号（只有判断排得到才会到这里）
  booking = await takeNumberWithRetry(api);

  // 5. 轮询排队进度
  console.log(`\n[${now()}] 📊 开始轮询排队进度（每 2 分钟一次）...\n`);

  while (Date.now() - startTime < MAX_RUNTIME_MS) {
    try {
      const progress = await checkProgress(api, booking.record_id);

      console.log(
        `[${now()}] 📋 号码=${progress.sn} | 当前叫号=${progress.current_sn} | 前面=${progress.wait_num}桌 | 状态=${progress.status_text}`
      );

      if (progress.status_text.includes('叫号') || progress.status_text.includes('过号')) {
        console.log(`[${now()}] 🎉 状态变更: ${progress.status_text}，结束轮询`);
        await sendNotification(progress);
        return;
      }

      if (progress.wait_num <= NOTIFY_THRESHOLD) {
        await sendNotification(progress);
      }
    } catch (err: any) {
      console.error(`[${now()}] ❌ 查询失败: ${err.message}`);
    }

    await sleep(POLL_INTERVAL_MS);
  }

  console.log(`[${now()}] ⏰ 已达到最大运行时间，自动退出`);
}

main().catch(err => {
  console.error(`[${now()}] 💥 致命错误:`, err.message);
  process.exit(1);
});
