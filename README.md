# ExamSetu DTU - Course Registration Bot 🎓

An Electron desktop application to automate course registration on [DTU ExamSetu](https://exam-setu.dtu.ac.in/student/login).

## Features

- 🔐 **Auto Login** — Logs into ExamSetu with your roll number and password
- ⏰ **Scheduled Start** — Set a timer to start at exactly 2:00 PM when registration opens
- 🔄 **Auto Retry** — Continuously checks if registration is open (every 2-3 seconds)
- 🎯 **Target Courses** — Specify course codes to auto-register for specific electives
- 📊 **Live Course Table** — See all available courses and their status in real-time
- 🔔 **Desktop Notifications** — Get notified when registration opens or courses are registered
- 📝 **Activity Log** — Full live log of all actions and responses

## Setup

```bash
npm install
npm start
```

## Usage

1. Enter your **Roll Number** (e.g., `23/SE/136`)
2. Enter your **Password**
3. *(Optional)* Enter **Target Course Codes** separated by commas (e.g., `HU326, IT320`)
4. Set the **Start Time** (defaults to today/tomorrow 2:00 PM)
5. Set **Retry Interval** (default 2 seconds)
6. Click **🚀 Start Bot**

The bot will:
- Log in to ExamSetu
- Navigate to the Course Registration page
- Wait until the scheduled start time
- Continuously check for open registration
- Auto-register for your target courses as soon as they open
- Send desktop notifications on success

## Build

```bash
# Windows
npm run dist:win

# Mac
npm run dist:mac

# Linux
npm run dist:linux
```

## ⚠️ Disclaimer

This tool is for educational purposes only. Use responsibly and in accordance with DTU's policies.
