import axios from 'axios';
import cfonts from 'cfonts';
import gradient from 'gradient-string';
import chalk from 'chalk';
import fs from 'fs/promises';
import readline from 'readline';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import ProgressBar from 'progress';
import ora from 'ora';
import boxen from 'boxen';

const logger = {
  info: (msg, options = {}) => {
    const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const emoji = options.emoji || 'ℹ️  ';
    const context = options.context ? `[${options.context}] ` : '';
    const level = chalk.green('INFO'); 
    const formattedMsg = `[ ${chalk.gray(timestamp)} ] ${emoji}${level} ${chalk.white(context.padEnd(20))}${chalk.white(msg)}`;
    console.log(formattedMsg);
  },
  warn: (msg, options = {}) => {
    const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const emoji = options.emoji || '⚠️ ';
    const context = options.context ? `[${options.context}] ` : '';
    const level = chalk.yellow('WARN');
    const formattedMsg = `[ ${chalk.gray(timestamp)} ] ${emoji}${level} ${chalk.white(context.padEnd(20))}${chalk.white(msg)}`;
    console.log(formattedMsg);
  },
  error: (msg, options = {}) => {
    const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const emoji = options.emoji || '❌ ';
    const context = options.context ? `[${options.context}] ` : '';
    const level = chalk.red('ERROR');
    const formattedMsg = `[ ${chalk.gray(timestamp)} ] ${emoji}${level} ${chalk.white(context.padEnd(20))}${chalk.white(msg)}`;
    console.log(formattedMsg);
  },
  debug: (msg, options = {}) => {
    const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const emoji = options.emoji || '🔍  ';
    const context = options.context ? `[${options.context}] ` : '';
    const level = chalk.blue('DEBUG');
    const formattedMsg = `[ ${chalk.gray(timestamp)} ] ${emoji}${level} ${chalk.white(context.padEnd(20))}${chalk.white(msg)}`;
    console.log(formattedMsg);
  }
};

