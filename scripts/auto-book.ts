import axios, { AxiosInstance } from 'axios';
import nodemailer from 'nodemailer';

// ─── 环境变量 ───────────────────────────────────────────────
const ACCOUNTS: { account: string; password: string }[] = JSON.parse(
  process.env.BOOK_ACCOUNTS ?? '[]'
);
const NUM = Number(process.env.BOOK_NUM ?? '2');
const STORE_ID = Number(process.env.BOOK_STORE_ID ?? '19');
const EAT_TIME = process.env.BOOK_EAT_TIME ?? '19:30'; // 想吃到的时间
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL;
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT ?? '465');
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

const BASE_URL = 'https://xcx.zhufuguihuoguo.com';
const MAX_RUNTIME_MS = 5 * 60 * 60 * 1000;

// 历史数据：各时段消化速度（桌/分钟）
const HISTORICAL_RATES: Record<number, number> = {
  17: 8.9,
  18: 8.8,
  19: 10.2,
  20: 18.3,
  21: 30.8,
};

// ─── 工具函数 ───────────────────────────────────────────────
function now() {
  return new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** 获取北京时间当前小时 */
function bjHour(): number {
  return new Date(Date.now() + 8 * 3600 * 1000).getUTCHours();
}

/** 获取当前时段的历史消化速度 */
function getHistoricalRate(): number {
  return HISTORICAL_RATES[bjHour()] ?? 10;
}

/** 解析 "19:30" → 今天北京时间的 Date 对象 */
function parseTime(timeStr: string): Date {
  const [h, m] = timeStr.split(':').map(Number);
  const bjNow = new Date(Date.now() + 8 * 3600 * 1000);
  const bjTarget = new Date(bjNow);
  bjTarget.setUTCHours(h, m, 0, 0);
  return new Date(bjTarget.getTime() - 8 * 3600 * 1000);
}

function minutesUntil(date: Date): number {
  return (date.getTime() - Date.now()) / 60000;
}

// ─── 登录 ───────────────────────────────────────────────────
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';

async function login(account: string, password: string): Promise<AxiosInstance> {
  const loginPageRes = await axios.get(`${BASE_URL}/index/user/login.html`, {
    headers: { 'User-Agent': UA },
    timeout: 15000,
  });

  const html = String(loginPageRes.data);
  const csrfMatch =
    html.match(/name="__token__"\s+value="([^"]+)"/) ??
    html.match(/__token__.*?value="([^"]+)"/);
  if (!csrfMatch?.[1]) throw new Error(`账号 ${account}: 无法获取 CSRF token`);

  const cookies: string[] = [];
  if (loginPageRes.headers['set-cookie']) {
    for (const c of loginPageRes.headers['set-cookie']) cookies.push(c.split(';')[0]);
  }

  const loginRes = await axios.post(
    `${BASE_URL}/index/user/login.html`,
    new URLSearchParams({
      account,
      password,
      keeplogin: '1',
      __token__: csrfMatch[1],
    }).toString(),
    {
      headers: {
        'User-Agent': UA,
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
    throw new Error(`账号 ${account} 登录失败: ${loginRes.data.msg}`);
  }

  if (loginRes.headers['set-cookie']) {
    for (const c of loginRes.headers['set-cookie']) cookies.push(c.split(';')[0]);
  }

  const token = cookies.find(c => c.startsWith('token='))?.split('=')[1];
  if (!token) throw new Error(`账号 ${account}: 未找到 token`);

  return axios.create({
    baseURL: BASE_URL,
    timeout: 15000,
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA, token },
  });
}

// ─── 查询当前排队情况（公开接口） ──────────────────────────
interface QueueStatus {
  currentSn: number;
  waitingCount: number;
  timestamp: number;
}

