import axios, { AxiosInstance } from 'axios';
import nodemailer from 'nodemailer';

// ─── 环境变量 ───────────────────────────────────────────────
const ACCOUNT = process.env.BOOK_ACCOUNT!;
const PASSWORD = process.env.BOOK_PASSWORD!;
const NUM = Number(process.env.BOOK_NUM ?? '2');
const STORE_ID = Number(process.env.BOOK_STORE_ID ?? '19');
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL;
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT ?? '465');
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

const BASE_URL = 'https://xcx.zhufuguihuoguo.com';
const POLL_INTERVAL_MS = 2 * 60 * 1000; // 2 分钟
const MAX_RUNTIME_MS = 4 * 60 * 60 * 1000; // 4 小时
const NOTIFY_THRESHOLD = 20; // 前面 ≤20 桌时通知

// ─── 工具函数 ───────────────────────────────────────────────
function now() {
  return new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── 登录 ───────────────────────────────────────────────────
async function login(): Promise<AxiosInstance> {
  console.log(`[${now()}] 🔐 开始登录...`);

  const ua =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';

  // 1) GET 登录页获取 CSRF token + PHPSESSID cookie
  const loginPageRes = await axios.get(`${BASE_URL}/index/user/login.html`, {
    headers: { 'User-Agent': ua },
    timeout: 15000,
  });

  // 提取 __token__
  const csrfMatch = String(loginPageRes.data).match(
    /name="__token__"\s+value="([^"]+)"/
  );
  if (!csrfMatch?.[1]) {
    // 尝试备选匹配
    const altMatch = String(loginPageRes.data).match(/__token__.*?value="([^"]+)"/);
    if (!altMatch?.[1]) {
      throw new Error('无法获取 CSRF token');
    }
  }
  const csrfToken = csrfMatch?.[1] ?? String(loginPageRes.data).match(/__token__.*?value="([^"]+)"/)?.[1]!;

  // 收集 PHPSESSID cookie
  const cookies: string[] = [];
  const setCookieHeaders = loginPageRes.headers['set-cookie'];
  if (setCookieHeaders) {
    for (const c of setCookieHeaders) {
      cookies.push(c.split(';')[0]);
    }
  }
  console.log(`[${now()}]   CSRF token 获取成功，cookies: ${cookies.length} 个`);

  // 2) POST 登录（AJAX 方式）
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
      // 需要手动处理 set-cookie，不跟随重定向
      maxRedirects: 0,
      validateStatus: s => s < 400,
    }
  );

  // 检查登录响应
  const loginData = loginRes.data;
  if (loginData.code !== 1) {
    throw new Error(`登录失败: ${loginData.msg ?? JSON.stringify(loginData)}`);
  }
  console.log(`[${now()}]   登录响应: ${loginData.msg}`);

  // 收集登录后的 cookies（包含 token、uid）
  const postCookies = loginRes.headers['set-cookie'];
  if (postCookies) {
    for (const c of postCookies) {
      cookies.push(c.split(';')[0]);
    }
  }

  // 从 cookie 中提取 token（用于 API 请求头）
  const tokenCookie = cookies.find(c => c.startsWith('token='));
  const token = tokenCookie?.split('=')[1];
  if (!token) {
    throw new Error('登录失败：未找到 token cookie');
  }

  console.log(`[${now()}] ✅ 登录成功，token: ${token.substring(0, 8)}...`);

  // 创建带 token 的 API 客户端
  const api = axios.create({
    baseURL: BASE_URL,
    timeout: 15000,
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': ua,
      token: token,
    },
  });

  return api;
}

// ─── 取号 ───────────────────────────────────────────────────
interface BookResult {
  sn_text: string; // 排队号，如 "A865"
  sn: string; // 纯数字号，如 "865"
  record_id: string; // 排队记录 ID，用于后续查询
}

