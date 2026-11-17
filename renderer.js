// renderer.js

document.addEventListener('DOMContentLoaded', () => {
  const addCourseBtn = document.getElementById('add-course');
  const courseList = document.getElementById('course-list');
  const startBtn = document.getElementById('start-btn');
  const stopBtn = document.getElementById('stop-btn');
  const statusArea = document.getElementById('status-area');
  const errorArea = document.getElementById('error-area');
  const registeredList = document.getElementById('registered-list');
  const blockedList = document.getElementById('blocked-list');
  const togglePassword = document.getElementById('toggle-password');
  const passwordInput = document.getElementById('password');
  const rollNoInput = document.getElementById('roll-no');
  const eyeOpen = document.getElementById('eye-open');
  const eyeClosed = document.getElementById('eye-closed');

  // JSON Input Modal Elements
  const jsonInputBtn = document.getElementById('json-input-btn');
  const jsonInputModal = document.getElementById('json-input-modal');
  const closeJsonBtn = document.getElementById('close-json-btn');
  const saveJsonBtn = document.getElementById('save-json-btn');
  const resetJsonBtn = document.getElementById('reset-json-btn');
  const jsonInputArea = document.getElementById('json-input-area');

  let isAutomationRunning = false;
  let jsonInputState = '';

  // Pre-fill user's roll number
  rollNoInput.value = '23/SE/136';

  // Live Clock
  const clockEl = document.getElementById('live-clock');
  function updateClock() {
    if (clockEl) {
      const now = new Date();
      clockEl.textContent = now.toLocaleTimeString('en-IN', { hour12: true });
    }
  }
  setInterval(updateClock, 1000);
  updateClock();

  const placeholder = `[
  { "code": "HU326", "slot": "E1" },
  { "code": "IT320", "slot": "E1" },
  { "code": "CS322", "slot": "E1" }
]`;

  let editor = null;
  if (typeof CodeMirror !== 'undefined') {
    editor = CodeMirror.fromTextArea(jsonInputArea, {
      mode: { name: 'javascript', json: true },
      theme: 'dracula',
      lineNumbers: true,
      autoCloseBrackets: true,
    });

    editor.setValue(placeholder);
    editor.getWrapperElement().style.opacity = '0.5';

    editor.on('focus', () => {
      if (editor.getValue() === placeholder) {
        editor.setValue('');
        editor.getWrapperElement().style.opacity = '1';
      }
    });

    editor.on('blur', () => {
      if (editor.getValue().trim() === '') {
        editor.setValue(placeholder);
        editor.getWrapperElement().style.opacity = '0.5';
      }
    });

    editor.on('change', () => {
      if (editor.getValue() !== placeholder) {
        jsonInputState = editor.getValue();
      }
    });
  } else {
    jsonInputArea.value = placeholder;
  }

  // Toggle password visibility
  togglePassword.addEventListener('click', () => {
    const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
    passwordInput.setAttribute('type', type);
    eyeOpen.classList.toggle('hidden');
    eyeClosed.classList.toggle('hidden');
  });

  // Function to display errors
  function showError(message) {
    errorArea.textContent = message;
    errorArea.classList.remove('hidden');
  }

  // Function to clear errors
  function clearError() {
    errorArea.classList.add('hidden');
  }

  // Function to update UI state
  function setUIState(running) {
    startBtn.classList.toggle('hidden', running);
    stopBtn.classList.toggle('hidden', !running);
    addCourseBtn.disabled = running;
    jsonInputBtn.disabled = running;

    document.getElementById('roll-no').disabled = running;
    document.getElementById('password').disabled = running;
    document.getElementById('auto-login').disabled = running;

    const courseRows = document.querySelectorAll('.course-row input, .course-row button');
    courseRows.forEach(element => {
      element.disabled = running;
    });
  }

  // Add a new course input row
  function addCourseRow(courseCode = '', courseSlot = '') {
    const row = document.createElement('div');
    row.className = 'course-row';

    const courseCodeInput = document.createElement('input');
    courseCodeInput.type = 'text';
    courseCodeInput.placeholder = 'Course Code';
    courseCodeInput.value = courseCode;
    courseCodeInput.required = true;

    const courseSlotInput = document.createElement('input');
    courseSlotInput.type = 'text';
    courseSlotInput.placeholder = 'Slot';
    courseSlotInput.value = courseSlot;
    courseSlotInput.required = true;

    const removeBtn = document.createElement('button');
    removeBtn.textContent = 'Remove';
    removeBtn.className = 'remove-course';

    removeBtn.addEventListener('click', () => {
      courseList.removeChild(row);
    });

    row.appendChild(courseCodeInput);
    row.appendChild(courseSlotInput);
    row.appendChild(removeBtn);

    courseList.appendChild(row);
  }

  // Initial course row on page load (matches screenshot!)
  addCourseRow();

  addCourseBtn.addEventListener('click', () => addCourseRow());

  // Start the automation process
  startBtn.addEventListener('click', async () => {
    clearError();
    const rollNo = document.getElementById('roll-no').value.trim();
    const password = document.getElementById('password').value.trim();
    const autoLogin = document.getElementById('auto-login').checked;

    if (!rollNo || !password) {
      showError('Please enter both Roll Number and Password.');
      return;
    }

    const courseRows = document.querySelectorAll('.course-row');
    const courses = [];
    courseRows.forEach(row => {
      const inputs = row.querySelectorAll('input');
      const courseCode = inputs[0].value.trim().toUpperCase();
      const courseSlot = inputs[1].value.trim().toUpperCase();
      if (courseCode && courseSlot) {
        courses.push(`${courseCode}:${courseSlot}`);
      } else if (courseCode) {
        courses.push(`${courseCode}:*`);
      }
    });

    if (courses.length === 0) {
      showError('Please add at least one course to track.');
      return;
    }

    isAutomationRunning = true;
    setUIState(isAutomationRunning);
    statusArea.textContent = 'Starting automation for ExamSetu DTU...';

    const response = await window.electronAPI.startAutomation({
      creds: { r: rollNo, p: password },
      courses: courses,
      autoLogin: autoLogin,
    });

    if (!response.success) {
      showError(response.error);
      isAutomationRunning = false;
      setUIState(isAutomationRunning);
      statusArea.textContent = 'Automation failed to start.';
    } else {
      statusArea.textContent = 'Automation is running. Monitoring courses...';
    }
  });

  // Stop the automation process
  stopBtn.addEventListener('click', async () => {
    await window.electronAPI.stopAutomation();
    isAutomationRunning = false;
    setUIState(isAutomationRunning);
    statusArea.textContent = 'Automation stopped by user.';
  });

  // Listen for status updates
  window.electronAPI.onStatusUpdate((event, message) => {
    statusArea.textContent = message;
  });

  // Listen for course registration updates
  window.electronAPI.onCourseRegistered((event, course) => {
    const li = document.createElement('li');
    const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    li.innerHTML = `<span><strong>${course.courseCode}</strong> (Slot: ${course.courseSlot}) - Registered!</span> <span class="timestamp">${timestamp}</span>`;
    registeredList.appendChild(li);
  });

  window.electronAPI.onCourseBlocked((event, course) => {
    const li = document.createElement('li');
    const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    li.innerHTML = `<span><strong>${course.courseCode}</strong> (Slot: ${course.courseSlot}) - Blocked!</span> <span class="timestamp">${timestamp}</span>`;
    blockedList.appendChild(li);
  });

  // Listen for error messages
  window.electronAPI.onError((event, errorMessage) => {
    showError(errorMessage);
    isAutomationRunning = false;
    setUIState(isAutomationRunning);
    statusArea.textContent = 'An error occurred.';
  });

  // JSON Input Modal Logic
  jsonInputBtn.addEventListener('click', () => {
    jsonInputModal.classList.remove('hidden');
    jsonInputModal.classList.add('modal-open');
    if (editor) {
      editor.refresh();
      if (jsonInputState.trim() === '') {
        editor.setValue(placeholder);
        editor.getWrapperElement().style.opacity = '0.5';
      } else {
        editor.setValue(jsonInputState);
      }
    }
  });

  closeJsonBtn.addEventListener('click', () => {
    jsonInputModal.classList.add('modal-close');
    jsonInputModal.addEventListener('animationend', () => {
      jsonInputModal.classList.add('hidden');
      jsonInputModal.classList.remove('modal-close');
    }, { once: true });
  });

  resetJsonBtn.addEventListener('click', () => {
    if (editor) {
      editor.setValue(placeholder);
      editor.getWrapperElement().style.opacity = '0.5';
    } else {
      jsonInputArea.value = placeholder;
    }
    jsonInputState = '';
  });

  saveJsonBtn.addEventListener('click', () => {
    clearError();
    const jsonText = editor ? editor.getValue() : jsonInputArea.value;

    if (jsonText === placeholder || jsonText.trim() === '') {
      courseList.innerHTML = '';
      jsonInputModal.classList.add('hidden');
      return;
    }

    try {
      const parsedCourses = JSON.parse(jsonText);
      if (!Array.isArray(parsedCourses)) {
        throw new Error('Input must be a JSON array.');
      }

      courseList.innerHTML = '';
      parsedCourses.forEach(course => {
        if (course.code) {
          addCourseRow(course.code, course.slot || '');
        }
      });

      jsonInputModal.classList.add('hidden');
    } catch (error) {
      showError(`Invalid JSON format: ${error.message}`);
    }
  });

  // Close modal on Escape key press
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !jsonInputModal.classList.contains('hidden')) {
      closeJsonBtn.click();
    }
  });
});
