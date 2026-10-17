# 🎭 Project Waifu (Live2D AI Companion Console)

An interactive, customizable Web-based AI Companion application featuring **Live2D animated avatars** with automatic horizontal centering on resize/move, **real-time chat with LLMs** (OpenAI-compatible endpoints like OpenWebUI, Ollama, LM Studio, vLLM, OpenAI), **TTS voice synthesis and STT**, full **Persona & Model customization**, and **secure SQLite server-side authentication & settings sync**.
<img width="1179" height="863" alt="projectwaifu" src="https://github.com/user-attachments/assets/bee23194-9144-409a-99cb-4c965fc95681" />

---

## 🌟 Key Features

1. **🎭 Interactive Live2D Avatar Console**
   - **Automatic Horizontal Centering**: The Live2D model automatically centers horizontally within its container on load, window resize, panning, and dragging.
   - **Drag & Reposition**: Click and hold the header bar to drag the avatar window anywhere on screen.
   - **Dynamic Resizing & Zoom**: Smooth mouse wheel zoom, pinch-to-zoom on touch, and bottom-right resize handles with persistent local storage.
   - **Live Parameter Tracking**: Real-time mouth tracking, emotion badges, and eye/head tracking following cursor or touch.

2. **💬 AI Chat & Voice Assistant**
   - **Persona Manager**: Custom AI personas with customizable system prompts, Live2D avatar models (Tamamo included as the default model), and voice configurations.
   - **TTS & STT Support**: Built-in speech synthesis and browser speech recognition for hands-free conversations.
   - **Custom Model ZIP Upload**: Directly upload `.zip` packages containing Live2D `model3.json` and associated asset files.

3. **🔐 Secure Server-Side Architecture & Admin Panel**
   - **Magic Link Authentication**: Passwordless secure login via email magic links.
   - **Optional SMTP Email Delivery**: Configure SMTP settings in the Admin panel to send real emails, or view direct links in-UI if unconfigured.
   - **Admin Management Console**: User approval workflows, role management (admin/user), and system diagnostics.

---

## 🚀 How to Deploy with Portainer (From GitHub)

If you have never deployed an app using Portainer before, follow this simple step-by-step guide.

### Prerequisites
- A running server with **Docker** and **Portainer** installed.
- Your copy of this repository hosted on **GitHub** (Public or Private).

---

### Step-by-Step Portainer Deployment

1. **Log in to Portainer**
   Open your Portainer dashboard (e.g., `https://your-server-ip:9443`).

2. **Navigate to Stacks**
   - Select your environment (usually named **primary** or **local**).
   - Click on **Stacks** in the left sidebar menu.
   - Click the **+ Add stack** button in the top right.

3. **Configure the Stack**
   - **Name**: Enter a name for your stack (e.g., `project-waifu`).
   - **Build method**: Click on **Repository**.

4. **Repository Settings**
   - **Repository URL**: `https://github.com/MisterRat/Project-Waifu.git`
   - **Repository reference**: Enter `refs/heads/main` (or `main`).
   - **Compose path**: Ensure `docker-compose.yml` is specified.
   *(If your repository is private, enable **Authentication** and enter your GitHub username and Personal Access Token (PAT)).*

5. **Deploy the Stack**
   - Click **Deploy the stack** at the bottom of the page.
   - Portainer will clone the GitHub repository, build the Docker image, and launch the container.

6. **Access the App**
   Once the stack status shows **Healthy** / **Running**, open your browser and navigate to:
   ```text
   http://<your-server-ip>:3020
   ```
   (`docker-compose.yml` publishes the app on host port **3020**.)

---

## 🛠️ Alternative Manual Docker Deployment

If you prefer using Docker CLI directly on your server:

```bash
# 1. Clone the repository
git clone https://github.com/MisterRat/Project-Waifu.git
cd Project-Waifu

# 2. (Optional) Copy .env.example if you wish to pre-configure keys
cp .env.example .env

# 3. Build and launch containers
docker compose up -d --build
```

---

## 🔒 Security Settings (optional)

Set these in the `environment:` block of `docker-compose.yml` when the app sits behind a reverse proxy or HTTPS:

| Variable | What it does |
| --- | --- |
| `TRUST_PROXY` | Set to `1` (or `true`) when a reverse proxy such as Nginx, Traefik or Cloudflare Tunnel is in front, so rate limiting sees real client IPs and HTTPS is detected. |
| `COOKIE_SECURE` | Set to `true` to always mark the sign-in cookie HTTPS-only. Leave unset for plain-HTTP home-network use. |

Only the System Owner can change settings, upload or delete models. Signed-in users can chat and use voice through the endpoints the owner configured; API keys are never sent to their browsers.