function delay(seconds) {
  return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

function stripAnsi(str) {
  return str.replace(/\x1B\[[0-9;]*m/g, '');
}

function centerText(text, width) {
  const cleanText = stripAnsi(text);
  const textLength = cleanText.length;
  const totalPadding = Math.max(0, width - textLength);
  const leftPadding = Math.floor(totalPadding / 2);
  const rightPadding = totalPadding - leftPadding;
  return `${' '.repeat(leftPadding)}${text}${' '.repeat(rightPadding)}`;
}

function printHeader(title) {
  const width = 80;
  console.log(gradient.morning(`┬${'─'.repeat(width - 2)}┬`));
  console.log(gradient.morning(`│ ${title.padEnd(width - 4)} │`));
  console.log(gradient.morning(`┴${'─'.repeat(width - 2)}┴`));
}

function printInfo(label, value, context) {
  logger.info(`${label.padEnd(15)}: ${chalk.cyan(value)}`, { emoji: '📍 ', context });
}

async function formatTaskTable(tasks, context) {
  console.log('\n');
  logger.info('Task List:', { context, emoji: '📋 ' });
  console.log('\n');

  const spinner = ora('Rendering tasks...').start();
  await new Promise(resolve => setTimeout(resolve, 1000));
  spinner.stop();

  const header = chalk.cyanBright('+----------------------+----------+-------+---------+\n| Task Name            | Category | Point | Status  |\n+----------------------+----------+-------+---------+');
  const rows = tasks.map(task => {
    const displayName = task.description && typeof task.description === 'string'
      ? (task.description.length > 20 ? task.description.slice(0, 17) + '...' : task.description)
      : 'Unknown Task';
    const status = task.status === 'completed' ? chalk.greenBright('Complte') : chalk.yellowBright('Pending');
    return `| ${displayName.padEnd(20)} | ${((task.category || 'N/A') + '     ').slice(0, 8)} | ${((task.points || 0).toString() + '    ').slice(0, 5)} | ${status.padEnd(6)} |`;
  }).join('\n');
  const footer = chalk.cyanBright('+----------------------+----------+-------+---------+');

  console.log(header + '\n' + rows + '\n' + footer);
  console.log('\n');
}

const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/105.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/102.0'
];

function getRandomUserAgent() {
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

function getGlobalHeaders(token) {
  return {
    'accept': 'application/json',
    'authorization': `Bearer ${token}`,
    'cache-control': 'no-cache',
    'origin': 'https://astpoint.asterai.xyz',
    'referer': 'https://astpoint.asterai.xyz/',
    'user-agent': getRandomUserAgent()
  };
}

function getStandardHeaders() {
  return {
    'User-Agent': getRandomUserAgent(),
    'Accept': 'application/json'
  };
}

function getAxiosConfig(proxy, token = null, useGlobalHeaders = true) {
  const config = {
    headers: useGlobalHeaders ? getGlobalHeaders(token) : getStandardHeaders(),
    timeout: 60000
  };
  if (proxy) {
    config.httpsAgent = newAgent(proxy);
    config.proxy = false;
  }
  return config;
}

function newAgent(proxy) {
  if (proxy.startsWith('http://') || proxy.startsWith('https://')) {
    return new HttpsProxyAgent(proxy);
  } else if (proxy.startsWith('socks4://') || proxy.startsWith('socks5://')) {
    return new SocksProxyAgent(proxy);
  } else {
    logger.warn(`Unsupported proxy: ${proxy}`);
    return null;
  }
}

async function requestWithRetry(method, url, payload = null, config = {}, retries = 3, backoff = 2000, context) {
  for (let i = 0; i < retries; i++) {
    try {
      let response;
      if (method.toLowerCase() === 'get') {
        response = await axios.get(url, config);
      } else if (method.toLowerCase() === 'post') {
        response = await axios.post(url, payload, config);
      } else {
        throw new Error(`Method ${method} not supported`);
      }
      return response.data;
    } catch (error) {
      if (i < retries - 1) {
        logger.warn(`Retrying ${method.toUpperCase()} ${url} (${i + 1}/${retries})`, { emoji: '🔄', context });
        await delay(backoff / 1000);
        backoff *= 1.5;
        continue;
      }
      throw error;
    }
  }
}

async function readTokens() {
  try {
    const data = await fs.readFile('token.txt', 'utf-8');
    const tokens = data.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    logger.info(`Loaded ${tokens.length} token${tokens.length === 1 ? '' : 's'}`, { emoji: '📄 ' });
    return tokens;
  } catch (error) {
    logger.error(`Failed to read token.txt: ${error.message}`, { emoji: '❌ ' });
    return [];
  }
}

async function readProxies() {
  try {
    const data = await fs.readFile('proxy.txt', 'utf-8');
    const proxies = data.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    if (proxies.length === 0) {
      logger.warn('No proxies found. Proceeding without proxy.', { emoji: '⚠️ ' });
    } else {
      logger.info(`Loaded ${proxies.length} prox${proxies.length === 1 ? 'y' : 'ies'}`, { emoji: '🌐 ' });
    }
    return proxies;
  } catch (error) {
    logger.warn('proxy.txt not found.', { emoji: '⚠️ ' });
    return [];
  }
}

async function getPublicIP(proxy, context) {
  try {
    const response = await requestWithRetry('get', 'https://api.ipify.org?format=json', null, getAxiosConfig(proxy, null, false), 3, 2000, context);
    return response.ip || 'Unknown';
  } catch (error) {
    logger.error(`Failed to get IP: ${error.message}`, { emoji: '❌ ', context });
    return 'Error retrieving IP';
  }
}

async function fetchUserInfo(token, proxy, context) {
  const spinner = ora({ text: 'Fetching user info...', spinner: 'dots' }).start();
  try {
    const response = await requestWithRetry('get', 'https://api.nexyai.io/client/user', null, getAxiosConfig(proxy, token), 3, 2000, context);
    const data = response.data;
    if (!data || !data.metadata || !data.metadata.name || !data.agent_address) {
      throw new Error('Incomplete user data');
    }
    spinner.succeed(chalk.bold.greenBright(` Fetched user: ${data.metadata.name}`));
    return { username: data.metadata.name, agentAddress: data.agent_address };
  } catch (error) {
    spinner.fail(` Failed to fetch user: ${error.message}`);
    return { error: `Failed: ${error.message}` };
  }
}

async function fetchTasks(token, proxy, context) {
  try {
    const response = await requestWithRetry('get', 'https://api.nexyai.io/client/tasks', null, getAxiosConfig(proxy, token), 3, 2000, context);
    const tasks = response.data.map((task, index) => {
      if (!task.description) {
        logger.warn(`Task ${task.id || index} has no description`, { context });
      }
      return {
        id: task.id || `task-${index}`,
        description: typeof task.description === 'string' ? task.description.replace(/<[^>]+>/g, '') : '',
        category: task.category || 'N/A',
        points: task.points || 0,
        status: 'pending'
      };
    });
    return tasks;
  } catch (error) {
    logger.error(`Failed to fetch tasks: ${error.message}`, { context });
    return { error: `Failed: ${error.message}` };
  }
}

async function fetchCompletedTasks(token, proxy, context) {
  try {
    const response = await requestWithRetry('get', 'https://api.nexyai.io/client/user-tasks/completed', null, getAxiosConfig(proxy, token), 3, 2000, context);
    return response.data.map(item => item.task_id);
  } catch (error) {
    logger.error(`Failed to fetch completed tasks: ${error.message}`, { context });
    return [];
  }
}

async function verifyTask(token, taskId, taskName, taskCategory, proxy, context) {
  const taskContext = `${context}|T${taskId.slice(-6)}`;
  const spinner = ora({ text: `Verifying ${taskName}...`, spinner: 'dots' }).start();
  const maxRetries = 6;
  let retryCount = 0;

  try {
    while (retryCount < maxRetries) {
      const response = await requestWithRetry('post', `https://api.nexyai.io/client/user-tasks/verify/${taskId}`, {}, getAxiosConfig(proxy, token), 3, 2000, taskContext);
      const status = response.data.status;

      if (taskCategory === 'REF' && response.data?.task?.data?.min_referrals && response.data?.task_id) {
        const minReferrals = response.data.task.data.min_referrals;
        const invited = response.data.user.invited || 0;
        if (invited < minReferrals) {
          spinner.warn(chalk.bold.yellowBright(` Skipped: Need ${minReferrals} invites, have ${invited} [Category: ${taskCategory}]`));
          return { success: false, message: `Skipped: Insufficient invites (${invited}/${minReferrals})` };
        }
      }

      if (status === 'in_progress') {
        if (retryCount < maxRetries - 1) {
          spinner.text = `Retrying ${taskName} in 10s...`;
          await delay(10);
          retryCount++;
          continue;
        } else {
          spinner.warn(chalk.bold.yellowBright(` Max retries reached for ${taskName} [Category: ${taskCategory}]`));
          return { success: false, message: `Max retries reached: Still in progress` };
        }
      }

      if (status === 'completed') {
        spinner.succeed(chalk.bold.greenBright(` Verified: ${taskName} [Category: ${taskCategory}]`));
        return { success: true, message: `Task "${taskName}" verified` };
      }

      spinner.warn(` Invalid status: ${status} [Category: ${taskCategory}]`);
      return { success: false, message: `Invalid status: ${status}` };
    }
  } catch (error) {
    spinner.fail(chalk.bold.redBright(` Failed to verify ${taskName}: ${error.message} [Category: ${taskCategory}]`));
    return { success: false, message: `Failed to verify: ${error.message}` };
  }
}

async function claimTask(token, taskId, taskName, taskCategory, proxy, context, maxRetries = 5) {
  const taskContext = `${context}|T${taskId.slice(-6)}`;
  const spinner = ora({ text: `Claiming ${taskName}...`, spinner: 'dots' }).start();
  let retryCount = 0;

  try {
    while (retryCount < maxRetries) {
      const response = await requestWithRetry('post', `https://api.nexyai.io/client/user-tasks/claim/${taskId}`, {}, getAxiosConfig(proxy, token), 3, 2000, taskContext);
      if (response.statusCode === 200 || response.data?.success) {
        spinner.succeed(chalk.bold.greenBright(` Task Claimed: ${taskName} [Category: ${taskCategory}]`));
        return { success: true, message: `Task "${taskName}" claimed` };
      }
      if (retryCount < maxRetries - 1) {
        spinner.text = `Retrying claim for ${taskName} in 5s...`;
        await delay(5);
        retryCount++;
        continue;
      }
      spinner.warn(` Failed to claim ${taskName}: Invalid response [Category: ${taskCategory}]`);
      return { success: false, message: `Failed to claim: Invalid response` };
    }
  } catch (error) {
    if (error.response?.status === 400 && error.response?.data?.message?.includes('already claimed')) {
      spinner.succeed(chalk.bold.yellowBright(` Task Already Claimed: ${taskName} [Category: ${taskCategory}]`));
      return { success: true, message: `Task "${taskName}" already claimed` };
    }
    spinner.fail(chalk.bold.redBright(` Failed to claim ${taskName}: ${error.message} [Category: ${taskCategory}]`));
    return { success: false, message: `Failed to claim: ${error.message}` };
  }
}

async function fetchStatistics(token, proxy, context) {
  const spinner = ora({ text: 'Fetching statistics...', spinner: 'dots' }).start();
  try {
    const userResponse = await requestWithRetry('get', 'https://api.nexyai.io/client/user', null, getAxiosConfig(proxy, token), 3, 2000, context);
    const rewardsResponse = await requestWithRetry('get', 'https://api.nexyai.io/client/rewards/statistic', null, getAxiosConfig(proxy, token), 3, 2000, context);

    const userData = userResponse.data;
    const rewardsData = rewardsResponse.data;

    if (!userData || !userData.metadata || !userData.metadata.username || !userData.agent_address) {
      throw new Error('Incomplete user data');
    }

    spinner.succeed(chalk.bold.greenBright(` Fetched stats for ${userData.metadata.username}`));
    return {
      username: userData.metadata.username,
      agentAddress: userData.agent_address,
      socialPoint: rewardsData.social || 0,
      refPoint: rewardsData.ref || 0,
      totalPoint: (rewardsData.social || 0) + (rewardsData.ref || 0),
      followers: rewardsData.follower || 0
    };
  } catch (error) {
    spinner.fail(` Failed to fetch stats: ${error.message}`);
    return { error: `Failed: ${error.message}` };
  }
}

async function processAccount(token, index, total, proxy = null) {
  const context = `Account ${index + 1}/${total}`;
  logger.info(chalk.bold.magentaBright(`Starting account processing`), { emoji: '🚀 ', context });

  printHeader(`Account Info ${context}`);
  const userInfo = await fetchUserInfo(token, proxy, context);
  if (userInfo.error) {
    logger.error(`Skipping account due to user info error: ${userInfo.error}`, { context });
    return;
  }

  const ip = await getPublicIP(proxy, context);
  printInfo('Username', userInfo.username, context);
  printInfo('Agent Address', userInfo.agentAddress, context);
  printInfo('IP', ip, context);
  console.log('\n');

  const tasks = await fetchTasks(token, proxy, context);
  if (tasks.error) {
    logger.error(`Skipping account due to tasks error: ${tasks.error}`, { context });
    return;
  }

  const completedTaskIds = await fetchCompletedTasks(token, proxy, context);
  if (completedTaskIds.error) {
    logger.error(`Skipping account due to completed tasks error: ${completedTaskIds.error}`, { context });
    return;
  }

  tasks.forEach(task => {
    if (completedTaskIds.includes(task.id)) {
      task.status = 'completed';
    }
  });

  if (tasks.length === 0) {
    logger.warn('No tasks available', { emoji: '⚠️ ', context });
    return;
  }

  const pendingTasks = tasks.filter(task => task.status !== 'completed');

  let skippedTasks = 0;
  let completedTasks = 0;

  if (pendingTasks.length === 0) {
    logger.info('All tasks already completed', { emoji: '✅ ', context });
    await formatTaskTable(tasks, context);
  } else {
    const bar = new ProgressBar('Processing [:bar] :percent :etas', {
      complete: '█',
      incomplete: '░',
      width: 30,
      total: pendingTasks.length
    });
    for (const task of pendingTasks) {
      try {
        const verifyResult = await verifyTask(token, task.id, task.description || 'Unknown Task', task.category, proxy, context);
        if (verifyResult.success) {
          let claimSuccess = false;
          let claimAttempt = 0;
          const maxClaimAttempts = 3;

          while (!claimSuccess && claimAttempt < maxClaimAttempts) {
            const claimResult = await claimTask(token, task.id, task.description || 'Unknown Task', task.category, proxy, context, 3);
            if (claimResult.success) {
              claimSuccess = true;
              task.status = 'completed';
              completedTasks++;
              break;
            }
            claimAttempt++;
            if (claimAttempt < maxClaimAttempts) {
              logger.warn(`Retrying claim for ${task.description} (Attempt ${claimAttempt + 1}/${maxClaimAttempts})`, { context });
              await delay(5);
            }
          }
          if (!claimSuccess) {
            logger.error(`Failed to claim ${task.description} after ${maxClaimAttempts} attempts`, { context });
          }
        } else if (verifyResult.message.includes('Skipped')) {
          skippedTasks++;
        }
      } catch (error) {
        logger.error(`Error processing task ${task.id}: ${error.message}`, { context });
      }
      bar.tick();
      await delay(2);
    }
    await formatTaskTable(tasks, context);
    logger.info(`Processed ${pendingTasks.length} tasks: ${completedTasks} completed, ${skippedTasks} skipped`, { emoji: '📊', context });
  }

  printHeader(`Account Stats ${context}`);
  const stats = await fetchStatistics(token, proxy, context);
  if (stats.error) {
    logger.error(`Skipping stats due to error: ${stats.error}`, { context });
    return;
  }
  printInfo('Username', stats.username, context);
  printInfo('Agent Address', stats.agentAddress, context);
  printInfo('Social Point', stats.socialPoint, context);
  printInfo('Referral Point', stats.refPoint, context);
  printInfo('Total Point', stats.totalPoint, context);
  printInfo('Followers', stats.followers, context);

  logger.info(chalk.bold.greenBright(`Completed account processing`), { emoji: '🎉 ', context });
}

async function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans);
  }));
}