async function fetchQueueStatus(): Promise<QueueStatus> {
  const res = await axios.post(
    `${BASE_URL}/api/item/lists`,
    { search: '禹悦汇' },
    { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
  );

  if (res.data.code !== 1) throw new Error(`查询排队失败: ${res.data.msg}`);

  const store = res.data.data.find((s: any) => s.id === STORE_ID);
  if (!store) throw new Error('未找到目标门店');

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

// ─── 实时速度追踪 ──────────────────────────────────────────
let lastSample: QueueStatus | null = null;
let currentRate = getHistoricalRate(); // 用历史数据作为初始值

async function sampleAndUpdateRate(): Promise<QueueStatus> {
  const sample = await fetchQueueStatus();

  if (lastSample) {
    const elapsed = (sample.timestamp - lastSample.timestamp) / 60000;
    const consumed = sample.currentSn - lastSample.currentSn;

    if (consumed > 0 && elapsed > 0.5) {
      const newRate = consumed / elapsed;
      currentRate = newRate * 0.7 + currentRate * 0.3;
    }
  }

  lastSample = sample;
  return sample;
}

// ─── 取号 & 取消 ────────────────────────────────────────────
interface Ticket {
  label: string; // 如 "账号1"
  account: string;
  api: AxiosInstance;
  sn_text: string; // 如 "B350"
  sn: number;
  record_id: string;
  targetTime: Date; // 目标叫号时间
}

async function takeNumber(api: AxiosInstance): Promise<{ sn_text: string; sn: number; record_id: string }> {
  const res = await api.post('/addons/lineup/user/getsn', {
    item_id: STORE_ID,
    num: NUM,
  });

  if (res.data.code !== 1) {
    throw new Error(`取号失败: ${res.data.msg ?? JSON.stringify(res.data)}`);
  }

  const data = res.data.data;
  return {
    sn_text: data.sn_text ?? `${data.prefixcode}${data.sn}`,
    sn: Number(data.sn),
    record_id: String(data.id),
  };
}

// ─── 查询排队进度 ───────────────────────────────────────────
interface QueueProgress {
  sn: string;
  current_sn: string;
  wait_num: number;
  status_text: string;
}

async function checkProgress(api: AxiosInstance, recordId: string): Promise<QueueProgress> {
  const res = await api.post('/api/item/user_record', { record_id: recordId });

  if (res.data.code !== 1) {
    throw new Error(`查询失败: ${res.data.msg ?? JSON.stringify(res.data)}`);
  }

  const record = res.data.data?.user_record ?? res.data.data;
  const nowSn = record.now?.sn ? `${record.now.prefixcode ?? ''}${record.now.sn}` : '';
  const mySn = Number(record.sn) || 0;
  const curSn = Number(record.now?.sn) || 0;

  return {
    sn: record.sn_text ?? `${record.prefixcode ?? ''}${record.sn ?? ''}`,
    current_sn: nowSn,
    wait_num: mySn > curSn ? mySn - curSn : 0,
    status_text: record.status_text ?? '',
  };
}

// ─── 邮件通知 ───────────────────────────────────────────────
async function sendEmail(subject: string, html: string) {
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

  await transporter.sendMail({
    from: `"朱富贵取号助手" <${SMTP_USER}>`,
    to: NOTIFY_EMAIL,
    subject,
    html,
  });

  console.log(`[${now()}] 📧 邮件已发送至 ${NOTIFY_EMAIL}`);
}

// ─── 主流程 ─────────────────────────────────────────────────
async function main() {
  const eatDate = parseTime(EAT_TIME);
  const minsUntilEat = minutesUntil(eatDate);
  const numAccounts = ACCOUNTS.length;

  console.log('='.repeat(50));
  console.log(`[${now()}] 🚀 朱富贵自动取号系统启动`);
  console.log(`  人数: ${NUM}  门店ID: ${STORE_ID}`);
  console.log(`  想吃到的时间: ${EAT_TIME}（${Math.round(minsUntilEat)} 分钟后）`);
  console.log(`  账号数量: ${numAccounts}`);
  console.log('='.repeat(50));

  if (numAccounts === 0) {
    throw new Error('缺少 BOOK_ACCOUNTS 环境变量');
  }

  if (minsUntilEat <= 0) {
    throw new Error(`吃饭时间 ${EAT_TIME} 已过，请重新设置`);
  }

  const startTime = Date.now();

  // 1. 登录所有账号
  console.log(`\n[${now()}] 🔐 登录 ${numAccounts} 个账号...`);
  const apis: { label: string; account: string; api: AxiosInstance }[] = [];
  for (let i = 0; i < numAccounts; i++) {
    const { account, password } = ACCOUNTS[i];
    const masked = account.slice(0, 3) + '****' + account.slice(-4);
    try {
      const api = await login(account, password);
      apis.push({ label: `账号${i + 1}`, account: masked, api });
      console.log(`[${now()}]   ✅ ${masked} 登录成功`);
    } catch (err: any) {
      console.error(`[${now()}]   ❌ ${masked} 登录失败: ${err.message}`);
    }
  }

  if (apis.length === 0) throw new Error('所有账号登录失败');

  // 2. 监控排队，等待最佳取号时机
  const GAP = 3; // 每个号之间间隔约 3 桌
  console.log(`\n[${now()}] ⏰ 开始监控排队，等待最佳取号时机...`);
  console.log(`  策略: ${apis.length} 个账号，每个号间隔 ~${GAP} 桌\n`);

  const tickets: Ticket[] = [];

  while (true) {
    const status = await sampleAndUpdateRate();
    const minsToEat = minutesUntil(eatDate);
    const estimatedWaitMins = status.waitingCount / currentRate;

    console.log(
      `[${now()}] 📊 等待=${status.waitingCount}桌 | ` +
      `速度=${currentRate.toFixed(1)}桌/分钟 | ` +
      `预计消化=${Math.round(estimatedWaitMins)}分钟 | ` +
      `距吃饭=${Math.round(minsToEat)}分钟`
    );

    // 排队太长，吃饭前排不到 → 放弃
    if (minsToEat <= 10 && estimatedWaitMins > minsToEat * 2) {
      console.log(`[${now()}] 🚫 排队太长（预计 ${Math.round(estimatedWaitMins)} 分钟），放弃取号`);
      await sendEmail(
        `😮‍💨 排队太长，不建议去（${status.waitingCount}桌）`,
        `<h2>朱富贵火锅 - 排队提醒</h2>
         <p>你计划 <strong>${EAT_TIME}</strong> 吃到（${NUM}人），但当前排队 ${status.waitingCount} 桌，预计需 ${(estimatedWaitMins / 60).toFixed(1)} 小时。</p>
         <p><strong>已放弃取号</strong>，建议改天再去。</p>`
      );
      return;
    }

    // 时机判断：预计等待 ≈ 距吃饭时间（双向匹配，不能太早也不能太晚）
    // 允许误差：±5 分钟
    const diff = Math.abs(estimatedWaitMins - minsToEat);
    if (diff <= 5) {
      console.log(`[${now()}] 🎯 时机到了！预计等待=${Math.round(estimatedWaitMins)}分钟 ≈ 距吃饭=${Math.round(minsToEat)}分钟`);
      break;
    }

    // 排队很短但离吃饭还远 → 继续等
    if (estimatedWaitMins < minsToEat - 5) {
      console.log(`[${now()}]   ⏳ 取号太早（${Math.round(estimatedWaitMins)}分钟后就到号，但吃饭在${Math.round(minsToEat)}分钟后），继续等`);
    }

    // 吃饭时间快到了但排队仍较长 → 也取号（至少排上）
    if (minsToEat <= 5) {
      console.log(`[${now()}] ⚡ 距吃饭仅 ${Math.round(minsToEat)} 分钟，立即取号`);
      break;
    }

    // 动态间隔
    const interval =
      currentRate >= 5 ? 30 * 1000 :
      currentRate >= 2 ? 60 * 1000 :
      minsToEat > 60  ? 5 * 60 * 1000 :
                        2 * 60 * 1000;
    await sleep(interval);

    if (Date.now() - startTime > MAX_RUNTIME_MS) {
      throw new Error('已达最大运行时间，自动退出');
    }
  }

  // 3. 依次取号，每个号之间等待 GAP 桌的间隔
  for (let i = 0; i < apis.length; i++) {
    // 第 2 个号开始，等待间隔
    if (i > 0) {
      const waitSec = Math.round((GAP / currentRate) * 60);
      console.log(`[${now()}]   等待 ~${waitSec}秒（约 ${GAP} 桌间隔）...`);
      await sleep(waitSec * 1000);
    }

    try {
      console.log(`[${now()}] 🎫 ${apis[i].label}（${apis[i].account}）取号中...`);
      const result = await takeNumber(apis[i].api);
      tickets.push({
        label: apis[i].label,
        account: apis[i].account,
        api: apis[i].api,
        ...result,
        targetTime: eatDate,
      });
      console.log(`[${now()}]   ✅ 取号成功: ${result.sn_text}`);
    } catch (err: any) {
      console.error(`[${now()}]   ❌ ${apis[i].label} 取号失败: ${err.message}`);
    }
  }

  if (tickets.length === 0) {
    console.log(`[${now()}] ❌ 所有账号都未成功取号，退出`);
    return;
  }

  // 4. 汇总取号结果
  console.log(`\n[${now()}] 📋 取号汇总:`);
  for (const t of tickets) {
    console.log(`  ${t.label}（${t.account}）: ${t.sn_text}`);
  }

  // 5. 轮询所有票的进度，找到最佳的那张
  console.log(`\n[${now()}] 📊 开始轮询所有号码的进度...\n`);

  let bestNotified = false;

  while (Date.now() - startTime < MAX_RUNTIME_MS) {
    let bestTicket: Ticket | null = null;
    let bestWait = Infinity;

    for (const ticket of tickets) {
      try {
        const progress = await checkProgress(ticket.api, ticket.record_id);
        console.log(
          `[${now()}]   ${ticket.label} ${progress.sn}: 当前叫号=${progress.current_sn} | 前面=${progress.wait_num}桌 | ${progress.status_text}`
        );

        // 已叫号 → 直接用这个
        if (progress.status_text.includes('叫号')) {
          console.log(`\n[${now()}] 🎉 ${ticket.label} (${progress.sn}) 已叫号！`);

          await sendEmail(
            `🔥 到你了！${progress.sn} 已叫号`,
            `<h2>朱富贵火锅 - 叫号通知</h2>
             <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;">
               <tr><td><strong>你的号码</strong></td><td>${progress.sn}</td></tr>
               <tr><td><strong>使用账号</strong></td><td>${ticket.account}</td></tr>
               <tr><td><strong>叫号时间</strong></td><td>${now()}</td></tr>
             </table>`
          );
          return;
        }

        if (progress.wait_num < bestWait) {
          bestWait = progress.wait_num;
          bestTicket = ticket;
        }
      } catch (err: any) {
        console.error(`[${now()}]   ❌ ${ticket.label} 查询失败: ${err.message}`);
      }
    }

    if (bestTicket && bestWait <= 20 && !bestNotified) {
      bestNotified = true;
      console.log(`\n[${now()}] 🏆 最佳号码: ${bestTicket.sn_text}（${bestTicket.label}），前面 ${bestWait} 桌`);

      await sendEmail(
        `🔥 快到了！${bestTicket.sn_text}（${bestTicket.label}），前面 ${bestWait} 桌`,
        `<h2>朱富贵火锅 - 排队通知</h2>
         <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;">
           <tr><td><strong>最佳号码</strong></td><td>${bestTicket.sn_text}（${bestTicket.label} ${bestTicket.account}）</td></tr>
           <tr><td><strong>前面还有</strong></td><td>${bestWait} 桌</td></tr>
           <tr><td><strong>预计等待</strong></td><td>约 ${Math.round(bestWait / currentRate)} 分钟</td></tr>
           <tr><td><strong>查询时间</strong></td><td>${now()}</td></tr>
         </table>
         <p>到店后请用 <strong>${bestTicket.account}</strong> 的号入座。</p>`
      );
    }

    console.log('');
    await sleep(2 * 60 * 1000);
  }

  console.log(`[${now()}] ⏰ 已达最大运行时间，自动退出`);
}

main().catch(err => {
  console.error(`[${now()}] 💥 致命错误:`, err.message);
  process.exit(1);
});