---

## 📖 Basic Usage Guide

### 1. 🎭 Interactive Live2D Avatar
- **Drag & Reposition**: Click and hold the header bar of the Avatar window to drag it around your screen.
- **Resize Window**: Click and drag the bottom-right resize handle to make the avatar box larger or smaller. Window positions and sizes automatically save to browser storage.
- **Horizontal Centering**: The avatar model automatically keeps horizontally centered within the model container during load, resize, panning, and touch interactions.
- **Touch / Motion Interactions**: Click on the avatar to trigger expressions, animations, and motion reactions.

### 2. 💬 AI Chat Console
- **Type Messages**: Converse with your AI companion in natural language.
- **Voice Output (TTS)**: Speech synthesis plays automatically. By default, it uses Microsoft Edge TTS or Web Speech API.
- **Voice Input (STT)**: Click the microphone icon to speak directly to your companion using browser speech recognition.
- **Conversation Mode**: Tap the green sound-wave button and just talk. A speech detector running in your browser (Silero VAD) separates your voice from background noise and sends your sentence when you pause; she listens again after she finishes answering. The detector files (~16 MB) download once, the first time you turn it on.
- **Layout**: On a computer she fills the stage and the conversation sits in a panel beside her; drag the divider to resize it (double-click to reset). On a phone the latest lines appear as subtitles over her; tap the speech-bubble button for the full conversation.
- **Idle behaviour** (same rules as the Waifu Pet desktop app): she follows the mouse only while it moves, looks forward while talking, and when left alone glances around, fidgets and changes mood now and then.

**Whisper model size:** speech-to-text runs on the server with `Xenova/whisper-tiny` by default. For better accuracy at the cost of speed, set `WHISPER_MODEL=Xenova/whisper-base` (or `Xenova/whisper-small`) under `environment:` in `docker-compose.yml`.

### 3. ⚙️ Customizing Personas & Avatars
- **Persona Switcher**: Quick-swap between preset AI characters or create your own custom companion.
- **Upload Live2D Models**: Upload custom `.zip` files containing Live2D `model3.json` avatar packages to give your companion a unique look. Face (`*.exp3.json`) and motion (`*.motion3.json`, also in a `Motions/` folder) files in the zip are used even if `model3.json` doesn't list them: files named `Idle_*` loop while she is idle, and the others play as gestures named after the file.
- **Tuning faces without editing them**: put a `waifu-faces.json` next to the `model3.json` to skip face files or choose which face an emotion uses, e.g. `{ "skip": ["Crying"], "map": { "crying": "Sad" } }`. The Waifu Pet desktop app reads the same file.
- **Custom System Prompts**: Tailor character personalities, backstories, tone, and greetings in the Persona Editor.

### 4. 🔗 Connecting External LLMs (OpenWebUI / Ollama / OpenAI)
- Open the **OpenWebUI Setup / Voice Tester** in the application.
- Enter your OpenAI-compatible endpoint URL (e.g. OpenWebUI, Ollama, LM Studio, vLLM, OpenAI), Model name, and API Key.
- Test endpoint health and verify stream response capabilities with built-in diagnostic tools.

---

## 📄 License & Attributions

Distributed under the MIT License. Feel free to modify and share!

### 📚 Open Source Attributions & Acknowledgments

This project utilizes and builds upon the following open-source modules, libraries, and technologies:

- **[pixi-live2d-display](https://github.com/guansss/pixi-live2d-display)** (MIT License) - Live2D model rendering integration for PixiJS created by guansss.
- **[PixiJS](https://pixijs.com/)** (MIT License) - High-performance HTML5 2D rendering engine.
- **[Live2D Cubism Core & SDK](https://www.live2d.com/)** - Live2D Cubism runtime components provided by Live2D Inc.
- **[React](https://react.dev/) & [React DOM](https://react.dev/)** (MIT License) - Frontend UI framework created by Meta.
- **[JSZip](https://stuk.github.io/jszip/)** (MIT License) - JavaScript library for client-side `.zip` file unpacking and Live2D model extraction.
- **[Transformers.js (@xenova/transformers)](https://github.com/xenova/transformers.js)** (Apache-2.0 License) - In-browser machine learning and NLP framework by Hugging Face.
- **[Lucide React](https://lucide.dev/)** (ISC License) - UI icon set for React applications.
- **[Express.js](https://expressjs.com/)** (MIT License) - Server-side backend web framework for Node.js.
- **[Tailwind CSS](https://tailwindcss.com/) & [Motion](https://motion.dev/)** (MIT License) - Utility-first CSS framework and fluid layout animation library.