let globalUseProxy = false;
let globalProxies = [];

async function initializeConfig() {
  const useProxyAns = await askQuestion(chalk.cyanBright('🔌 Dp You Want Use Proxy? (y/n): '));
  if (useProxyAns.trim().toLowerCase() === 'y') {
    globalUseProxy = true;
    globalProxies = await readProxies();
    if (globalProxies.length === 0) {
      globalUseProxy = false;
      logger.warn('No proxies available, proceeding without proxy.', { emoji: '⚠️ ' });
    }
  } else {
    logger.info('Proceeding without proxy.', { emoji: 'ℹ️ ' });
  }
}

async function runCycle() {
  const tokens = await readTokens();
  if (tokens.length === 0) {
    logger.error('No tokens found in token.txt. Exiting cycle.', { emoji: '❌ ' });
    return;
  }

  for (let i = 0; i < tokens.length; i++) {
    const proxy = globalUseProxy ? globalProxies[i % globalProxies.length] : null;
    try {
      await processAccount(tokens[i], i, tokens.length, proxy);
    } catch (error) {
      logger.error(`Error processing account: ${error.message}`, { emoji: '❌ ', context: `Account ${i + 1}/${tokens.length}` });
    }
    if (i < tokens.length - 1) {
      console.log('\n\n');
    }
    await delay(5);
  }
}

async function run() {
  const terminalWidth = process.stdout.columns || 80;
  cfonts.say('NT EXHAUST', {
    font: 'block',
    align: 'center',
    colors: ['cyan', 'magenta'],
    background: 'transparent',
    letterSpacing: 1,
    lineHeight: 1,
    space: true
  });
  console.log(gradient.retro(centerText('=== Telegram Channel 🚀 : NT Exhaust (@NTExhaust) ===', terminalWidth)));
  console.log(gradient.retro(centerText('✪ BOT NEXY AI AUTO COMPLETE DAILY & SOCIAL TASKS ✪', terminalWidth)));
  console.log('\n');
  await initializeConfig();

  while (true) {
    await runCycle();
    logger.info(chalk.bold.yellowBright('Cycle completed. Waiting 24 hours...'), { emoji: '🔄 ' });
    await delay(86400);
  }
}

run().catch(error => logger.error(`Fatal error: ${error.message}`, { emoji: '❌' }));