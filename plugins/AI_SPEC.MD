# AI PLUGIN SPEC — DO NOT DEVIATE

This repository contains a WhatsApp MD bot with a **custom plugin system**.
The uploaded reference files define the architecture and are considered LAW.

---

## 🔒 HARD RULES (NON-NEGOTIABLE)

- DO NOT change the plugin architecture
- DO NOT introduce new frameworks, patterns, or abstractions
- DO NOT refactor existing structures
- DO NOT create new MongoDB connections
- DO NOT modify how plugins are loaded or executed
- DO NOT output multiple files

You must IMITATE the reference plugins exactly.

---

## 📐 PLUGIN CONTRACT

All plugins MUST:

- Use `export default { ... }`
- Define metadata fields as seen in reference plugins
- Define a command handler using the SAME function name and signature
  (e.g. `run(context)` or `execute(ctx)` — match reference exactly)
- Use the same reply method used in reference plugins
- Follow the same error-handling style

If unsure, COPY the structure from `jid.js`.

---

## 🗄️ DATABASE / MONGODB RULES

- MongoDB is a SHARED connection
- Use ONLY the existing integration
- Import helpers exactly as shown in reference plugins
- Use existing helper functions for:
  - user data
  - economy
  - attendance
  - safe DB operations
- NEVER create a new Mongo client or connection

---

## 📁 FILE STRUCTURE RULES

- Output ONE plugin file
- File must be drop-in ready inside `/plugins`
- Use relative imports exactly as in reference plugins
- Do not rename or move integration files

---

## 🎯 TASK FORMAT YOU WILL RECEIVE

You will be asked to build a plugin with:
- Plugin name
- Command(s)
- Description of behavior

You must implement ONLY the requested logic.
All structure must be copied from reference plugins.

---

## 📦 OUTPUT RULES

- Output ONLY the final plugin file
- No explanations outside the code
- Inline comments are allowed
- Code must work on FIRST RUN

---

## 🧠 GOAL

The generated plugin must work immediately inside this bot
without modification, debugging, or trial-and-error.