async function takeNumber(api: AxiosInstance): Promise<BookResult> {
  console.log(`[${now()}] 🎫 尝试取号（${NUM}人，门店=${STORE_ID}）...`);

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

/**
 * 循环尝试取号，最多重试 15 分钟（覆盖门店 17:00 才开放的场景）
 */
async function takeNumberWithRetry(api: AxiosInstance): Promise<BookResult> {
  const maxRetryMs = 15 * 60 * 1000;
  const retryInterval = 15 * 1000;
  const deadline = Date.now() + maxRetryMs;

  while (Date.now() < deadline) {
    try {
      return await takeNumber(api);
    } catch (err: any) {
      const remaining = Math.round((deadline - Date.now()) / 1000);
      console.log(
        `[${now()}] ⏳ 取号未成功（${err.message}），剩余 ${remaining}s 继续重试...`
      );
      await sleep(retryInterval);
    }
  }

  throw new Error('取号超时：超过 15 分钟仍未取号成功');
}

// ─── 查询排队进度 ─────────────────────────────────────────
interface QueueProgress {
  sn: string; // 你的号，如 "A865"
  current_sn: string; // 当前叫到的号
  wait_num: number; // 前面还有几桌
  status_text: string; // 状态文字
}

async function checkProgress(
  api: AxiosInstance,
  recordId: string
): Promise<QueueProgress> {
  const res = await api.post('/api/item/user_record', {
    record_id: recordId,
  });

  if (res.data.code !== 1) {
    throw new Error(
      `查询排队进度失败: ${res.data.msg ?? JSON.stringify(res.data)}`
    );
  }

  const record = res.data.data?.user_record ?? res.data.data;
  const nowSn = record.now?.sn
    ? `${record.now.prefixcode ?? ''}${record.now.sn}`
    : '';

  // 计算前面桌数：用号码差值估算
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

  const estimatedMinutes = progress.wait_num * 5;

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

// ─── 主流程 ─────────────────────────────────────────────────
async function main() {
  console.log('='.repeat(50));
  console.log(`[${now()}] 🚀 朱富贵自动取号系统启动`);
  console.log(`  人数: ${NUM}  门店ID: ${STORE_ID}`);
  console.log('='.repeat(50));

  if (!ACCOUNT || !PASSWORD) {
    throw new Error('缺少环境变量 BOOK_ACCOUNT 或 BOOK_PASSWORD');
  }

  const startTime = Date.now();

  // 1. 登录
  const api = await login();

  // 2. 取号（带重试）
  const booking = await takeNumberWithRetry(api);

  // 3. 轮询排队进度
  console.log(
    `\n[${now()}] 📊 开始轮询排队进度（每 2 分钟一次，最多 4 小时）...\n`
  );

  while (Date.now() - startTime < MAX_RUNTIME_MS) {
    try {
      const progress = await checkProgress(api, booking.record_id);

      console.log(
        `[${now()}] 📋 号码=${progress.sn} | 当前叫号=${progress.current_sn} | 前面=${progress.wait_num}桌 | 状态=${progress.status_text}`
      );

      // 已叫号或状态变化 → 发通知
      if (
        progress.status_text.includes('叫号') ||
        progress.status_text.includes('过号')
      ) {
        console.log(
          `[${now()}] 🎉 状态变更: ${progress.status_text}，结束轮询`
        );
        await sendNotification(progress);
        return;
      }

      // 前面 ≤ 阈值 → 发通知
      if (progress.wait_num <= NOTIFY_THRESHOLD) {
        await sendNotification(progress);
      }
    } catch (err: any) {
      console.error(`[${now()}] ❌ 查询失败: ${err.message}`);
    }

    await sleep(POLL_INTERVAL_MS);
  }

  console.log(`[${now()}] ⏰ 已达到最大运行时间（4小时），自动退出`);
}

main().catch(err => {
  console.error(`[${now()}] 💥 致命错误:`, err.message);
  process.exit(1);
});
