// automation.js - ExamSetu DTU Course Registration Engine
const https = require('https');
const querystring = require('querystring');
const cheerio = require('cheerio');

const gotModule = require('got');
const got = gotModule.default || gotModule;

const BASE_HOST = 'exam-setu.dtu.ac.in';
const BASE_URL = `https://${BASE_HOST}`;

// Custom HTTPS Agent for fast connection reuse
const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
  keepAlive: true,
  maxSockets: 50,
  maxFreeSockets: 10,
});

let isRunning = false;

// Extract and merge cookies across requests
function extractAndMergeCookies(headers, currentCookies) {
  const setCookies = headers['set-cookie'];
  if (setCookies) {
    const newCookies = Array.isArray(setCookies) ? setCookies : [setCookies];
    const cookieMap = new Map(
      (currentCookies || '')
        .split('; ')
        .filter(Boolean)
        .map(cookie => cookie.split('='))
    );
    newCookies.forEach(cookieStr => {
      const parts = cookieStr.split(';')[0];
      const eqIdx = parts.indexOf('=');
      if (eqIdx !== -1) {
        const key = parts.slice(0, eqIdx).trim();
        const val = parts.slice(eqIdx + 1).trim();
        cookieMap.set(key, val);
      }
    });
    return Array.from(cookieMap.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
  }
  return currentCookies || '';
}

function getCommonHeaders() {
  return {
    'Host': BASE_HOST,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-User': '?1',
    'Connection': 'keep-alive',
  };
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

let notifyCallback = null;

function notify(title, message) {
  if (notifyCallback && typeof notifyCallback === 'function') {
    try {
      notifyCallback(title, message);
    } catch (e) {}
  }
}

/**
 * Step 1: Login to ExamSetu DTU
 */
async function automateLogin({ r, p }) {
  try {
    let cookies = '';

    // Initial GET to acquire session cookie
    const getRes = await got(`${BASE_URL}/student/login`, {
      method: 'GET',
      headers: getCommonHeaders(),
      agent: { https: httpsAgent },
      followRedirect: false,
      throwHttpErrors: false,
    });
    cookies = extractAndMergeCookies(getRes.headers, cookies);

    // POST credentials
    const credentials = querystring.stringify({
      roll_no: r,
      password: p,
    });

    const postRes = await got(`${BASE_URL}/student/login`, {
      method: 'POST',
      body: credentials,
      headers: {
        ...getCommonHeaders(),
        'Origin': BASE_URL,
        'Referer': `${BASE_URL}/student/login`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookies,
      },
      agent: { https: httpsAgent },
      followRedirect: false,
      throwHttpErrors: false,
    });

    cookies = extractAndMergeCookies(postRes.headers, cookies);

    const locationHeader = postRes.headers['location'] || '';
    const body = postRes.body || '';

    // Check invalid credentials
    if (body.includes('Invalid Roll No or Password') || body.includes('Invalid credentials') || body.includes('Incorrect password')) {
      throw new Error('Invalid Roll Number or Password.');
    }

    // Extract student hash from location header or body
    const match = locationHeader.match(/\/student\/home\/([a-zA-Z0-9]+)/) ||
                  body.match(/\/student\/home\/([a-zA-Z0-9]+)/);

    let studentHash = '';
    if (match && match[1]) {
      studentHash = match[1];
    } else {
      // Fallback: check if we are redirected to home
      if (locationHeader.includes('/student/home')) {
        studentHash = locationHeader.split('/student/home/')[1]?.split('?')[0] || '';
      }
    }

    if (!studentHash) {
      if (postRes.statusCode === 403) {
        throw new Error('ExamSetu returned 403 (Cloudflare block). Please retry.');
      }
      throw new Error('Could not extract student hash from login response.');
    }

    return { cookies, studentHash };
  } catch (err) {
    throw err;
  }
}

async function automateLoginWithRetry(credentials, callbacks) {
  let attempts = 0;
  while (isRunning) {
    try {
      attempts++;
      callbacks.onStatusUpdate(`Login attempt ${attempts}...`);
      const result = await automateLogin(credentials);
      callbacks.onStatusUpdate('Login successful.');
      return result;
    } catch (error) {
      if (!isRunning) break;
      if (error.message.includes('Invalid Roll Number or Password')) {
        throw error;
      }
      callbacks.onStatusUpdate(`Login failed: ${error.message}. Retrying in 2s...`);
      await delay(2000);
    }
  }
  throw new Error('Automation stopped during login.');
}

/**
 * Step 2: Fetch student home & find Course Registration URL
 */
async function getCourseRegUrl(cookies, studentHash) {
  try {
    const res = await got(`${BASE_URL}/student/home/${studentHash}`, {
      method: 'GET',
      headers: {
        ...getCommonHeaders(),
        'Referer': `${BASE_URL}/student/login`,
        'Cookie': cookies,
      },
      agent: { https: httpsAgent },
      followRedirect: false,
      throwHttpErrors: false,
    });

    const $ = cheerio.load(res.body);
    let courseRegUrl = null;

    $('a').each((_, el) => {
      const href = $(el).attr('href') || '';
      if (href.includes('/student/courseRegistration/')) {
        courseRegUrl = href.startsWith('http') ? href : `${BASE_URL}${href.startsWith('/') ? '' : '/'}${href}`;
      }
    });

    if (!courseRegUrl) {
      courseRegUrl = `${BASE_URL}/student/courseRegistration/${studentHash}`;
    }

    return courseRegUrl;
  } catch (e) {
    return `${BASE_URL}/student/courseRegistration/${studentHash}`;
  }
}

/**
 * Step 3: Fetch course registration HTML
 */
async function fetchCourseRegHTML(cookies, courseRegUrl) {
  try {
    const res = await got(courseRegUrl, {
      method: 'GET',
      headers: {
        ...getCommonHeaders(),
        'Cookie': cookies,
      },
      agent: { https: httpsAgent },
      followRedirect: false,
      throwHttpErrors: false,
    });

    if (res.statusCode !== 200) {
      throw new Error(`Failed to fetch course registration page (Status ${res.statusCode})`);
    }

    return { body: res.body, headers: res.headers };
  } catch (err) {
    throw err;
  }
}

/**
 * Send POST or action request to register a course
 */
async function sendRegisterRequest(cookies, actionUrl, formData, courseRegUrl) {
  try {
    const targetUrl = actionUrl.startsWith('http') ? actionUrl : `${BASE_URL}${actionUrl.startsWith('/') ? '' : '/'}${actionUrl}`;
    
    const response = await got.post(targetUrl, {
      form: formData || undefined,
      headers: {
        ...getCommonHeaders(),
        'Origin': BASE_URL,
        'Referer': courseRegUrl,
        'Cookie': cookies,
      },
      agent: { https: httpsAgent },
      throwHttpErrors: false,
      followRedirect: true,
    });

    return response;
  } catch (err) {
    console.error('Registration POST failed:', err.message);
    return null;
  }
}

/**
 * Main Monitoring and Auto-Registration Loop
 */
async function handlerLogic(session, courseRegUrl, targetCourses, autoLogin, credentials, callbacks) {
  let previousEtag = null;
  let currentSession = session;
  let remainingCourses = [...targetCourses]; // [{ code: 'HU326', slot: 'E1' }]

  callbacks.onStatusUpdate(`Tracking ${remainingCourses.length} course(s). Monitoring for open registration...`);

  while (isRunning && remainingCourses.length > 0) {
    try {
      const { body, headers } = await fetchCourseRegHTML(currentSession.cookies, courseRegUrl);

      // Session expiration check
      if (body.includes('Found. Redirecting to /student/login') || body.length < 5000 && body.includes('login')) {
        throw new Error('Session Expired');
      }

      const currentEtag = headers['etag'];
      if (previousEtag && currentEtag === previousEtag) {
        // Unchanged
        await delay(900);
        continue;
      }
      previousEtag = currentEtag;

      const $ = cheerio.load(body);

      // Check alerts
      const alertDiv = $('div.alert.alert-danger, .alert-warning');
      if (alertDiv.length > 0) {
        callbacks.onStatusUpdate(`Notice: ${alertDiv.first().text().trim()}`);
      }

      // Parse course rows in tables
      const parsedRows = [];
      $('table tbody tr, table tr').each((_, row) => {
        const cells = $(row).find('td');
        if (cells.length >= 5) {
          const courseName = $(cells[0]).text().trim();
          const courseCode = $(cells[1]).text().trim().toUpperCase();
          const credits = $(cells[2]).text().trim();
          const slot = $(cells[3]).text().trim().toUpperCase();
          const seatsRaw = $(cells[4]).text().trim();
          const actionCell = cells.length > 5 ? $(cells[5]) : $(cells[cells.length - 1]);
          const actionText = actionCell.text().trim();

          // Form or link in action cell
          const form = actionCell.find('form');
          const button = actionCell.find('button, a, input[type="submit"]');

          let formAction = null;
          let formData = {};
          if (form.length > 0) {
            formAction = form.attr('action');
            form.find('input').each((__, inp) => {
              const name = $(inp).attr('name');
              const val = $(inp).attr('value') || '';
              if (name) formData[name] = val;
            });
          } else if (button.length > 0) {
            formAction = button.attr('href') || button.attr('data-url') || button.attr('onclick') || '';
          }

          // Parse seats (e.g. "140/150" -> 140, or "75" -> 75)
          let availableSeats = 0;
          if (seatsRaw.includes('/')) {
            availableSeats = parseInt(seatsRaw.split('/')[0], 10) || 0;
          } else {
            availableSeats = parseInt(seatsRaw, 10) || 0;
          }

          const actionLower = actionText.toLowerCase();
          const isClosed = actionLower.includes('closed') || 
                           actionLower.includes('lock') || 
                           actionLower === 'registration closed' ||
                           actionCell.find('button:disabled, input:disabled').length > 0;

          const isRegistered = !isClosed && (
            actionLower === 'registered' ||
            actionLower.includes('already registered') ||
            $(row).attr('bgcolor') === '#0ff288' ||
            $(row).hasClass('table-success')
          );

          const isBlocked = actionLower.includes('blocked') ||
                            $(row).attr('bgcolor') === '#d4d3d2';

          const hasActiveForm = form.length > 0 && form.find('button:disabled, input:disabled').length === 0;
          const hasActiveButton = button.length > 0 && !button.is(':disabled') && !button.hasClass('disabled');
          const isOpen = !isClosed && !isRegistered && !isBlocked && (hasActiveForm || hasActiveButton || (actionLower.includes('register') && !actionLower.includes('closed')));

          parsedRows.push({
            courseName,
            courseCode,
            credits,
            slot,
            seatsRaw,
            availableSeats,
            actionText,
            formAction,
            formData,
            isClosed,
            isRegistered,
            isBlocked,
            isOpen,
          });
        }
      });

      // Check each remaining target course
      for (let i = remainingCourses.length - 1; i >= 0; i--) {
        const target = remainingCourses[i];
        const match = parsedRows.find(r => 
          r.courseCode === target.code && 
          (target.slot === '*' || target.slot === '' || r.slot === target.slot)
        );

        if (!match) continue;

        // Already registered?
        if (match.isRegistered) {
          callbacks.onCourseRegistered({ courseCode: target.code, courseSlot: match.slot });
          callbacks.onStatusUpdate(`Course Already Registered: ${target.code} (${match.slot})!`);
          notify('Course Registered!', `${target.code} (${match.slot}) has been successfully registered!`);
          remainingCourses.splice(i, 1);
          continue;
        }

        // Blocked?
        if (match.isBlocked) {
          callbacks.onCourseBlocked({ courseCode: target.code, courseSlot: match.slot });
          callbacks.onStatusUpdate(`Course is Blocked: ${target.code} (${match.slot})`);
          remainingCourses.splice(i, 1);
          continue;
        }

        // Registration Open! ONLY trigger when genuinely open and NOT closed
        if (match.isOpen) {
          callbacks.onStatusUpdate(`🔥 REGISTRATION OPEN for ${target.code} (${match.slot})! Submitting registration...`);
          notify('Registration Open!', `Registering for ${target.code} (${match.slot})...`);

          let actionUrl = match.formAction;
          if (!actionUrl) {
            actionUrl = `/student/courseRegister/${currentSession.studentHash}/${target.code}`;
          }

          const regResponse = await sendRegisterRequest(currentSession.cookies, actionUrl, match.formData, courseRegUrl);

          if (regResponse && regResponse.body) {
            const bodyLower = regResponse.body.toLowerCase();
            const isRejected = bodyLower.includes('registration is closed') ||
                               bodyLower.includes('registration closed') ||
                               bodyLower.includes('alert-danger') ||
                               bodyLower.includes('failed') ||
                               bodyLower.includes('not allowed');

            if (!isRejected && (bodyLower.includes('successfully registered') || bodyLower.includes('success'))) {
              callbacks.onCourseRegistered({ courseCode: target.code, courseSlot: match.slot });
              callbacks.onStatusUpdate(`✅ Successfully registered for ${target.code} (${match.slot})!`);
              notify('Success!', `Registered for ${target.code} (${match.slot})!`);
              remainingCourses.splice(i, 1);
            } else {
              callbacks.onStatusUpdate(`Registration attempt for ${target.code} rejected: Portal is currently locked. Continuing to monitor...`);
            }
          }
        } else {
          // Status is closed / locked - keep monitoring
          callbacks.onStatusUpdate(`Monitoring: ${target.code} (${match.slot || 'All'}) - Status: Registration Closed (Locked). Waiting for 2:00 PM opening... [Seats: ${match.seatsRaw || 'N/A'}]`);
        }
      }

      if (remainingCourses.length === 0) {
        callbacks.onStatusUpdate('🎉 All target courses processed! Automation completed.');
        break;
      }

      await delay(900);
    } catch (err) {
      if (!isRunning) break;

      if (autoLogin && err.message.includes('Session Expired')) {
        callbacks.onStatusUpdate('Session expired. Auto-logging in...');
        try {
          currentSession = await automateLoginWithRetry(credentials, callbacks);
          callbacks.onStatusUpdate('Session refreshed successfully.');
        } catch (loginErr) {
          callbacks.onError(`Re-login failed: ${loginErr.message}`);
          break;
        }
      } else {
        callbacks.onStatusUpdate(`Status: ${err.message}. Retrying...`);
        await delay(1200);
      }
    }
  }

  if (remainingCourses.length === 0) {
    notify('All Done!', 'All specified courses have been registered!');
  }
}

/**
 * Main Entry Point
 */
async function startAutomation(credentials, courseCodes, autoLogin, callbacks) {
  isRunning = true;
  notifyCallback = callbacks && callbacks.onNotify ? callbacks.onNotify : null;
  try {
    let session;
    if (autoLogin) {
      session = await automateLoginWithRetry(credentials, callbacks);
    } else {
      callbacks.onStatusUpdate('Attempting to log in to ExamSetu DTU...');
      session = await automateLogin(credentials);
      callbacks.onStatusUpdate('Login successful.');
    }

    callbacks.onStatusUpdate('Navigating to Course Registration...');
    const courseRegUrl = await getCourseRegUrl(session.cookies, session.studentHash);

    // Parse course codes array: ['HU326:E1', 'IT320:E1']
    const parsedTargets = courseCodes.map(codeStr => {
      const parts = codeStr.split(':');
      return {
        code: parts[0].trim().toUpperCase(),
        slot: (parts[1] || '*').trim().toUpperCase(),
      };
    });

    callbacks.onStatusUpdate(`Loaded registration page: ${courseRegUrl}`);
    await handlerLogic(session, courseRegUrl, parsedTargets, autoLogin, credentials, callbacks);
  } catch (error) {
    callbacks.onError(error.message);
  } finally {
    isRunning = false;
    if (callbacks && callbacks.onStop) {
      callbacks.onStop();
    }
  }
}

function stopAutomation() {
  isRunning = false;
}

module.exports = { startAutomation, stopAutomation };
