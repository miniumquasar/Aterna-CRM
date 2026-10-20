# The assistant

**AI assistant**, in the title bar, opens a conversation with an AI model that runs on this computer through Ollama, a free program. Nothing you ask, and nothing it reads, leaves the computer. It also writes the briefings on Forecast and in the Client file, and drafts client emails from a template.

It can be wrong. Check anything that matters against the records.

## Setting it up

The assistant checks that it can run before anything else. When it can't, it says what is missing and what to do, in steps for this kind of computer:

| What it says | What to do |
|---|---|
| **Ollama isn't installed** | Download Ollama from ollama.com/download and install it. Then start it, and download the model. |
| **Ollama is installed, but isn't running** | Start Ollama. On Windows it is in the Start menu and runs by the clock. On a Mac, open it from Applications; it runs in the menu bar. On Linux, run `ollama serve`, or `sudo systemctl start ollama` when it was installed as a service. |
| **The model isn't on this computer yet** | A partner or manager chooses *Download the model here*: the progress shows, and the download can be cancelled. Or run `ollama pull llama3.1:8b` (or the model chosen) in a terminal. |

The model is several gigabytes. It downloads once, then works without the internet. Keep the app open until the download finishes. The download is recorded in the audit log.

While the assistant isn't ready, the screen checks again every 10 seconds. Starting Ollama shows without a click. *Check again* checks at once.

The app talks to Ollama at 127.0.0.1, port 11434, on this computer only. It never uses "localhost": on Windows that can mean an address Ollama doesn't listen on.

## Choosing a model

Settings → *The assistant* shows how it stands, and the model in use: `llama3.1:8b` unless another is chosen. Choose any model already on this computer, or type another model's name.

`llama3.1:8b` and `mistral:7b` need about 8 GB of free memory. A smaller model answers faster on an older computer.

## Conversations

Ask about clients, deadlines and tasks, or ask for a client email. To answer, the assistant can:
- find clients;
- read a client's record;
- list open tasks, deadlines coming up, overdue filings, work in progress, and clients by type;
- read an email template.

It can also make changes:
- add a task;
- change a client's remarks;
- save a client's own version of a template.

It works with exactly the access of the person signed in. Staff reach their own clients only. Secrets on a client record come back masked. Changes are recorded in the audit log, and refused while the app is read-only. It makes at most three look-ups for one question.

It speaks for the practice as set in Settings: the firm's name, the tone, the email signature and the disclaimer. A signature or disclaimer the practice hasn't written is left out.

Conversations are kept so they can be read again under *History*. Each is its owner's; partners and managers can read every one.

## Briefings

- **Forecast → Briefing from the assistant**: where the pressure falls in the months ahead, what is overdue, and the money. It is given the figures on the screen.
- **Client file → Briefing from the assistant**: what needs doing for the client, most urgent first, and anything at risk. It is given:
  - the client's deadlines, risk score and reasons, money owed, AML and open data issues;
  - the last few calls and messages;
  - Companies House changes from the last 90 days.

  It is never given a password, tax reference, NI number or authorisation code.

*What the assistant was given* shows exactly the text it read, to check its answer against.

## When something goes wrong

| Message | What it means |
|---|---|
| The assistant took too long to answer | Large models are slow on some computers. Ask a shorter question, or choose a smaller model in Settings. |
| The model “…” isn't downloaded | The model chosen in Settings isn't on this computer. Download it, or choose another. |
| There is no model called “…” | The name in Settings is mistyped. |
| The local AI isn't running | Ollama has stopped. Start it, then *Check again*. |
